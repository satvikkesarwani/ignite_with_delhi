#!/usr/bin/env node
/**
 * Integrity checks for the generated dataset in ./data.
 *
 * A broken load discovered at hour five of an eight-hour hackathon is fatal, so
 * this runs before anything touches Neo4j. Prints a PASS/FAIL table and the
 * actual offending rows (not just a count), and exits non-zero on any failure.
 *
 *   node scripts/validate_data.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { STORY_USERS, BANNED_NAMES } from './data/storyUsers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '..', 'data');
const TODAY = '2026-09-19';

// ------------------------------------------------------------------ csv parse

function parseCsv(file) {
  const text = fs.readFileSync(path.join(DATA, file), 'utf8');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows.shift();
  return rows.filter((r) => r.length === headers.length).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

// ------------------------------------------------------------------- harness

const results = [];
let failed = 0;
function check(name, fn) {
  let bad = [];
  let err = null;
  try {
    bad = fn() || [];
  } catch (e) {
    err = e;
  }
  const ok = !err && bad.length === 0;
  if (!ok) failed++;
  results.push({ name, ok, bad: bad.slice(0, 6), total: bad.length, err });
}

// ---------------------------------------------------------------------- load

const users = parseCsv('users.csv');
const hacks = parseCsv('hackathons.csv');
const teams = parseCsv('teams.csv');
const parts = parseCsv('participations.csv');
const projects = parseCsv('projects.csv');
const results_ = parseCsv('results.csv');
const mentors = parseCsv('mentors.csv');
const sessions = parseCsv('mentor_sessions.csv');
const interactions = parseCsv('interactions.csv');
const crm = parseCsv('crm_touchpoints.csv');
const github = readJson('github_profiles.json');
const linkedin = readJson('linkedin_profiles.json');

const userIds = new Set(users.map((u) => u.user_id));
const hackIds = new Set(hacks.map((h) => h.hackathon_id));
const teamIds = new Set(teams.map((t) => t.team_id));
const projectIds = new Set(projects.map((p) => p.project_id));
const mentorIds = new Set(mentors.map((m) => m.mentor_id));
const hackById = new Map(hacks.map((h) => [h.hackathon_id, h]));
const userById = new Map(users.map((u) => [u.user_id, u]));
const teamById = new Map(teams.map((t) => [t.team_id, t]));
const resultByProject = new Map(results_.map((r) => [r.project_id, r]));

// ------------------------------------------------------------ primary keys

const dupes = (rows, key) => {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (seen.has(r[key])) out.push(`${key}=${r[key]}`);
    seen.add(r[key]);
  }
  return out;
};

check('PK unique: users.user_id', () => dupes(users, 'user_id'));
check('PK unique: hackathons.hackathon_id', () => dupes(hacks, 'hackathon_id'));
check('PK unique: teams.team_id', () => dupes(teams, 'team_id'));
check('PK unique: participations.participation_id', () => dupes(parts, 'participation_id'));
check('PK unique: projects.project_id', () => dupes(projects, 'project_id'));
check('PK unique: results.project_id', () => dupes(results_, 'project_id'));
check('PK unique: mentor_sessions.session_id', () => dupes(sessions, 'session_id'));
check('PK unique: interactions.interaction_id', () => dupes(interactions, 'interaction_id'));
check('PK unique: crm_touchpoints.touchpoint_id', () => dupes(crm, 'touchpoint_id'));

check('users.email unique', () => dupes(users, 'email'));

// ----------------------------------------------------------- foreign keys

check('FK participations -> user/hackathon/team', () =>
  parts.filter((p) => !userIds.has(p.user_id) || !hackIds.has(p.hackathon_id) || (p.team_id && !teamIds.has(p.team_id))).map((p) => p.participation_id)
);
check('FK teams -> hackathon', () => teams.filter((t) => !hackIds.has(t.hackathon_id)).map((t) => t.team_id));
check('FK projects -> team/hackathon', () => projects.filter((p) => !teamIds.has(p.team_id) || !hackIds.has(p.hackathon_id)).map((p) => p.project_id));
check('FK results -> project', () => results_.filter((r) => !projectIds.has(r.project_id)).map((r) => r.project_id));
check('FK mentor_sessions -> user/mentor/hackathon', () =>
  sessions.filter((s) => !userIds.has(s.user_id) || !mentorIds.has(s.mentor_id) || !hackIds.has(s.hackathon_id)).map((s) => s.session_id)
);
check('FK interactions -> user (and hackathon when set)', () =>
  interactions.filter((i) => !userIds.has(i.user_id) || (i.hackathon_id && !hackIds.has(i.hackathon_id))).map((i) => i.interaction_id)
);
check('FK crm_touchpoints -> user', () => crm.filter((c) => !userIds.has(c.user_id)).map((c) => c.touchpoint_id));
check('Every project has a result row', () => projects.filter((p) => !resultByProject.has(p.project_id)).map((p) => p.project_id));

// ------------------------------------------------------- team consistency

check('No user on two teams in one hackathon', () => {
  const seen = new Map();
  const bad = [];
  for (const p of parts) {
    if (!p.team_id) continue;
    const key = `${p.user_id}@${p.hackathon_id}`;
    if (seen.has(key) && seen.get(key) !== p.team_id) bad.push(`${key}: ${seen.get(key)} vs ${p.team_id}`);
    seen.set(key, p.team_id);
  }
  return bad;
});

check('teams.team_size matches actual members', () => {
  const counts = new Map();
  for (const p of parts) if (p.team_id) counts.set(p.team_id, (counts.get(p.team_id) || 0) + 1);
  return teams.filter((t) => Number(t.team_size) !== (counts.get(t.team_id) || 0)).map((t) => `${t.team_id}: declared ${t.team_size}, actual ${counts.get(t.team_id) || 0}`);
});

check('no_show rows carry no team, attended rows do', () =>
  parts.filter((p) => (p.status === 'no_show' && p.team_id) || (p.status === 'attended' && !p.team_id)).map((p) => `${p.participation_id} (${p.status})`)
);

// -------------------------------------------------------------- date order

check('signup_date <= registered_at < hackathon start', () =>
  parts
    .filter((p) => {
      const u = userById.get(p.user_id);
      const h = hackById.get(p.hackathon_id);
      return !u || !h || u.signup_date > p.registered_at || p.registered_at >= h.start_date;
    })
    .map((p) => {
      const u = userById.get(p.user_id);
      const h = hackById.get(p.hackathon_id);
      return `${p.participation_id}: signup ${u?.signup_date} reg ${p.registered_at} start ${h?.start_date}`;
    })
);

check('submitted_at within hackathon window', () =>
  projects
    .filter((p) => {
      const h = hackById.get(p.hackathon_id);
      const d = p.submitted_at.slice(0, 10);
      return !h || d < h.start_date || d > h.end_date;
    })
    .map((p) => `${p.project_id}: ${p.submitted_at}`)
);

check('mentor_session within hackathon window', () =>
  sessions
    .filter((s) => {
      const h = hackById.get(s.hackathon_id);
      return !h || s.session_date < h.start_date || s.session_date > h.end_date;
    })
    .map((s) => `${s.session_id}: ${s.session_date}`)
);

check('nothing dated after today (2026-09-19)', () => {
  const bad = [];
  for (const h of hacks) if (h.end_date > TODAY) bad.push(`hackathon ${h.hackathon_id} ${h.end_date}`);
  for (const p of projects) if (p.submitted_at.slice(0, 10) > TODAY) bad.push(`project ${p.project_id}`);
  for (const i of interactions) if (i.timestamp.slice(0, 10) > TODAY) bad.push(`interaction ${i.interaction_id} ${i.timestamp}`);
  for (const c of crm) if (c.sent_at.slice(0, 10) > TODAY) bad.push(`touchpoint ${c.touchpoint_id} ${c.sent_at}`);
  for (const u of users) if (u.last_active > TODAY || u.signup_date > TODAY) bad.push(`user ${u.user_id}`);
  return bad;
});

check('interactions not before the user signed up', () =>
  interactions.filter((i) => i.timestamp.slice(0, 10) < userById.get(i.user_id)?.signup_date).map((i) => `${i.interaction_id}: ${i.timestamp} < ${userById.get(i.user_id)?.signup_date}`)
);

// -------------------------------------------------------- ranks and prizes

check('rank order consistent with score', () => {
  const byHack = new Map();
  for (const p of projects) {
    if (!byHack.has(p.hackathon_id)) byHack.set(p.hackathon_id, []);
    byHack.get(p.hackathon_id).push(p);
  }
  const bad = [];
  for (const [hid, ps] of byHack) {
    const ranked = ps.map((p) => ({ p, r: resultByProject.get(p.project_id) })).filter((x) => x.r && x.r.rank !== '');
    ranked.sort((a, b) => Number(a.r.rank) - Number(b.r.rank));
    for (let i = 1; i < ranked.length; i++) {
      if (Number(ranked[i].r.score) >= Number(ranked[i - 1].r.score)) {
        bad.push(`${hid}: rank ${ranked[i].r.rank} scores ${ranked[i].r.score} >= rank ${ranked[i - 1].r.rank} scores ${ranked[i - 1].r.score}`);
      }
    }
    // nothing unranked may outscore the lowest podium finisher
    const lowest = ranked.length ? Number(ranked[ranked.length - 1].r.score) : null;
    if (lowest !== null) {
      for (const { p, r } of ps.map((p) => ({ p, r: resultByProject.get(p.project_id) }))) {
        if (!r || r.rank !== '' || r.prize_track) continue;
        if (Number(r.score) >= lowest) bad.push(`${hid}: unranked ${p.project_id} scores ${r.score} >= podium low ${lowest}`);
      }
    }
  }
  return bad;
});

check('sponsor tracks only in the final three events', () => {
  const allowed = new Set(hacks.slice(-3).map((h) => h.hackathon_id));
  return results_
    .filter((r) => r.prize_track && r.prize_track !== 'Overall')
    .filter((r) => {
      const proj = projects.find((p) => p.project_id === r.project_id);
      return !proj || !allowed.has(proj.hackathon_id);
    })
    .map((r) => `${r.project_id}: ${r.prize_track}`);
});

check('each sponsor track awarded at most once per event', () => {
  const seen = new Set();
  const bad = [];
  for (const r of results_) {
    if (!r.prize_track || r.prize_track === 'Overall') continue;
    const proj = projects.find((p) => p.project_id === r.project_id);
    const key = `${proj?.hackathon_id}|${r.prize_track}`;
    if (seen.has(key)) bad.push(key);
    seen.add(key);
  }
  return bad;
});

check('ranks 1-3 unique per hackathon', () => {
  const seen = new Set();
  const bad = [];
  for (const r of results_) {
    if (r.rank === '') continue;
    const proj = projects.find((p) => p.project_id === r.project_id);
    const key = `${proj?.hackathon_id}|rank${r.rank}`;
    if (seen.has(key)) bad.push(key);
    seen.add(key);
  }
  return bad;
});

// ------------------------------------------------------------------ consent

check('no touchpoint after an unsubscribe', () => {
  const byUser = new Map();
  for (const c of crm) {
    if (!byUser.has(c.user_id)) byUser.set(c.user_id, []);
    byUser.get(c.user_id).push(c);
  }
  const bad = [];
  for (const [uid, rows] of byUser) {
    rows.sort((a, b) => a.sent_at.localeCompare(b.sent_at));
    const unsubIdx = rows.findIndex((r) => r.outcome === 'unsubscribed');
    if (unsubIdx >= 0 && unsubIdx < rows.length - 1) bad.push(`${uid}: ${rows.length - 1 - unsubIdx} touchpoints after unsubscribe`);
  }
  return bad;
});

check('clicked implies opened, replied implies opened', () =>
  crm.filter((c) => (c.clicked === 'true' && c.opened !== 'true') || (c.replied === 'true' && c.opened !== 'true')).map((c) => c.touchpoint_id)
);

// ---------------------------------------------------- external profile links

check('every github_username has a profile and vice versa', () => {
  const declared = new Set(users.map((u) => u.github_username).filter(Boolean));
  const bad = [];
  for (const g of declared) if (!github[g]) bad.push(`user declares ${g}, no profile`);
  for (const g of Object.keys(github)) if (!declared.has(g)) bad.push(`profile ${g} has no user`);
  return bad;
});

check('every linkedin_url has a profile and vice versa', () => {
  const declared = new Set(users.map((u) => u.linkedin_url).filter(Boolean));
  const bad = [];
  for (const l of declared) if (!linkedin[l]) bad.push(`user declares ${l}, no profile`);
  for (const l of Object.keys(linkedin)) if (!declared.has(l)) bad.push(`profile ${l} has no user`);
  return bad;
});

check('external profiles are labelled synthetic', () =>
  [...Object.values(github), ...Object.values(linkedin)].filter((p) => p.source !== 'synthetic_seed').map((p) => p.username || p.url)
);

check('github top_languages sum to ~100', () =>
  Object.values(github)
    .filter((p) => Math.abs(p.top_languages.reduce((a, l) => a + l.pct, 0) - 100) > 2)
    .map((p) => `${p.username}: ${p.top_languages.reduce((a, l) => a + l.pct, 0)}`)
);

// ------------------------------------------------------------- story users

const statOf = (uid) => {
  const ps = parts.filter((p) => p.user_id === uid);
  const attended = ps.filter((p) => p.status === 'attended');
  const myTeams = new Set(attended.map((p) => p.team_id));
  const myProjects = projects.filter((p) => myTeams.has(p.team_id));
  const myResults = myProjects.map((p) => resultByProject.get(p.project_id)).filter(Boolean);
  const sess = sessions.filter((s) => s.user_id === uid);
  return {
    registered: ps.length,
    attended: attended.length,
    noShows: ps.filter((p) => p.status === 'no_show').length,
    submitted: myProjects.length,
    prizes: myResults.filter((r) => r.rank !== '' || r.prize_track).length,
    avgMentor: sess.length ? Number((sess.reduce((a, s) => a + Number(s.mentor_score), 0) / sess.length).toFixed(2)) : null,
  };
};

check('story users match their declared specs', () => {
  const bad = [];
  for (const s of STORY_USERS) {
    const st = statOf(s.id);
    const expectedReg = s.hackathons.length;
    const expectedAttended = expectedReg - (s.noShow?.length || 0);
    const expectedSubmitted = expectedAttended - (s.noSubmit?.length || 0);
    const expectedPrizes = Object.values(s.forcedResults || {}).filter((f) => f.rank || f.prizeTrack).length;
    if (st.registered !== expectedReg) bad.push(`${s.id} registered ${st.registered} != ${expectedReg}`);
    if (st.attended !== expectedAttended) bad.push(`${s.id} attended ${st.attended} != ${expectedAttended}`);
    if (st.submitted !== expectedSubmitted) bad.push(`${s.id} submitted ${st.submitted} != ${expectedSubmitted}`);
    if (st.prizes !== expectedPrizes) bad.push(`${s.id} prizes ${st.prizes} != ${expectedPrizes}`);
  }
  return bad;
});

check('Kabir Singh (U0009) score series is 52,68,79,91', () => {
  const ps = parts.filter((p) => p.user_id === 'U0009' && p.status === 'attended');
  const myTeams = new Set(ps.map((p) => p.team_id));
  const rows = projects
    .filter((p) => myTeams.has(p.team_id))
    .map((p) => ({ at: p.submitted_at, score: Number(resultByProject.get(p.project_id)?.score) }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const got = rows.map((r) => r.score).join(',');
  return got === '52,68,79,91' ? [] : [`got ${got}`];
});

check('U0015 claim gap: declares ML, GitHub is mostly JavaScript', () => {
  const u = userById.get('U0015');
  const gh = github[u.github_username];
  const bad = [];
  if (!/Machine Learning/.test(u.declared_skills)) bad.push('U0015 no longer declares Machine Learning');
  if (gh.top_languages[0].language !== 'JavaScript') bad.push(`top language is ${gh.top_languages[0].language}, expected JavaScript`);
  return bad;
});

check('U0001 and U0007 are repeat teammates (2 shared teams)', () => {
  const teamsOf = (uid) => new Set(parts.filter((p) => p.user_id === uid && p.team_id).map((p) => p.team_id));
  const a = teamsOf('U0001');
  const b = teamsOf('U0007');
  const shared = [...a].filter((t) => b.has(t));
  return shared.length === 2 ? [] : [`shared ${shared.length} teams, expected 2`];
});

check('U0016 has consent_flag=false and an unsubscribe', () => {
  const u = userById.get('U0016');
  const rows = crm.filter((c) => c.user_id === 'U0016');
  const bad = [];
  if (u.consent_flag !== 'false') bad.push('consent_flag is not false');
  if (!rows.some((r) => r.outcome === 'unsubscribed')) bad.push('no unsubscribed touchpoint');
  return bad;
});

// --------------------------------------------------------- existence probes

check('exactly two people named Shiv Sharma', () => {
  const n = users.filter((u) => u.full_name.trim() === 'Shiv Sharma').length;
  return n === 2 ? [] : [`found ${n}`];
});

check('banned probe names appear nowhere', () => {
  const haystack = [
    ...users.map((u) => u.full_name),
    ...mentors.map((m) => m.full_name),
    ...Object.values(github).map((g) => g.name || ''),
    ...projects.map((p) => p.description),
    ...interactions.map((i) => i.text),
  ].join('\n');
  return BANNED_NAMES.filter((n) => haystack.includes(n));
});

check('U0017 Aarav Malik exists as the near-miss', () => (users.some((u) => u.full_name.trim() === 'Aarav Malik') ? [] : ['missing']));

// -------------------------------------------------------------- text quality

check('project descriptions are not near-duplicates', () => {
  const heads = new Map();
  for (const p of projects) {
    const head = p.description.split(/\s+/).slice(0, 8).join(' ');
    heads.set(head, (heads.get(head) || 0) + 1);
  }
  const worst = [...heads.entries()].filter(([, c]) => c / projects.length > 0.1);
  return worst.map(([h, c]) => `${c}/${projects.length} share opening "${h}"`);
});

check('no project description is byte-identical to another', () => {
  const seen = new Set();
  const bad = [];
  for (const p of projects) {
    if (seen.has(p.description)) bad.push(p.project_id);
    seen.add(p.description);
  }
  return bad;
});

check('judge feedback tone matches score band', () => {
  const bad = [];
  for (const r of results_) {
    const s = Number(r.score);
    if (!r.judge_feedback) bad.push(`${r.project_id}: empty feedback`);
    if (s > 85 && /struggl|overscoped|failed twice|insufficient/i.test(r.judge_feedback)) bad.push(`${r.project_id}: harsh feedback on score ${s}`);
  }
  return bad;
});

// ------------------------------------------------------------------- report

const W = 56;
console.log('\nDataset validation — ./data\n');
for (const r of results) {
  const status = r.ok ? 'PASS' : 'FAIL';
  console.log(`  [${status}] ${r.name}`);
  if (r.err) console.log(`         ERROR: ${r.err.message}`);
  for (const b of r.bad) console.log(`         - ${b}`);
  if (r.total > r.bad.length) console.log(`         ... and ${r.total - r.bad.length} more`);
}
console.log('\n' + '-'.repeat(W));
console.log(`  ${results.length - failed}/${results.length} checks passed`);
console.log(`  users ${users.length} · hackathons ${hacks.length} · teams ${teams.length} · participations ${parts.length}`);
console.log(`  projects ${projects.length} · mentor sessions ${sessions.length} · interactions ${interactions.length} · touchpoints ${crm.length}`);
console.log('-'.repeat(W) + '\n');

if (failed) {
  console.error(`${failed} check(s) FAILED — fix before loading the graph.\n`);
  process.exit(1);
}
console.log('All checks passed. Safe to load.\n');
