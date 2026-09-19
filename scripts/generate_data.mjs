#!/usr/bin/env node
/**
 * PersonaCRM synthetic dataset generator.
 *
 * Produces a self-consistent hackathon-platform database in ./data:
 *   600 users, 24 hackathons, ~350 teams, ~1150 participations, ~240 projects
 *   with free-text descriptions, results with judge feedback, mentor sessions,
 *   interactions, CRM touchpoints, plus synthetic GitHub/LinkedIn profiles.
 *
 * The 17 hand-authored story users in scripts/data/storyUsers.mjs are honoured
 * exactly — every demo beat and eval question depends on their stats.
 *
 * Deterministic: seeded at 42, so re-running reproduces byte-identical output.
 *
 *   node scripts/generate_data.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as P from './data/pools.mjs';
import { STORY_USERS, FORCED_SPONSOR_TRACKS, BANNED_NAMES } from './data/storyUsers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'data');
const TODAY = new Date('2026-09-19T00:00:00Z');

// ---------------------------------------------------------------- RNG + utils

let _seed = 42;
function rnd() {
  _seed |= 0;
  _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
function pickN(arr, n) {
  const c = [...arr];
  const out = [];
  while (out.length < n && c.length) out.push(c.splice(Math.floor(rnd() * c.length), 1)[0]);
  return out;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function weightedPick(items, weightFn) {
  const total = items.reduce((s, it) => s + weightFn(it), 0);
  let r = rnd() * total;
  for (const it of items) {
    r -= weightFn(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
/** Box-Muller normal, clamped. */
function normal(mean, sd, lo, hi) {
  const u = Math.max(rnd(), 1e-9);
  const v = rnd();
  const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.min(hi, Math.max(lo, Math.round(mean + n * sd)));
}

const DAY = 86400000;
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const fmtDate = (d) => d.toISOString().slice(0, 10);
const fmtTs = (d) => d.toISOString().slice(0, 19);
function randomTimeOn(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), ri(8, 23), ri(0, 59), ri(0, 59)));
}
const id = (prefix, n, width) => prefix + String(n).padStart(width, '0');

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function writeCsv(file, headers, rows) {
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  fs.writeFileSync(path.join(OUT, file), lines.join('\n') + '\n', 'utf8');
  return rows.length;
}
function writeJson(file, obj) {
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(obj, null, 2), 'utf8');
}

// ------------------------------------------------------------------ hackathons

/** Fixed theme order — chosen so story users' sponsor-track wins land coherently. */
const HACK_THEMES = [
  'EdTech', 'FinTech', 'GenAI & Agents', 'Social Impact', 'HealthTech',
  'Open Source & DevTools', 'Climate & Sustainability', 'Smart Cities & IoT', 'Web3', 'Data & Graph',
  'FinTech', 'EdTech', 'GenAI & Agents', 'HealthTech', 'Social Impact',
  'Climate & Sustainability', 'Data & Graph', 'Open Source & DevTools', 'Smart Cities & IoT', 'Web3',
  'GenAI & Agents', 'GenAI & Agents', 'Data & Graph', 'GenAI & Agents',
];
const N_HACKS = 24;
const SPONSOR_HACK_IDX = [21, 22, 23];

function buildHackathons() {
  const out = [];
  let cursor = new Date('2024-01-13T00:00:00Z');
  for (let i = 0; i < N_HACKS; i++) {
    const durationDays = ri(1, 3);
    const start = new Date(cursor);
    const end = addDays(start, durationDays - 1);
    const isSponsorEdition = SPONSOR_HACK_IDX.includes(i);
    const sponsors = pickN(P.SPONSORS, ri(2, 3));
    if (isSponsorEdition) sponsors.push(...P.FINAL_SPONSORS);
    const mode = weightedPick(['offline', 'hybrid', 'online'], (m) => (m === 'offline' ? 5 : m === 'hybrid' ? 3 : 2));
    out.push({
      hackathon_id: id('H', i + 1, 3),
      idx: i,
      name: P.HACKATHON_NAMES[i],
      start_date: fmtDate(start),
      end_date: fmtDate(end),
      startD: start,
      endD: end,
      mode,
      city: mode === 'online' ? 'Remote' : pick(['Delhi', 'Delhi', 'Noida', 'Gurugram']),
      theme_track: HACK_THEMES[i],
      sponsors: sponsors.join('|'),
      prize_pool_inr: ri(3, 15) * 50000,
      max_team_size: ri(3, 5),
      organizer: 'Delhi Hack Collective',
      isSponsorEdition,
      targetSize: ri(25, 90),
    });
    cursor = addDays(cursor, ri(34, 46));
  }
  return out;
}

// ----------------------------------------------------------------------- users

function skillsForRole(rolePref, n) {
  const clusters = P.ROLE_TO_CLUSTERS[rolePref] || ['Web'];
  const primary = P.SKILL_CLUSTERS[clusters[0]];
  const secondary = P.SKILL_CLUSTERS[clusters[1] || clusters[0]];
  const picked = new Set(pickN(primary, Math.min(primary.length, Math.max(2, n - 1))));
  while (picked.size < n) picked.add(pick(chance(0.7) ? primary : secondary));
  return [...picked];
}

function makeGithubUsername(first, last, taken) {
  const f = first.toLowerCase();
  const l = last.toLowerCase();
  const forms = [`${f}${l}`, `${f}-${l}`, `${f}${l[0]}`, `${f}_${l}`, `${f}${ri(10, 99)}`, `${f[0]}${l}`, `${f}${l}dev`, `dev${f}`];
  for (const form of shuffle(forms)) if (!taken.has(form)) return form;
  let i = 2;
  while (taken.has(`${f}${l}${i}`)) i++;
  return `${f}${l}${i}`;
}

