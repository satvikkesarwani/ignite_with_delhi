/**
 * The context layer itself.
 *
 * Turns raw graph rows into a synthesized understanding of each person:
 * deterministic facts, skills with provenance and confidence, derived traits
 * and personas, a trajectory over time, and finally an LLM narrative.
 *
 * THE RULE: the LLM never computes a number. Every count, rate, date and
 * ranking below comes from Cypher. Stage 4 hands the model finished values and
 * asks only for prose. If you let Nemotron count hackathons it will say 3 when
 * the answer is 7, and the agent's accuracy dies with it.
 *
 * Signals, trait rules, persona rules and weights are read from
 * config/domain.<domain>.json so the same engine can point at another platform.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { neo4jService } from './neo4jService.js';
import { generateChat } from './aiService.js';
import { createLogger } from './logger.js';
import { SKILL_CLUSTERS } from '../scripts/data/pools.mjs';

const log = createLogger('context-builder');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const TODAY = new Date('2026-09-19T00:00:00Z');
const DAY = 86400000;

const SKILL_TO_CLUSTER = new Map();
for (const [cluster, skills] of Object.entries(SKILL_CLUSTERS)) {
  for (const s of skills) if (!SKILL_TO_CLUSTER.has(s)) SKILL_TO_CLUSTER.set(s, cluster);
}

export function loadDomainConfig(domain = 'hackathon') {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'config', `domain.${domain}.json`), 'utf8'));
}

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY);
const round = (n, p = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? null : Number(Number(n).toFixed(p));

async function q(cypher, params = {}) {
  const res = await neo4jService.runCypherQuery(cypher, params);
  if (!res.success) throw new Error(`${res.error} :: ${cypher.slice(0, 90)}`);
  return res.records;
}

// =============================================================== STAGE 1
// Deterministic signals. Eight bulk queries for all 600 people rather than
// 600 round trips — the difference is minutes against the Aura free tier.

export async function fetchAllSignals() {
  const byUser = new Map();
  const ensure = (id) => {
    if (!byUser.has(id)) byUser.set(id, {});
    return byUser.get(id);
  };

  const identity = await q(`MATCH (p:Person) RETURN p AS person`);
  for (const r of identity) ensure(r.person.user_id).identity = r.person;

  const core = await q(`
    MATCH (p:Person)
    OPTIONAL MATCH (p)-[r:REGISTERED_FOR]->(:Hackathon)
    WITH p, count(r) AS registered, sum(CASE WHEN r.status = 'no_show' THEN 1 ELSE 0 END) AS no_shows
    OPTIONAL MATCH (p)-[:ATTENDED]->(ah:Hackathon)
    WITH p, registered, no_shows, count(DISTINCT ah) AS attended,
         min(ah.start_date) AS first_event, max(ah.end_date) AS last_event
    OPTIONAL MATCH (p)-[:MEMBER_OF]->(:Team)-[:BUILT]->(pr:Project)
    RETURN p.user_id AS user_id, registered, no_shows, attended, first_event, last_event,
           count(DISTINCT pr) AS submitted`);
  for (const r of core) Object.assign(ensure(r.user_id), r);

  const prizes = await q(`
    MATCH (p:Person)-[:MEMBER_OF]->(t:Team)-[:BUILT]->(pr:Project)-[:ACHIEVED]->(res:Result)
    WHERE res.rank IS NOT NULL OR res.prize_track IS NOT NULL
    MATCH (t)-[:COMPETED_IN]->(h:Hackathon)
    RETURN p.user_id AS user_id,
           collect({hackathon: h.name, hackathon_id: h.hackathon_id, rank: res.rank,
                    prize_track: res.prize_track, date: h.end_date, score: res.score,
                    project_id: pr.project_id, project_title: pr.title}) AS prizes`);
  for (const r of prizes) ensure(r.user_id).prizes = r.prizes;

  const scores = await q(`
    MATCH (p:Person)-[:MEMBER_OF]->(:Team)-[:BUILT]->(pr:Project)-[:ACHIEVED]->(res:Result)
    RETURN p.user_id AS user_id,
           collect({date: pr.submitted_at, score: res.score, project_id: pr.project_id,
                    title: pr.title, tech: pr.tech_stack, feedback: res.judge_feedback}) AS entries`);
  for (const r of scores) ensure(r.user_id).scoreEntries = r.entries;

  const mentor = await q(`
    MATCH (p:Person)-[:PERFORMED]->(s:MentorSession)
    RETURN p.user_id AS user_id, count(s) AS sessions, avg(s.mentor_score) AS avg_score`);
  for (const r of mentor)
    Object.assign(ensure(r.user_id), {
      mentor_sessions: r.sessions,
      avg_mentor_score: round(r.avg_score, 2),
    });

  const inter = await q(`
    MATCH (p:Person)-[:POSTED]->(i:Interaction)
    RETURN p.user_id AS user_id, i.type AS type, count(*) AS c, max(i.timestamp) AS last_ts`);
  for (const r of inter) {
    const u = ensure(r.user_id);
    u.interactions_by_type = u.interactions_by_type || {};
    u.interactions_by_type[r.type] = r.c;
    u.last_interaction =
      !u.last_interaction || r.last_ts > u.last_interaction ? r.last_ts : u.last_interaction;
  }

  const outreach = await q(`
    MATCH (p:Person)-[:RECEIVED]->(o:OutreachEvent)
    RETURN p.user_id AS user_id, count(o) AS sent,
           sum(CASE WHEN o.opened THEN 1 ELSE 0 END) AS opened,
           sum(CASE WHEN o.clicked THEN 1 ELSE 0 END) AS clicked,
           sum(CASE WHEN o.replied THEN 1 ELSE 0 END) AS replied,
           sum(CASE WHEN o.outcome = 'unsubscribed' THEN 1 ELSE 0 END) AS unsub`);
  for (const r of outreach) {
    ensure(r.user_id).outreach = {
      sent: r.sent,
      opened: r.opened,
      clicked: r.clicked,
      replied: r.replied,
      unsubscribed: r.unsub > 0,
    };
  }

  const skills = await q(`
    MATCH (p:Person)-[r:HAS_SKILL]->(s:Skill)
    RETURN p.user_id AS user_id, s.name AS skill,
           collect({source: r.source, confidence: r.confidence, evidence: r.evidence}) AS sources`);
  for (const r of skills) {
    const u = ensure(r.user_id);
    u.rawSkills = u.rawSkills || [];
    u.rawSkills.push({ skill: r.skill, sources: r.sources });
  }

  const mates = await q(`
    MATCH (p:Person)-[r:TEAMMATE_OF]-(o:Person)
    RETURN p.user_id AS user_id,
           collect({user_id: o.user_id, name: o.full_name, times: r.times}) AS teammates`);
  for (const r of mates) ensure(r.user_id).teammates = r.teammates;

  log.info('Signals fetched', { people: byUser.size });
  return byUser;
}

// =============================================================== STAGE 2
// Skills: merge declared / github / project evidence into one ranked list, and
// flag where a claim has no support (or where evidence exists but was never
// declared). This gap detection is the clearest proof that this is a context
// layer and not a join.

function buildSkills(raw, cap) {
  const out = [];
  for (const { skill, sources } of raw || []) {
    const merged = new Map();
    for (const s of sources) {
      if (!s.source) continue;
      const prev = merged.get(s.source);
      if (!prev || (s.confidence ?? 0) > (prev.confidence ?? 0)) merged.set(s.source, s);
    }
    const list = [...merged.values()];
    // Independent-evidence combination: 1 - Π(1 - w)
    const confidence = Math.min(
      cap,
      1 -
        list.reduce((acc, s) => acc * (1 - Math.max(0.05, Math.min(0.95, s.confidence ?? 0.3))), 1)
    );
    const kinds = new Set(list.map((s) => s.source));
    out.push({
      skill,
      cluster: SKILL_TO_CLUSTER.get(skill) || 'Other',
      confidence: round(confidence, 2),
      sources: list.map((s) => ({
        type: s.source,
        detail: s.evidence || s.source,
        weight: round(s.confidence, 2),
      })),
      claim_gap: kinds.has('declared') && kinds.size === 1,
      hidden_strength: !kinds.has('declared') && list.some((s) => (s.confidence ?? 0) >= 0.6),
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

// =============================================================== STAGE 3
// Traits, personas, trajectory, engagement — all deterministic rules from the
// domain config.

function safeEval(expr, ctx) {
  try {
    const keys = Object.keys(ctx);

    const fn = new Function(...keys, 'min', 'max', `"use strict"; return (${expr});`);
    const v = fn(...keys.map((k) => ctx[k]), Math.min, Math.max);
    return typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : Boolean(v);
  } catch {
    return false;
  }
}

function buildTrajectory(entries, cfg) {
  const series = (entries || [])
    .filter((e) => e.score !== null && e.score !== undefined)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((e) => ({ date: String(e.date).slice(0, 10), score: e.score, project_id: e.project_id }));

  let direction = 'insufficient_data';
  if (series.length >= 3) {
    // Least-squares slope over submission index
    const n = series.length;
    const meanX = (n - 1) / 2;
    const meanY = series.reduce((a, s) => a + s.score, 0) / n;
    let num = 0;
    let den = 0;
    series.forEach((s, i) => {
      num += (i - meanX) * (s.score - meanY);
      den += (i - meanX) ** 2;
    });
    const slope = den ? num / den : 0;
    // Judged scores are noisy; a gentle slope across 3 points is not a trend.
    direction = slope > 3 ? 'rising' : slope < -3 ? 'declining' : 'steady';
  } else if (series.length) direction = 'insufficient_data';

  // Tech drift: what appears in the two most recent projects but in neither of
  // the two earliest.
  const byDate = (entries || [])
    .filter((e) => e.tech?.length)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const early = new Set(byDate.slice(0, 2).flatMap((e) => e.tech));
  const late = new Set(byDate.slice(-2).flatMap((e) => e.tech));
  const drift = {
    from: [...early].filter((t) => !late.has(t)).slice(0, 4),
    to: [...late].filter((t) => !early.has(t)).slice(0, 4),
  };

  return { direction, series, drift, cfg };
}

function statusFor(days, thresholds) {
  if (days === null) return 'unknown';
  if (days <= thresholds.active) return 'active';
  if (days <= thresholds.cooling) return 'cooling';
  if (days <= thresholds.dormant) return 'dormant';
  return 'lapsed';
}

function buildEngagement(ctx, cfg) {
  const comps = {};
  let total = 0;
  for (const [key, spec] of Object.entries(cfg.engagement.components)) {
    const raw = ctx[spec.from];
    let v = raw === null || raw === undefined ? 0 : Number(raw);
    v = spec.invert ? Math.max(0, 1 - v / spec.scale) : Math.min(1, v / spec.scale);
    const score = Math.round(v * 100);
    comps[key] = score;
    total += score * spec.weight;
  }
  return { value: Math.round(total), components: comps };
}

// =============================================================== assemble

export function assembleProfile(sig, cfg) {
  const p = sig.identity || {};
  const attended = sig.attended ?? 0;
  const submitted = sig.submitted ?? 0;
  const prizes = sig.prizes || [];
  const teammates = sig.teammates || [];
  const byType = sig.interactions_by_type || {};
  const interactions = Object.values(byType).reduce((a, b) => a + b, 0);

  const lastActive =
    p.last_active || sig.last_event || sig.last_interaction?.slice(0, 10) || p.signup_date;
  const daysSince = lastActive ? daysBetween(lastActive, TODAY) : null;
  const skills = buildSkills(sig.rawSkills, cfg.confidence_cap ?? 0.97);
  const traj = buildTrajectory(sig.scoreEntries, cfg);
  const repeatMates = teammates.filter((t) => t.times > 1).sort((a, b) => b.times - a.times);
  const scoresOnly = (sig.scoreEntries || [])
    .map((e) => e.score)
    .filter((s) => s !== null && s !== undefined);
  const ranks = prizes.map((x) => x.rank).filter((r) => r !== null && r !== undefined);

  const facts = {
    hackathons_registered: sig.registered ?? 0,
    hackathons_attended: attended,
    no_shows: sig.no_shows ?? 0,
    projects_submitted: submitted,
    submission_rate: attended ? round(submitted / attended, 2) : null,
    prizes: prizes.map((x) => ({ ...x, date: String(x.date).slice(0, 10) })),
    prize_count: prizes.length,
    projects: (sig.scoreEntries || [])
      .map((e) => ({
        project_id: e.project_id,
        title: e.title,
        date: String(e.date).slice(0, 10),
        score: e.score,
        tech: e.tech || [],
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    best_rank: ranks.length ? Math.min(...ranks) : null,
    avg_score: scoresOnly.length
      ? round(scoresOnly.reduce((a, b) => a + b, 0) / scoresOnly.length, 1)
      : null,
    first_seen: sig.first_event || p.signup_date || null,
    last_active: lastActive || null,
    days_since_active: daysSince,
    mentor_sessions: sig.mentor_sessions ?? 0,
    avg_mentor_score: sig.avg_mentor_score ?? null,
    interactions,
    interactions_by_type: byType,
    workshops: byType.workshop_attended ?? 0,
    answers_given: byType.answered_question ?? 0,
    distinct_teammates: teammates.length,
    repeat_teammates: repeatMates,
    outreach: sig.outreach || { sent: 0, opened: 0, clicked: 0, replied: 0, unsubscribed: false },
  };

  // Rule evaluation context — flat scalars only, so config rules stay simple.
  const ctx = {
    ...facts,
    submission_rate: facts.submission_rate ?? 0,
    avg_mentor_score: facts.avg_mentor_score ?? 0,
    days_since_active: daysSince ?? 9999,
    days_since_signup: p.signup_date ? daysBetween(p.signup_date, TODAY) : 9999,
    repeat_teammates: repeatMates,
    skill_clusters: new Set(skills.filter((s) => s.confidence >= 0.4).map((s) => s.cluster)).size,
    trajectory_direction: traj.direction,
  };

  const traits = (cfg.traits || [])
    .filter((t) => safeEval(t.rule, ctx))
    .map((t) => ({
      trait: t.key,
      label: t.label,
      score: round(Math.min(1, Math.max(0, Number(safeEval(t.score, ctx)) || 0.6)), 2),
      evidence: traitEvidence(t.key, facts),
    }))
    .sort((a, b) => b.score - a.score);

  const personas = (cfg.personas || [])
    .filter((x) => safeEval(x.rule, ctx))
    .slice(0, cfg.max_personas ?? 2)
    .map((x) => x.label);

  const engagement = buildEngagement(ctx, cfg);
  const status = statusFor(daysSince, cfg.status_thresholds);

  const evidence = buildEvidence(p, facts, skills);

  return {
    user_id: p.user_id,
    version: 1,
    built_at: new Date().toISOString(),
    identity: {
      full_name: p.full_name,
      email: p.email,
      college: p.college,
      degree: p.degree,
      branch: p.branch,
      grad_year: p.grad_year,
      city: p.city,
      role_pref: p.role_pref,
      github_username: p.github_username || null,
      linkedin_url: p.linkedin_url || null,
      consent_flag: p.consent_flag === true,
    },
    facts,
    skills,
    traits,
    personas: personas.length ? personas : [defaultPersona(facts)],
    trajectory: {
      direction: traj.direction,
      status,
      score_series: traj.series,
      tech_drift: traj.drift,
    },
    engagement,
    narrative: null,
    narrative_status: 'pending',
    evidence,
    data_sources: [
      'platform',
      p.github_username ? 'github_synthetic_seed' : null,
      p.linkedin_url ? 'linkedin_synthetic_seed' : null,
    ].filter(Boolean),
  };
}

/**
 * Fallback label when no configured persona rule matches.
 * Defaulting everyone to "Newcomer" was wrong — someone with eight events is
 * not a newcomer just because they fit no named archetype.
 */
