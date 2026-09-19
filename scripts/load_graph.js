#!/usr/bin/env node
/**
 * Loads ./data into Neo4j AuraDB as the PersonaCRM hackathon graph.
 *
 * Everything MERGEs on a business key, so re-running is a no-op rather than a
 * duplication — you will run this many times today. Writes are batched through
 * `neo4jService.runBatch` (UNWIND, 500 rows per transaction) because row-by-row
 * writes against the Aura free tier take 20+ minutes for this dataset.
 *
 * Every relationship carries {source, observed_at}. Provenance is a judged
 * feature and cannot be retrofitted later.
 *
 *   node scripts/load_graph.js
 *   node scripts/load_graph.js --wipe        # delete hackathon nodes first
 *   node scripts/load_graph.js --dry-run     # counts only, no writes
 *   node scripts/load_graph.js --only=users
 */

import { neo4jService } from '../backend/neo4jService.js';
import { applySchema, awaitIndexes } from '../backend/graphSchema.js';
import { parseCsv, readJson, num, bool, list, nullIfBlank, normalizeName } from './data/csv.mjs';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const WIPE = argv.includes('--wipe');
const ONLY = argv.find((a) => a.startsWith('--only='))?.split('=')[1] || null;

const want = (name) => !ONLY || ONLY === name;
const t0 = Date.now();
const summary = [];

function step(name, count, res) {
  const ok = res?.success !== false;
  summary.push({ name, count, ok, ms: res?.durationMs ?? 0, error: res?.error });
  const status = ok ? 'ok  ' : 'FAIL';
  console.log(
    `  ${status} ${name.padEnd(28)} ${String(count).padStart(6)} rows  ${String(res?.durationMs ?? 0).padStart(6)}ms${res?.error ? '  ' + res.error : ''}`
  );
  if (!ok) process.exitCode = 1;
}

async function batch(name, cypher, rows) {
  if (!rows.length) return step(name, 0, { success: true });
  if (DRY) return step(name, rows.length, { success: true });
  const res = await neo4jService.runBatch(cypher, rows, { label: name });
  step(name, rows.length, res);
  return res;
}

// --------------------------------------------------------------------- read

console.log('\nPersonaCRM graph loader\n');
console.log('Reading ./data ...');

const users = parseCsv('users.csv');
const hacks = parseCsv('hackathons.csv');
const teams = parseCsv('teams.csv');
const parts = parseCsv('participations.csv');
const projects = parseCsv('projects.csv');
const results = parseCsv('results.csv');
const mentors = parseCsv('mentors.csv');
const sessions = parseCsv('mentor_sessions.csv');
const interactions = parseCsv('interactions.csv');
const crm = parseCsv('crm_touchpoints.csv');
const githubProfiles = readJson('github_profiles.json');
const linkedinProfiles = readJson('linkedin_profiles.json');

console.log(
  `  ${users.length} users · ${hacks.length} hackathons · ${teams.length} teams · ${parts.length} participations`
);
console.log(
  `  ${projects.length} projects · ${sessions.length} sessions · ${interactions.length} interactions · ${crm.length} touchpoints\n`
);

// ------------------------------------------------------------------- schema

if (!DRY) {
  console.log('Applying schema...');
  await applySchema();
  console.log('Waiting for indexes to come online...');
  const idx = await awaitIndexes();
  console.log(idx.ok ? `  all indexes ONLINE (${idx.waitedMs}ms)\n` : `  WARNING: ${idx.error}\n`);

  if (WIPE) {
    console.log('Wiping existing PersonaCRM nodes (Cognee/memory nodes are left alone)...');
    const labels = [
      'Person',
      'Hackathon',
      'Team',
      'Project',
      'Result',
      'Skill',
      'College',
      'Company',
      'Mentor',
      'MentorSession',
      'Interaction',
      'OutreachEvent',
      'ContextProfile',
      'RawEvent',
    ];
    for (const l of labels) {
      await neo4jService.runCypherQuery(
        `MATCH (n:${l}) CALL { WITH n DETACH DELETE n } IN TRANSACTIONS OF 1000 ROWS`
      );
    }
    console.log('  wiped\n');
  }
}

// ------------------------------------------------------------- reference nodes

console.log('Loading...');

const SRC = (f) => `csv:${f}`;

// Colleges: the CSV has variant spellings for ~5% of rows, so key on the raw
// string but keep a normalized form for matching.
const collegeRows = [...new Set(users.map((u) => u.college))].map((name) => ({
  name,
  city: users.find((u) => u.college === name)?.city || null,
}));
if (want('colleges')) {
  await batch(
    'colleges',
    `UNWIND $rows AS row MERGE (c:College {name: row.name}) SET c.city = coalesce(c.city, row.city)`,
    collegeRows
  );
}

