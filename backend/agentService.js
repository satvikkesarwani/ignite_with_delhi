/**
 * The conversational agent.
 *
 * Budget: at most ONE LLM call per question. Nemotron takes ~25s a call, so the
 * design keeps almost everything off the model:
 *
 *   - existence checks, disambiguation, "not found"        -> 0 calls, <50ms
 *   - "tell me about X"                                    -> 0 calls (the stored narrative)
 *   - activity / prizes / skills / projects / mentoring    -> 0 calls (built from facts)
 *   - segment questions ("find ML people from DTU")        -> 0 calls (Cypher templates)
 *   - a narrower question the facet answerers don't cover  -> 1 call, profile as sole context
 *
 * Every number in every answer is read from a computed fact. The model is only
 * ever asked to phrase, never to count.
 */

import crypto from 'crypto';
import { resolve } from './resolveService.js';
import { segment, parseSegment } from './retrievalService.js';
import { profileStore, canonicalCollege, toRow } from './profileStore.js';
import { generateChat } from './aiService.js';
import { neo4jService } from './neo4jService.js';
import { memoryService } from './memoryService.js';
import { parseCsv } from '../scripts/data/csv.mjs';
import { createLogger } from './logger.js';

const log = createLogger('agent');

// ------------------------------------------------------------------ sessions

const SESSIONS = new Map(); // sessionId -> { subject, pending, turns: [] }
const MAX_TURNS = 6;

function session(id) {
  const sid = id || crypto.randomUUID().slice(0, 12);
  if (!SESSIONS.has(sid)) SESSIONS.set(sid, { subject: null, pending: null, turns: [] });
  return { sid, s: SESSIONS.get(sid) };
}
const remember = (s, role, text) => {
  s.turns.push({ role, text: String(text).slice(0, 600) });
  if (s.turns.length > MAX_TURNS * 2) s.turns.splice(0, s.turns.length - MAX_TURNS * 2);
};

// ---------------------------------------------------------------- name finding

const NOT_NAMES =
  /\b(developers?|engineers?|builders?|people|students?|participants?|users?|members?|everyone|anyone|someone|hackathons?|winners?|mentors?|teams?|projects?|colleges?|skills?|top|best|most|all)\b/i;

