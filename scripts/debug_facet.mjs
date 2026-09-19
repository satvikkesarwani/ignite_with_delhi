// Ad-hoc: node scripts/debug_facet.mjs "question"  -> shows what the agent extracted and why
import { chat } from '../backend/agentService.js';
import { neo4jService } from '../backend/neo4jService.js';

const message = process.argv[2];
const r = await chat({ message, sessionId: 'dbg' });
console.log(JSON.stringify({ strategy: r.strategy, resolution: r.resolution, answer: r.answer.slice(0, 260) }, null, 1));
await neo4jService.close();
process.exit(0);
