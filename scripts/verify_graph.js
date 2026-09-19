#!/usr/bin/env node
/**
 * Post-load verification against the live graph.
 *
 * Confirms the structure is sound AND that every fact the demo leans on
 * survived the load — especially the two Shiv Sharmas and the fuzzy-match
 * index, which the existence check depends on.
 *
 *   node scripts/verify_graph.js
 */

import { neo4jService } from '../backend/neo4jService.js';

let failed = 0;
const rows = [];

async function q(cypher, params = {}) {
  const res = await neo4jService.runCypherQuery(cypher, params);
  if (!res.success) throw new Error(res.error);
  return res.records;
}

async function check(name, fn, describe = (v) => String(v)) {
  try {
    const { ok, value } = await fn();
    if (!ok) failed++;
    rows.push({ name, ok, detail: describe(value) });
  } catch (e) {
    failed++;
    rows.push({ name, ok: false, detail: 'ERROR: ' + e.message });
  }
}

console.log('\nGraph verification\n');

// ------------------------------------------------------------ counts

const expected = {
  Person: 600,
  Hackathon: 24,
  Team: 352,
  Project: 256,
  Result: 256,
  Mentor: 30,
  MentorSession: 468,
  Interaction: 3342,
  OutreachEvent: 835,
};
for (const [label, want] of Object.entries(expected)) {
  await check(
    `${label} count == ${want}`,
    async () => {
      const r = await q(`MATCH (n:${label}) RETURN count(n) AS c`);
      return { ok: r[0].c === want, value: r[0].c };
    },
    (v) => `got ${v}`
  );
}

// ------------------------------------------------------ structural sanity

await check(
  'no orphan Projects (every project has a team and a hackathon)',
  async () => {
    const r = await q(`MATCH (p:Project) WHERE NOT (p)<-[:BUILT]-(:Team) RETURN count(p) AS c`);
    return { ok: r[0].c === 0, value: r[0].c };
  },
  (v) => `${v} orphans`
);

await check(
  'no orphan Results',
  async () => {
    const r = await q(
      `MATCH (r:Result) WHERE NOT (r)<-[:ACHIEVED]-(:Project) RETURN count(r) AS c`
    );
    return { ok: r[0].c === 0, value: r[0].c };
  },
  (v) => `${v} orphans`
);

await check(
  'every Person has a College',
  async () => {
    const r = await q(
      `MATCH (p:Person) WHERE NOT (p)-[:STUDIED_AT]->(:College) RETURN count(p) AS c`
    );
    return { ok: r[0].c === 0, value: r[0].c };
  },
  (v) => `${v} without`
);

await check(
  'ATTENDED never exceeds REGISTERED_FOR',
  async () => {
    const r = await q(`
      MATCH (p:Person)
      WITH p, size([(p)-[:REGISTERED_FOR]->() | 1]) AS reg, size([(p)-[:ATTENDED]->() | 1]) AS att
      WHERE att > reg RETURN count(p) AS c`);
    return { ok: r[0].c === 0, value: r[0].c };
  },
  (v) => `${v} violations`
);

await check(
  'all relationships carry provenance',
  async () => {
    const r = await q(`
      MATCH ()-[r:REGISTERED_FOR|ATTENDED|MEMBER_OF|BUILT|ACHIEVED|POSTED|RECEIVED|PERFORMED|STUDIED_AT]->()
      WHERE r.source IS NULL RETURN count(r) AS c`);
    return { ok: r[0].c === 0, value: r[0].c };
  },
  (v) => `${v} missing source`
);

await check(
  'integers deserialise as numbers, not {low,high}',
  async () => {
    const r = await q(`MATCH (p:Person {user_id:'U0001'}) RETURN p.grad_year AS y`);
    return { ok: typeof r[0].y === 'number', value: typeof r[0].y };
  },
  (v) => `typeof = ${v}`
);

// ------------------------------------------------------- existence probes

await check(
  'exactly 2 people named Shiv Sharma',
  async () => {
    const r = await q(
      `MATCH (p:Person {name_normalized:'shiv sharma'}) RETURN p.user_id AS id, p.college AS college ORDER BY id`
    );
    return { ok: r.length === 2, value: r };
  },
  (v) => v.map((x) => `${x.id}@${String(x.college).slice(0, 22)}`).join(' | ')
);

await check(
  'Aarav Malhotra does NOT exist',
  async () => {
    const r = await q(
      `MATCH (p:Person) WHERE p.name_normalized CONTAINS 'malhotra' AND p.name_normalized CONTAINS 'aarav' RETURN count(p) AS c`
    );
    return { ok: r[0].c === 0, value: r[0].c };
  },
  (v) => `${v} matches`
);

await check(
  'fulltext index resolves the typo "Ananya Iyar"',
  async () => {
    const r = await q(`
      CALL db.index.fulltext.queryNodes('person_search', 'Ananya Iyar~') YIELD node, score
      RETURN node.user_id AS id, node.full_name AS name, score ORDER BY score DESC LIMIT 3`);
    return { ok: r.some((x) => x.id === 'U0007'), value: r };
  },
  (v) => v.map((x) => `${x.name}(${x.score.toFixed(2)})`).join(', ') || 'no hits'
);

await check(
  'fulltext index finds Aarav Malik for "Aarav Malhotra"',
  async () => {
    const r = await q(`
      CALL db.index.fulltext.queryNodes('person_search', 'Aarav Malhotra~') YIELD node, score
      RETURN node.user_id AS id, node.full_name AS name ORDER BY score DESC LIMIT 3`);
    return { ok: r.some((x) => x.id === 'U0017'), value: r };
  },
  (v) => v.map((x) => x.name).join(', ') || 'no hits'
);

