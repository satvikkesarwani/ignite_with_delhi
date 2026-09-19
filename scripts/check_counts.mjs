#!/usr/bin/env node
/**
 * Spot-check: does the agent's answer contain the number the raw CSVs say it should?
 * Ground truth comes from data/eval_questions.json, which the generator computed from
 * the CSVs (never hard-coded). Only the count-type questions are checked here; the
 * full 25-question harness is phase C4.
 *
 *   node scripts/check_counts.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chat } from '../backend/agentService.js';
import { neo4jService } from '../backend/neo4jService.js';

const evalPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'eval_questions.json');
const qs = JSON.parse(fs.readFileSync(evalPath, 'utf8')).filter((q) => q.type === 'count');

let pass = 0;
for (const q of qs) {
  const r = await chat({ message: q.question, sessionId: `chk-${q.id}` });
  const expected = String(q.expected_answer);
  // The expected answer starts with the number the agent must state.
  const lead = expected.match(/^[\d.]+/)?.[0];
  const numeric = lead ? new RegExp(`(^|[^\\d.])${lead.replace('.', '\\.')}([^\\d]|$)`).test(r.answer) : false;
  // "has no prizes" is a correct way to say 0
  // A name-led expectation ("Ananya Iyer (U0007) — 2 times; ...") passes when every named person appears.
  const names = lead ? [] : expected.match(/[A-Z][a-z]+ [A-Z][a-z]+/g) || [];
  const namesOk = names.length > 0 && names.every((n) => r.answer.includes(n));
  const ok = numeric || namesOk || (lead === '0' && /\b(no|none|zero)\b/i.test(r.answer));
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${q.id}  expected ${expected.slice(0, 40).padEnd(40)}  [${r.strategy}, llm=${r.llm_calls}]`);
  if (!ok) console.log(`        got: ${r.answer.slice(0, 200)}`);
}
console.log(`\n${pass}/${qs.length} count questions match the raw data`);
await neo4jService.close();
process.exit(pass === qs.length ? 0 : 1);
