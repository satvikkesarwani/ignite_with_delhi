#!/usr/bin/env node
/** Mentor-style prompts, English and Hinglish, through the real agent. */
import { chat } from '../backend/agentService.js';
import { getGraphOverview } from '../backend/graphOverview.js';
import { neo4jService } from '../backend/neo4jService.js';

const g = await getGraphOverview({ limit: 24 });
console.log(`GRAPH  source=${g.source}  nodes=${g.stats.nodes}  links=${g.stats.links}  ${JSON.stringify(g.stats.by_type)}\n`);

const prompts = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'Find DTU students who know React and Python and are interning',
      'Mujhe DTU ke wo bache dikhao jo React aur Python jante hain aur abhi interning hain',
      'Web3 ke liye top log dhundo',
      'Jo log jeete hain lekin ab gayab hain unhe dikhao',
      'Find ML builders from Delhi colleges who have won something',
      'Who would make a good mentor this year?',
    ];
for (const message of prompts) {
  const r = await chat({ message, sessionId: 'mentor-' + Math.random().toString(36).slice(2, 6) });
  console.log(`> ${message}\n  [${r.strategy}] llm=${r.llm_calls} ${r.latency_ms}ms rows=${r.table?.length ?? 0}${r.criteria?.length ? '  criteria: ' + r.criteria.join(' | ') : ''}`);
  (r.table || []).slice(0, 3).forEach((x) => console.log(`    - ${x.full_name.trim()} [${x.college}]  ${r.rationale_by_user_id?.[x.user_id] || ''}`));
  if (!r.table?.length) console.log('    ' + r.answer.slice(0, 160));
}
await neo4jService.close();
process.exit(0);
