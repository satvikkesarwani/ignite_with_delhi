/**
 * Read-side of the context layer: what the directory, the drawer and the
 * header strip need. Profiles come from the profile store (a cache of the
 * ContextProfile nodes, mirrored on disk); graph-only questions — the evidence
 * subgraph, live counts — go to Neo4j and fall back to profile-derived data if
 * the graph is unreachable, so nothing ever renders blank.
 */

import { profileStore, toRow, canonicalCollege } from './profileStore.js';
import { neo4jService } from './neo4jService.js';
import { parseCsv } from '../scripts/data/csv.mjs';

// ------------------------------------------------------------------- stats

let graphProbe = { at: 0, ok: false };

async function graphIsLive() {
  if (Date.now() - graphProbe.at < 10000) return graphProbe.ok;
  let ok = false;
  if (!neo4jService.isMockMode && neo4jService.driver) {
    const res = await Promise.race([
      neo4jService.runCypherQuery('RETURN 1 AS ok'),
      new Promise((r) => setTimeout(() => r({ success: false }), 2500)),
    ]);
    ok = Boolean(res.success && !res.isMock);
  }
  graphProbe = { at: Date.now(), ok };
  return ok;
}

export async function getStats() {
  const profiles = profileStore.all();
  const live = await graphIsLive();
  let hackathons;
  let projects;
  if (live) {
    const res = await neo4jService.runCypherQuery(
      'MATCH (h:Hackathon) WITH count(h) AS h MATCH (p:Project) RETURN h, count(p) AS p'
    );
    if (res.success && res.records[0]) {
      hackathons = res.records[0].h;
      projects = res.records[0].p;
    }
  }
  hackathons ??= parseCsv('hackathons.csv').length;
  projects ??= parseCsv('projects.csv').length;
  return {
    success: true,
    people: profiles.length,
    hackathons,
    projects,
    profiles_built: profiles.length,
    llm_narratives: profiles.filter((p) => p.narrative_status === 'llm').length,
    active_last_90d: profiles.filter((p) => (p.facts.days_since_active ?? 9999) <= 90).length,
    consented: profiles.filter((p) => p.identity.consent_flag).length,
    graph: live ? 'live' : 'offline',
    mode: process.env.USE_MOCK === '1' ? 'mock' : 'live',
  };
}

// --------------------------------------------------------------- directory

const SORTS = {
  engagement: (p) => p.engagement.value,
  name: (p) => p.identity.full_name.trim().toLowerCase(),
  last_active: (p) => p.facts.last_active || '',
  hackathons: (p) => p.facts.hackathons_attended,
  prizes: (p) => p.facts.prize_count,
};

const has = (hay, needle) =>
  String(hay || '')
    .toLowerCase()
    .includes(needle);