// Skills come from three places: declared, project stacks, and GitHub languages.
const skillSet = new Set();
users.forEach((u) => list(u.declared_skills).forEach((s) => skillSet.add(s)));
projects.forEach((p) => list(p.tech_stack).forEach((s) => skillSet.add(s)));
Object.values(githubProfiles).forEach((g) =>
  g.top_languages.forEach((l) => skillSet.add(l.language))
);
const skillRows = [...skillSet].map((name) => ({ name }));
if (want('skills')) {
  await batch('skills', `UNWIND $rows AS row MERGE (s:Skill {name: row.name})`, skillRows);
}

const companySet = new Set();
Object.values(linkedinProfiles).forEach((p) =>
  (p.experience || []).forEach((e) => e.company && companySet.add(e.company))
);
mentors.forEach((m) => m.company && companySet.add(m.company));
if (want('companies')) {
  await batch(
    'companies',
    `UNWIND $rows AS row MERGE (c:Company {name: row.name})`,
    [...companySet].map((name) => ({ name }))
  );
}

// ------------------------------------------------------------------- people

const userRows = users.map((u) => ({
  user_id: u.user_id,
  full_name: u.full_name.trim(),
  name_normalized: normalizeName(u.full_name),
  email: u.email,
  college: u.college,
  degree: u.degree,
  branch: u.branch,
  grad_year: num(u.grad_year),
  city: u.city,
  signup_date: u.signup_date,
  last_active: u.last_active,
  github_username: nullIfBlank(u.github_username),
  linkedin_url: nullIfBlank(u.linkedin_url),
  role_pref: u.role_pref,
  consent_flag: bool(u.consent_flag),
  referral_source: u.referral_source,
}));

if (want('users')) {
  await batch(
    'people',
    `UNWIND $rows AS row
     MERGE (p:Person {user_id: row.user_id})
     SET p += row`,
    userRows
  );
  await batch(
    'person -> college',
    `UNWIND $rows AS row
     MATCH (p:Person {user_id: row.user_id})
     MATCH (c:College {name: row.college})
     MERGE (p)-[r:STUDIED_AT]->(c)
     SET r.source = row.source, r.observed_at = row.observed_at`,
    users.map((u) => ({
      user_id: u.user_id,
      college: u.college,
      source: SRC('users.csv'),
      observed_at: u.signup_date,
    }))
  );
  await batch(
    'declared skills',
    `UNWIND $rows AS row
     MATCH (p:Person {user_id: row.user_id})
     MATCH (s:Skill {name: row.skill})
     MERGE (p)-[r:HAS_SKILL {source: 'declared'}]->(s)
     SET r.confidence = 0.3, r.evidence = 'self-declared at signup', r.observed_at = row.observed_at`,
    users.flatMap((u) =>
      list(u.declared_skills).map((skill) => ({
        user_id: u.user_id,
        skill,
        observed_at: u.signup_date,
      }))
    )
  );
}

// --------------------------------------------------------------- hackathons

if (want('hackathons')) {
  await batch(
    'hackathons',
    `UNWIND $rows AS row MERGE (h:Hackathon {hackathon_id: row.hackathon_id}) SET h += row`,
    hacks.map((h) => ({
      hackathon_id: h.hackathon_id,
      name: h.name,
      start_date: h.start_date,
      end_date: h.end_date,
      mode: h.mode,
      city: h.city,
      theme_track: h.theme_track,
      sponsors: list(h.sponsors),
      prize_pool_inr: num(h.prize_pool_inr),
      max_team_size: num(h.max_team_size),
      organizer: h.organizer,
    }))
  );
}

if (want('teams')) {
  await batch(
    'teams',
    `UNWIND $rows AS row
     MERGE (t:Team {team_id: row.team_id})
     SET t.team_name = row.team_name, t.team_size = row.team_size
     WITH t, row MATCH (h:Hackathon {hackathon_id: row.hackathon_id})
     MERGE (t)-[r:COMPETED_IN]->(h) SET r.source = row.source`,
    teams.map((t) => ({
      team_id: t.team_id,
      team_name: t.team_name,
      team_size: num(t.team_size),
      hackathon_id: t.hackathon_id,
      source: SRC('teams.csv'),
    }))
  );
}

// ----------------------------------------------------------- participations

