#!/usr/bin/env node
/**
 * One-off: add the deterministic claim-gap sentence to narratives that were generated before
 * generateNarrative did it itself. Idempotent, and touches only LLM narratives that qualify.
 *
 *   node scripts/append_claim_gaps.mjs
 */
import { profileStore } from '../backend/profileStore.js';
import { withClaimGap, persistProfile } from '../backend/contextBuilder.js';
import { neo4jService } from '../backend/neo4jService.js';

let changed = 0;
for (const p of profileStore.all()) {
  if (p.narrative_status !== 'llm') continue;
  const next = withClaimGap(p.narrative, p);
  if (next === p.narrative) continue;
  p.narrative = next;
  await persistProfile(p);
  changed++;
  console.log(`  ${p.user_id} ${p.identity.full_name.trim()}: claim-gap sentence added`);
}
console.log(`${changed} narrative(s) updated`);
await neo4jService.close();
process.exit(0);
