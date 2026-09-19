#!/usr/bin/env node
/**
 * Generates backend/mocks/*.json from the REAL profiles and the REAL agent.
 *
 * Hand-written fixtures drift from the contract the moment the backend changes;
 * generated ones cannot. The frontend builds against these while the graph is
 * unavailable, and USE_MOCK=1 serves them verbatim.
 *
 *   node scripts/make_mocks.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { profileStore, toRow } from '../backend/profileStore.js';
import { listCandidates, getSubgraph, getStats } from '../backend/contextService.js';
import { resolve } from '../backend/resolveService.js';
import { segment } from '../backend/retrievalService.js';
import { chat } from '../backend/agentService.js';
import { neo4jService } from '../backend/neo4jService.js';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'mocks');
fs.mkdirSync(OUT, { recursive: true });
const write = (name, obj) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 2));
  console.log(`  wrote ${name}`);
};

// One row per persona/status so every badge and state is represented.
const SHOWCASE = ['U0001', 'U0002', 'U0007', 'U0008', 'U0009', 'U0010', 'U0011', 'U0012', 'U0013', 'U0014', 'U0015', 'U0016'];
const full = listCandidates({ limit: 1 });
write('candidates.json', {
  success: true,
  total: SHOWCASE.length,
  limit: 50,
  offset: 0,
  facets: full.facets,
  rows: SHOWCASE.map((id) => toRow(profileStore.get(id))),
});

for (const id of ['U0001', 'U0015']) {
  write(`profile.${id}.json`, profileStore.get(id));
  const g = await getSubgraph(id);
  write(`subgraph.${id}.json`, { nodes: g.nodes, links: g.links });
}
// Every showcase person gets a profile fixture too, so any row a mock table shows can open its drawer.
for (const id of SHOWCASE.filter((i) => !['U0001', 'U0015'].includes(i))) write(`profile.${id}.json`, profileStore.get(id));

write('stats.json', { ...(await getStats()), mode: 'mock' });
write('resolve.json', await resolve('Shiv Sharma'));
write('segment.json', await segment('Find ML builders from Delhi colleges who have won something'));
write('chat.json', await chat({ message: 'Is Shiv Sharma in our database?', sessionId: 'mock' }));

await neo4jService.close();
process.exit(0);