function buildUsers(hacks) {
  const users = [];
  const takenEmail = new Set();
  const takenGithub = new Set();
  const takenName = new Set();

  // --- story users, verbatim from the spec
  for (const s of STORY_USERS) {
    const col = P.COLLEGES.find((c) => c.name === s.college);
    if (!col) throw new Error(`Unknown college in story user ${s.id}: ${s.college}`);
    users.push({
      user_id: s.id,
      full_name: s.name,
      email: s.email,
      college: s.college,
      collegeShort: col.short,
      degree: s.degree,
      branch: s.branch,
      grad_year: s.gradYear,
      city: s.city,
      signup_date: s.signup,
      signupD: new Date(s.signup + 'T00:00:00Z'),
      github_username: s.github,
      linkedin_url: s.linkedin ? `https://linkedin.com/in/${s.name.toLowerCase().replace(/\s+/g, '-')}-${s.id.slice(-3)}` : null,
      declared_skills: s.declaredSkills,
      role_pref: s.rolePref,
      consent_flag: s.consent,
      referral_source: pick(P.REFERRAL_SOURCES),
      story: s,
    });
    takenEmail.add(s.email);
    if (s.github) takenGithub.add(s.github);
    takenName.add(s.name.toLowerCase());
  }

  // --- generated users
  const N_TOTAL = 600;
  let n = STORY_USERS.length;
  while (users.length < N_TOTAL) {
    n++;
    const gender = chance(0.42) ? 'f' : 'm';
    const first = pick(gender === 'f' ? P.FIRST_NAMES_F : P.FIRST_NAMES_M);
    const last = pick(P.SURNAMES);
    const full = `${first} ${last}`;
    // Never emit a banned probe name, and keep generated names off the story names
    // so the two-Shiv-Sharma trap stays a clean pair.
    if (BANNED_NAMES.includes(full)) continue;
    if (takenName.has(full.toLowerCase())) continue;
    takenName.add(full.toLowerCase());

    const col = weightedPick(P.COLLEGES, (c) => c.weight);
    const rolePref = pick(P.ROLE_PREFS);
    const gradYear = ri(2025, 2029);
    const degree = pick(P.DEGREES);

    let email = `${first.toLowerCase()}.${last.toLowerCase()}${chance(0.5) ? ri(1, 99) : ''}@gmail.com`;
    if (chance(0.35)) email = `${first.toLowerCase()}.${last.toLowerCase()}@${col.short.toLowerCase().replace(/[^a-z]/g, '')}.ac.in`;
    let guard = 0;
    while (takenEmail.has(email) && guard++ < 50) email = `${first.toLowerCase()}.${last.toLowerCase()}${ri(100, 999)}@gmail.com`;
    takenEmail.add(email);

    const hasGithub = chance(0.85);
    let gh = null;
    if (hasGithub) {
      gh = makeGithubUsername(first, last, takenGithub);
      takenGithub.add(gh);
    }

    users.push({
      user_id: id('U', n, 4),
      full_name: full,
      email,
      college: col.name,
      collegeShort: col.short,
      degree,
      branch: pick(P.BRANCHES),
      grad_year: gradYear,
      city: chance(0.75) ? col.city : pick(P.CITIES),
      github_username: gh,
      linkedin_url: chance(0.8) ? `https://linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${ri(1000, 9999)}` : null,
      declared_skills: skillsForRole(rolePref, ri(3, 6)),
      role_pref: rolePref,
      consent_flag: chance(0.92),
      referral_source: pick(P.REFERRAL_SOURCES),
      story: null,
    });
  }

  // --- participation plans (story users forced, others power-law)
  for (const u of users) {
    if (u.story) {
      u.plan = [...u.story.hackathons].sort((a, b) => a - b);
      u.noShowIdx = new Set(u.story.noShow || []);
      u.noSubmitIdx = new Set(u.story.noSubmit || []);
      continue;
    }
    const roll = rnd();
    let count;
    if (roll < 0.25) count = 0;
    else if (roll < 0.55) count = 1;
    else if (roll < 0.75) count = 2;
    else if (roll < 0.87) count = 3;
    else if (roll < 0.95) count = ri(4, 5);
    else count = ri(6, 10);

    u.plan = count === 0 ? [] : pickN([...Array(N_HACKS).keys()], count).sort((a, b) => a - b);
    u.noShowIdx = new Set(u.plan.filter(() => chance(0.15)));
    u.noSubmitIdx = new Set();
  }

  // --- signup dates for generated users, always before their first event
  for (const u of users) {
    if (u.story) continue;
    if (u.plan.length) {
      const first = hacks[u.plan[0]].startD;
      u.signupD = addDays(first, -ri(15, 110));
    } else {
      u.signupD = addDays(new Date('2024-01-01T00:00:00Z'), ri(0, 960));
    }
    if (u.signupD < new Date('2023-11-01T00:00:00Z')) u.signupD = new Date('2023-11-01T00:00:00Z');
    u.signup_date = fmtDate(u.signupD);
  }

  // --- deliberate messiness in ~5% of generated rows (never story users, never IDs)
  const messy = pickN(users.filter((u) => !u.story), Math.round(users.length * 0.05));
  for (const u of messy) {
    const kind = ri(1, 3);
    if (kind === 1) u.full_name = chance(0.5) ? u.full_name.toUpperCase() : `  ${u.full_name} `;
    if (kind === 2) {
      const col = P.COLLEGES.find((c) => c.name === u.college);
      u.college = pick(col.variants);
    }
    if (kind === 3) u.email = u.email.replace('@gmail.com', '@outlook.com');
    u.messy = true;
  }

  return users;
}

// --------------------------------------------------------- teams & participation

function buildParticipationAndTeams(users, hacks) {
  const byId = new Map(users.map((u) => [u.user_id, u]));
  const participations = [];
  const teams = [];
  const teamMembers = new Map(); // team_id -> [user]
  const priorTeammates = new Map(); // user_id -> Map(otherId -> count)
  let pIdx = 0;
  let tIdx = 0;

  const addPrior = (a, b) => {
    if (!priorTeammates.has(a)) priorTeammates.set(a, new Map());
    const m = priorTeammates.get(a);
    m.set(b, (m.get(b) || 0) + 1);
  };

  for (const h of hacks) {
    const registered = users.filter((u) => u.plan.includes(h.idx));
    const attendees = registered.filter((u) => !u.noShowIdx.has(h.idx));

    // Forced pairings first, so the demo's teammate edges always exist.
    const forcedGroups = [];
    const claimed = new Set();
    for (const u of attendees) {
      if (!u.story?.teamWith) continue;
      const partners = u.story.teamWith.filter((t) => t.hack === h.idx).map((t) => byId.get(t.user)).filter((p) => p && attendees.includes(p));
      if (!partners.length) continue;
      const group = [u, ...partners].filter((m) => !claimed.has(m.user_id));
      if (group.length < 2) continue;
      group.forEach((m) => claimed.add(m.user_id));
      forcedGroups.push(group);
    }

    const pool = shuffle(attendees.filter((u) => !claimed.has(u.user_id)));
    const groups = [];

    // Grow the forced groups up to a sensible size first.
    for (const g of forcedGroups) {
      const target = Math.min(h.max_team_size, Math.max(g.length, ri(3, 4)));
      while (g.length < target && pool.length) g.push(pool.splice(chooseTeammateIdx(g, pool, priorTeammates), 1)[0]);
      groups.push(g);
    }

    while (pool.length) {
      const size = Math.min(pool.length, h.max_team_size, weightedPick([1, 2, 3, 4], (s) => (s === 3 ? 8 : s === 4 ? 6 : s === 2 ? 4 : 1)));
      const g = [pool.shift()];
      while (g.length < size && pool.length) g.push(pool.splice(chooseTeammateIdx(g, pool, priorTeammates), 1)[0]);
      groups.push(g);
    }

    const usedNames = new Set();
    for (const g of groups) {
      tIdx++;
      let tname;
      do {
        tname = `${pick(P.TEAM_NAME_A)} ${pick(P.TEAM_NAME_B)}`;
      } while (usedNames.has(tname));
      usedNames.add(tname);
      const team = { team_id: id('T', tIdx, 4), hackathon_id: h.hackathon_id, hackIdx: h.idx, team_name: tname, team_size: g.length };
      teams.push(team);
      teamMembers.set(team.team_id, g);
      for (const a of g) for (const b of g) if (a !== b) addPrior(a.user_id, b.user_id);
    }

    const teamOf = new Map();
    for (const t of teams.filter((t) => t.hackathon_id === h.hackathon_id)) {
      for (const m of teamMembers.get(t.team_id)) teamOf.set(m.user_id, t.team_id);
    }

    for (const u of registered) {
      pIdx++;
      const noShow = u.noShowIdx.has(h.idx);
      let regD = addDays(h.startD, -ri(3, 40));
      if (regD <= u.signupD) regD = addDays(u.signupD, 1);
      if (regD >= h.startD) regD = addDays(h.startD, -1);
      participations.push({
        participation_id: id('PA', pIdx, 5),
        user_id: u.user_id,
        hackathon_id: h.hackathon_id,
        team_id: noShow ? '' : teamOf.get(u.user_id) || '',
        team_role: noShow ? '' : roleFor(u),
        registered_at: fmtDate(regD),
        status: noShow ? 'no_show' : 'attended',
      });
    }
  }

  return { participations, teams, teamMembers, priorTeammates };
}

