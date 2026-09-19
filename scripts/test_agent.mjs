#!/usr/bin/env node
/**
 * Runs the A3 acceptance conversation against the agent and prints answer,
 * strategy, LLM calls and latency for each turn. Use --llm to also exercise
 * the one question that needs a real model call.
 *
 *   node scripts/test_agent.mjs
 *   node scripts/test_agent.mjs "custom question" "another"   (one shared session)
 */
import { chat } from '../backend/agentService.js';
import { neo4jService } from '../backend/neo4jService.js';

const custom = process.argv.slice(2);
const turns = custom.length
  ? [custom]
  : [
      ['Is Shiv Sharma in our database?'],
      ['Shiv Sharma from IIT Delhi', 'How active has he been in our hackathons?', 'What has he built?', 'Would they make a good mentor?'],
      ['Is Aarav Malhotra in our database?'],
      ['Ananya Iyar'],
      ['Tell me about Devansh Kapoor', 'Can we email Nisha Pillai about the next hackathon?'],
      ['Find ML people from Delhi colleges who have won something'],
      ['Who won the Neo4j track?'],
      ['Who should we re-invite who has gone quiet since winning?'],
      ['How many people are in our database?', 'How many hackathons have we run?', 'How many people have consented to outreach?'],
      ["What is the average shoe size of our users?"],
    ];

let calls = 0;
for (const convo of turns) {
  const sessionId = 'test-' + Math.random().toString(36).slice(2, 8);
  for (const message of convo) {
    const r = await chat({ message, sessionId });
    calls += r.llm_calls;
    console.log(`\n> ${message}`);
    console.log(`  [${r.strategy}]  llm=${r.llm_calls}  ${r.latency_ms}ms${r.resolution ? `  resolution=${r.resolution.status}` : ''}${r.table?.length ? `  rows=${r.table.length}` : ''}`);
    console.log('  ' + r.answer.replace(/\n\n/g, '\n  ').slice(0, 640));
    if (r.citations?.length) console.log(`  cites: ${r.citations.slice(0, 2).map((c) => `${c.source_ref}`).join(', ')}`);
  }
}
console.log(`\nTotal LLM calls across the whole run: ${calls}`);
await neo4jService.close();
process.exit(0);
