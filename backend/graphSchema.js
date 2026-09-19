/**
 * Constraints and indexes for the PersonaCRM hackathon graph.
 *
 * Runs before the bulk load — creating indexes after loading into AuraDB free
 * tier is dramatically slower. Every statement is idempotent, so this is safe
 * to re-run as often as you like.
 */

import { neo4jService } from './neo4jService.js';
import { createLogger } from './logger.js';

const log = createLogger('graph-schema');

export const CONSTRAINTS = [
  'CREATE CONSTRAINT person_id IF NOT EXISTS FOR (n:Person) REQUIRE n.user_id IS UNIQUE',
  'CREATE CONSTRAINT hackathon_id IF NOT EXISTS FOR (n:Hackathon) REQUIRE n.hackathon_id IS UNIQUE',
  'CREATE CONSTRAINT team_id IF NOT EXISTS FOR (n:Team) REQUIRE n.team_id IS UNIQUE',
  'CREATE CONSTRAINT project_id IF NOT EXISTS FOR (n:Project) REQUIRE n.project_id IS UNIQUE',
  'CREATE CONSTRAINT result_id IF NOT EXISTS FOR (n:Result) REQUIRE n.project_id IS UNIQUE',
  'CREATE CONSTRAINT mentor_id IF NOT EXISTS FOR (n:Mentor) REQUIRE n.mentor_id IS UNIQUE',
  'CREATE CONSTRAINT session_id IF NOT EXISTS FOR (n:MentorSession) REQUIRE n.session_id IS UNIQUE',
  'CREATE CONSTRAINT interaction_id IF NOT EXISTS FOR (n:Interaction) REQUIRE n.interaction_id IS UNIQUE',
  'CREATE CONSTRAINT outreach_id IF NOT EXISTS FOR (n:OutreachEvent) REQUIRE n.touchpoint_id IS UNIQUE',
  'CREATE CONSTRAINT profile_id IF NOT EXISTS FOR (n:ContextProfile) REQUIRE n.user_id IS UNIQUE',
  'CREATE CONSTRAINT rawevent_id IF NOT EXISTS FOR (n:RawEvent) REQUIRE n.event_id IS UNIQUE',
  // Join hubs — these are what make skill and college traversals cheap.
  'CREATE CONSTRAINT skill_name IF NOT EXISTS FOR (n:Skill) REQUIRE n.name IS UNIQUE',
  'CREATE CONSTRAINT college_name IF NOT EXISTS FOR (n:College) REQUIRE n.name IS UNIQUE',
  'CREATE CONSTRAINT company_name IF NOT EXISTS FOR (n:Company) REQUIRE n.name IS UNIQUE',
];

export const INDEXES = [
  // The existence check depends on this one.
  'CREATE FULLTEXT INDEX person_search IF NOT EXISTS FOR (n:Person) ON EACH [n.full_name, n.email, n.college]',
  'CREATE INDEX person_name_norm IF NOT EXISTS FOR (n:Person) ON (n.name_normalized)',
  'CREATE INDEX person_last_active IF NOT EXISTS FOR (n:Person) ON (n.last_active)',
  'CREATE INDEX person_grad_year IF NOT EXISTS FOR (n:Person) ON (n.grad_year)',
  'CREATE INDEX person_college IF NOT EXISTS FOR (n:Person) ON (n.college)',
  'CREATE INDEX hackathon_start IF NOT EXISTS FOR (n:Hackathon) ON (n.start_date)',
  'CREATE INDEX hackathon_theme IF NOT EXISTS FOR (n:Hackathon) ON (n.theme_track)',
  'CREATE INDEX result_rank IF NOT EXISTS FOR (n:Result) ON (n.rank)',
  'CREATE INDEX result_track IF NOT EXISTS FOR (n:Result) ON (n.prize_track)',
  'CREATE INDEX interaction_type IF NOT EXISTS FOR (n:Interaction) ON (n.type)',
];

export async function applySchema({ verbose = true } = {}) {
  const applied = [];
  const failed = [];
  for (const stmt of [...CONSTRAINTS, ...INDEXES]) {
    const name = stmt.match(/(?:CONSTRAINT|INDEX)\s+(\w+)/)?.[1] || stmt.slice(0, 40);
    const res = await neo4jService.runCypherQuery(stmt);
    if (res.success) {
      applied.push(name);
      if (verbose) console.log(`  ok    ${name}`);
    } else {
      failed.push({ name, error: res.error });
      if (verbose) console.log(`  FAIL  ${name}: ${res.error}`);
    }
  }
  log.info('Schema applied', { applied: applied.length, failed: failed.length });
  return { applied, failed };
}

/** Waits for index population — a fulltext query against a still-building index returns nothing. */
export async function awaitIndexes(timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await neo4jService.runCypherQuery(
      "SHOW INDEXES YIELD name, state WHERE state <> 'ONLINE' RETURN count(*) AS pending"
    );
    if (!res.success) return { ok: false, error: res.error };
    const pending = Number(res.records?.[0]?.pending ?? 0);
    if (pending === 0) return { ok: true, waitedMs: Date.now() - started };
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { ok: false, error: 'timed out waiting for indexes to come online' };
}