if (want('participations')) {
  await batch(
    'registered_for',
    `UNWIND $rows AS row
     MATCH (p:Person {user_id: row.user_id})
     MATCH (h:Hackathon {hackathon_id: row.hackathon_id})
     MERGE (p)-[r:REGISTERED_FOR]->(h)
     SET r.registered_at = row.registered_at, r.status = row.status,
         r.participation_id = row.participation_id, r.source = row.source, r.observed_at = row.registered_at`,
    parts.map((p) => ({ ...p, source: SRC('participations.csv') }))
  );

  await batch(
    'attended',
    `UNWIND $rows AS row
     MATCH (p:Person {user_id: row.user_id})
     MATCH (h:Hackathon {hackathon_id: row.hackathon_id})
     MERGE (p)-[r:ATTENDED]->(h)
     SET r.registered_at = row.registered_at, r.source = row.source, r.observed_at = row.observed_at`,
    parts
      .filter((p) => p.status === 'attended')
      .map((p) => ({
        user_id: p.user_id,
        hackathon_id: p.hackathon_id,
        registered_at: p.registered_at,
        source: SRC('participations.csv'),
        observed_at: hacks.find((h) => h.hackathon_id === p.hackathon_id)?.end_date,
      }))
  );

  await batch(
    'member_of',
    `UNWIND $rows AS row
     MATCH (p:Person {user_id: row.user_id})
     MATCH (t:Team {team_id: row.team_id})
     MERGE (p)-[r:MEMBER_OF]->(t)
     SET r.team_role = row.team_role, r.source = row.source, r.observed_at = row.observed_at`,
    parts
      .filter((p) => p.team_id)
      .map((p) => ({
        user_id: p.user_id,
        team_id: p.team_id,
        team_role: p.team_role,
        source: SRC('participations.csv'),
        observed_at: p.registered_at,
      }))
  );
}

// ------------------------------------------------------- projects & results

if (want('projects')) {
  await batch(
    'projects',
    `UNWIND $rows AS row
     MERGE (pr:Project {project_id: row.project_id})
     SET pr.title = row.title, pr.description = row.description, pr.tech_stack = row.tech_stack,
         pr.repo_url = row.repo_url, pr.demo_url = row.demo_url, pr.submitted_at = row.submitted_at,
         pr.hackathon_id = row.hackathon_id
     WITH pr, row
     MATCH (t:Team {team_id: row.team_id})
     MERGE (t)-[r:BUILT]->(pr) SET r.source = row.source, r.observed_at = row.submitted_at`,
    projects.map((p) => ({
      project_id: p.project_id,
      team_id: p.team_id,
      hackathon_id: p.hackathon_id,
      title: p.title,
      description: p.description,
      tech_stack: list(p.tech_stack),
      repo_url: nullIfBlank(p.repo_url),
      demo_url: nullIfBlank(p.demo_url),
      submitted_at: p.submitted_at,
      source: SRC('projects.csv'),
    }))
  );

  await batch(
    'project -> skill',
    `UNWIND $rows AS row
     MATCH (pr:Project {project_id: row.project_id})
     MATCH (s:Skill {name: row.skill})
     MERGE (pr)-[r:USES]->(s) SET r.source = row.source`,
    projects.flatMap((p) =>
      list(p.tech_stack).map((skill) => ({
        project_id: p.project_id,
        skill,
        source: SRC('projects.csv'),
      }))
    )
  );

  await batch(
    'results',
    `UNWIND $rows AS row
     MERGE (res:Result {project_id: row.project_id})
     SET res.rank = row.rank, res.prize_track = row.prize_track, res.prize_amount_inr = row.prize_amount_inr,
         res.score = row.score, res.judge_feedback = row.judge_feedback
     WITH res, row
     MATCH (pr:Project {project_id: row.project_id})
     MERGE (pr)-[r:ACHIEVED]->(res) SET r.source = row.source`,
    results.map((r) => ({
      project_id: r.project_id,
      rank: num(r.rank),
      prize_track: nullIfBlank(r.prize_track),
      prize_amount_inr: num(r.prize_amount_inr),
      score: num(r.score),
      judge_feedback: r.judge_feedback,
      source: SRC('results.csv'),
    }))
  );
}

// -------------------------------------------------------------- mentorship