function defaultPersona(f) {
  if (f.hackathons_registered === 0) return 'Newcomer';
  if (f.hackathons_attended === 0) return 'Registered, Never Attended';
  if (f.hackathons_attended === 1) return 'One-Time Participant';
  return 'Steady Participant';
}

function traitEvidence(key, f) {
  switch (key) {
    case 'serial_finisher':
      return [
        `${f.projects_submitted} of ${f.hackathons_attended} attended events produced a submission`,
      ];
    case 'starter_not_finisher':
      return [
        `attended ${f.hackathons_attended} events but submitted only ${f.projects_submitted}`,
      ];
    case 'no_show_risk':
      return [`${f.no_shows} no-shows across ${f.hackathons_registered} registrations`];
    case 'team_player':
      return f.repeat_teammates.slice(0, 2).map((t) => `teamed with ${t.name} ${t.times} times`);
    case 'mentor_material':
      return [
        `average mentor rating ${f.avg_mentor_score} across ${f.mentor_sessions} sessions`,
        `answered ${f.answers_given} questions`,
      ];
    case 'competitive_performer':
      return [`${f.prize_count} prizes, best finish rank ${f.best_rank ?? '—'}`];
    case 'community_active':
      return [`${f.interactions} platform interactions`];
    default:
      return [];
  }
}