export function listCandidates({
  q,
  college,
  skill,
  persona,
  status,
  sort,
  dir,
  limit = 50,
  offset = 0,
} = {}) {
  const explicitSort = Boolean(sort);
  const all = profileStore.all();
  let rows = all;

  if (q) {
    const needle = String(q).trim().toLowerCase();
    rows = rows.filter((p) => {
      const c = canonicalCollege(p.identity.college);
      return (
        has(p.identity.full_name, needle) ||
        has(p.identity.email, needle) ||
        has(p.user_id, needle) ||
        has(c.short, needle) ||
        has(c.name, needle) ||
        p.skills.some((s) => s.confidence >= 0.5 && has(s.skill, needle)) ||
        p.personas.some((x) => has(x, needle))
      );
    });
  }
  if (college) {
    const canon = canonicalCollege(college);
    rows = rows.filter(
      (p) =>
        canonicalCollege(p.identity.college).name === canon.name ||
        has(canonicalCollege(p.identity.college).short, String(college).toLowerCase())
    );
  }
  if (skill)
    rows = rows.filter((p) =>
      p.skills.some(
        (s) => s.skill.toLowerCase() === String(skill).toLowerCase() && s.confidence >= 0.5
      )
    );
  if (persona)
    rows = rows.filter((p) =>
      p.personas.some((x) => x.toLowerCase() === String(persona).toLowerCase())
    );
  if (status) rows = rows.filter((p) => p.trajectory.status === status);

  // A text search ranks people whose NAME matches above people who merely study somewhere
  // named "Shiv Nadar University" — unless the caller asked for an explicit sort.
  const needleLower = q ? String(q).trim().toLowerCase() : null;
  const relevance = (p) =>
    needleLower && has(p.identity.full_name, needleLower)
      ? 0
      : needleLower && (has(p.identity.email, needleLower) || has(p.user_id, needleLower))
        ? 1
        : 2;

  const key = SORTS[sort] ? sort : 'engagement';
  const desc = dir ? dir !== 'asc' : key !== 'name';
  const fn = SORTS[key];
  rows = [...rows].sort((a, b) => {
    const x = fn(a);
    const y = fn(b);
    const cmp = x < y ? -1 : x > y ? 1 : 0;
    return (
      (needleLower && !explicitSort ? relevance(a) - relevance(b) : 0) ||
      (desc ? -cmp : cmp) ||
      a.user_id.localeCompare(b.user_id)
    );
  });

  // Facets are computed over the whole directory, not the filtered page, so the
  // filter dropdowns don't collapse to one option once a filter is applied.
  const count = (arr) =>
    Object.entries(arr.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {}))
      .map(([value, c]) => ({ value, count: c }))
      .sort((a, b) => b.count - a.count);
  const facets = {
    colleges: count(all.map((p) => canonicalCollege(p.identity.college).short)).slice(0, 30),
    skills: count(
      all.flatMap((p) => p.skills.filter((s) => s.confidence >= 0.5).map((s) => s.skill))
    ).slice(0, 30),
    personas: count(all.flatMap((p) => p.personas)),
    statuses: count(all.map((p) => p.trajectory.status)),
  };

  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  return {
    success: true,
    total: rows.length,
    limit: lim,
    offset: off,
    facets,
    rows: rows.slice(off, off + lim).map(toRow),
  };
}

export function getProfile(userId) {
  return profileStore.get(userId);
}

// ---------------------------------------------------------- evidence subgraph

const MAX_NODES = 40;

function fromProfile(p) {
  const nodes = [
    {
      id: p.user_id,
      label: p.identity.full_name.trim(),
      type: 'Person',
      group: 'Person',
      properties: { college: p.identity.college, role_pref: p.identity.role_pref },
    },
  ];
  const links = [];
  const seen = new Set([p.user_id]);
  const add = (n, rel) => {
    if (nodes.length >= MAX_NODES) return;
    if (!seen.has(n.id)) {
      seen.add(n.id);
      nodes.push(n);
    }
    links.push({
      id: `${p.user_id}-${rel}-${n.id}`,
      source: p.user_id,
      target: n.id,
      label: rel,
      type: rel,
    });
  };
  add(
    {
      id: `C:${p.identity.college}`,
      label: canonicalCollege(p.identity.college).short,
      type: 'College',
      group: 'College',
      properties: {},
    },
    'STUDIED_AT'
  );
  for (const pr of p.facts.projects.slice(-6))
    add(
      {
        id: pr.project_id,
        label: pr.title,
        type: 'Project',
        group: 'Project',
        properties: { score: pr.score, date: pr.date },
      },
      'BUILT'
    );
  for (const s of p.skills.filter((x) => x.confidence >= 0.5).slice(0, 8))
    add(
      {
        id: `S:${s.skill}`,
        label: s.skill,
        type: 'Skill',
        group: 'Skill',
        properties: { confidence: s.confidence },
      },
      'HAS_SKILL'
    );
  for (const t of p.facts.repeat_teammates.slice(0, 4))
    add(
      {
        id: t.user_id,
        label: t.name,
        type: 'Person',
        group: 'Teammate',
        properties: { times: t.times },
      },
      'TEAMMATE_OF'
    );
  return { nodes, links };
}