if (want('mentors')) {
  await batch(
    'mentors',
    `UNWIND $rows AS row MERGE (m:Mentor {mentor_id: row.mentor_id}) SET m += row`,
    mentors.map((m) => ({ ...m, years_experience: num(m.years_experience) }))
  );
  await batch(
    'mentor -> company',
    `UNWIND $rows AS row
     MATCH (m:Mentor {mentor_id: row.mentor_id}) MATCH (c:Company {name: row.company})
     MERGE (m)-[r:WORKS_AT]->(c) SET r.source = row.source`,
    mentors
      .filter((m) => m.company)
      .map((m) => ({ mentor_id: m.mentor_id, company: m.company, source: SRC('mentors.csv') }))
  );
  await batch(
    'mentor sessions',
    `UNWIND $rows AS row
     MERGE (s:MentorSession {session_id: row.session_id})
     SET s.session_date = row.session_date, s.duration_min = row.duration_min,
         s.mentor_score = row.mentor_score, s.notes = row.notes
     WITH s, row
     MATCH (p:Person {user_id: row.user_id})
     MATCH (m:Mentor {mentor_id: row.mentor_id})
     MATCH (h:Hackathon {hackathon_id: row.hackathon_id})
     MERGE (p)-[r1:PERFORMED]->(s) SET r1.source = row.source, r1.observed_at = row.session_date
     MERGE (s)-[:WITH_MENTOR]->(m)
     MERGE (s)-[:DURING]->(h)`,
    sessions.map((s) => ({
      ...s,
      duration_min: num(s.duration_min),
      mentor_score: num(s.mentor_score),
      source: SRC('mentor_sessions.csv'),
    }))
  );
}

// ------------------------------------------------------------ interactions

if (want('interactions')) {
  await batch(
    'interactions',
    `UNWIND $rows AS row
     MERGE (i:Interaction {interaction_id: row.interaction_id})
     SET i.type = row.type, i.timestamp = row.timestamp, i.text = row.text, i.hackathon_id = row.hackathon_id
     WITH i, row
     MATCH (p:Person {user_id: row.user_id})
     MERGE (p)-[r:POSTED]->(i) SET r.source = row.source, r.observed_at = row.timestamp`,
    interactions.map((i) => ({
      ...i,
      hackathon_id: nullIfBlank(i.hackathon_id),
      source: SRC('interactions.csv'),
    }))
  );
}

// ---------------------------------------------------------------- outreach

if (want('crm')) {
  await batch(
    'outreach events',
    `UNWIND $rows AS row
     MERGE (o:OutreachEvent {touchpoint_id: row.touchpoint_id})
     SET o.campaign_name = row.campaign_name, o.channel = row.channel, o.sent_at = row.sent_at,
         o.opened = row.opened, o.clicked = row.clicked, o.replied = row.replied, o.outcome = row.outcome
     WITH o, row
     MATCH (p:Person {user_id: row.user_id})
     MERGE (p)-[r:RECEIVED]->(o) SET r.source = row.source, r.observed_at = row.sent_at`,
    crm.map((c) => ({
      ...c,
      opened: bool(c.opened),
      clicked: bool(c.clicked),
      replied: bool(c.replied),
      source: SRC('crm_touchpoints.csv'),
    }))
  );
}

// ------------------------------------------------- external synthetic seeds

if (want('external')) {
  const ghSkillRows = [];
  const ghPropRows = [];
  for (const [username, g] of Object.entries(githubProfiles)) {
    ghPropRows.push({
      username,
      public_repos: g.public_repos,
      followers: g.followers,
      contributions_last_year: g.contributions_last_year,
      account_created: g.account_created,
      github_bio: g.bio || null,
      github_source: g.source,
    });
    for (const l of g.top_languages) {
      ghSkillRows.push({ username, skill: l.language, pct: l.pct, repos: g.public_repos });
    }
  }
  await batch(
    'github profile props',
    `UNWIND $rows AS row
     MATCH (p:Person {github_username: row.username})
     SET p.public_repos = row.public_repos, p.followers = row.followers,
         p.contributions_last_year = row.contributions_last_year,
         p.github_account_created = row.account_created, p.github_bio = row.github_bio,
         p.github_source = row.github_source`,
    ghPropRows
  );
  await batch(
    'github languages -> skills',
    `UNWIND $rows AS row
     MATCH (p:Person {github_username: row.username})
     MATCH (s:Skill {name: row.skill})
     MERGE (p)-[r:HAS_SKILL {source: 'github'}]->(s)
     SET r.confidence = toFloat(row.pct) / 100.0,
         r.evidence = toString(row.pct) + '% of ' + toString(row.repos) + ' public repos',
         r.origin = 'synthetic_seed'`,
    ghSkillRows
  );

  const liExp = [];
  for (const [url, p] of Object.entries(linkedinProfiles)) {
    for (const e of p.experience || []) {
      if (e.company)
        liExp.push({ url, company: e.company, title: e.title, start: e.start, end: e.end || null });
    }
  }
  await batch(
    'linkedin -> company',
    `UNWIND $rows AS row
     MATCH (p:Person {linkedin_url: row.url})
     MATCH (c:Company {name: row.company})
     MERGE (p)-[r:WORKED_AT {title: row.title}]->(c)
     SET r.start = row.start, r.end = row.end, r.source = 'linkedin', r.origin = 'synthetic_seed'`,
    liExp
  );
}