/** Pull a person's name (or email, or id) out of a sentence. Returns a raw string or null. */
function extractName(message) {
  const m = message.trim();
  const id = m.match(/\bU\d{4}\b/i);
  if (id) return id[0].toUpperCase();
  const email = m.match(/\S+@\S+\.\S+/);
  if (email) return email[0];

  const patterns = [
    /\b(?:is|are)\s+(.+?)\s+(?:in|on|part of|a member of|registered (?:in|on|with)|listed (?:in|on)|present in)\s+(?:our|the|this)\s+(?:database|db|platform|system|user base|records|directory|list)/i,
    /\b(?:do we have|have we got|is there|does (?:our|the) (?:database|platform) (?:have|contain))\s+(?:anyone|someone|a person|a user|a participant|any)?\s*(?:called|named)\s+(.+?)(?:\s+in\b|\?|$)/i,
    /\b(?:can|could|should|may|shall) (?:we|i) (?:email|contact|reach out to|reach|message|invite|ping)\s+(.+?)(?:\s+(?:about|for|regarding|to|on)\b|\s*[?.!]|$)/i,
    /\b(?:email|contact|reach out to|message|invite|ping)\s+([A-Z][\w.'’-]*(?:\s+[A-Z][\w.'’-]*){0,3})(?:\s+(?:about|for|regarding|to|on)\b|\s*[?.!]|$)/,
    /\b(?:tell me about|who is|who's|info(?:rmation)? (?:on|about)|details (?:on|about)|profile (?:of|for)|background (?:of|on)|summar(?:y|ise|ize)(?: of)?|look ?up|lookup|find out about|about)\s+(.+?)(?:\s*[?.!]|\s+(?:and|—|-|:|,)\s|$)/i,
  ];
  for (const re of patterns) {
    const hit = m.match(re);
    if (hit) {
      const name = hit[1]
        .replace(/['’]s\b/, '')
        .replace(/^(?:the\s+)/i, '')
        .trim();
      if (
        name &&
        !NOT_NAMES.test(name) &&
        !NOT_A_NAME_WORD.test(name.split(/\s+(?:from|at)\s+/i)[0]) &&
        name.split(/\s+/).length <= 6
      )
        return name;
    }
  }
  // A bare name: "Ananya Iyar", "Shiv from IIT Delhi"
  if (
    /^[A-Za-z.'’-]+(?:\s+[A-Za-z.'’-]+){0,3}(?:\s+(?:from|at)\s+[A-Za-z .&-]+)?\??$/.test(m) &&
    !NOT_NAMES.test(m) &&
    m.split(/\s+/).length <= 6
  ) {
    const bare = m.replace(/\?$/, '');
    const namePart = bare.split(/\s+(?:from|at)\s+/i)[0];
    if (/^[A-Z]/.test(bare) && !NOT_A_NAME_WORD.test(namePart)) return bare;
  }
  return null;
}

/** Words that mean a string is a sentence fragment, not a name — "What has he built" is not a person. */
const NOT_A_NAME_WORD =
  /\b(what|whats|who|whom|which|how|when|where|why|is|are|was|were|do|does|did|can|could|would|should|will|shall|has|have|had|find|show|list|tell|give|get|he|she|they|him|her|his|hers|their|them|it|this|that|these|those|the|a|an|and|or|of|for|to|with|about|me|my|our|we|us|you|your|any|some|please|thanks|hello|hi)\b/i;

const PRONOUN =
  /\b(he|she|they|him|her|his|hers|their|them|this person|that person|the candidate)\b/i;

// ------------------------------------------------------------- formatting utils

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (x) => `${Math.round(x * 100)}%`;
const shortName = (p) => p.identity.full_name.trim();

function evidenceFor(profile, re, max = 4) {
  const hits = profile.evidence.filter((e) => re.test(e.claim));
  const list = (hits.length ? hits : profile.evidence).slice(0, max);
  return list.map((e) => ({
    claim: e.claim,
    source_type: e.source_type,
    source_ref: e.source_ref,
    user_id: profile.user_id,
  }));
}

// ---------------------------------------------------------- facet answerers

const FACETS = [
  {
    key: 'activity',
    re: /\b(active|activity|participat\w*|attend\w*|how many (?:hackathons|events)|engag\w*|involve\w*|how often|regular|workshops?)\b/i,
    ev: /registered|interaction|submitted/i,
    answer: (p) => {
      const f = p.facts;
      const bits = [];
      bits.push(
        `${shortName(p)} has attended ${f.hackathons_attended} of the ${plural(f.hackathons_registered, 'hackathon')} they registered for` +
          (f.no_shows ? ` (${plural(f.no_shows, 'no-show')})` : '') +
          ` and submitted ${plural(f.projects_submitted, 'project')}` +
          (f.submission_rate !== null && f.hackathons_attended
            ? ` — a submission rate of ${pct(f.submission_rate)}`
            : '') +
          '.'
      );
      bits.push(
        `Last active ${f.last_active}${f.days_since_active !== null ? `, ${plural(f.days_since_active, 'day')} ago` : ''} (${p.trajectory.status}).`
      );
      if (f.interactions) {
        bits.push(
          `They have ${plural(f.interactions, 'platform interaction')}${f.workshops ? `, including ${plural(f.workshops, 'workshop')}` : ''}${f.answers_given ? ` and ${plural(f.answers_given, 'answer')} to other participants' questions` : ''}.`
        );
      }
      return bits.join(' ');
    },
  },
  {
    key: 'prizes',
    re: /\b(won|win|wins|winning|prizes?|award\w*|podium|placed|achievements?|accomplish\w*|honou?rs?|track record)\b/i,
    ev: /rank|best use|prize/i,
    answer: (p) => {
      const f = p.facts;
      if (!f.prize_count)
        return `${shortName(p)} has no prizes or podium finishes on record across ${plural(f.hackathons_attended, 'hackathon')} attended.`;
      const list = f.prizes
        .slice(0, 5)
        .map(
          (x) =>
            `${x.rank ? `rank ${x.rank}` : x.prize_track} at ${x.hackathon} with "${x.project_title}" (${x.date}, scored ${x.score})`
        );
      return `${shortName(p)} has ${plural(f.prize_count, 'prize')}${f.best_rank ? `, best finish rank ${f.best_rank}` : ''}: ${list.join('; ')}.`;
    },
  },
  {
    key: 'skills',
    re: /\b(skills?|good at|strong(?:est)?|strengths?|stack|languages?|tech(?:nolog\w*)?|expert\w*|specialis\w*|know|proficien\w*)\b/i,
    ev: /:\s/,
    answer: (p) => {
      const strong = p.skills.filter((s) => s.confidence >= 0.5).slice(0, 5);
      const parts = [];
      if (strong.length) {
        parts.push(
          `${shortName(p)}'s strongest evidenced skills are ` +
            strong
              .map(
                (s) =>
                  `${s.skill} (${s.confidence.toFixed(2)} — ${
                    s.sources
                      .filter((x) => x.type !== 'declared')
                      .map((x) => x.detail)
                      .slice(0, 2)
                      .join('; ') || s.sources[0].detail
                  })`
              )
              .join(', ') +
            '.'
        );
      } else parts.push(`${shortName(p)} has no skill backed by a repository or project yet.`);
      const gaps = p.skills.filter((s) => s.claim_gap).slice(0, 5);
      if (gaps.length)
        parts.push(
          `Declared at signup but with no supporting evidence: ${gaps.map((s) => s.skill).join(', ')}.`
        );
      return parts.join(' ');
    },
  },
  {
    key: 'projects',
    re: /\b(built|build|projects?|created|made|shipped|work(?:ed)? on|portfolio|submi\w+)\b/i,
    ev: /submitted|rank|best use/i,
    answer: (p) => {
      const pr = p.facts.projects || [];
      if (!pr.length) return `${shortName(p)} has not submitted any projects.`;
      const list = pr
        .slice(0, 6)
        .map(
          (x) =>
            `"${x.title}" (${x.date}${x.score !== null && x.score !== undefined ? `, scored ${x.score}` : ''}; ${x.tech.slice(0, 3).join(', ')})`
        );
      return `${shortName(p)} has submitted ${plural(pr.length, 'project')}: ${list.join('; ')}${pr.length > 6 ? `; and ${pr.length - 6} more` : ''}.`;
    },
  },
  {
    key: 'mentor',
    re: /\bmentor\w*/i,
    ev: /mentor/i,
    answer: (p) => {
      const f = p.facts;
      if (!f.mentor_sessions) return `${shortName(p)} has had no mentor sessions.`;
      return `${shortName(p)} had ${plural(f.mentor_sessions, 'mentor session')}, rated ${f.avg_mentor_score} out of 5 on average.${p.personas.includes('Mentor Material') ? ' They are flagged as Mentor Material — strong ratings plus a record of answering other participants.' : ''}`;
    },
  },
  {
    key: 'outreach',
    re: /\b(contact\w*|email\w*|reach\w*|outreach|consent\w*|opt\w*|unsubscrib\w*|repl(?:y|ied)|invite\w*)\b/i,
    ev: /outreach/i,
    answer: (p) => {
      const o = p.facts.outreach;
      const canContact = p.identity.consent_flag && !o.unsubscribed;
      const head = canContact
        ? `${shortName(p)} has consented to outreach and can be contacted.`
        : `${shortName(p)} must NOT be contacted — ${!p.identity.consent_flag ? 'no consent on file' : 'they have unsubscribed'}${o.unsubscribed && !p.identity.consent_flag ? ' and they have unsubscribed' : ''}.`;
      return o.sent
        ? `${head} ${plural(o.sent, 'message')} sent so far: ${o.opened} opened, ${o.clicked} clicked, ${o.replied} replied.`
        : `${head} No outreach has been sent to them yet.`;
    },
  },
  {
    key: 'trajectory',
    re: /\b(improv\w*|trend\w*|trajectory|progress\w*|growth|getting better|over time|momentum|declin\w*|rising)\b/i,
    ev: /rank|submitted/i,
    answer: (p) => {
      const t = p.trajectory;
      const series = t.score_series.map((s) => s.score);
      const drift = t.tech_drift.to.length
        ? ` Their stack has moved toward ${t.tech_drift.to.join(', ')}.`
        : '';
      if (t.direction === 'insufficient_data')
        return `${shortName(p)} has too few judged projects (${series.length}) to call a trend.${drift}`;
      return `${shortName(p)}'s judged scores are ${t.direction} (${series.join(' → ')}).${drift} Currently ${t.status}.`;
    },
  },
  {
    key: 'teammates',
    re: /\b(teammates?|worked with|team(?:ed)? up|teamed|collaborat\w*|who (?:do|did) they)\b/i,
    ev: /submitted/i,
    answer: (p) => {
      const f = p.facts;
      if (!f.distinct_teammates) return `${shortName(p)} has no recorded teammates.`;
      const rep = f.repeat_teammates.map((t) => `${t.name} (${t.times} times)`);
      return `${shortName(p)} has worked with ${plural(f.distinct_teammates, 'distinct teammate')}.${rep.length ? ` Repeat collaborators: ${rep.join(', ')}.` : ' No one more than once.'}`;
    },
  },
  {
    key: 'background',
    re: /\b(background|education|college|universit\w+|studies|study|degree|branch|where (?:do|did|does)|from where|graduat\w*|city)\b/i,
    ev: /./,
    answer: (p) => {
      const i = p.identity;
      return `${shortName(p)} is doing a ${i.degree} in ${i.branch} at ${i.college}${i.grad_year ? `, graduating in ${i.grad_year}` : ''}, based in ${i.city}. Their preferred role is ${i.role_pref}. External context on file: ${
        p.data_sources
          .filter((d) => d !== 'platform')
          .join(', ')
          .replace(/_/g, ' ') || 'none'
      }.`;
    },
  },
  {
    key: 'claims',
    re: /\b(claims?|declared?|verif\w*|evidence|really (?:know|good)|credib\w*|trust)\b/i,
    ev: /:\s/,
    answer: (p) => {
      const gaps = p.skills.filter((s) => s.claim_gap);
      const hidden = p.skills.filter((s) => s.hidden_strength).slice(0, 4);
      if (!gaps.length && !hidden.length)
        return `${shortName(p)}'s declared skills line up with their repositories and projects — no gaps found.`;
      const bits = [];
      if (gaps.length)
        bits.push(
          `${shortName(p)} declares ${gaps.map((s) => s.skill).join(', ')} but no repository or project supports it`
        );
      if (hidden.length)
        bits.push(
          `the evidence instead points to ${hidden.map((s) => `${s.skill} (${s.sources[0].detail})`).join(', ')}, which they never declared`
        );
      return bits.join(' — ') + '.';
    },
  },
];

function facetAnswer(profile, message) {
  let hits = FACETS.filter((f) => f.re.test(message));
  // "Does he really know ML?" is a claims question — answering it twice (skills, then claims) is noise.
  if (hits.some((f) => f.key === 'claims')) hits = hits.filter((f) => f.key !== 'skills');
  if (!hits.length) return null;
  // "how active" and "what have they won" are usually one question — cap at three so it stays readable.
  const used = hits.slice(0, 3);
  return {
    answer: used.map((f) => f.answer(profile)).join('\n\n'),
    citations: used.flatMap((f) => evidenceFor(profile, f.ev, 3)),
    facets: used.map((f) => f.key),
  };
}

function overview(profile) {
  const f = profile.facts;
  const line = [
    plural(f.hackathons_attended, 'hackathon'),
    plural(f.prize_count, 'prize'),
    f.avg_mentor_score ? `mentor rating ${f.avg_mentor_score}` : null,
    `last active ${f.last_active}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const flags = [];
  const gaps = profile.skills.filter((s) => s.claim_gap);
  if (gaps.length)
    flags.push(
      `Note: declares ${gaps
        .slice(0, 3)
        .map((s) => s.skill)
        .join(', ')} without supporting evidence.`
    );
  if (!profile.identity.consent_flag) flags.push('Note: has not consented to outreach.');
  return {
    answer: [profile.narrative, `Key facts: ${line}.`, ...flags].filter(Boolean).join('\n\n'),
    citations: profile.evidence.slice(0, 5).map((e) => ({
      claim: e.claim,
      source_type: e.source_type,
      source_ref: e.source_ref,
      user_id: profile.user_id,
    })),
  };
}

// --------------------------------------------------------------- LLM (1 call)

async function llmAnswer(profile, message, turns) {
  const context = {
    identity: profile.identity,
    facts: {
      ...profile.facts,
      prizes: profile.facts.prizes.slice(0, 5),
      projects: profile.facts.projects.slice(0, 8),
    },
    skills: profile.skills.slice(0, 8).map((s) => ({
      skill: s.skill,
      confidence: s.confidence,
      claim_gap: s.claim_gap,
      evidence: s.sources.map((x) => x.detail),
    })),
    traits: profile.traits.map((t) => t.label),
    personas: profile.personas,
    trajectory: {
      direction: profile.trajectory.direction,
      status: profile.trajectory.status,
      scores: profile.trajectory.score_series.map((x) => x.score),
    },
    engagement: profile.engagement,
    narrative: profile.narrative,
  };
  const recent = turns
    .slice(-4)
    .map((t) => `${t.role}: ${t.text}`)
    .join('\n');
  const res = await generateChat({
    messages: [
      {
        role: 'system',
        content: `You are the analyst for a hackathon platform's organizers, answering a question about ONE participant.
Answer using ONLY the profile JSON provided. Never state a number, date, name or fact that is not in it. If the profile does not contain the answer, say exactly: "The profile doesn't record that." Do not guess pronouns — use the person's name or "they". 2 to 4 plain sentences, no bullet points, no markdown. /no_think`,
      },
      {
        role: 'user',
        content: `Profile:\n${JSON.stringify(context)}\n\n${recent ? `Recent conversation:\n${recent}\n\n` : ''}Question: ${message}`,
      },
    ],
    temperature: 0.2,
    maxTokens: 320,
  });
  const text = (res.content || '').trim();
  if (!text) throw new Error('empty completion');
  return text;
}

