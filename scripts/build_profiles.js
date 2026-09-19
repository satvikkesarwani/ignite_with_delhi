#!/usr/bin/env node
/**
 * Builds a ContextProfile for every person and persists it to Neo4j + disk.
 *
 * Stages 1-3 are deterministic and fast (one pass over eight bulk queries).
 * Stage 4 is the narrative, which costs one Nemotron call per person at ~25s
 * each — so it runs with concurrency matching the key pool, checkpoints after
 * every profile, and can be resumed or skipped entirely.
 *
 *   node scripts/build_profiles.js --story-only     # the 17 demo users, ~2 min
 *   node scripts/build_profiles.js --no-llm         # everyone, deterministic only
 *   node scripts/build_profiles.js --all --resume   # everyone, skip existing narratives
 *   node scripts/build_profiles.js --user=U0001
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { neo4jService } from '../backend/neo4jService.js';
import {
  loadDomainConfig,
  fetchAllSignals,
  assembleProfile,
  generateNarrative,
  persistProfile,
  readProfileFromDisk,
} from '../backend/contextBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const STORY_ONLY = argv.includes('--story-only');
const NO_LLM = argv.includes('--no-llm');
const RESUME = argv.includes('--resume');
const ONE = argv.find((a) => a.startsWith('--user='))?.split('=')[1] || null;
const CONCURRENCY = Number(argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] || 5);

const STORY_IDS = Array.from({ length: 17 }, (_, i) => `U${String(i + 1).padStart(4, '0')}`);

const t0 = Date.now();
const cfg = loadDomainConfig('hackathon');

console.log('\nPersonaCRM profile builder');
console.log(`  domain=${cfg.domain}  llm=${NO_LLM ? 'off' : 'on'}  concurrency=${CONCURRENCY}\n`);

console.log('Stage 1-3: fetching signals and deriving context...');
const signals = await fetchAllSignals();

let targets = [...signals.keys()].sort();
if (ONE) targets = targets.filter((id) => id === ONE);
else if (STORY_ONLY) targets = targets.filter((id) => STORY_IDS.includes(id));

const profiles = new Map();
for (const id of targets) {
  try {
    profiles.set(id, assembleProfile(signals.get(id), cfg));
  } catch (e) {
    console.log(`  FAIL assemble ${id}: ${e.message}`);
  }
}
console.log(
  `  built ${profiles.size} deterministic profiles in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`
);

// ---------------------------------------------------------------- narratives

if (!NO_LLM && profiles.size) {
  // Demo users first, then the most active — if we run out of time, the people
  // the judges will actually look at already have a real narrative.
  const queue = [...profiles.values()].sort((a, b) => {
    const aStory = STORY_IDS.includes(a.user_id) ? 0 : 1;
    const bStory = STORY_IDS.includes(b.user_id) ? 0 : 1;
    if (aStory !== bStory) return aStory - bStory;
    return b.facts.hackathons_attended - a.facts.hackathons_attended;
  });

  let done = 0;
  let llmOk = 0;
  let llmFail = 0;
  const started = Date.now();

  async function worker() {
    for (;;) {
      const profile = queue.shift();
      if (!profile) return;

      if (RESUME) {
        const existing = readProfileFromDisk(profile.user_id);
        if (existing?.narrative_status === 'llm' && existing.narrative) {
          profile.narrative = existing.narrative;
          profile.narrative_status = 'llm';
          await persistProfile(profile);
          done++;
          continue;
        }
      }

      try {
        profile.narrative = await generateNarrative(profile, cfg);
        profile.narrative_status = 'llm';
        llmOk++;
      } catch (e) {
        // Never leave a profile without prose — the UI must never show a blank.
        const { templateFallback } = await import('./lib/narrativeFallback.mjs');
        profile.narrative = templateFallback(profile);
        profile.narrative_status = 'template';
        llmFail++;
        if (llmFail <= 3)
          console.log(`  llm fallback ${profile.user_id}: ${e.message.slice(0, 70)}`);
      }
      await persistProfile(profile);
      done++;
      if (done % 5 === 0 || done === profiles.size) {
        const rate = done / ((Date.now() - started) / 1000);
        const eta = Math.round((profiles.size - done) / Math.max(rate, 0.001));
        process.stdout.write(
          `\r  narratives ${done}/${profiles.size}  llm=${llmOk} fallback=${llmFail}  eta ${eta}s     `
        );
      }
    }
  }

  console.log('Stage 4: narratives (one Nemotron call each, ~25s per call)...');
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log('\n');
} else {
  const { templateFallback } = await import('./lib/narrativeFallback.mjs');
  for (const profile of profiles.values()) {
    profile.narrative = templateFallback(profile);
    profile.narrative_status = 'template';
    await persistProfile(profile);
  }
  console.log(`  wrote ${profiles.size} template narratives (--no-llm)\n`);
}

// ------------------------------------------------------------------ summary

const dir = path.join(__dirname, '..', 'data', 'profiles');
const onDisk = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length
  : 0;

console.log('-'.repeat(64));
console.log(
  `  ${profiles.size} profiles built · ${onDisk} on disk · ${((Date.now() - t0) / 1000).toFixed(1)}s`
);
console.log('-'.repeat(64) + '\n');

if (ONE && profiles.has(ONE)) {
  console.log(JSON.stringify(profiles.get(ONE), null, 2));
} else {
  for (const id of STORY_IDS.filter((i) => profiles.has(i)).slice(0, 17)) {
    const p = profiles.get(id);
    console.log(
      `  ${id} ${String(p.identity.full_name).padEnd(16)} ` +
        `att=${String(p.facts.hackathons_attended).padStart(2)} sub=${String(p.facts.projects_submitted).padStart(2)} ` +
        `prz=${p.facts.prize_count} eng=${String(p.engagement.value).padStart(3)} ` +
        `${p.trajectory.direction.padEnd(18)} ${p.trajectory.status.padEnd(8)} ${p.personas.join(' + ')}`
    );
  }
}

await neo4jService.close();
process.exit(0);