// ------------------------------------------------- derived: project skills

if (want('derived')) {
  // A skill actually used in a submitted project is much stronger evidence than
  // a self-declaration, so it gets its own typed edge with its own confidence.
  const projSkillRows = [];
  const teamMembers = new Map();
  for (const p of parts) {
    if (!p.team_id) continue;
    if (!teamMembers.has(p.team_id)) teamMembers.set(p.team_id, []);
    teamMembers.get(p.team_id).push(p.user_id);
  }
  const resultBy = new Map(results.map((r) => [r.project_id, r]));
  for (const pr of projects) {
    const members = teamMembers.get(pr.team_id) || [];
    const score = num(resultBy.get(pr.project_id)?.score);
    for (const uid of members) {
      for (const skill of list(pr.tech_stack)) {
        projSkillRows.push({ user_id: uid, skill, project_id: pr.project_id, score });
      }
    }
  }
  await batch(
    'project skills -> person',
    `UNWIND $rows AS row
     MATCH (p:Person {user_id: row.user_id})
     MATCH (s:Skill {name: row.skill})
     MERGE (p)-[r:HAS_SKILL {source: 'project'}]->(s)
     SET r.confidence = 0.8,
         r.evidence = 'built ' + row.project_id + coalesce(' (scored ' + toString(row.score) + ')', ''),
         r.project_id = row.project_id`,
    projSkillRows
  );

  // TEAMMATE_OF with a `times` count — matchmaking and the "repeat collaborator"
  // answer both read this, so it is computed at load rather than at query time.
  const pairCounts = new Map();
  for (const [teamId, members] of teamMembers) {
    const hackId = teams.find((t) => t.team_id === teamId)?.hackathon_id;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const [a, b] = [members[i], members[j]].sort();
        const key = `${a}|${b}`;
        if (!pairCounts.has(key)) pairCounts.set(key, { a, b, times: 0, hackathons: [] });
        const e = pairCounts.get(key);
        e.times++;
        if (hackId) e.hackathons.push(hackId);
      }
    }
  }
  await batch(
    'teammate_of',
    `UNWIND $rows AS row
     MATCH (a:Person {user_id: row.a})
     MATCH (b:Person {user_id: row.b})
     MERGE (a)-[r:TEAMMATE_OF]-(b)
     SET r.times = row.times, r.hackathons = row.hackathons, r.source = 'derived:participations+teams'`,
    [...pairCounts.values()]
  );
}

// ----------------------------------------------------------------- summary

const totalMs = Date.now() - t0;
const failedSteps = summary.filter((s) => !s.ok);
console.log('\n' + '-'.repeat(64));
console.log(
  `  ${summary.length - failedSteps.length}/${summary.length} steps ok · ${(totalMs / 1000).toFixed(1)}s total${DRY ? '  (DRY RUN — nothing written)' : ''}`
);
if (failedSteps.length) {
  console.log('  FAILED:');
  failedSteps.forEach((s) => console.log(`    ${s.name}: ${s.error}`));
}
console.log('-'.repeat(64) + '\n');

if (!DRY) {
  const counts = await neo4jService.runCypherQuery(
    'MATCH (n) UNWIND labels(n) AS l RETURN l AS label, count(*) AS c ORDER BY c DESC'
  );
  if (counts.success) {
    console.log('Node counts:');
    counts.records.forEach((r) =>
      console.log(`  ${String(r.label).padEnd(20)} ${String(r.c).padStart(6)}`)
    );
  }
  const rels = await neo4jService.runCypherQuery(
    'MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS c ORDER BY c DESC'
  );
  if (rels.success) {
    console.log('\nRelationship counts:');
    rels.records.forEach((r) =>
      console.log(`  ${String(r.type).padEnd(20)} ${String(r.c).padStart(6)}`)
    );
  }
  console.log('\nRun `npm run data:verify` next.\n');
}

await neo4jService.close();
process.exit(process.exitCode || 0);