export async function getSubgraph(userId) {
  const profile = profileStore.get(userId);
  if (!profile) return null;
  if (!(await graphIsLive())) return { ...fromProfile(profile), source: 'profile' };

  const id = userId;
  const nodes = [
    {
      id,
      label: profile.identity.full_name.trim(),
      type: 'Person',
      group: 'Person',
      properties: { college: profile.identity.college, role_pref: profile.identity.role_pref },
    },
  ];
  const links = [];
  const seen = new Set([id]);
  const node = (n) => {
    if (seen.has(n.id) || nodes.length >= MAX_NODES) return seen.has(n.id);
    seen.add(n.id);
    nodes.push(n);
    return true;
  };
  const link = (source, target, type, props = {}) => {
    if (seen.has(source) && seen.has(target))
      links.push({
        id: `${source}-${type}-${target}`,
        source,
        target,
        label: type,
        type,
        properties: props,
      });
  };
  const q = async (cypher) => {
    const r = await neo4jService.runCypherQuery(cypher, { id });
    return r.success ? r.records : [];
  };

  for (const r of await q(
    `MATCH (:Person {user_id:$id})-[:ATTENDED]->(h:Hackathon) RETURN h.hackathon_id AS id, h.name AS name, h.theme_track AS theme ORDER BY h.start_date DESC LIMIT 6`
  )) {
    if (
      node({
        id: r.id,
        label: r.name,
        type: 'Hackathon',
        group: 'Hackathon',
        properties: { theme_track: r.theme },
      })
    )
      link(id, r.id, 'ATTENDED');
  }
  for (const r of await q(`MATCH (:Person {user_id:$id})-[:MEMBER_OF]->(t:Team)-[:BUILT]->(pr:Project)
       OPTIONAL MATCH (pr)-[:ACHIEVED]->(res:Result)
       OPTIONAL MATCH (t)-[:COMPETED_IN]->(h:Hackathon)
       RETURN pr.project_id AS id, pr.title AS title, res.rank AS rank, res.prize_track AS track, res.score AS score, h.hackathon_id AS hid
       ORDER BY pr.submitted_at DESC LIMIT 6`)) {
    const prize = r.rank ? `rank ${r.rank}` : r.track || null;
    if (
      node({
        id: r.id,
        label: r.title,
        type: 'Project',
        group: prize ? 'Prize' : 'Project',
        properties: { score: r.score, prize },
      })
    ) {
      link(id, r.id, 'BUILT');
      if (r.hid) link(r.id, r.hid, 'SUBMITTED_AT');
    }
  }
  for (const r of await q(
    `MATCH (:Person {user_id:$id})-[r:HAS_SKILL]->(s:Skill) WHERE r.confidence >= 0.5 RETURN s.name AS name, max(r.confidence) AS c ORDER BY c DESC LIMIT 7`
  )) {
    if (
      node({
        id: `S:${r.name}`,
        label: r.name,
        type: 'Skill',
        group: 'Skill',
        properties: { confidence: r.c },
      })
    )
      link(id, `S:${r.name}`, 'HAS_SKILL', { confidence: r.c });
  }
  for (const r of await q(
    `MATCH (:Person {user_id:$id})-[:STUDIED_AT]->(c:College) RETURN c.name AS name LIMIT 1`
  )) {
    if (
      node({
        id: `C:${r.name}`,
        label: canonicalCollege(r.name).short,
        type: 'College',
        group: 'College',
        properties: {},
      })
    )
      link(id, `C:${r.name}`, 'STUDIED_AT');
  }
  for (const r of await q(
    `MATCH (:Person {user_id:$id})-[r:TEAMMATE_OF]-(o:Person) RETURN o.user_id AS oid, o.full_name AS name, r.times AS times ORDER BY r.times DESC LIMIT 4`
  )) {
    if (
      node({
        id: r.oid,
        label: String(r.name).trim(),
        type: 'Person',
        group: 'Teammate',
        properties: { times: r.times },
      })
    )
      link(id, r.oid, 'TEAMMATE_OF', { times: r.times });
  }
  return { nodes, links, source: 'graph' };
}