// ------------------------------------------------------------ story users

const storyExpect = [
  ['U0001', { attended: 7, submitted: 6, prizes: 3 }],
  ['U0002', { attended: 2, submitted: 2, prizes: 0 }],
  ['U0007', { attended: 8, submitted: 8, prizes: 5 }],
  ['U0008', { attended: 3, submitted: 3, prizes: 2 }],
  ['U0009', { attended: 4, submitted: 4, prizes: 1 }],
  ['U0010', { attended: 8, submitted: 1, prizes: 0 }],
  ['U0011', { attended: 0, submitted: 0, prizes: 0 }],
  ['U0013', { attended: 3, submitted: 3, prizes: 1 }],
  ['U0015', { attended: 3, submitted: 3, prizes: 0 }],
];

for (const [uid, want] of storyExpect) {
  await check(
    `${uid} attended=${want.attended} submitted=${want.submitted} prizes=${want.prizes}`,
    async () => {
      const r = await q(
        `MATCH (p:Person {user_id:$uid})
         OPTIONAL MATCH (p)-[:ATTENDED]->(h:Hackathon)
         WITH p, count(DISTINCT h) AS attended
         OPTIONAL MATCH (p)-[:MEMBER_OF]->(:Team)-[:BUILT]->(pr:Project)
         WITH p, attended, count(DISTINCT pr) AS submitted
         OPTIONAL MATCH (p)-[:MEMBER_OF]->(:Team)-[:BUILT]->(:Project)-[:ACHIEVED]->(res:Result)
         WHERE res.rank IS NOT NULL OR res.prize_track IS NOT NULL
         RETURN attended, submitted, count(DISTINCT res) AS prizes`,
        { uid }
      );
      const got = r[0];
      const ok =
        got.attended === want.attended &&
        got.submitted === want.submitted &&
        got.prizes === want.prizes;
      return { ok, value: got };
    },
    (v) => `got attended=${v.attended} submitted=${v.submitted} prizes=${v.prizes}`
  );
}

await check(
  'U0009 score series is 52,68,79,91 in date order',
  async () => {
    const r = await q(`
      MATCH (p:Person {user_id:'U0009'})-[:MEMBER_OF]->(:Team)-[:BUILT]->(pr:Project)-[:ACHIEVED]->(res:Result)
      RETURN res.score AS score ORDER BY pr.submitted_at`);
    const got = r.map((x) => x.score).join(',');
    return { ok: got === '52,68,79,91', value: got };
  },
  (v) => v
);

await check(
  'U0001 and U0007 are TEAMMATE_OF with times=2',
  async () => {
    const r = await q(
      `MATCH (:Person {user_id:'U0001'})-[r:TEAMMATE_OF]-(:Person {user_id:'U0007'}) RETURN r.times AS times`
    );
    return { ok: r.length === 1 && r[0].times === 2, value: r[0]?.times ?? 'no edge' };
  },
  (v) => `times=${v}`
);

await check(
  'U0015 claim gap: declares ML, GitHub top language is JavaScript',
  async () => {
    const r = await q(`
      MATCH (p:Person {user_id:'U0015'})-[d:HAS_SKILL {source:'declared'}]->(ds:Skill)
      WITH p, collect(ds.name) AS declared
      MATCH (p)-[g:HAS_SKILL {source:'github'}]->(gs:Skill)
      RETURN declared, gs.name AS lang, g.confidence AS conf ORDER BY conf DESC LIMIT 1`);
    const ok =
      r[0]?.lang === 'JavaScript' && r[0].declared.some((s) => /Machine Learning/i.test(s));
    return { ok, value: r[0] };
  },
  (v) => `declares [${v?.declared?.join(', ')}] · top gh lang ${v?.lang} @ ${v?.conf}`
);

await check(
  'U0016 consent_flag is false',
  async () => {
    const r = await q(`MATCH (p:Person {user_id:'U0016'}) RETURN p.consent_flag AS c`);
    return { ok: r[0].c === false, value: r[0].c };
  },
  (v) => `consent=${v}`
);

await check(
  'Best use of Neo4j winner includes Vikram Rao (U0013)',
  async () => {
    const r = await q(`
      MATCH (res:Result {prize_track:'Best use of Neo4j'})<-[:ACHIEVED]-(pr:Project)<-[:BUILT]-(t:Team)<-[:MEMBER_OF]-(p:Person)
      RETURN pr.title AS title, collect(p.user_id) AS members`);
    return { ok: r.some((x) => x.members.includes('U0013')), value: r };
  },
  (v) => v.map((x) => `${x.title}[${x.members.join(',')}]`).join(' ') || 'none'
);

// ------------------------------------------------------------ leaderboard

const top = await q(`
  MATCH (p:Person)-[:ATTENDED]->(h:Hackathon)
  RETURN p.user_id AS id, p.full_name AS name, count(h) AS events
  ORDER BY events DESC, id LIMIT 5`);

// ------------------------------------------------------------- report

for (const r of rows) console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.name.padEnd(58)} ${r.detail}`);

console.log('\n  Most active participants:');
top.forEach((t) => console.log(`    ${t.id}  ${String(t.name).padEnd(20)} ${t.events} events`));

console.log('\n' + '-'.repeat(72));
console.log(`  ${rows.length - failed}/${rows.length} checks passed`);
console.log('-'.repeat(72) + '\n');

await neo4jService.close();
if (failed) {
  console.error(`${failed} check(s) FAILED.\n`);
  process.exit(1);
}
console.log('Graph verified.\n');
process.exit(0);
