# PersonaCRM — System Contract

The single source of truth shared by the backend (track A) and frontend (track B).
When the two disagree, **this file wins**. If the contract itself is wrong, change it here
first, then both sides.

---

## 0. The rule that decides Agent Quality

> **The LLM never computes a number.**
>
> Every count, rate, date, ranking and score comes from Cypher or from JavaScript over
> Cypher results. The LLM only *narrates* values handed to it.

If Nemotron is allowed to count hackathons it will confidently say 3 when the answer is 7,
and the agent-quality score dies with it. This rule applies in every phase, without
exception.

---

## 1. Graph schema

### Nodes

| Label | Key | Properties |
|---|---|---|
| `Person` | `user_id` | `full_name`, `name_normalized`, `email`, `college`, `degree`, `branch`, `grad_year`, `city`, `signup_date`, `last_active`, `github_username`, `linkedin_url`, `role_pref`, `consent_flag`, `referral_source` |
| `Hackathon` | `hackathon_id` | `name`, `start_date`, `end_date`, `mode`, `city`, `theme_track`, `sponsors[]`, `prize_pool_inr`, `max_team_size`, `organizer` |
| `Team` | `team_id` | `team_name`, `team_size` |
| `Project` | `project_id` | `title`, `description`, `tech_stack[]`, `repo_url`, `demo_url`, `submitted_at` |
| `Result` | `project_id` | `rank`, `prize_track`, `prize_amount_inr`, `score`, `judge_feedback` |
| `Skill` | `name` | `cluster` |
| `College` | `name` | `city` |
| `Company` | `name` | — |
| `Mentor` | `mentor_id` | `full_name`, `expertise`, `company`, `years_experience` |
| `MentorSession` | `session_id` | `session_date`, `duration_min`, `mentor_score`, `notes` |
| `Interaction` | `interaction_id` | `type`, `timestamp`, `text` |
| `OutreachEvent` | `touchpoint_id` | `campaign_name`, `channel`, `sent_at`, `opened`, `clicked`, `replied`, `outcome` |
| `ContextProfile` | `user_id` | `json`, `narrative`, `built_at`, `version` |
| `RawEvent` | `event_id` | `source_type`, `source_ref`, `claim`, `observed_at`, `confidence` |

`name_normalized` is `full_name` lowercased, whitespace-collapsed, punctuation-stripped.
The CSV deliberately contains messy casing and padded names — normalize at load, keep the
original for display.

### Relationships

| Pattern | Properties |
|---|---|
| `(Person)-[:REGISTERED_FOR]->(Hackathon)` | `registered_at`, `status` |
| `(Person)-[:ATTENDED]->(Hackathon)` | `registered_at` |
| `(Person)-[:MEMBER_OF]->(Team)` | `team_role` |
| `(Team)-[:COMPETED_IN]->(Hackathon)` | — |
| `(Team)-[:BUILT]->(Project)` | — |
| `(Project)-[:ACHIEVED]->(Result)` | — |
| `(Project)-[:USES]->(Skill)` | — |
| `(Person)-[:HAS_SKILL]->(Skill)` | `source`, `confidence`, `evidence` |
| `(Person)-[:STUDIED_AT]->(College)` | — |
| `(Person)-[:WORKED_AT]->(Company)` | `title`, `start`, `end` |
| `(Person)-[:PERFORMED]->(MentorSession)-[:WITH_MENTOR]->(Mentor)` | — |
| `(MentorSession)-[:DURING]->(Hackathon)` | — |
| `(Person)-[:POSTED]->(Interaction)` | — |
| `(Person)-[:RECEIVED]->(OutreachEvent)` | — |
| `(Person)-[:TEAMMATE_OF]->(Person)` | `times`, `hackathons[]` |
| `(ContextProfile)-[:ABOUT]->(Person)` | — |
| `(ContextProfile)-[:DERIVED_FROM]->(RawEvent)` | — |

**Every relationship written at load carries `{source, observed_at}`.** `source` is
`csv:<filename>` for bulk data and `form` / `resume` / `tavily` / `github` for live intake.
Provenance is a judged feature — it must be wired at write time, never retrofitted.

### Indexes (created before bulk load)

- Uniqueness: `Person.user_id`, `Hackathon.hackathon_id`, `Team.team_id`,
  `Project.project_id`, `Mentor.mentor_id`, `Skill.name`, `College.name`, `Company.name`
