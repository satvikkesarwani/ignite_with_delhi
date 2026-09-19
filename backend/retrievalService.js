/**
 * Segment retrieval: "find ML builders from Delhi colleges who have won something".
 *
 * Nemotron takes ~25s a call, so the hot path must not need one. Three tiers:
 *
 *   Tier 1  Composable Cypher template. The query is parsed with regex against
 *           vocabularies read from the data (skills, colleges, personas, tracks),
 *           then a parameterised Cypher statement is assembled from whichever
 *           filters were found. Zero LLM calls, ~100ms.
 *   Tier 2  text2cypher — ONE LLM call, only when no filter was recognised but the
 *           question is clearly about this domain. Schema-injected, read-only
 *           guarded, LIMIT forced, 10s timeout.
 *   Tier 3  Honest failure. Says what it can answer. Never fabricates.
 *
 * The Cypher that actually ran is returned so the UI can show it.
 */

import { neo4jService } from './neo4jService.js';
import { generateChat } from './aiService.js';
import { profileStore, toRow, canonicalCollege, collegeSpellings } from './profileStore.js';
import { COLLEGES, THEMES, HACKATHON_NAMES, SKILL_CLUSTERS } from '../scripts/data/pools.mjs';
import { createLogger } from './logger.js';

const log = createLogger('retrieval');

const TODAY = '2026-09-19';
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ------------------------------------------------------------- vocabularies

/** Words that name a whole skill cluster ("ML people", "web3 builders"). */
const CLUSTER_ALIASES = [
  {
    re: /\b(ml|machine learning|ai|artificial intelligence|nlp|llms?|genai|deep learning)\b/,
    cluster: 'ML/AI',
  },
  { re: /\b(web3|blockchain|crypto|decentrali[sz]ed|smart contracts?)\b/, cluster: 'Web3' },
  { re: /\b(front[- ]?end|ui developers?)\b/, cluster: 'Web' },
  { re: /\b(back[- ]?end)\b/, cluster: 'Backend' },
  { re: /\b(devops|cloud|infrastructure|sre)\b/, cluster: 'DevOps' },
  { re: /\b(data engineers?|data science|analytics)\b/, cluster: 'Data' },
  { re: /\b(graph databases?|knowledge graphs?|graph)\b/, cluster: 'Graph' },
  { re: /\b(mobile|android|ios|app developers?)\b/, cluster: 'Mobile' },
  { re: /\b(designers?|ux|ui\/ux|figma)\b/, cluster: 'Design' },
  { re: /\b(iot|hardware|embedded|robotics)\b/, cluster: 'IoT' },
];

const STATUS_WORDS = [
  {
    re: /\b(gone quiet|gone silent|gone dark|inactive|disengaged|slipp(?:ed|ing) away|dropped off|gone cold)\b/,
    statuses: ['dormant', 'lapsed'],
  },
  { re: /\b(dormant)\b/, statuses: ['dormant'] },
  { re: /\b(lapsed)\b/, statuses: ['lapsed'] },
  { re: /\b(cooling)\b/, statuses: ['cooling'] },
  { re: /\b(currently active|recently active|still active|active)\b/, statuses: ['active'] },
];

const METRICS = [
  { re: /\b(wins?|prizes?|awards?|winners?|podiums?)\b/, key: 'prize_count', label: 'prizes' },
  {
    re: /\b(mentor(?:ing)? (?:score|rating)|best mentors?|good mentors?|mentor)\b/,
    key: 'avg_mentor_score',
    label: 'mentor rating',
  },
  {
    re: /\b(submission rate|finish(?:ers|es)?|complet(?:e|ion))\b/,
    key: 'submission_rate',
    label: 'submission rate',
  },
  {
    re: /\b(most active|most events|most hackathons|attended the most|frequent)\b/,
    key: 'hackathons_attended',
    label: 'hackathons attended',
  },
  {
    re: /\b(interactions?|community|most engaged in the community)\b/,
    key: 'interactions',
    label: 'interactions',
  },
  { re: /\b(engagement|engaged)\b/, key: 'engagement', label: 'engagement' },
];

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const NUM_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
};

// ------------------------------------------------------------------ parsing

function findColleges(text) {
  const found = new Set();
  const lower = text.toLowerCase();
  for (const c of COLLEGES) {
    for (const spelling of [c.name, c.short, ...c.variants]) {
      const s = spelling.toLowerCase();
      if (s.length < 3) continue;
      if (new RegExp(`(^|[^a-z0-9])${esc(s)}([^a-z0-9]|$)`).test(lower)) found.add(c.name);
    }
  }
  return [...found];
}