// ------------------------------------------------------------------ counts

async function countAnswer(message) {
  const lower = message.toLowerCase();
  if (/how many (?:people|users|participants|students|members|profiles|persons)/.test(lower)) {
    if (/\bconsent\w*|opted in|opt-in/.test(lower)) {
      const n = profileStore.all().filter((p) => p.identity.consent_flag).length;
      return {
        answer: `${n} of ${profileStore.size} people have consented to outreach.`,
        strategy: 'count:consent',
        total: n,
      };
    }
    const parsed = parseSegment(message);
    if (parsed.filters.length) {
      const r = await segment(message);
      const n = r.total_matches ?? r.total ?? 0;
      return {
        answer: `${n} ${n === 1 ? 'person matches' : 'people match'} ${r.criteria.join(', ')}.`,
        strategy: r.strategy,
        cypher: r.cypher,
        total: n,
        seg: r,
      };
    }
    return {
      answer: `There are ${profileStore.size} people in the database.`,
      strategy: 'count:people',
      total: profileStore.size,
    };
  }
  if (/how many (?:hackathons|events)\b/.test(lower)) {
    let n;
    const res = await neo4jService.runCypherQuery('MATCH (h:Hackathon) RETURN count(h) AS n');
    n = res.success && !res.isMock ? res.records[0].n : parseCsv('hackathons.csv').length;
    return {
      answer: `${n} hackathons have been run on the platform.`,
      strategy: 'count:hackathons',
      cypher: 'MATCH (h:Hackathon) RETURN count(h) AS n',
    };
  }
  if (/how many projects\b/.test(lower)) {
    const res = await neo4jService.runCypherQuery('MATCH (p:Project) RETURN count(p) AS n');
    const n = res.success && !res.isMock ? res.records[0].n : parseCsv('projects.csv').length;
    return {
      answer: `${n} projects have been submitted across all hackathons.`,
      strategy: 'count:projects',
      cypher: 'MATCH (p:Project) RETURN count(p) AS n',
    };
  }
  return null;
}