- **Full-text `person_search` on `Person(full_name, email, college)`** — the existence
  check depends on it
- Range: `Person.last_active`, `Person.grad_year`, `Hackathon.start_date`

---

## 2. `ContextProfile`

The object the frontend renders and the agent cites. Built by `backend/contextBuilder.js`,
stored on the `ContextProfile` node and mirrored to `data/profiles/<user_id>.json`.

```jsonc
{
  "user_id": "U0001",
  "version": 1,
  "built_at": "2026-09-19T08:14:22Z",

  "identity": {
    "full_name": "Shiv Sharma",
    "email": "shiv.sharma@iitd.ac.in",
    "college": "Indian Institute of Technology Delhi",
    "degree": "B.Tech", "branch": "Computer Science and Engineering",
    "grad_year": 2026, "city": "Delhi", "role_pref": "ML/AI",
    "github_username": "shivsharma-ml",
    "linkedin_url": "https://linkedin.com/in/shiv-sharma-001",
    "consent_flag": true
  },

  // DETERMINISTIC. Computed by Cypher. Never by an LLM.
  "facts": {
    "hackathons_registered": 7,
    "hackathons_attended": 7,
    "no_shows": 0,
    "projects_submitted": 6,
    "submission_rate": 0.86,
    "prizes": [
      { "hackathon": "Ignite Delhi Monsoon", "hackathon_id": "H014",
        "rank": 1, "prize_track": "Overall", "date": "2025-06-14", "score": 93 }
    ],
    "prize_count": 3,
    "best_rank": 1,
    "avg_score": 84.2,
    "first_seen": "2024-04-11",
    "last_active": "2026-09-09",
    "days_since_active": 10,
    "mentor_sessions": 5,
    "avg_mentor_score": 4.6,
    "interactions": 26,
    "interactions_by_type": { "comment": 9, "answered_question": 6, "workshop_attended": 3 },
    "workshops": 3,
    "distinct_teammates": 14,
    "repeat_teammates": [ { "user_id": "U0007", "name": "Ananya Iyer", "times": 2 } ],
    "outreach": { "sent": 4, "opened": 3, "clicked": 1, "replied": 0, "unsubscribed": false }
  },

  "skills": [
    { "skill": "Python", "confidence": 0.94, "cluster": "ML/AI",
      "sources": [
        { "type": "github",  "detail": "70% of 22 public repos", "weight": 0.9 },
        { "type": "project", "detail": "built P0031 (scored 93)", "weight": 0.8 },
        { "type": "declared","detail": "self-declared at signup", "weight": 0.3 }
      ],
      "claim_gap": false, "hidden_strength": false }
  ],

  "traits": [
    { "trait": "serial_finisher", "score": 0.86,
      "evidence": ["6 of 7 attended events produced a submission"] }
  ],

  "personas": ["Serial Winner", "Mentor Material"],

  "trajectory": {
    "direction": "steady",              // rising | steady | declining | insufficient_data
    "status": "active",                 // active | cooling | dormant | lapsed
    "score_series": [ { "date": "2024-05-19", "score": 71, "hackathon_id": "H003" } ],
    "tech_drift": { "from": ["React", "Flask"], "to": ["LangChain", "Neo4j"] }
  },

  "engagement": {
    "value": 78,
    "components": { "recency": 92, "frequency": 74, "depth": 81, "outcome": 66 }
  },

  "narrative": "Shiv is a final-year CSE student at IIT Delhi who has become one of the platform's most consistent ML builders...",

  "evidence": [
    { "claim": "Won 1st place at Ignite Delhi Monsoon",
      "source_type": "csv", "source_ref": "results.csv#P0031",
      "observed_at": "2025-06-14", "confidence": 1.0 }
  ],

  "data_sources": ["platform", "github_synthetic_seed", "linkedin_synthetic_seed"],
  "narrative_status": "llm"             // llm | template | pending
}
```

### Field rules

- `facts.*` — deterministic only. A missing value is `null`, never a guess.
- `skills[].confidence` — `1 - Π(1 - weight_i)`, capped at **0.97**. Never emit `1.0`.
- `claim_gap: true` — declared with no corroborating source. `hidden_strength: true` —
  strong evidence, never declared.
- `engagement.components` must always be present. A bare total looks invented; the
  breakdown is what survives a judge asking "why 78?".
- `narrative_status` lets the UI distinguish a real synthesis from the deterministic
  fallback used while the batch job is still running.