function roleFor(u) {
  const map = { 'ML/AI': 'ML/AI', Backend: 'Backend', Frontend: 'Frontend', 'Full-stack': 'Lead', Data: 'Data', Design: 'Design', Product: 'Product', DevOps: 'DevOps', Mobile: 'Mobile', Web3: 'Backend', 'Hardware/IoT': 'Member' };
  return chance(0.8) ? map[u.role_pref] || 'Member' : pick(P.TEAM_ROLES);
}

/** Prefer prior teammates, then same college, then a role the team lacks. */
function chooseTeammateIdx(group, pool, priorTeammates) {
  const roles = new Set(group.map((m) => m.role_pref));
  const colleges = new Set(group.map((m) => m.college));
  let bestIdx = 0;
  let bestScore = -Infinity;
  const limit = Math.min(pool.length, 25);
  for (let i = 0; i < limit; i++) {
    const c = pool[i];
    let score = rnd() * 1.5;
    for (const m of group) {
      const prior = priorTeammates.get(m.user_id)?.get(c.user_id);
      if (prior) score += 3;
    }
    if (colleges.has(c.college)) score += 2;
    if (!roles.has(c.role_pref)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ------------------------------------------------------------ projects & results

/**
 * A project's stack stays inside the clusters its theme actually uses, so a CI
 * tool never lists Raspberry Pi and no stack lists Figma as a service. A member's
 * declared skill only makes the cut when it belongs to one of those clusters.
 */
function techStackFor(theme, members) {
  const forced = members.map((m) => m.story?.forcedTheme).filter(Boolean)[0];
  const themeToCluster = { 'Data & Graph': 'Graph', 'GenAI & Agents': 'ML/AI', Web: 'Web' };
  const clusters = forced
    ? [themeToCluster[forced] || 'Web', ...(P.THEME_CLUSTERS[theme] || ['Web'])]
    : P.THEME_CLUSTERS[theme] || ['Web'];
  const allowed = new Set(clusters.flatMap((c) => P.SKILL_CLUSTERS[c] || []));

  const out = new Set();
  const n = ri(3, 6);
  for (const m of members) for (const s of m.declared_skills) if (allowed.has(s) && chance(0.4)) out.add(s);
  let guard = 0;
  while (out.size < n && guard++ < 60) {
    const cluster = chance(0.6) ? clusters[0] : pick(clusters);
    out.add(pick(P.SKILL_CLUSTERS[cluster] || P.SKILL_CLUSTERS.Web));
  }
  return [...out].slice(0, n);
}

function describeProject(seed, tech, hackIdx) {
  const parts = [
    pick(P.DESC_PROBLEM).replace('{problem}', seed.problem),
    pick(P.DESC_APPROACH).replace('{approach}', seed.approach),
    pick(P.DESC_TECH).replace('{tech}', tech.slice(0, 4).join(', ')),
  ];
  if (chance(0.72)) parts.push(pick(P.DESC_EXTRA).replace('{n}', String(ri(3, 40))));
  // Modern tooling only shows up in the later events.
  if (hackIdx < 8) parts[2] = parts[2].replace(/LangChain|RAG|Vector Databases|LLM Fine-tuning/g, 'scikit-learn');
  return parts.join(' ');
}

function buildProjects(hacks, teams, teamMembers, users) {
  const projects = [];
  const results = [];
  let projIdx = 0;

  for (const h of hacks) {
    const hTeams = teams.filter((t) => t.hackIdx === h.idx);
    const submitted = [];

    for (const t of hTeams) {
      const members = teamMembers.get(t.team_id);
      const mustNotSubmit = members.some((m) => m.noSubmitIdx?.has(h.idx));
      // Story users' submission counts are declared, so their teams never rely
      // on the 70% coin flip — otherwise U0015's claim-gap projects vanish.
      const mustSubmit = members.some((m) => m.story && !m.noSubmitIdx.has(h.idx));
      if (mustNotSubmit) continue;
      if (!mustSubmit && !chance(0.7)) continue;

      projIdx++;
      const seed = pick(P.PROJECT_SEEDS[h.theme_track]);
      const tech = techStackFor(h.theme_track, members);
      const withGithub = members.filter((m) => m.github_username);
      const slug = seed.title.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      const submittedAt = randomTimeOn(h.endD);
      const forced = members.map((m) => m.story?.forcedResults?.[h.idx]).find(Boolean);

      const proj = {
        project_id: id('P', projIdx, 4),
        team_id: t.team_id,
        hackathon_id: h.hackathon_id,
        hackIdx: h.idx,
        title: seed.title,
        description: describeProject(seed, tech, h.idx),
        tech_stack: tech.join('|'),
        repo_url: withGithub.length ? `https://github.com/${pick(withGithub).github_username}/${slug}` : '',
        demo_url: chance(0.7) ? `https://${slug}-demo.vercel.app` : '',
        submitted_at: fmtTs(submittedAt),
        _forced: forced || null,
        _members: members,
      };
      projects.push(proj);
      submitted.push(proj);
    }

    scoreAndRank(submitted, h);
  }

  for (const p of projects) {
    results.push({
      project_id: p.project_id,
      rank: p._rank || '',
      prize_track: p._prizeTrack || '',
      prize_amount_inr: p._prize || '',
      score: p._score,
      judge_feedback: feedbackFor(p._score),
    });
  }
  return { projects, results };
}

function feedbackFor(score) {
  if (score > 85) return pick(P.JUDGE_HIGH);
  if (score >= 50) return pick(P.JUDGE_MID);
  return pick(P.JUDGE_LOW);
}

/**
 * Assigns scores, sponsor tracks and podium ranks for one hackathon.
 *
 * Forced story-user outcomes are pinned first; free projects are then capped so
 * the ordering that falls out always matches what the story specs promised.
 */
function scoreAndRank(submitted, h) {
  if (!submitted.length) return;

  /**
   * A story user only ever wins what their spec declares. Any project carrying
   * a story user with no forced outcome at this event is barred from the podium
   * and from random sponsor tracks, so "U0002 has no wins" stays true.
   */
  const protectedFromPrizes = (p) => p._members.some((m) => {
    if (!m.story) return false;
    const f = m.story.forcedResults?.[h.idx];
    // A forced *score* alone (Kabir's 52/68/79 climb) grants no prize.
    return !f?.rank && !f?.prizeTrack;
  });

  // 1. sponsor tracks (these sit outside the overall podium)
  const sponsorWinners = new Set();
  if (h.isSponsorEdition) {
    const forcedMap = FORCED_SPONSOR_TRACKS[h.idx] || {};
    const tracks = P.FINAL_SPONSORS.map((s) => `Best use of ${s}`);
    for (const track of tracks) {
      const forcedUser = forcedMap[track];
      let winner = null;
      if (forcedUser) {
        winner = submitted.find((p) => p._members.some((m) => m.user_id === forcedUser) && !sponsorWinners.has(p));
      }
      if (!winner) winner = shuffle(submitted).find((p) => !sponsorWinners.has(p) && !p._forced && !protectedFromPrizes(p));
      if (!winner) continue;
      sponsorWinners.add(winner);
      winner._prizeTrack = track;
      winner._prize = 25000;
      if (winner._forced?.score) {
        winner._score = winner._forced.score;
        winner._fixed = true;
      }
    }
  }

  const pool = submitted.filter((p) => !sponsorWinners.has(p));

  // 2. free scores, capped below the lowest forced podium score
  const forcedRanked = pool.filter((p) => p._forced?.rank);
  const minForcedScore = forcedRanked.length ? Math.min(...forcedRanked.map((p) => p._forced.score)) : null;
  const freeCap = minForcedScore ? Math.min(84, minForcedScore - 1) : 84;
  for (const p of pool) {
    if (p._forced?.score) {
      p._score = p._forced.score;
      p._fixed = true;
    } else {
      p._score = normal(62, 13, 32, freeCap);
    }
  }
  for (const p of sponsorWinners) if (p._score === undefined) p._score = normal(80, 5, 70, 92);

  // 3. podium: pinned ranks first, remaining slots to the best eligible projects
  const podium = [null, null, null];
  for (const p of forcedRanked) podium[p._forced.rank - 1] = p;
  const eligible = pool.filter((p) => !podium.includes(p) && !protectedFromPrizes(p)).sort((a, b) => b._score - a._score);
  const spare = pool.filter((p) => !podium.includes(p) && protectedFromPrizes(p)).sort((a, b) => b._score - a._score);
  for (let r = 0; r < 3 && r < pool.length; r++) {
    if (podium[r]) continue;
    podium[r] = eligible.shift() || null;
  }

  // 4. strictly decreasing podium scores, working bottom-up.
  //    Fixed scores are never touched — U0009's 52/68/79/91 trajectory depends on it.
  const nonPodium = pool.filter((p) => !podium.includes(p));
  const fixedFloor = Math.max(0, ...nonPodium.filter((p) => p._fixed).map((p) => p._score));
  for (let r = 2; r >= 0; r--) {
    const p = podium[r];
    if (!p || p._fixed) continue;
    const below = Math.max(podium[r + 1]?._score ?? 0, fixedFloor);
    p._score = Math.max(p._score, below + ri(1, 4));
  }
  for (let r = 0; r < 3; r++) {
    const p = podium[r];
    if (!p) continue;
    const above = podium[r - 1];
    if (above && p._score >= above._score && !p._fixed) p._score = above._score - 1;
    p._rank = r + 1;
    p._prizeTrack = 'Overall';
    p._prize = [100000, 60000, 30000][r];
  }

  // 5. nothing off the podium may outscore third place (free projects only)
  const third = podium.filter(Boolean).slice(-1)[0]?._score;
  if (third !== undefined) {
    for (const p of nonPodium) {
      if (p._fixed) continue;
      if (p._score >= third) p._score = Math.max(30, third - ri(1, 8));
    }
  }
  void spare;
}

// ------------------------------------------------------------------- mentors

function buildMentors() {
  const out = [];
  const used = new Set();
  for (let i = 1; i <= 30; i++) {
    let name;
    do {
      name = `${pick(chance(0.4) ? P.FIRST_NAMES_F : P.FIRST_NAMES_M)} ${pick(P.SURNAMES)}`;
    } while (used.has(name) || BANNED_NAMES.includes(name));
    used.add(name);
    out.push({
      mentor_id: id('M', i, 3),
      full_name: name,
      expertise: pick(P.MENTOR_EXPERTISE),
      company: pick(P.COMPANIES),
      years_experience: ri(3, 18),
      linkedin_url: `https://linkedin.com/in/${name.toLowerCase().replace(/\s+/g, '-')}-m${i}`,
    });
  }
  return out;
}

/** Integer 1-5 ratings whose mean lands as close to `avg` as the count allows. */
function ratingsSumming(count, avg) {
  const target = Math.max(count, Math.min(count * 5, Math.round(avg * count)));
  const base = Math.floor(target / count);
  let rem = target - base * count;
  const arr = Array(count).fill(base);
  for (let i = 0; i < count && rem > 0; i++) {
    if (arr[i] < 5) {
      arr[i]++;
      rem--;
    }
  }
  return shuffle(arr);
}

function buildMentorSessions(users, hacks, participations, mentors) {
  const sessions = [];
  let sIdx = 0;
  const attendedBy = new Map();
  for (const p of participations) {
    if (p.status !== 'attended') continue;
    if (!attendedBy.has(p.user_id)) attendedBy.set(p.user_id, []);
    attendedBy.get(p.user_id).push(p.hackathon_id);
  }
  const hackById = new Map(hacks.map((h) => [h.hackathon_id, h]));

  for (const u of users) {
    const attended = attendedBy.get(u.user_id) || [];
    if (!attended.length) continue;
    const spec = u.story?.mentor;
    const count = spec ? spec.sessions : chance(0.55) ? ri(1, 3) : 0;
    if (!count) continue;
    const plannedRatings = spec?.avgScore ? ratingsSumming(count, spec.avgScore) : null;

    for (let i = 0; i < count; i++) {
      sIdx++;
      const h = hackById.get(attended[i % attended.length]);
      const mentor = pick(mentors);
      const rating = spec?.avgScore ? plannedRatings[i] : weightedPick([1, 2, 3, 4, 5], (r) => (r >= 4 ? 6 : r === 3 ? 3 : 1));
      const day = addDays(h.startD, ri(0, Math.max(0, Math.round((h.endD - h.startD) / DAY))));
      const bank = rating >= 5 ? P.MENTOR_NOTE_HIGH : rating >= 3 ? P.MENTOR_NOTE_MID : P.MENTOR_NOTE_LOW;
      sessions.push({
        session_id: id('S', sIdx, 4),
        user_id: u.user_id,
        mentor_id: mentor.mentor_id,
        hackathon_id: h.hackathon_id,
        session_date: fmtDate(day),
        duration_min: pick([15, 20, 30, 30, 45, 60]),
        mentor_score: rating,
        notes: pick(bank).replace('{topic}', pick(P.MENTOR_TOPICS)),
      });
    }
  }
  return sessions;
}

// -------------------------------------------------------------- interactions

function buildInteractions(users, hacks, participations) {
  const out = [];
  let iIdx = 0;
  const attendedByUser = new Map();
  for (const p of participations) {
    if (!attendedByUser.has(p.user_id)) attendedByUser.set(p.user_id, []);
    attendedByUser.get(p.user_id).push(p.hackathon_id);
  }
  const hackById = new Map(hacks.map((h) => [h.hackathon_id, h]));

  for (const u of users) {
    const spec = u.story;
    let count;
    if (spec) count = spec.interactions;
    else {
      const attended = (attendedByUser.get(u.user_id) || []).length;
      count = attended === 0 ? (chance(0.6) ? 0 : ri(1, 2)) : ri(1, 3) + attended * ri(1, 3);
    }
    if (!count) continue;

    const workshops = spec?.workshops || 0;
    const theirHacks = (attendedByUser.get(u.user_id) || []).map((hid) => hackById.get(hid));
    const cutoff = spec?.lastInteractionBefore ? new Date(spec.lastInteractionBefore + 'T00:00:00Z') : TODAY;

    for (let i = 0; i < count; i++) {
      iIdx++;
      let type;
      if (i < workshops) type = 'workshop_attended';
      else if (spec?.interactionBias && chance(0.65)) type = spec.interactionBias;
      else type = weightedPick(['comment', 'question', 'workshop_attended', 'discord_message', 'answered_question', 'profile_update'],
        (t) => ({ comment: 8, question: 6, workshop_attended: 3, discord_message: 7, answered_question: 4, profile_update: 2 })[t]);

      // ~70% of chatter clusters around an event the person actually joined
      let when;
      let hackId = '';
      if (theirHacks.length && chance(0.7)) {
        const h = pick(theirHacks);
        hackId = h.hackathon_id;
        when = randomTimeOn(addDays(h.startD, ri(-14, 14)));
      } else {
        const span = Math.max(1, Math.round((cutoff - u.signupD) / DAY));
        when = randomTimeOn(addDays(u.signupD, ri(0, span)));
      }
      if (when > cutoff) when = randomTimeOn(addDays(cutoff, -ri(0, 20)));
      if (when < u.signupD) when = randomTimeOn(addDays(u.signupD, ri(0, 10)));
      if (when > TODAY) when = randomTimeOn(addDays(TODAY, -ri(1, 30)));

      const hasText = type !== 'workshop_attended' && type !== 'profile_update';
      out.push({
        interaction_id: id('I', iIdx, 5),
        user_id: u.user_id,
        hackathon_id: hackId,
        type,
        timestamp: fmtTs(when),
        text: hasText ? pick(P.INTERACTION_TEXT[type] || P.INTERACTION_TEXT.comment) : '',
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------- CRM

function buildCrm(users, hacks) {
  const out = [];
  let cIdx = 0;
  for (const u of users) {
    const override = u.story?.crmOverride;

    if (override?.unsubscribed) {
      cIdx++;
      out.push({
        touchpoint_id: id('C', cIdx, 5),
        user_id: u.user_id,
        campaign_name: pick(P.CAMPAIGNS),
        channel: 'email',
        sent_at: fmtTs(randomTimeOn(new Date(override.unsubscribedAt + 'T00:00:00Z'))),
        opened: 'true',
        clicked: 'false',
        replied: 'false',
        outcome: 'unsubscribed',
      });
      continue; // nothing may follow an unsubscribe
    }

    if (override?.allUnopened) {
      const since = new Date(override.since + 'T00:00:00Z');
      for (let i = 0; i < override.campaigns; i++) {
        cIdx++;
        out.push({
          touchpoint_id: id('C', cIdx, 5),
          user_id: u.user_id,
          campaign_name: pick(P.CAMPAIGNS),
          channel: 'email',
          sent_at: fmtTs(randomTimeOn(addDays(since, i * ri(60, 110)))),
          opened: 'false',
          clicked: 'false',
          replied: 'false',
          outcome: 'ignored',
        });
      }
      continue;
    }

    if (!u.consent_flag) continue;

    // Build the person's touchpoints in date order, then stop dead at the first
    // unsubscribe — nothing may be sent to someone who has opted out.
    const n = weightedPick([0, 1, 2, 3, 4, 5, 6], (k) => [2, 5, 7, 6, 4, 2, 1][k]);
    const candidates = [];
    for (let i = 0; i < n; i++) {
      const h = pick(hacks);
      const sent = addDays(h.startD, -ri(10, 60));
      if (sent < u.signupD || sent > TODAY) continue;
      candidates.push(sent);
    }
    candidates.sort((a, b) => a - b);

    for (const sent of candidates) {
      cIdx++;
      const opened = chance(0.45);
      const clicked = opened && chance(0.33);
      const replied = opened && clicked && chance(0.3);
      const outcome = replied ? 'registered' : chance(0.04) ? 'bounced' : chance(0.03) ? 'unsubscribed' : 'ignored';
      out.push({
        touchpoint_id: id('C', cIdx, 5),
        user_id: u.user_id,
        campaign_name: pick(P.CAMPAIGNS),
        channel: weightedPick(['email', 'whatsapp', 'discord'], (c) => (c === 'email' ? 7 : c === 'whatsapp' ? 2 : 1)),
        sent_at: fmtTs(randomTimeOn(sent)),
        opened: String(opened),
        clicked: String(clicked),
        replied: String(replied),
        outcome,
      });
      if (outcome === 'unsubscribed') break;
    }
  }
  return out.sort((a, b) => a.sent_at.localeCompare(b.sent_at));
}

// --------------------------------------------------- external profile fixtures

function buildGithubProfiles(users, projects, teamMembers) {
  const profiles = {};
  const projectsByUser = new Map();
  for (const p of projects) for (const m of p._members) {
    if (!projectsByUser.has(m.user_id)) projectsByUser.set(m.user_id, []);
    projectsByUser.get(m.user_id).push(p);
  }

  for (const u of users) {
    if (!u.github_username) continue;
    const spec = u.story?.githubProfile;
    const clusters = P.ROLE_TO_CLUSTERS[u.role_pref] || ['Web'];
    let langs;
    let repoCount;
    let contributions;
    let followers;
    let created;
    let bio;

    if (spec) {
      langs = spec.langs.map(([language, pct]) => ({ language, pct }));
      repoCount = spec.repos;
      contributions = spec.contributions;
      followers = spec.followers;
      created = spec.created;
      bio = spec.bio;
    } else {
      // 20% of people have a genuine gap between what they declare and what they push
      const diverges = chance(0.2);
      const langCluster = diverges ? pick(Object.keys(P.CLUSTER_LANGUAGES)) : clusters[0];
      const langPool = [...new Set(P.CLUSTER_LANGUAGES[langCluster])];
      const chosen = pickN(langPool, Math.min(langPool.length, ri(2, 4)));
      let remaining = 100;
      langs = chosen.map((language, i) => {
        const pct = i === chosen.length - 1 ? remaining : Math.max(4, Math.round(remaining * (i === 0 ? 0.6 : 0.5)));
        remaining -= pct;
        return { language, pct };
      }).filter((l) => l.pct > 0);
      repoCount = chance(0.12) ? ri(30, 70) : ri(3, 18);
      contributions = ri(20, 520);
      followers = ri(0, 140);
      created = fmtDate(addDays(new Date('2021-01-01T00:00:00Z'), ri(0, 1400)));
      bio = chance(0.6) ? pick(['Student developer.', 'Building things.', 'CS undergrad, open to internships.', 'I like shipping.', null]) : null;
    }

    const cluster = clusters[0];
    const topics = P.REPO_TOPICS[cluster] || P.REPO_TOPICS.Web;
    const userProjects = projectsByUser.get(u.user_id) || [];
    const repos = [];
    for (const p of userProjects.slice(0, 2)) {
      repos.push({
        name: p.title.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(),
        description: p.description.split('. ')[0] + '.',
        language: langs[0]?.language || 'Python',
        stars: ri(0, 40),
        topics: pickN(topics, 2),
        last_pushed: p.submitted_at.slice(0, 10),
      });
    }
    while (repos.length < Math.min(5, repoCount)) {
      repos.push({
        name: `${pick(P.REPO_NAME_A)}-${pick(P.REPO_NAME_B)}`,
        description: pick(['Weekend experiment.', 'Coursework, cleaned up.', 'Small utility I kept reaching for.', 'Learning project.', 'Fork with my own changes.']),
        language: pick(langs).language,
        stars: ri(0, 12),
        topics: pickN(topics, ri(1, 2)),
        last_pushed: fmtDate(addDays(TODAY, -ri(10, 700))),
      });
    }

    profiles[u.github_username] = {
      username: u.github_username,
      name: u.full_name.trim(),
      bio,
      public_repos: repoCount,
      followers,
      account_created: created,
      contributions_last_year: contributions,
      top_languages: langs,
      repos,
      source: 'synthetic_seed',
    };
  }
  return profiles;
}

function buildLinkedinProfiles(users) {
  const profiles = {};
  for (const u of users) {
    if (!u.linkedin_url) continue;
    const spec = u.story?.linkedinProfile;
    const experience = spec ? spec.experience : [];
    if (!spec && chance(0.55)) {
      const nExp = ri(1, 2);
      for (let i = 0; i < nExp; i++) {
        const startY = ri(2024, 2026);
        experience.push({
          title: pick([`${u.role_pref} Intern`, 'Software Engineering Intern', 'Technical Member', 'Freelance Developer', 'Research Intern']),
          company: chance(0.7) ? pick(P.COMPANIES) : `${u.collegeShort} ${pick(['Coding Club', 'Robotics Society', 'E-Cell', 'ACM Chapter'])}`,
          start: `${startY}-0${ri(1, 9)}`,
          end: chance(0.5) ? null : `${startY}-${String(ri(10, 12))}`,
          description: pick(['Worked on internal tooling.', 'Contributed to the frontend rewrite.', 'Built data pipelines for reporting.', 'Supported the platform team.', 'Ran weekly workshops for juniors.']),
        });
      }
    }
    profiles[u.linkedin_url] = {
      url: u.linkedin_url,
      headline: spec ? spec.headline : `${u.degree} ${u.branch} @ ${u.collegeShort} · ${u.role_pref}`,
      location: u.city,
      education: [{ school: u.college, degree: `${u.degree} ${u.branch}`, start_year: u.grad_year - 4, end_year: u.grad_year }],
      experience,
      skills: u.declared_skills,
      certifications: chance(0.3) ? pickN(['AWS Cloud Practitioner', 'Google Data Analytics', 'Meta Frontend Developer', 'Neo4j Certified Professional', 'TensorFlow Developer'], ri(1, 2)) : [],
      source: 'synthetic_seed',
    };
  }
  return profiles;
}

// ------------------------------------------------------------------ assemble

console.log('PersonaCRM dataset generator — seed 42\n');
fs.mkdirSync(OUT, { recursive: true });

const hacks = buildHackathons();
const users = buildUsers(hacks);
const { participations, teams, teamMembers } = buildParticipationAndTeams(users, hacks);
const { projects, results } = buildProjects(hacks, teams, teamMembers, users);
const mentors = buildMentors();
const mentorSessions = buildMentorSessions(users, hacks, participations, mentors);
const interactions = buildInteractions(users, hacks, participations);
const crm = buildCrm(users, hacks);
const githubProfiles = buildGithubProfiles(users, projects, teamMembers);
const linkedinProfiles = buildLinkedinProfiles(users);

// derived: last_active per user, across every signal we generated
const lastActive = new Map();
const bump = (uid, dateStr) => {
  if (!dateStr) return;
  const d = dateStr.slice(0, 10);
  if (!lastActive.has(uid) || d > lastActive.get(uid)) lastActive.set(uid, d);
};
const hackById = new Map(hacks.map((h) => [h.hackathon_id, h]));
for (const p of participations) {
  bump(p.user_id, p.registered_at);
  if (p.status === 'attended') bump(p.user_id, hackById.get(p.hackathon_id).end_date);
}
for (const s of mentorSessions) bump(s.user_id, s.session_date);
for (const i of interactions) bump(i.user_id, i.timestamp);
for (const u of users) if (!lastActive.has(u.user_id)) lastActive.set(u.user_id, u.signup_date);

// ------------------------------------------------------------------- write

const userRows = users.map((u) => ({
  user_id: u.user_id,
  full_name: u.full_name,
  email: u.email,
  college: u.college,
  degree: u.degree,
  branch: u.branch,
  grad_year: u.grad_year,
  city: u.city,
  signup_date: u.signup_date,
  last_active: lastActive.get(u.user_id),
  github_username: u.github_username || '',
  linkedin_url: u.linkedin_url || '',
  declared_skills: u.declared_skills.join('|'),
  role_pref: u.role_pref,
  consent_flag: String(u.consent_flag),
  referral_source: u.referral_source,
}));

const counts = {};
counts['users.csv'] = writeCsv('users.csv', ['user_id', 'full_name', 'email', 'college', 'degree', 'branch', 'grad_year', 'city', 'signup_date', 'last_active', 'github_username', 'linkedin_url', 'declared_skills', 'role_pref', 'consent_flag', 'referral_source'], userRows);

counts['hackathons.csv'] = writeCsv('hackathons.csv', ['hackathon_id', 'name', 'start_date', 'end_date', 'mode', 'city', 'theme_track', 'sponsors', 'prize_pool_inr', 'max_team_size', 'organizer'], hacks);
counts['teams.csv'] = writeCsv('teams.csv', ['team_id', 'hackathon_id', 'team_name', 'team_size'], teams);
counts['participations.csv'] = writeCsv('participations.csv', ['participation_id', 'user_id', 'hackathon_id', 'team_id', 'team_role', 'registered_at', 'status'], participations);
counts['projects.csv'] = writeCsv('projects.csv', ['project_id', 'team_id', 'hackathon_id', 'title', 'description', 'tech_stack', 'repo_url', 'demo_url', 'submitted_at'], projects);
counts['results.csv'] = writeCsv('results.csv', ['project_id', 'rank', 'prize_track', 'prize_amount_inr', 'score', 'judge_feedback'], results);
counts['mentors.csv'] = writeCsv('mentors.csv', ['mentor_id', 'full_name', 'expertise', 'company', 'years_experience', 'linkedin_url'], mentors);
counts['mentor_sessions.csv'] = writeCsv('mentor_sessions.csv', ['session_id', 'user_id', 'mentor_id', 'hackathon_id', 'session_date', 'duration_min', 'mentor_score', 'notes'], mentorSessions);
counts['interactions.csv'] = writeCsv('interactions.csv', ['interaction_id', 'user_id', 'hackathon_id', 'type', 'timestamp', 'text'], interactions);
counts['crm_touchpoints.csv'] = writeCsv('crm_touchpoints.csv', ['touchpoint_id', 'user_id', 'campaign_name', 'channel', 'sent_at', 'opened', 'clicked', 'replied', 'outcome'], crm);

writeJson('github_profiles.json', githubProfiles);
writeJson('linkedin_profiles.json', linkedinProfiles);
counts['github_profiles.json'] = Object.keys(githubProfiles).length;
counts['linkedin_profiles.json'] = Object.keys(linkedinProfiles).length;

// ------------------------------------------------------- eval questions (computed)

const stat = (uid) => {
  const parts = participations.filter((p) => p.user_id === uid);
  const attended = parts.filter((p) => p.status === 'attended');
  const myTeams = new Set(attended.map((p) => p.team_id));
  const myProjects = projects.filter((p) => myTeams.has(p.team_id));
  const myResults = myProjects.map((p) => results.find((r) => r.project_id === p.project_id));
  const prizes = myResults.filter((r) => r && (r.rank !== '' || (r.prize_track && r.prize_track !== 'Overall' && r.prize_track !== '')));
  const sess = mentorSessions.filter((s) => s.user_id === uid);
  return {
    registered: parts.length,
    attended: attended.length,
    noShows: parts.filter((p) => p.status === 'no_show').length,
    submitted: myProjects.length,
    prizes: prizes.length,
    bestRank: Math.min(...myResults.filter((r) => r && r.rank !== '').map((r) => Number(r.rank)), Infinity),
    avgMentor: sess.length ? Number((sess.reduce((a, s) => a + s.mentor_score, 0) / sess.length).toFixed(2)) : null,
    mentorSessions: sess.length,
    lastActive: lastActive.get(uid),
    workshops: interactions.filter((i) => i.user_id === uid && i.type === 'workshop_attended').length,
    scores: myResults.filter((r) => r).map((r) => Number(r.score)),
  };
};

const u1 = stat('U0001');
const u7 = stat('U0007');
const u8 = stat('U0008');
const u9 = stat('U0009');
const u10 = stat('U0010');
const u11 = stat('U0011');
const u12 = stat('U0012');
const u2 = stat('U0002');
const u3 = stat('U0003');
const shivs = users.filter((u) => u.full_name.trim() === 'Shiv Sharma');
const neo4jWinner = results.find((r) => r.prize_track === 'Best use of Neo4j' && projects.find((p) => p.project_id === r.project_id)?.hackIdx === 22);
const neo4jWinnerProject = projects.find((p) => p.project_id === neo4jWinner?.project_id);

const evalQuestions = [
  { id: 'Q01', type: 'existence', question: 'Is Ananya Iyer in our database?', expected_answer: 'Yes — U0007, IIIT Delhi, ML/AI.', evidence_files: ['users.csv'] },
  { id: 'Q02', type: 'ambiguity', question: 'Is Shiv Sharma in our database?', expected_answer: `Ambiguous — ${shivs.length} people share that name (${shivs.map((s) => `${s.user_id} at ${s.collegeShort}`).join(', ')}). The agent must ask which one.`, evidence_files: ['users.csv'] },
  { id: 'Q03', type: 'not_found', question: 'Is Aarav Malhotra in our database?', expected_answer: 'No. There is no Aarav Malhotra. The agent must say so plainly and must not invent a profile; it may offer the nearest names, clearly labelled as different people.', evidence_files: ['users.csv'] },
  { id: 'Q04', type: 'existence', question: 'Do we have anyone called Ananya Iyar?', expected_answer: 'Fuzzy match to Ananya Iyer (U0007); should flag it as an approximate match.', evidence_files: ['users.csv'] },
  { id: 'Q05', type: 'count', question: 'How many hackathons has Shiv Sharma from IIT Delhi attended?', expected_answer: String(u1.attended), evidence_files: ['participations.csv'] },
  { id: 'Q06', type: 'count', question: 'How many projects has Shiv Sharma from IIT Delhi submitted?', expected_answer: String(u1.submitted), evidence_files: ['projects.csv'] },
  { id: 'Q07', type: 'count', question: 'How many prizes has Ananya Iyer won?', expected_answer: String(u7.prizes), evidence_files: ['results.csv'] },
  { id: 'Q08', type: 'trend', question: 'Is Kabir Singh improving over time?', expected_answer: `Yes — rising. Scores in chronological order: ${u9.scores.join(', ')}.`, evidence_files: ['results.csv'] },
  { id: 'Q09', type: 'count', question: 'How many submissions does Meera Joshi have?', expected_answer: String(u10.submitted), evidence_files: ['projects.csv'] },
  { id: 'Q10', type: 'count', question: 'How many events has Arjun Khanna actually attended?', expected_answer: `${u11.attended} attended out of ${u11.registered} registrations — ${u11.noShows} no-shows.`, evidence_files: ['participations.csv'] },
  { id: 'Q11', type: 'ranking', question: 'Who would make the best mentor this year?', expected_answer: `Sneha Reddy (U0012) — average mentor score ${u12.avgMentor} across ${u12.mentorSessions} sessions.`, evidence_files: ['mentor_sessions.csv'] },
  { id: 'Q12', type: 'consent', question: 'Can we email Nisha Pillai about the next hackathon?', expected_answer: 'No — consent_flag is false and she has an unsubscribed touchpoint.', evidence_files: ['users.csv', 'crm_touchpoints.csv'] },
  { id: 'Q13', type: 'trend', question: 'When was Rohan Mehta last active?', expected_answer: u8.lastActive, evidence_files: ['interactions.csv', 'participations.csv'] },
  { id: 'Q14', type: 'ranking', question: "What is Shiv Sharma from IIT Delhi's strongest language on GitHub?", expected_answer: `Python (${githubProfiles['shivsharma-ml'].top_languages[0].pct}% of ${githubProfiles['shivsharma-ml'].public_repos} repos).`, evidence_files: ['github_profiles.json'] },
  { id: 'Q15', type: 'ranking', question: 'Who won the Best use of Neo4j track at the Data & Graph event?', expected_answer: `Project ${neo4jWinnerProject?.title} (${neo4jWinnerProject?.project_id}), which includes Vikram Rao (U0013).`, evidence_files: ['results.csv'] },
  { id: 'Q16', type: 'trend', question: 'Who has won something but gone quiet?', expected_answer: `Rohan Mehta (U0008) — ${u8.prizes} prizes, last active ${u8.lastActive}.`, evidence_files: ['results.csv', 'interactions.csv'] },
  { id: 'Q17', type: 'count', question: 'Who has Shiv Sharma from IIT Delhi teamed up with more than once?', expected_answer: 'Ananya Iyer (U0007) — twice.', evidence_files: ['participations.csv', 'teams.csv'] },
  { id: 'Q18', type: 'count', question: "What is Shiv Sharma from IIT Delhi's average mentor rating?", expected_answer: String(u1.avgMentor), evidence_files: ['mentor_sessions.csv'] },
  { id: 'Q19', type: 'existence', question: 'Does anyone declare machine learning skills they cannot evidence?', expected_answer: 'Devansh Kapoor (U0015) — declares Machine Learning, Deep Learning and PyTorch, but GitHub is 88% JavaScript across 4 repos and LinkedIn says Frontend Developer Intern.', evidence_files: ['users.csv', 'github_profiles.json'] },
  { id: 'Q20', type: 'count', question: 'How many people are in our database?', expected_answer: String(users.length), evidence_files: ['users.csv'] },
  { id: 'Q21', type: 'count', question: 'How many hackathons have we run?', expected_answer: String(hacks.length), evidence_files: ['hackathons.csv'] },
  { id: 'Q22', type: 'ranking', question: "What is Shivam Sharma's best finish?", expected_answer: u3.bestRank === Infinity ? 'No podium finish.' : `Rank ${u3.bestRank}.`, evidence_files: ['results.csv'] },
  { id: 'Q23', type: 'count', question: 'How many prizes has Shiv Sharma from Amity won?', expected_answer: String(u2.prizes), evidence_files: ['results.csv'] },
  { id: 'Q24', type: 'count', question: 'How many workshops has Sneha Reddy attended?', expected_answer: String(u12.workshops), evidence_files: ['interactions.csv'] },
  { id: 'Q25', type: 'count', question: 'How many people have consented to outreach?', expected_answer: String(users.filter((u) => u.consent_flag).length), evidence_files: ['users.csv'] },
];
writeJson('eval_questions.json', evalQuestions);

// -------------------------------------------------------------- README_data.md

const readme = [
  '# PersonaCRM synthetic dataset',
  '',
  'Generated by `node scripts/generate_data.mjs` (seed 42, deterministic).',
  'Represents a fictional Delhi hackathon-listing platform between 2024-01 and 2026-09.',
  '',
  '**All data is synthetic.** `github_profiles.json` and `linkedin_profiles.json` are',
  'generated fixtures carrying `"source": "synthetic_seed"` — no real profile was scraped.',
  'They model the external context the platform captured at signup. Live Tavily and GitHub',
  'enrichment runs only on the intake form path, for real people who submit it themselves.',
  '',
  '## Files',
  '',
  '| File | Rows |',
  '| --- | --- |',
  ...Object.entries(counts).map(([f, c]) => `| \`${f}\` | ${c} |`),
  '',
  '## Story users',
  '',
  'Hand-authored. Every demo beat and eval question depends on these being exact.',
  '',
  '| ID | Name | What it tests |',
  '| --- | --- | --- |',
  ...STORY_USERS.map((s) => `| ${s.id} | ${s.name} | ${s.notes} |`),
  '',
  '## Must NOT exist',
  '',
  ...BANNED_NAMES.map((n) => `- **${n}** — the existence check must return "not found" and suggest the nearest real name.`),
  '',
  '## Verified story-user stats',
  '',
  '| ID | Registered | Attended | No-shows | Submitted | Prizes | Avg mentor | Last active |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...STORY_USERS.map((s) => {
    const st = stat(s.id);
    return `| ${s.id} | ${st.registered} | ${st.attended} | ${st.noShows} | ${st.submitted} | ${st.prizes} | ${st.avgMentor ?? '—'} | ${st.lastActive} |`;
  }),
  '',
  '## Demo questions these support',
  '',
  ...evalQuestions.map((q) => `- **${q.id}** (${q.type}) — ${q.question}`),
  '',
].join('\n');
fs.writeFileSync(path.join(OUT, 'README_data.md'), readme, 'utf8');

// ------------------------------------------------------------------ summary

console.log('Wrote ./data:\n');
for (const [f, c] of Object.entries(counts)) console.log(`  ${f.padEnd(26)} ${String(c).padStart(6)}`);
console.log(`  ${'README_data.md'.padEnd(26)} ${String(STORY_USERS.length).padStart(6)} story users`);
console.log(`  ${'eval_questions.json'.padEnd(26)} ${String(evalQuestions.length).padStart(6)}`);
console.log('\nStory-user check:');
for (const s of STORY_USERS.slice(0, 17)) {
  const st = stat(s.id);
  console.log(`  ${s.id} ${s.name.padEnd(16)} reg=${st.registered} att=${st.attended} sub=${st.submitted} prizes=${st.prizes} mentor=${st.avgMentor ?? '-'} last=${st.lastActive}`);
}
console.log(`\n"Shiv Sharma" rows in users.csv: ${shivs.length} (must be 2)`);
console.log('Run `node scripts/validate_data.js` next.\n');