// -------------------------------------------------------------------- main

/** Choose among the candidates we just asked about: an id, a college, or an ordinal. */
function pickPending(message, pending) {
  const id = message.match(/\bU\d{4}\b/i)?.[0]?.toUpperCase();
  if (id && pending.some((m) => m.user_id === id)) return id;
  const lower = message.toLowerCase();
  const byCollege = pending.filter((m) => {
    const c = canonicalCollege(m.college);
    return [c.name, c.short].some((x) => x && lower.includes(String(x).toLowerCase()));
  });
  if (byCollege.length === 1) return byCollege[0].user_id;
  if (/\b(first|1st|top)\b/.test(lower)) return pending[0].user_id;
  if (/\b(second|2nd)\b/.test(lower) && pending[1]) return pending[1].user_id;
  const byRole = pending.filter((m) => lower.includes(String(m.role_pref).toLowerCase()));
  if (byRole.length === 1) return byRole[0].user_id;
  return null;
}

export async function chat({ message, sessionId }) {
  const startedAt = Date.now();
  const text = String(message || '').trim();
  const { sid, s } = session(sessionId);
  const out = {
    success: true,
    sessionId: sid,
    answer: '',
    resolution: null,
    citations: [],
    table: [],
    strategy: 'none',
    cypher: null,
    llm_calls: 0,
  };
  const finish = () => {
    out.latency_ms = Date.now() - startedAt;
    remember(s, 'organizer', text);
    remember(s, 'agent', out.answer);
    trace(out, text, sid);
    return out;
  };

  if (!text) {
    out.answer = 'Ask me about a person, or describe a group of people you want to find.';
    return finish();
  }

  // 1. Answering a disambiguation question we just asked.
  let userId = null;
  if (s.pending) {
    userId = pickPending(text, s.pending);
    if (userId) s.pending = null;
  }

  // 2. Which person, if any, is this about?
  let nameQuery = null;
  if (!userId) {
    nameQuery = extractName(text);
    if (/^U\d{4}$/i.test(nameQuery || '')) {
      userId = nameQuery.toUpperCase();
      nameQuery = null;
    }
  }

  // 3. Counting questions.
  if (!userId && !nameQuery) {
    const counted = await countAnswer(text);
    if (counted) {
      out.answer = counted.answer;
      out.strategy = counted.strategy;
      out.cypher = counted.cypher || null;
      if (counted.seg) {
        out.table = counted.seg.rows;
        out.rationale_by_user_id = counted.seg.rationale_by_user_id;
      }
      return finish();
    }
  }

  // 4. Follow-ups that use a pronoun ("and what has he built?").
  // "How active has he been" contains a status word, but with a live subject and a pronoun it is
  // a question about that person — unless it opens like a search ("find people who ...").
  if (
    !userId &&
    !nameQuery &&
    s.subject &&
    PRONOUN.test(text) &&
    !/^\s*(find|list|show|who|which|top|give me|how many)\b/i.test(text)
  ) {
    userId = s.subject;
  }

  // 5. A named person: resolve, then answer from their profile.
  if (userId || nameQuery) {
    let profile = null;
    let resolution;
    if (userId) {
      profile = profileStore.get(userId);
      resolution = profile
        ? { status: 'found', match_type: 'exact_id', match: { user_id: userId } }
        : {
            status: 'not_found',
            matches: [],
            suggestions: [],
            note: `No profile with id ${userId}.`,
          };
    } else {
      resolution = await resolve(nameQuery);
    }
    out.resolution = {
      status: resolution.status,
      match_type: resolution.match_type || null,
      user_id: resolution.match?.user_id || null,
    };

    if (resolution.status === 'ambiguous') {
      s.pending = resolution.matches;
      out.answer = resolution.question;
      out.strategy = 'resolve:ambiguous';
      out.matches = resolution.matches;
      out.resolution.matches = resolution.matches;
      return finish();
    }
    if (resolution.status === 'not_found') {
      out.answer = resolution.note;
      out.strategy = 'resolve:not_found';
      out.suggestions = resolution.suggestions || [];
      out.resolution.suggestions = out.suggestions;
      return finish();
    }

    profile = profile || profileStore.get(resolution.match.user_id);
    if (!profile) {
      out.answer = `${resolution.match.full_name} exists in the graph but their profile has not been built yet.`;
      out.strategy = 'resolve:no_profile';
      return finish();
    }
    s.subject = profile.user_id;
    out.subject_user_id = profile.user_id;
    out.resolution.user_id = profile.user_id;
    out.table = [toRow(profile)];

    const fuzzyNote = resolution.match_type === 'fuzzy' ? `${resolution.note} ` : '';
    const isExistence =
      /\b(in (?:our|the) (?:database|platform|user base|system|records|directory)|do we have|is there|anyone (?:called|named))\b/i.test(
        text
      );
    const remaining = userId ? text.replace(/\bU\d{4}\b/i, '') : text.replace(nameQuery, '');
    const facet = facetAnswer(profile, remaining);

    if (isExistence && !facet) {
      const f = profile.facts;
      out.answer = `${fuzzyNote}Yes — ${shortName(profile)} (${profile.user_id}) is in the database: ${canonicalCollege(profile.identity.college).short}, ${profile.identity.role_pref}, ${plural(f.hackathons_attended, 'hackathon')} attended, ${plural(f.prize_count, 'prize')}, last active ${f.last_active}. Ask for their background, projects or activity.`;
      out.strategy = 'profile:existence';
      out.citations = evidenceFor(profile, /registered/i, 2);
    } else if (facet) {
      out.answer = fuzzyNote + facet.answer;
      out.citations = facet.citations;
      out.strategy = `profile:${facet.facets.join('+')}`;
    } else if (
      /\b(tell me about|who is|who's|about|background|profile|overview|summar\w+|everything|know)\b/i.test(
        remaining
      ) ||
      !remaining.replace(/[^a-z]/gi, '').length ||
      remaining.trim().split(/\s+/).length <= 4
    ) {
      const ov = overview(profile);
      out.answer = fuzzyNote + ov.answer;
      out.citations = ov.citations;
      out.strategy = 'profile:overview';
    } else {
      try {
        out.answer = fuzzyNote + (await llmAnswer(profile, text, s.turns));
        out.llm_calls = 1;
        out.strategy = 'profile:llm';
        out.citations = evidenceFor(profile, /./, 3);
      } catch (e) {
        log.warn('LLM answer failed, using deterministic overview', { message: e.message });
        const ov = overview(profile);
        out.answer = fuzzyNote + ov.answer;
        out.citations = ov.citations;
        out.strategy = 'profile:overview_fallback';
      }
    }
    return finish();
  }

  // 6. Otherwise: a segment question.
  const seg = await segment(text);
  out.strategy = seg.strategy;
  out.cypher = seg.cypher;
  out.llm_calls = seg.llm_calls || 0;
  out.table = seg.rows;
  out.rationale_by_user_id = seg.rationale_by_user_id;
  out.criteria = seg.criteria;
  out.total_matches = seg.total_matches ?? seg.total;
  if (seg.honest_failure) {
    out.answer = `${seg.message}\n\nTry: ${seg.examples.map((e) => `"${e}"`).join(' · ')}`;
  } else if (!seg.rows.length) {
    out.answer = `No one matches ${seg.criteria.join(', ') || 'that'}. Try loosening one of the filters.`;
  } else {
    const shown = seg.rows.length;
    const total = seg.total_matches ?? shown;
    out.answer =
      `${total} ${total === 1 ? 'person matches' : 'people match'} ${seg.criteria.length ? seg.criteria.join(', ') : 'your request'}` +
      (total > shown ? `; showing the top ${shown} by ${seg.sort}` : '') +
      '. ' +
      (shown === 1
        ? `${seg.rows[0].full_name.trim()} is the match.`
        : `Top of the list: ${seg.rows
            .slice(0, 3)
            .map((r) => r.full_name.trim())
            .join(', ')}.`);
  }
  return finish();
}

/** Persist the reasoning trail to the graph without ever delaying or breaking the answer. */
function trace(out, text, sid) {
  const entities = [
    ...(out.table || []).map((r) => r.full_name?.trim()),
    ...(out.matches || []).map((m) => m.full_name?.trim()),
  ].filter(Boolean);
  memoryService
    .traceInteraction({
      sessionId: sid,
      userText: text,
      toolUsed: out.strategy,
      executedQuery: out.cypher || out.strategy,
      grounding: out.strategy.startsWith('profile')
        ? 'context_profile'
        : out.strategy.startsWith('resolve')
          ? 'person_resolver'
          : 'graph_template',
      retrievedEntities: entities,
      responsePreview: out.answer,
    })
    .catch(() => {});
}

export function resetSession(sessionId) {
  SESSIONS.delete(sessionId);
}
