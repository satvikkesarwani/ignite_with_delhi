/**
 * In-memory index over the built ContextProfiles.
 *
 * ContextProfile nodes in Neo4j are the source of truth; this is a read-through
 * cache of them, loaded from data/profiles/*.json (which persistProfile mirrors
 * on every build). Two jobs:
 *
 *   1. Speed. The directory table, facets and story users answer in
 *      milliseconds instead of a round trip to AuraDB per request.
 *   2. The stage fallback. If the graph is paused mid-demo the app keeps
 *      serving profiles and the existence check still works.
 *
 * Graph-side queries (winners of a track, teammates, the evidence subgraph)
 * still hit Neo4j; this only covers what a profile already knows.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { COLLEGES } from '../scripts/data/pools.mjs';
import { createLogger } from './logger.js';

const log = createLogger('profile-store');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, '..', 'data', 'profiles');

/** college string in ANY spelling the CSV used -> { name, short } */
const COLLEGE_INDEX = new Map();
for (const c of COLLEGES) {
  for (const key of [c.name, c.short, ...c.variants]) {
    COLLEGE_INDEX.set(key.toLowerCase(), { name: c.name, short: c.short });
  }
}

export const canonicalCollege = (raw) =>
  COLLEGE_INDEX.get(
    String(raw || '')
      .trim()
      .toLowerCase()
  ) || { name: raw, short: raw };

/**
 * Resolve free text ("IIT Delhi", "amity", "DTU") to a real college, or null.
 * Returns null rather than echoing the input, so callers can tell a college from a non-college.
 */
export function matchCollege(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase();
  if (t.length < 3) return null;
  if (COLLEGE_INDEX.has(t)) return COLLEGE_INDEX.get(t);
  for (const c of COLLEGES) {
    for (const spelling of [c.name, c.short, ...c.variants]) {
      const sp = spelling.toLowerCase();
      if (sp.includes(t) || (t.includes(sp) && sp.length >= 3))
        return { name: c.name, short: c.short };
    }
  }
  return null;
}

/** Every spelling of a college, for Cypher `IN` filters against messy source rows. */
export function collegeSpellings(nameOrShort) {
  const canon = canonicalCollege(nameOrShort);
  const c = COLLEGES.find((x) => x.name === canon.name);
  return c ? [c.name, c.short, ...c.variants] : [nameOrShort];
}

export const normalizeName = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

class ProfileStore {
  constructor() {
    this.byId = new Map();
    this.loaded = false;
  }

  load(force = false) {
    if (this.loaded && !force) return this;
    this.byId.clear();
    if (fs.existsSync(DIR)) {
      for (const f of fs.readdirSync(DIR)) {
        if (!f.endsWith('.json')) continue;
        try {
          const p = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
          this.byId.set(p.user_id, p);
        } catch (e) {
          log.warn('Skipping unreadable profile', { file: f, message: e.message });
        }
      }
    }
    this.loaded = true;
    log.info('Profile store loaded', { profiles: this.byId.size });
    return this;
  }

  upsert(profile) {
    this.load();
    this.byId.set(profile.user_id, profile);
  }

  get(userId) {
    return this.load().byId.get(userId) || null;
  }

  all() {
    return [...this.load().byId.values()];
  }

  get size() {
    return this.load().byId.size;
  }

  /** Vocabularies the retrieval router matches queries against — read from data, never hardcoded. */
  vocab() {
    if (this._vocab) return this._vocab;
    const skills = new Map();
    const personas = new Set();
    const cities = new Set();
    for (const p of this.all()) {
      for (const s of p.skills)
        skills.set(s.skill.toLowerCase(), { name: s.skill, cluster: s.cluster });
      p.personas.forEach((x) => personas.add(x));
      if (p.identity.city) cities.add(p.identity.city);
    }
    this._vocab = { skills, personas: [...personas], cities: [...cities] };
    return this._vocab;
  }

  invalidate() {
    this._vocab = null;
  }
}

export const profileStore = new ProfileStore();

/** The directory-table row shape fixed in docs/CONTRACT.md. */
export function toRow(p) {
  const f = p.facts;
  return {
    user_id: p.user_id,
    full_name: p.identity.full_name,
    email: p.identity.email,
    college: canonicalCollege(p.identity.college).short,
    city: p.identity.city,
    personas: p.personas,
    top_skills: p.skills
      .filter((s) => s.confidence >= 0.5)
      .slice(0, 3)
      .map((s) => s.skill),
    hackathons_attended: f.hackathons_attended,
    prize_count: f.prize_count,
    engagement: p.engagement.value,
    last_active: f.last_active,
    status: p.trajectory.status,
    consent_flag: p.identity.consent_flag,
  };
}

/** One-line human distinguisher used when two people share a name. */
export function distinguisher(p) {
  return `${canonicalCollege(p.identity.college).short} · ${p.identity.role_pref} · ${p.facts.hackathons_attended} hackathon${p.facts.hackathons_attended === 1 ? '' : 's'}`;
}
