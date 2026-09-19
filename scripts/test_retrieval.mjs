#!/usr/bin/env node
/** Ad-hoc retrieval probe: node scripts/test_retrieval.mjs "question" ["question2" ...] */
import { segment } from '../backend/retrievalService.js';
import { neo4jService } from '../backend/neo4jService.js';

const qs = process.argv.slice(2);
for (const q of qs) {
  const r = await segment(q);
  console.log(`\nQ: ${q}`);
  console.log(`   strategy=${r.strategy}  llm=${r.llm_calls}  ${r.latency_ms}ms  rows=${r.total}${r.total_matches !== undefined ? ` of ${r.total_matches}` : ''}${r.source ? `  via ${r.source}` : ''}`);
  if (r.criteria?.length) console.log(`   criteria: ${r.criteria.join(' | ')}`);
  (r.rows || []).slice(0, 4).forEach((x) => console.log(`   - ${x.user_id} ${x.full_name.padEnd(18)} ${r.rationale_by_user_id[x.user_id] || ''}`));
  if (r.honest_failure) console.log(`   ! ${r.message.slice(0, 100)}`);
}
await neo4jService.close();
process.exit(0);