- `data_sources` must name `*_synthetic_seed` for the 600 CSV users. Live intake adds
  `tavily` / `github_live`. **Be honest about this on screen** — it is a strength, not a
  weakness.

---

## 3. REST API

Base: `http://localhost:5001`. All responses JSON. Mounted in `backend/crmRoutes.js`.

### Success / failure envelope

Failure, on every endpoint:

```json
{ "success": false, "error": "human-readable message", "requestId": "a1b2c3d4e5f6" }
```

`requestId` is the `X-Request-Id` that `server.js` already stamps on every request — reuse
it, do not invent a second correlation id.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/crm/stats` | Header counters |
| `GET` | `/api/crm/candidates` | Filterable directory table |
| `GET` | `/api/crm/candidates/:userId` | Full `ContextProfile` |
| `GET` | `/api/crm/candidates/:userId/graph` | Evidence subgraph |
| `POST` | `/api/crm/resolve` | Existence check + disambiguation |
| `POST` | `/api/crm/segment` | Natural-language segment search |
| `POST` | `/api/agent/chat` | Conversational agent |
| `POST` | `/api/crm/intake` | Live ingestion (multipart) |
| `GET` | `/api/crm/intake/:jobId/status` | Async cognify status |
| `POST` | `/api/crm/outreach` | Send / preview email |
| `POST` | `/api/crm/match` | Matchmaking |

#### `GET /api/crm/stats`

```json
{ "success": true, "people": 600, "hackathons": 24, "projects": 256,
  "profiles_built": 600, "active_last_90d": 211, "consented": 553,
  "graph": "live", "mode": "live" }
```

`graph` is `live | offline`; `mode` is `live | mock`. The frontend rail indicator reads these.

#### `GET /api/crm/candidates`

Query: `q`, `college`, `skill`, `persona`, `status`, `sort`, `limit` (default 50), `offset`.

```json
{ "success": true, "total": 600, "limit": 50, "offset": 0,
  "facets": { "colleges": [{"value":"DTU","count":66}], "skills": [], "personas": [] },
  "rows": [
    { "user_id": "U0001", "full_name": "Shiv Sharma",
      "email": "shiv.sharma@iitd.ac.in", "college": "IIT Delhi", "city": "Delhi",
      "personas": ["Serial Winner"], "top_skills": ["Python","PyTorch","LangChain"],
      "hackathons_attended": 7, "prize_count": 3, "engagement": 78,
      "last_active": "2026-09-09", "status": "active", "consent_flag": true }
  ] }
```

`status` ∈ `active | cooling | dormant | lapsed`. Row shape is fixed — the table renders it
directly.

#### `GET /api/crm/candidates/:userId`

`{ "success": true, "profile": { ...ContextProfile } }` or `404` with the standard envelope.

#### `GET /api/crm/candidates/:userId/graph`

Max 40 nodes, 1–2 hops. Shape matches the existing `GraphVisualizer.jsx`:

```json
{ "success": true,
  "nodes": [ { "id": "U0001", "label": "Shiv Sharma", "type": "Person", "group": "Person", "properties": {} } ],
  "links": [ { "id": "e1", "source": "U0001", "target": "H014", "label": "ATTENDED", "type": "ATTENDED" } ] }
```

#### `POST /api/crm/resolve`

Request `{ "name": "Shiv Sharma" }`. **Zero LLM calls. Must return in under a second.**

```json
{ "success": true, "status": "ambiguous",
  "question": "I found two people named Shiv Sharma — one at IIT Delhi (ML/AI, 7 hackathons, 3 prizes) and one at Amity Noida (Backend, 2 hackathons, no prizes). Which one?",
  "matches": [
    { "user_id": "U0001", "full_name": "Shiv Sharma", "college": "IIT Delhi",
      "role_pref": "ML/AI", "hackathons_attended": 7, "prize_count": 3,
      "distinguisher": "IIT Delhi · ML/AI · 7 hackathons" }
  ],
  "match_type": "exact" }
```

`status` ∈ `found | ambiguous | not_found`.
`match_type` ∈ `exact_email | exact_name | fulltext | fuzzy`.
On `not_found`, return `suggestions[]` of nearest real names. **Never invent a person.**

#### `POST /api/crm/segment`

Request `{ "query": "ML builders from Delhi colleges who have won something" }`.

```json
{ "success": true, "rows": [ /* same row shape as /candidates */ ],
  "strategy": "template:skill_college_winners",
  "cypher": "MATCH (p:Person)-[:HAS_SKILL]->(s:Skill) ...",
  "rationale_by_user_id": { "U0001": "1 win at GenAI track, Python across 22 repos, active 10 days ago" },
  "latency_ms": 84 }