function buildEvidence(p, f, skills) {
  const ev = [];
  const add = (claim, source_type, source_ref, observed_at, confidence = 1) =>
    ev.push({
      claim,
      source_type,
      source_ref,
      observed_at: observed_at ? String(observed_at).slice(0, 10) : null,
      confidence,
    });

  add(
    `Registered for ${f.hackathons_registered} hackathons, attended ${f.hackathons_attended}`,
    'csv',
    'participations.csv',
    f.last_active
  );
  if (f.projects_submitted)
    add(`Submitted ${f.projects_submitted} projects`, 'csv', 'projects.csv', f.last_active);
  for (const pr of f.prizes) {
    add(
      `${pr.rank ? `Rank ${pr.rank}` : pr.prize_track} at ${pr.hackathon} with "${pr.project_title}" (score ${pr.score})`,
      'csv',
      `results.csv#${pr.project_id}`,
      pr.date
    );
  }
  if (f.mentor_sessions)
    add(
      `${f.mentor_sessions} mentor sessions, average rating ${f.avg_mentor_score}`,
      'csv',
      'mentor_sessions.csv',
      f.last_active
    );
  if (f.interactions)
    add(`${f.interactions} platform interactions`, 'csv', 'interactions.csv', f.last_active);
  if (f.outreach.sent)
    add(
      `Sent ${f.outreach.sent} outreach messages, opened ${f.outreach.opened}, replied ${f.outreach.replied}`,
      'csv',
      'crm_touchpoints.csv',
      null
    );
  for (const s of skills.slice(0, 8)) {
    for (const src of s.sources) {
      add(
        `${s.skill}: ${src.detail}`,
        src.type === 'github' ? 'github' : src.type === 'declared' ? 'form' : 'csv',
        src.type === 'github' ? `github_profiles.json#${p.github_username}` : 'users.csv',
        null,
        s.confidence
      );
    }
  }
  return ev;
}