function findCityColleges(text) {
  const lower = text.toLowerCase();
  if (/\bdelhi[- ]?ncr\b/.test(lower)) return ['Delhi', 'Noida', 'Greater Noida'];
  // "from Delhi colleges" — but not when a specific college already carries "Delhi" in its name.
  if (
    /\b(delhi|noida|bengaluru|pune|hyderabad|mumbai|chennai)\b\s+(colleges?|universit|institutes?)/.test(
      lower
    )
  ) {
    const m = lower.match(
      /\b(delhi|noida|bengaluru|pune|hyderabad|mumbai|chennai)\b\s+(?:colleges?|universit|institutes?)/
    );
    return [m[1][0].toUpperCase() + m[1].slice(1)];
  }
  return [];
}

function findSkills(text) {
  const lower = text.toLowerCase();
  const vocab = profileStore.vocab().skills; // lowercased name -> {name, cluster}
  const groups = [];
  const consumed = [];

  // Named skills first, longest first so "Node.js" beats "Node" and "Next.js" beats "Next".
  const names = [...vocab.keys()].sort((a, b) => b.length - a.length);
  for (const n of names) {
    if (n.length < 2) continue;
    const re = new RegExp(`(^|[^a-z0-9+#])${esc(n)}(?![a-z0-9])`);
    if (re.test(lower) && !consumed.some((c) => c.includes(n))) {
      groups.push({ label: vocab.get(n).name, names: [vocab.get(n).name] });
      consumed.push(n);
    }
  }
  // Cluster words, unless a named skill from that same cluster already covers it.
  for (const { re, cluster } of CLUSTER_ALIASES) {
    const m = lower.match(re);
    if (!m) continue;
    const already = groups.some((g) => g.names.some((n) => SKILL_CLUSTERS[cluster]?.includes(n)));
    if (already) continue;
    groups.push({ label: `${cluster} skills`, names: SKILL_CLUSTERS[cluster] || [], cluster });
  }
  return groups;
}