```

`strategy` is `template:<name>` | `cognee_hybrid` | `text2cypher` | `fallback`.
**Rationale strings are built deterministically from graph facts, never generated per row.**

#### `POST /api/agent/chat`

Request `{ "message": "...", "sessionId": "uuid" }`.

```json
{ "success": true,
  "answer": "Shiv Sharma from IIT Delhi has attended 7 hackathons...",
  "resolution": { "status": "found", "user_id": "U0001" },
  "citations": [ { "claim": "7 hackathons attended", "source_type": "csv",
                   "source_ref": "participations.csv", "user_id": "U0001" } ],
  "table": [ /* rows, when the answer is a segment */ ],
  "strategy": "profile_lookup", "cypher": null,
  "llm_calls": 0, "latency_ms": 180 }
```

`llm_calls` must be **0 or 1**. Surfacing it keeps the latency budget honest.
When `resolution.status === "ambiguous"`, return the matches and the question with
`llm_calls: 0` — the UI renders selectable cards.

#### `POST /api/crm/intake` (multipart)

Fields: `full_name`, `email`, `phone`, `college`, `city`, `track`, `github_url`,
file `resume` (PDF, ≤10MB).

```json
{ "success": true, "user_id": "U0601", "is_returning": false,
  "profile": { ...ContextProfile },
  "stages": [ { "name": "parse_resume", "status": "done", "ms": 840, "detail": "6 pages" },
              { "name": "structure_llm", "status": "done", "ms": 24100, "detail": "12 skills" },
              { "name": "enrich_external", "status": "done", "ms": 2900, "detail": "14 public repos" },
              { "name": "write_graph", "status": "done", "ms": 610, "detail": "23 nodes" },
              { "name": "build_profile", "status": "done", "ms": 1400, "detail": null } ],
  "cognify_job_id": "job_8f2a" }
```

`status` ∈ `pending | running | done | failed`. Stages `structure_llm` and `enrich_external`
run **concurrently** — the UI shows them both lit. Target total under 40s.
Cognify is **never awaited**; poll `/api/crm/intake/:jobId/status`.

#### `POST /api/crm/outreach`

Request `{ "userIds": [], "template": "hackathon-invite", "subject": null, "body": null }`.
Templates: `hackathon-invite | win-back | mentor-invite | custom`. Max 25 recipients.

```json
{ "success": true,
  "sent": [ { "user_id": "U0001", "transport": "ethereal",
              "preview_url": "https://ethereal.email/message/xyz", "subject": "..." } ],
  "skipped": [ { "user_id": "U0016", "reason": "consent_flag is false" } ] }
```

Consent skips are **returned and displayed**, never silent.

#### `POST /api/crm/match`

Request `{ "mode": "team" | "mentor" | "opportunity", "userId": "U0001", "requirements": {} }`.

```json
{ "success": true, "matches": [
  { "user_id": "U0013", "full_name": "Vikram Rao", "score": 0.84,
    "reason": "Adds graph modelling which the team lacks; 3 events, 100% submission rate; won Best use of Neo4j",
    "components": { "role_complementarity": 0.9, "skill_coverage_gain": 0.8,
                    "collaboration_signal": 0.6, "reliability": 1.0, "availability": 1.0 } } ] }
```

---

## 4. Mock mode

`USE_MOCK=1` in `backend/.env` serves `backend/mocks/*.json` for every endpoint above. The
backend also falls back to mocks automatically when the graph is unavailable, so the
frontend is never blocked and the demo never shows a blank screen.

Fallback order: **live graph → `data/profiles/*.json` on disk → mock fixtures.**

---

## 5. Naming conventions

- JSON keys are `snake_case` throughout (matching the CSV columns), **except** the
  request-body fields `userIds`, `sessionId`, `jobId`, which are `camelCase`.
- Dates are `YYYY-MM-DD`; timestamps are ISO-8601 strings. Never send a `Date` object or a
  Neo4j temporal type.
- Neo4j integers must be converted with `.toNumber()` before serialising. A leaked
  `{low, high}` is the single most common integration bug on this stack — convert in
  `neo4jService`, once, for everything.