// =============================================================== STAGE 4
// The narrative — the only LLM call, and it happens offline at build time so
// the agent can answer "tell me about X" with zero model calls.

const NARRATIVE_RULES = [
  'Hard rules:',
  '- Do not mention confidence numbers, project IDs (like P0145) or the score of any individual project.',
  '- A skill backed by repositories or projects is "evidenced", never "declared". Only names listed in skills_declared_without_evidence are merely claimed.',
  '- Never write dates in numeric or timestamp form; write months and years in words if you need them.',
  '- Finish every sentence. End the paragraph with a full stop.',
].join('\n');

/** Drop project ids and per-project scores from an evidence string before the model sees it. */
function scrubEvidence(detail) {
  return String(detail)
    .replace(/,?\s*best\s+P\d+/gi, '')
    .replace(/\s*\(scored [\d.]+\)/gi, '')
    .replace(/\bP\d{4}\b/g, 'a submitted project')
    .trim();
}

/** Returns a reason the text is unusable, or null if it is fine. */
export function narrativeProblem(text) {
  if (!text || text.length < 220) return 'too short';
  if (text.length > 1700) return 'too long';
  if (!/[.!?]["')\]]?$/.test(text)) return 'does not end with a full stop (truncated)';
  if (/\d{1,3}:\d{2}:\d{2}/.test(text)) return 'contains a timestamp fragment';
  if (/\bP\d{4}\b/.test(text)) return 'leaks a project id';
  if (/\b(he|she|his|her|him|hers)\b/i.test(text)) return 'uses gendered pronouns';
  if (/\b(third|second|first|fourth)[- ]year\b/i.test(text)) return 'invents a year of study';
  return null;
}

export async function generateNarrative(profile, cfg) {
  const payload = {
    name: profile.identity.full_name,
    college: profile.identity.college,
    degree: profile.identity.degree,
    branch: profile.identity.branch,
    grad_year: profile.identity.grad_year,
    role_preference: profile.identity.role_pref,
    facts: {
      hackathons_registered: profile.facts.hackathons_registered,
      hackathons_attended: profile.facts.hackathons_attended,
      no_shows: profile.facts.no_shows,
      projects_submitted: profile.facts.projects_submitted,
      submission_rate: profile.facts.submission_rate,
      prize_count: profile.facts.prize_count,
      best_rank: profile.facts.best_rank,
      avg_score: profile.facts.avg_score,
      avg_mentor_score: profile.facts.avg_mentor_score,
      mentor_sessions: profile.facts.mentor_sessions,
      interactions: profile.facts.interactions,
      workshops: profile.facts.workshops,
      answers_given: profile.facts.answers_given,
      last_active: profile.facts.last_active,
      days_since_active: profile.facts.days_since_active,
    },
    prizes: profile.facts.prizes.map((p) => ({
      rank: p.rank,
      track: p.prize_track,
      event: p.hackathon,
      project: p.project_title,
      date: p.date,
    })),
    top_skills: profile.skills.slice(0, 6).map((s) => ({
      skill: s.skill,
      confidence: s.confidence,
      evidence: s.sources.map((x) => scrubEvidence(x.detail)),
    })),
    skills_declared_without_evidence: profile.skills.filter((s) => s.claim_gap).map((s) => s.skill),
    traits: profile.traits.map((t) => t.label),
    personas: profile.personas,
    trajectory: {
      direction: profile.trajectory.direction,
      status: profile.trajectory.status,
      scores_in_order: profile.trajectory.score_series.map((s) => s.score),
    },
    engagement: profile.engagement.value,
  };

  // The model occasionally degenerates (a sentence that trails off into a timestamp, a
  // truncation mid-clause). Validate hard, retry once at a higher temperature, and let the
  // caller fall back to the deterministic template rather than store garbage.
  let lastReason = 'no attempt';
  for (const temperature of [0.4, 0.6]) {
    const res = await generateChat({
      messages: [
        {
          role: 'system',
          content: `${cfg.narrative_prompt}\n\n${NARRATIVE_RULES}\n\n/no_think — output only the finished paragraph, no preamble, no headings.`,
        },
        {
          role: 'user',
          content: `Profile data:\n${JSON.stringify(payload, null, 1)}\n\nWrite the profile now.`,
        },
      ],
      temperature,
      maxTokens: 620,
    });
    const candidate = (res.content || '').replace(/^\s*(here'?s?|profile:)\s*/i, '').trim();
    const problem = narrativeProblem(candidate);
    if (!problem) return candidate;
    lastReason = problem;
    log.warn('Narrative rejected', { user: profile.user_id, problem, temperature });
  }
  throw new Error(`narrative failed validation: ${lastReason}`);
}

// =============================================================== persistence

export async function persistProfile(profile) {
  const dir = path.join(ROOT, 'data', 'profiles');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${profile.user_id}.json`), JSON.stringify(profile, null, 2));

  const res = await neo4jService.runCypherQuery(
    `MATCH (p:Person {user_id: $uid})
     MERGE (cp:ContextProfile {user_id: $uid})
     SET cp.json = $json, cp.narrative = $narrative, cp.narrative_status = $status,
         cp.engagement = $engagement, cp.personas = $personas, cp.trajectory_status = $trajStatus,
         cp.trajectory_direction = $trajDirection,
         cp.prize_count = $prizeCount, cp.hackathons_attended = $attended,
         cp.submission_rate = $submissionRate, cp.avg_mentor_score = $avgMentor,
         cp.interactions = $interactions, cp.days_since_active = $daysSince,
         cp.last_active = $lastActive, cp.no_shows = $noShows,
         cp.built_at = $builtAt, cp.version = 1
     MERGE (cp)-[:ABOUT]->(p)`,
    {
      uid: profile.user_id,
      json: JSON.stringify(profile),
      narrative: profile.narrative,
      status: profile.narrative_status,
      engagement: profile.engagement.value,
      personas: profile.personas,
      trajStatus: profile.trajectory.status,
      trajDirection: profile.trajectory.direction,
      // Scalars the retrieval layer filters and sorts on directly in Cypher.
      prizeCount: profile.facts.prize_count,
      attended: profile.facts.hackathons_attended,
      submissionRate: profile.facts.submission_rate ?? 0,
      avgMentor: profile.facts.avg_mentor_score ?? 0,
      interactions: profile.facts.interactions,
      daysSince: profile.facts.days_since_active ?? 9999,
      lastActive: profile.facts.last_active,
      noShows: profile.facts.no_shows,
      builtAt: profile.built_at,
    }
  );
  return res.success;
}

export function readProfileFromDisk(userId) {
  const f = path.join(ROOT, 'data', 'profiles', `${userId}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}