function parseSince(text) {
  const lower = text.toLowerCase();
  const iso = lower.match(/since\s+(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const my = lower.match(new RegExp(`since\\s+(${MONTHS.join('|')})\\s+(\\d{4})`));
  if (my) return `${my[2]}-${String(MONTHS.indexOf(my[1]) + 1).padStart(2, '0')}-01`;
  const y = lower.match(/since\s+(20\d{2})\b/);
  if (y) return `${y[1]}-01-01`;
  const ago = lower.match(
    /(?:in|for|past|last)\s+(?:the\s+)?(?:last\s+)?(\d+|six|three|twelve)\s+months?/
  );
  if (ago && /(no|not|haven'?t|hasn'?t|without|gone|quiet|inactive)/.test(lower)) {
    const n = Number(ago[1]) || { six: 6, three: 3, twelve: 12 }[ago[1]];
    const d = new Date(`${TODAY}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - n);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Turn a sentence into structured filters. Pure regex + vocabulary — no LLM.
 * Returns null filters that were not present, so callers can tell what matched.
 */
/**
 * Organizers here write Hinglish ("DTU ke bache jo React jante hain aur abhi interning hain").
 * Map the common words to English before parsing, so the same regex vocabulary handles both.
 * Multi-word phrases first; the filler words that carry no meaning are dropped.
 */
export function normalizeHinglish(input) {
  let t = ` ${String(input || '').toLowerCase()} `;
  const rules = [
    [/\b(jaante|jante|janta|jaanta) (hain|hai|ho)\b/g, ' know '],
    [/\b(aata|aati|aate) (hai|hain)\b/g, ' know '],
    [
      /\b(gayab|kho gaye|kho gaya|chup ho gaye|active nahi|nahi aaye|nahin aaye)\b/g,
      ' gone quiet ',
    ],
    [
      /\b(dikhao|dikha do|dikhaiye|batao|bata do|dhundo|dhoondo|dhundho|nikalo|chahiye)\b/g,
      ' find ',
    ],
    [/\b(bache|bachhe|bachche|log|ladke|ladkiyan|vidyarthi)\b/g, ' people '],
    [/\b(jeete|jeeta|jeeti|jite|jita|jeet chuke)\b/g, ' won '],
    [/\b(jo|jinhone|jinhe)\b/g, ' who '],
    [/\b(abhi|filhal|currently)\b/g, ' currently '],
    [/\b(aur)\b/g, ' and '],
    [/\b(kitne)\b/g, ' how many '],
    [
      /\b(mujhe|humein|hume|mera|meri|wo|woh|ye|yeh|ke|ka|ki|ko|se|mein|me|hai|hain|ho|hoon|kar|karo|raha|rahe|rahi|wale|wali|wala)\b/g,
      ' ',
    ],
  ];
  for (const [re, to] of rules) t = t.replace(re, to);
  return t.replace(/\s+/g, ' ').trim();
}

export function parseSegment(message) {
  const text = normalizeHinglish(message);
  const lower = text.toLowerCase();
  const vocab = profileStore.vocab();
  const p = { filters: [], labels: [] };

  const colleges = findColleges(text);
  if (colleges.length) {
    p.colleges = colleges;
    p.filters.push('college');
    p.labels.push(colleges.map((c) => canonicalCollege(c).short).join(' or '));
  }
  const cityColleges = colleges.length ? [] : findCityColleges(text);
  if (cityColleges.length) {
    p.collegeCities = cityColleges;
    p.filters.push('college_city');
    p.labels.push(`${cityColleges.join('/')} colleges`);
  }

  const trackWord = lower.match(/\b(tavily|cognee|neo4j)\b/)?.[1];
  const trackAsked = trackWord && /\b(track|won|win|winners?|winning|prize|best use)\b/.test(lower);
  const skills = findSkills(text).filter(
    (g) => !(trackAsked && g.label.toLowerCase() === trackWord)
  );
  if (skills.length) {
    p.skillGroups = skills;
    p.filters.push('skill');
    p.labels.push(skills.map((s) => s.label).join(' + '));
  }

  const grad =
    lower.match(
      /\b(?:class of|batch of|batch|graduating(?: in)?|graduates? of|grad(?:uation)? year)\s+(20\d{2})\b/
    ) || lower.match(/\b(20(?:2[5-9]))\s+(?:batch|graduates?|grads?)\b/);
  if (grad) {
    p.gradYear = Number(grad[1]);
    p.filters.push('grad_year');
    p.labels.push(`class of ${grad[1]}`);
  } else if (/\bfinal[- ]year\b/.test(lower)) {
    p.gradYear = 2026;
    p.filters.push('grad_year');
    p.labels.push('final-year');
  }

  for (const persona of vocab.personas) {
    const root = persona.toLowerCase();
    const singular = root.replace(/s$/, '');
    if (
      lower.includes(root) ||
      lower.includes(singular) ||
      lower.includes(root.replace(/-/g, ' '))
    ) {
      p.persona = persona;
      p.filters.push('persona');
      p.labels.push(persona);
      break;
    }
  }
  if (
    !p.persona &&
    /\b(mentor material|would make (?:a )?good mentors?|potential mentors?|future mentors?|mentors? this year|who should (?:we )?(?:ask|recruit).{0,20}mentor)\b/.test(
      lower
    )
  ) {
    p.persona = 'Mentor Material';
    p.filters.push('persona');
    p.labels.push('Mentor Material');
  }
  if (!p.persona && /\b(rising stars?|on the rise|improving)\b/.test(lower)) {
    p.persona = 'Rising Star';
    p.filters.push('persona');
    p.labels.push('Rising Star');
  }

  for (const { re, statuses } of STATUS_WORDS) {
    if (re.test(lower)) {
      p.statuses = statuses;
      p.filters.push('status');
      p.labels.push(statuses.join('/'));
      break;
    }
  }

  // Winners, and which prize.
  const wantsWinners =
    /\b(won|win|wins|winning|winners?|prizes?|podium|placed|awarded|champions?|medal(?:l)?ists?|first place|1st place)\b/.test(
      lower
    ) && !/\b(top \d+|most)\b.*\b(wins?|prizes?)\b/.test(lower);
  const track = lower.match(/\b(?:best use of\s+)?(tavily|cognee|neo4j)\b(?:\s+track)?/);
  const theme = THEMES.find(
    (t) =>
      lower.includes(t.toLowerCase()) ||
      (t === 'GenAI & Agents' && /\bgenai\b/.test(lower) && /(hackathon|track|event)/.test(lower))
  );
  const hname = HACKATHON_NAMES.find((n) => lower.includes(n.toLowerCase()));
  if (wantsWinners || track) {
    p.winner = {
      track: track
        ? `Best use of ${track[1] === 'neo4j' ? 'Neo4j' : track[1][0].toUpperCase() + track[1].slice(1)}`
        : null,
      theme: theme || null,
      hackathon: hname || null,
      first: /\b(first place|1st place|champions?)\b/.test(lower),
    };
    p.filters.push('winners');
    p.labels.push(
      p.winner.track
        ? `won ${p.winner.track}`
        : p.winner.first
          ? 'took first place'
          : 'has won a prize'
    );
  }

  const since = parseSince(text);
  if (
    since &&
    /(quiet|inactive|not|no |haven|hasn|without|gone|absent|missing|lapsed|dormant)/.test(lower)
  ) {
    p.inactiveSince = since;
    p.filters.push('inactive_since');
    p.labels.push(`inactive since ${since}`);
  }

  // Outreach / consent.
  if (
    /\b(no reply|not replied|never replied|haven'?t replied|hasn'?t replied|without (?:a )?repl(?:y|ies)|unanswered|ignored us)\b/.test(
      lower
    ) &&
    /\b(contact|email|emailed|reach|reached|messag|sent|invite|outreach)\w*/.test(lower)
  ) {
    const t = lower.match(/\b(twice|two times|(\d+) times|three times|thrice)\b/);
    p.noReply = {
      minSent: t
        ? ({ twice: 2, 'two times': 2, thrice: 3, 'three times': 3 }[t[1]] ?? Number(t[2]))
        : 1,
    };
    p.filters.push('contacted_no_reply');
    p.labels.push(`contacted ${p.noReply.minSent}+ times, no reply`);
  } else if (
    /\b(can we|could we|should we|who to|okay to|safe to|allowed to)\b.{0,30}\b(email|contact|reach|message|invite|ping)\b|\b(consented|opted in|opt-in|reachable)\b/.test(
      lower
    )
  ) {
    p.canContact = true;
    p.filters.push('can_contact');
    p.labels.push('consented, not unsubscribed');
  }

  // "currently interning" — a current internship on the (synthetic) LinkedIn-shaped work history.
  if (/\b(interns?|interning|internship|internships)\b/.test(lower)) {
    p.interning = true;
    p.filters.push('interning');
    p.labels.push('currently interning');
  }

  // Sorting / limit.
  const topN = lower.match(
    /\btop\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)\b/
  );
  if (topN) p.limit = Number(topN[1]) || NUM_WORDS[topN[1]];
  for (const m of METRICS) {
    if (
      m.re.test(lower) &&
      (topN ||
        /\b(best|most|highest|top|strongest|leading|rank(?:ed)?)\b/.test(lower) ||
        (m.key === 'avg_mentor_score' && p.persona === 'Mentor Material'))
    ) {
      p.sortBy = m;
      if (!p.filters.length) p.filters.push('top_n');
      break;
    }
  }
  if (!p.sortBy && p.persona === 'Mentor Material')
    p.sortBy = METRICS.find((m) => m.key === 'avg_mentor_score');
  if (!p.sortBy && (p.winner || p.filters.includes('winners')))
    p.sortBy = METRICS.find((m) => m.key === 'prize_count');

  return p;
}

// ------------------------------------------------------------- cypher builder

const SORT_PROP = {
  prize_count: 'cp.prize_count',
  avg_mentor_score: 'cp.avg_mentor_score',
  submission_rate: 'cp.submission_rate',
  hackathons_attended: 'cp.hackathons_attended',
  interactions: 'cp.interactions',
  engagement: 'cp.engagement',
};

export function buildCypher(p) {
  const params = {};
  const where = [];
  const limit = Math.min(Math.max(Number(p.limit) || 25, 1), 50);

  if (p.colleges) {
    params.colleges = p.colleges.flatMap((c) => collegeSpellings(c));
    where.push('p.college IN $colleges');
  }
  if (p.collegeCities) {
    params.collegeCities = p.collegeCities;
    where.push('EXISTS { (p)-[:STUDIED_AT]->(c:College) WHERE c.city IN $collegeCities }');
  }
  (p.skillGroups || []).forEach((g, i) => {
    params[`skills${i}`] = g.names;
    // Evidence-backed only (confidence >= 0.5): a bare self-declaration is 0.3 and does not count.
    where.push(
      `EXISTS { (p)-[r:HAS_SKILL]->(s:Skill) WHERE s.name IN $skills${i} AND r.confidence >= 0.5 }`
    );
  });
  if (p.gradYear) {
    params.gradYear = p.gradYear;
    where.push('p.grad_year = $gradYear');
  }
  if (p.persona) {
    params.persona = p.persona;
    where.push('$persona IN cp.personas');
  }
  if (p.statuses) {
    params.statuses = p.statuses;
    where.push('cp.trajectory_status IN $statuses');
  }
  if (p.winner) {
    const w = p.winner;
    const inner = ['(res.rank IS NOT NULL OR res.prize_track IS NOT NULL)'];
    if (w.track) {
      params.track = w.track;
      inner.push('res.prize_track = $track');
    }
    if (w.first) inner.push('res.rank = 1');
    let tail = '';
    if (w.theme) {
      params.theme = w.theme;
      tail = ' AND EXISTS { (t)-[:COMPETED_IN]->(h:Hackathon) WHERE h.theme_track = $theme }';
    } else if (w.hackathon) {
      params.hackName = w.hackathon;
      tail = ' AND EXISTS { (t)-[:COMPETED_IN]->(h:Hackathon) WHERE h.name = $hackName }';
    }
    where.push(
      `EXISTS { (p)-[:MEMBER_OF]->(t:Team)-[:BUILT]->(:Project)-[:ACHIEVED]->(res:Result) WHERE ${inner.join(' AND ')}${tail} }`
    );
  }
  if (p.inactiveSince) {
    params.since = p.inactiveSince;
    where.push('p.last_active < $since');
  }
  if (p.canContact) {
    where.push('p.consent_flag = true');
    where.push(
      "NOT EXISTS { (p)-[:RECEIVED]->(u:OutreachEvent) WHERE u.outcome = 'unsubscribed' }"
    );
    // Not contacted in the last 90 days — don't nag someone we just emailed.
    const d = new Date(`${TODAY}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 90);
    params.recent = d.toISOString().slice(0, 10);
    where.push('NOT EXISTS { (p)-[:RECEIVED]->(o:OutreachEvent) WHERE o.sent_at >= $recent }');
  }
  if (p.interning) {
    where.push(
      "EXISTS { (p)-[w:WORKED_AT]->(:Company) WHERE w.end IS NULL AND toLower(w.title) CONTAINS 'intern' }"
    );
  }
  if (p.noReply) {
    params.minSent = p.noReply.minSent;
    where.push('size([(p)-[:RECEIVED]->(o:OutreachEvent) | o]) >= $minSent');
    where.push('NOT EXISTS { (p)-[:RECEIVED]->(o2:OutreachEvent) WHERE o2.replied = true }');
  }

  const sortKey = p.sortBy?.key || 'engagement';
  const orderProp = SORT_PROP[sortKey] || 'cp.engagement';
  const cypher = [
    'MATCH (cp:ContextProfile)-[:ABOUT]->(p:Person)',
    where.length ? `WHERE ${where.join('\n  AND ')}` : null,
    `RETURN p.user_id AS user_id, ${orderProp} AS sort_value${p.interning ? ", [(p)-[w:WORKED_AT]->(c:Company) WHERE w.end IS NULL AND toLower(w.title) CONTAINS 'intern' | c.name + ' (' + w.title + ')'][0] AS interning_at" : ''}`,
    `ORDER BY sort_value DESC, p.full_name`,
    `LIMIT ${limit}`,
  ]
    .filter(Boolean)
    .join('\n');

  // Same filters, no LIMIT — lets the UI say "showing 25 of 61" honestly.
  const countCypher = [
    'MATCH (cp:ContextProfile)-[:ABOUT]->(p:Person)',
    where.length ? `WHERE ${where.join('\n  AND ')}` : null,
    'RETURN count(p) AS total',
  ]
    .filter(Boolean)
    .join('\n');
  return { cypher, countCypher, params, limit, sortKey };
}

// ------------------------------------------------------------- rationale

/**
 * Evidence strings carry a project score ("used in 2 projects, best P0021 (scored 33)").
 * In a one-line rationale that number is noise and can read as an insult, so drop it.
 */
function cleanEvidence(detail) {
  return String(detail)
    .replace(/,?\s*best\s+P\d+(\s*\(scored [\d.]+\))?/i, '')
    .replace(/\s*\(scored [\d.]+\)/i, '')
    .trim();
}

/** One factual line per row, built from the profile — never generated by an LLM. */
export function rationaleFor(profile, p) {
  const f = profile.facts;
  const parts = [];

  if (p.sortBy?.key === 'prize_count' && !p.winner) {
    parts.push(
      `${f.prize_count} prize${f.prize_count === 1 ? '' : 's'}, best rank ${f.best_rank ?? '—'}`
    );
  } else if (p.winner) {
    const prize =
      f.prizes.find((x) => (p.winner?.track ? x.prize_track === p.winner.track : true)) ||
      f.prizes[0];
    if (prize)
      parts.push(`${prize.rank ? `rank ${prize.rank}` : prize.prize_track} at ${prize.hackathon}`);
    else if (f.prize_count) parts.push(`${f.prize_count} prizes`);
  }
  for (const g of p.skillGroups || []) {
    const hit = profile.skills.find((s) => g.names.includes(s.skill) && s.confidence >= 0.5);
    if (hit) {
      const src =
        hit.sources.find((x) => x.type === 'github') ||
        hit.sources.find((x) => x.type === 'project') ||
        hit.sources[0];
      parts.push(`${hit.skill} (${cleanEvidence(src.detail)})`);
    }
  }
  if (p.persona) parts.push(p.persona);
  if (p.sortBy?.key === 'avg_mentor_score' && f.avg_mentor_score)
    parts.push(`mentor rating ${f.avg_mentor_score} over ${f.mentor_sessions} sessions`);
  if (p.noReply) parts.push(`${f.outreach.sent} messages sent, ${f.outreach.replied} replies`);
  if (p.inactiveSince || p.statuses)
    parts.push(`last active ${f.last_active} (${f.days_since_active} days ago)`);

  if (parts.length < 3)
    parts.push(`${f.hackathons_attended} hackathon${f.hackathons_attended === 1 ? '' : 's'}`);
  if (parts.length < 3 && !(p.inactiveSince || p.statuses) && f.days_since_active !== null) {
    parts.push(
      f.days_since_active <= 60
        ? `active ${f.days_since_active} days ago`
        : `last active ${f.days_since_active} days ago`
    );
  }
  return parts.slice(0, 4).join(' · ');
}

// ------------------------------------------------------ in-memory fallback

/**
 * Same filters, evaluated against the profile store. Used only when the graph is
 * unreachable, so the demo degrades to "slightly less detail" rather than "blank".
 */
function filterInMemory(p) {
  let rows = profileStore.all();
  if (p.colleges)
    rows = rows.filter((x) => p.colleges.includes(canonicalCollege(x.identity.college).name));
  if (p.collegeCities)
    rows = rows.filter((x) =>
      COLLEGES.find(
        (c) =>
          c.name === canonicalCollege(x.identity.college).name && p.collegeCities.includes(c.city)
      )
    );
  for (const g of p.skillGroups || [])
    rows = rows.filter((x) =>
      x.skills.some((s) => g.names.includes(s.skill) && s.confidence >= 0.5)
    );
  if (p.gradYear) rows = rows.filter((x) => x.identity.grad_year === p.gradYear);
  if (p.persona) rows = rows.filter((x) => x.personas.includes(p.persona));
  if (p.statuses) rows = rows.filter((x) => p.statuses.includes(x.trajectory.status));
  if (p.winner) {
    rows = rows.filter((x) =>
      x.facts.prizes.some(
        (z) =>
          (!p.winner.track || z.prize_track === p.winner.track) && (!p.winner.first || z.rank === 1)
      )
    );
  }
  if (p.inactiveSince) rows = rows.filter((x) => x.facts.last_active < p.inactiveSince);
  if (p.canContact)
    rows = rows.filter((x) => x.identity.consent_flag && !x.facts.outreach.unsubscribed);
  if (p.noReply)
    rows = rows.filter(
      (x) => x.facts.outreach.sent >= p.noReply.minSent && x.facts.outreach.replied === 0
    );

  const key = p.sortBy?.key || 'engagement';
  const val = (x) =>
    ({
      prize_count: x.facts.prize_count,
      avg_mentor_score: x.facts.avg_mentor_score ?? 0,
      submission_rate: x.facts.submission_rate ?? 0,
      hackathons_attended: x.facts.hackathons_attended,
      interactions: x.facts.interactions,
      engagement: x.engagement.value,
    })[key] ?? 0;
  return rows.sort((a, b) => val(b) - val(a)).slice(0, Math.min(Number(p.limit) || 25, 50));
}

// -------------------------------------------------------------------- tier 1

async function tier1(message, parsed) {
  const startedAt = Date.now();
  const { cypher, countCypher, params, limit } = buildCypher(parsed);
  const name = parsed.filters.join('_') || 'top_n';

  let ids = null;
  let source = 'graph';
  const res = await neo4jService.runCypherQuery(cypher, params);
  if (res.success && !res.isMock) ids = res.records.map((r) => r.user_id);
  else {
    source = 'profile_store';
    ids = filterInMemory(parsed).map((x) => x.user_id);
  }

  let totalMatches = ids.length;
  if (source === 'graph' && ids.length >= limit) {
    const c = await neo4jService.runCypherQuery(countCypher, params);
    if (c.success) totalMatches = c.records[0]?.total ?? ids.length;
  } else if (source === 'profile_store') {
    totalMatches = filterInMemory({ ...parsed, limit: 9999 }).length;
  }

  // The internship filter needs the graph's work history; the profile store cannot answer it, and an
  // unfiltered fallback would list people who are NOT interning. Fail through to the honest tier instead.
  if (parsed.interning && source !== 'graph')
    throw new Error('interning filter needs the live graph');
  const internAt =
    source === 'graph' && parsed.interning
      ? Object.fromEntries(res.records.map((r) => [r.user_id, r.interning_at]))
      : {};

  const profiles = ids.map((id) => profileStore.get(id)).filter(Boolean);
  const rows = profiles.map(toRow);
  const rationale = Object.fromEntries(
    profiles.map((pr) => [
      pr.user_id,
      [
        internAt[pr.user_id] ? `interning at ${internAt[pr.user_id]}` : null,
        rationaleFor(pr, parsed),
      ]
        .filter(Boolean)
        .join(' · '),
    ])
  );

  return {
    rows,
    total: rows.length,
    total_matches: totalMatches,
    strategy: `template:${name}`,
    cypher,
    cypher_params: params,
    rationale_by_user_id: rationale,
    criteria: parsed.labels,
    sort: parsed.sortBy?.label || 'engagement',
    source,
    latency_ms: Date.now() - startedAt,
    llm_calls: 0,
  };
}

// -------------------------------------------------------------------- tier 2

const DOMAIN_SCHEMA = `Graph schema (Neo4j). Use ONLY these labels, relationships and properties.
Nodes:
  (:Person {user_id, full_name, email, college, degree, branch, grad_year, city, signup_date, last_active, github_username, role_pref, consent_flag})
  (:Hackathon {hackathon_id, name, start_date, end_date, mode, city, theme_track, sponsors, prize_pool_inr})
  (:Team {team_id, team_name, team_size})
  (:Project {project_id, title, description, tech_stack, submitted_at})
  (:Result {project_id, rank, prize_track, score, judge_feedback})   -- rank is 1..3 or null
  (:Skill {name})  (:College {name, city})  (:Company {name})
  (:Mentor {mentor_id, full_name, expertise, company})
  (:MentorSession {session_id, session_date, mentor_score, notes})
  (:Interaction {interaction_id, type, timestamp, text})
  (:OutreachEvent {touchpoint_id, campaign_name, channel, sent_at, opened, clicked, replied, outcome})
  (:ContextProfile {user_id, engagement, personas, trajectory_status, prize_count, hackathons_attended, submission_rate, avg_mentor_score, interactions, days_since_active, last_active})
Relationships:
  (Person)-[:ATTENDED|REGISTERED_FOR]->(Hackathon)   (Person)-[:MEMBER_OF]->(Team)   (Team)-[:COMPETED_IN]->(Hackathon)
  (Team)-[:BUILT]->(Project)   (Project)-[:ACHIEVED]->(Result)   (Project)-[:USES]->(Skill)
  (Person)-[:HAS_SKILL {source, confidence}]->(Skill)   (Person)-[:STUDIED_AT]->(College)   (Person)-[:WORKED_AT]->(Company)
  (Person)-[:PERFORMED]->(MentorSession)-[:WITH_MENTOR]->(Mentor)   (Person)-[:POSTED]->(Interaction)
  (Person)-[:RECEIVED]->(OutreachEvent)   (Person)-[:TEAMMATE_OF {times}]-(Person)   (ContextProfile)-[:ABOUT]->(Person)`;

const WRITE_RE =
  /\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|LOAD\s+CSV|FOREACH|INSERT)\b|\bCALL\s+(?!db\.index\.fulltext)/i;

export function guardCypher(raw) {
  let cypher = String(raw || '')
    .replace(/```[a-z]*\n?/gi, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
    .replace(/;+\s*$/, '')
    .trim();
  if (!/^(MATCH|OPTIONAL MATCH|WITH|CALL db\.index\.fulltext)/i.test(cypher))
    return { ok: false, reason: 'does not start with a read clause', cypher };
  if (WRITE_RE.test(cypher))
    return { ok: false, reason: 'contains a write or procedure clause', cypher };
  if (!/\bLIMIT\s+\d+/i.test(cypher)) cypher += '\nLIMIT 50';
  return { ok: true, cypher };
}

async function tier2(message) {
  const startedAt = Date.now();
  const gen = await generateChat({
    messages: [
      {
        role: 'system',
        content: `You convert an organizer's question into ONE read-only Neo4j Cypher statement over a hackathon-participant graph.
${DOMAIN_SCHEMA}
Rules:
- Output ONLY the Cypher. No prose, no markdown fences, no comments.
- Start with MATCH or OPTIONAL MATCH. Never write, and never use CALL except the fulltext index.
- Always end with LIMIT (max 50). Prefer RETURN p.user_id AS user_id, p.full_name AS full_name plus any measured column.
- Use only labels, relationships and properties listed above. If the question cannot be answered from them, output exactly: NO_ANSWER
Examples:
Q: who attended more than 5 hackathons
MATCH (p:Person)-[:ATTENDED]->(h:Hackathon) WITH p, count(h) AS events WHERE events > 5 RETURN p.user_id AS user_id, p.full_name AS full_name, events ORDER BY events DESC LIMIT 25
Q: which projects use Neo4j
MATCH (pr:Project)-[:USES]->(s:Skill {name:'Neo4j'}) RETURN pr.project_id AS project_id, pr.title AS title LIMIT 25
Q: mentors who gave the highest average rating
MATCH (m:Mentor)<-[:WITH_MENTOR]-(s:MentorSession) RETURN m.full_name AS mentor, avg(s.mentor_score) AS avg_rating, count(s) AS sessions ORDER BY avg_rating DESC LIMIT 10
/no_think`,
      },
      { role: 'user', content: message },
    ],
    temperature: 0.1,
    maxTokens: 350,
  });

  if (/NO_ANSWER/i.test(gen.content))
    return {
      ok: false,
      reason: 'model declared the question unanswerable',
      latency_ms: Date.now() - startedAt,
    };
  const guarded = guardCypher(gen.content);
  if (!guarded.ok)
    return {
      ok: false,
      reason: guarded.reason,
      cypher: guarded.cypher,
      latency_ms: Date.now() - startedAt,
    };

  const run = await Promise.race([
    neo4jService.runCypherQuery(guarded.cypher, {}),
    new Promise((resolve) =>
      setTimeout(() => resolve({ success: false, error: 'query timed out after 10s' }), 10000)
    ),
  ]);
  if (!run.success)
    return {
      ok: false,
      reason: run.error,
      cypher: guarded.cypher,
      latency_ms: Date.now() - startedAt,
    };
  if (!run.records.length)
    return {
      ok: false,
      reason: 'the query ran but returned nothing',
      cypher: guarded.cypher,
      latency_ms: Date.now() - startedAt,
    };

  const withIds = run.records.filter((r) => r.user_id && profileStore.get(r.user_id));
  const profiles = withIds.map((r) => profileStore.get(r.user_id));
  return {
    ok: true,
    rows: profiles.map(toRow),
    records: run.records,
    cypher: guarded.cypher,
    latency_ms: Date.now() - startedAt,
  };
}

// --------------------------------------------------------------------- entry

const DOMAIN_WORDS =
  /\b(hackathons?|projects?|teams?|mentors?|mentoring|prizes?|scores?|ranks?|winners?|skills?|colleges?|universit\w+|students?|participants?|people|attend\w*|submi\w+|interactions?|workshops?|repos?|github|teammates?|tracks?|sponsors?|judges?|campaigns?|outreach|emails?)\b/;

export const EXAMPLE_QUESTIONS = [
  'Find ML builders from Delhi colleges who have won something',
  'Who has gone quiet since winning?',
  'Who would make a good mentor this year?',
  'Top 5 people by prizes',
];

export async function segment(message) {
  const parsed = parseSegment(message);

  // Tier 1 — a template hit needs at least one recognised filter.
  if (parsed.filters.length) {
    try {
      const out = await tier1(message, parsed);
      return { success: true, ...out };
    } catch (e) {
      log.warn('Tier 1 failed, falling through', { message: e.message });
    }
  }

  // Tier 2 — only for questions that are plainly about this domain.
  if (DOMAIN_WORDS.test(message.toLowerCase()) && !neo4jService.isMockMode) {
    try {
      const t2 = await tier2(message);
      if (t2.ok) {
        return {
          success: true,
          rows: t2.rows,
          records: t2.records,
          total: t2.records.length,
          strategy: 'text2cypher',
          cypher: t2.cypher,
          rationale_by_user_id: Object.fromEntries(
            t2.rows.map((r) => [r.user_id, rationaleFor(profileStore.get(r.user_id), {})])
          ),
          criteria: [],
          latency_ms: t2.latency_ms,
          llm_calls: 1,
        };
      }
      log.info('Tier 2 gave up', { reason: t2.reason });
    } catch (e) {
      log.warn('Tier 2 failed', { message: e.message });
    }
  }

  // Tier 3 — honest failure.
  return {
    success: true,
    rows: [],
    total: 0,
    strategy: 'fallback',
    cypher: null,
    rationale_by_user_id: {},
    criteria: [],
    latency_ms: 0,
    llm_calls: 0,
    honest_failure: true,
    message:
      "I couldn't turn that into a reliable query, so I won't guess. I can filter people by college, skill, persona, activity status, wins, mentor rating and outreach history.",
    examples: EXAMPLE_QUESTIONS,
  };
}
