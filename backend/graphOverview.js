/**
 * A dense, readable slice of the context graph for the /crm/graph view.
 *
 * The raw graph has ~6,000 nodes and would render as a hairball. This picks a cast of
 * people (top by engagement, or whoever a filter selects) and draws everything the layer
 * knows about them: where they studied, the events they attended, the projects they built
 * (prize winners flagged), the skills the evidence supports, and who they teamed with.
 * ~24 people gives 150-200 nodes and 300+ edges — visibly dense, still legible.
 */

import { profileStore, canonicalCollege } from './profileStore.js';
import { listCandidates } from './contextService.js';
import { neo4jService } from './neo4jService.js';

const MAX_PEOPLE = 60;

async function cypher(query, params) {
  const res = await neo4jService.runCypherQuery(query, params);
  return res.success && !res.isMock ? res.records : null;
}

export async function getGraphOverview({ limit = 24, q, persona, college, skill, status } = {}) {
  const n = Math.min(Math.max(Number(limit) || 24, 3), MAX_PEOPLE);
  let cast;
  if (q || persona || college || skill || status) {
    cast = listCandidates({ q, persona, college, skill, status, limit: n }).rows;
  } else {
    // Unfiltered, the top people by engagement are almost all prize winners, which paints the whole
    // graph one colour. Mix winners with strong non-winners so the groups are visibly distinct.
    const pool = listCandidates({ limit: 200 }).rows;
    const winners = pool.filter((r) => r.prize_count > 0).slice(0, Math.ceil(n * 0.5));
    const others = pool.filter((r) => !(r.prize_count > 0)).slice(0, n - winners.length);
    cast = [...winners, ...others];
  }
  const ids = cast.map((r) => r.user_id);
  if (!ids.length)
    return { nodes: [], links: [], stats: { people: 0, nodes: 0, links: 0 }, source: 'none' };

  const nodes = new Map();
  const links = [];
  const seenLink = new Set();
  const node = (id, label, type, group, properties = {}) => {
    if (!nodes.has(id)) nodes.set(id, { id, label, type, group, properties });
    return id;
  };
  const link = (source, target, type, properties = {}) => {
    const key = `${source}|${type}|${target}`;
    if (seenLink.has(key) || !nodes.has(source) || !nodes.has(target)) return;
    seenLink.add(key);
    links.push({ id: key, source, target, label: type, type, properties });
  };

  // People + college — always available from profiles.
  for (const r of cast) {
    const p = profileStore.get(r.user_id);
    const winner = p.facts.prize_count > 0;
    node(r.user_id, p.identity.full_name.trim(), 'Person', winner ? 'Winner' : 'Person', {
      college: canonicalCollege(p.identity.college).short,
      personas: p.personas,
      engagement: p.engagement.value,
      prizes: p.facts.prize_count,
      hackathons: p.facts.hackathons_attended,
    });
    const c = canonicalCollege(p.identity.college);
    node(`C:${c.name}`, c.short, 'College', 'College', {});
    link(r.user_id, `C:${c.name}`, 'STUDIED_AT');
  }

  const live = ids.length && (await cypher('RETURN 1 AS ok', {})) !== null;

  if (live) {
    for (const r of (await cypher(
      `MATCH (p:Person)-[:ATTENDED]->(h:Hackathon) WHERE p.user_id IN $ids
       RETURN p.user_id AS pid, h.hackathon_id AS id, h.name AS name, h.theme_track AS theme`,
      { ids }
    )) || []) {
      node(r.id, r.name, 'Hackathon', 'Hackathon', { theme_track: r.theme });
      link(r.pid, r.id, 'ATTENDED');
    }

    // Prize-winning projects for everyone, plus each person's latest project — keeps it dense but legible.
    const projects =
      (await cypher(
        `MATCH (p:Person)-[:MEMBER_OF]->(:Team)-[:BUILT]->(pr:Project) WHERE p.user_id IN $ids
       OPTIONAL MATCH (pr)-[:ACHIEVED]->(res:Result)
       RETURN p.user_id AS pid, pr.project_id AS id, pr.title AS title, pr.submitted_at AS at,
              res.rank AS rank, res.prize_track AS track, res.score AS score
       ORDER BY pr.submitted_at DESC`,
        { ids }
      )) || [];
    const latestSeen = new Set();
    for (const r of projects) {
      const prized = r.rank || r.track;
      const latest = !latestSeen.has(r.pid);
      latestSeen.add(r.pid);
      if (!prized && !latest) continue;
      node(r.id, r.title, 'Project', prized ? 'Prize' : 'Project', {
        score: r.score,
        prize: r.rank ? `rank ${r.rank}` : r.track || null,
      });
      link(r.pid, r.id, 'BUILT');
    }

    const skills =
      (await cypher(
        `MATCH (p:Person)-[r:HAS_SKILL]->(s:Skill) WHERE p.user_id IN $ids AND r.confidence >= 0.6
       RETURN p.user_id AS pid, s.name AS name, max(r.confidence) AS c ORDER BY pid, c DESC`,
        { ids }
      )) || [];
    const perPerson = new Map();
    for (const r of skills) {
      const k = perPerson.get(r.pid) || 0;
      if (k >= 3) continue; // top three evidenced skills per person
      perPerson.set(r.pid, k + 1);
      node(`S:${r.name}`, r.name, 'Skill', 'Skill', {});
      link(r.pid, `S:${r.name}`, 'HAS_SKILL', { confidence: r.c });
    }

    for (const r of (await cypher(
      `MATCH (a:Person)-[r:TEAMMATE_OF]-(b:Person)
       WHERE a.user_id IN $ids AND b.user_id IN $ids AND a.user_id < b.user_id
       RETURN a.user_id AS a, b.user_id AS b, r.times AS times`,
      { ids }
    )) || [])
      link(r.a, r.b, 'TEAMMATE_OF', { times: r.times });
  } else {
    // Graph unreachable: draw what the profiles alone know.
    for (const r of cast) {
      const p = profileStore.get(r.user_id);
      for (const pr of p.facts.projects.slice(-2)) {
        node(pr.project_id, pr.title, 'Project', 'Project', { score: pr.score });
        link(r.user_id, pr.project_id, 'BUILT');
      }
      for (const s of p.skills.filter((x) => x.confidence >= 0.6).slice(0, 3)) {
        node(`S:${s.skill}`, s.skill, 'Skill', 'Skill', {});
        link(r.user_id, `S:${s.skill}`, 'HAS_SKILL', { confidence: s.confidence });
      }
      for (const t of p.facts.repeat_teammates)
        if (ids.includes(t.user_id)) link(r.user_id, t.user_id, 'TEAMMATE_OF', { times: t.times });
    }
  }

  const out = { nodes: [...nodes.values()], links };
  const byType = out.nodes.reduce((m, x) => ((m[x.type] = (m[x.type] || 0) + 1), m), {});
  return {
    ...out,
    stats: {
      people: ids.length,
      nodes: out.nodes.length,
      links: out.links.length,
      by_type: byType,
    },
    source: live ? 'graph' : 'profiles',
  };
}
