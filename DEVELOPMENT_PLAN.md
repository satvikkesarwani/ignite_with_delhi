# 🗺️ DEVELOPMENT PLAN — Post-CourseLearnings Stack Upgrade & PS-Day Execution

> Built from: current repo audit + courses.md (GraphAcademy 4 courses + GenAI module)
>
> - Neo4j documentation best practices.
>   Goal: kal problem statement aate hi — design decide ho chuka ho, sirf execution bache.

---

## 📌 PART 1 — CURRENT STATE (verified today, not assumed)

### What WORKS (do not touch)

| Component           | State                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Neo4j AuraDB        | Live, 37 nodes, real semantic edges, `__Node__.id` uniqueness constraint, APOC 2026.09.0 |
| Cognee ECL pipeline | `/api/cognify/run` writes real graph (verified: 29→37 nodes), idempotent/incremental     |
| Vector retrieval    | LanceDB + FastEmbed (384-dim), CHUNKS search returns real chunks                         |
| GraphRAG synthesis  | `/api/cognify/query` → `grounding: cognee_graph`, clean Nemotron answers                 |
| Render Workflows    | `workflows.py` pipeline (ingest→cognify→verify) pre-built + verify task tested           |
| Logging             | Request-ID correlation across Node⇄Python, error/warn/crash nets                         |
| CI/CD + keep-alive  | Auto-deploy green, AuraDB auto-warmup every 10 min                                       |

### Verified GAPS (courses.md learnings point exactly here)

| #   | Gap                                                                                                                               | Evidence (queried AuraDB today)                                       | Course reference                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| G1  | **No Neo4j-native vector index** — embeddings live only in LanceDB, so hybrid vector+graph retrieval in pure Cypher is impossible | `SHOW VECTOR INDEXES` → NONE; `Entity.embedding` missing on all nodes | Module 6: vector index + `db.index.vector.queryNodes`       |
| G2  | **No agent memory** — every query is stateless; zero graph-backed reasoning trail                                                 | `MATCH (n:Session)` → 0                                               | Module 6: Context Graphs (short/long-term/reasoning memory) |
| G3  | **Generic ontology** — Cognee writes `:Entity` + `is_a`/`contains`; PS domain will need domain edges                              | Label counts: Entity 10, is_a 13                                      | Module 3: refactoring patterns 1-4                          |
| G4  | **No Text2Cypher** — natural-language → Cypher path missing; judges ask "how does the graph answer?"                              | API list has no such route                                            | Module 6: Text2Cypher retrieval mechanism                   |
| G5  | **No CSV ingestion path** — if organizers hand tabular data, we have no pipeline                                                  | No import endpoint exists                                             | Module 4: LOAD CSV + MERGE + constraints-first              |
| G6  | **No schema introspection surface** — Text2Cypher needs the live schema; demo needs a model view                                  | No `/api/graph/schema`                                                | Module 5: `apoc.meta.schema()`                              |

---

## 📌 PART 2 — UPGRADE PLAN (pre-PS, tonight ~2-3 hrs, all PS-agnostic)

### U1. Agent Memory Context Graph ⭐ (highest value — 35% agent pillar)

**File**: `backend/memoryService.js` + routes in `server.js`
**What**: every query interaction persists as a reasoning trail in AuraDB.

```cypher
MERGE (s:Session {sessionId: $sessionId})
CREATE (m:Message {role:$role, text:$text, ts: datetime()})
CREATE (s)-[:HAS_MESSAGE]->(m)
CREATE (step:ReasoningStep {
  toolUsed: $toolUsed,                // 'cognee_search' | 'cypher_query' | 'nemotron'
  executedQuery: $query,
  grounding: $grounding,
  ts: datetime()
})
CREATE (m)-[:TRIGGERED]->(step)
WITH step MATCH (e:Entity) WHERE e.name IN $retrievedEntities
CREATE (step)-[:RETRIEVED_ENTITY]->(e)
```

**Endpoints**:

- `POST /api/memory/trace` — called automatically at the end of `/api/cognify/query`
  (wire it inside the existing route: sessionId from body or generated)
- `GET /api/memory/session/:sessionId` — returns the full reasoning trail
  (messages → steps → retrieved entities) for the explainability demo
- `GET /api/memory/sessions` — recent sessions list

**Demo line it enables**: _"Every answer the agent gave is auditable — here's its
actual reasoning path stored as a graph, retrieved via Cypher."_
**Cypher to show on screen**:

```cypher
MATCH (s:Session {sessionId:$id})-[:HAS_MESSAGE]->(m)-[:TRIGGERED]->(step)
OPTIONAL MATCH (step)-[:RETRIEVED_ENTITY]->(e)
RETURN m.text, step.toolUsed, step.executedQuery, collect(e.name) AS entities
```

**Time**: ~60-75 min. **Risk**: low — additive only.

### U2. Hybrid GraphRAG — Neo4j-native vector index ⭐ (Module 6 pattern, on OUR AuraDB)

**File**: `backend/vectorService.js` (new) + `POST /api/graph/embed-entities` (admin route)
**What**: embed every `:Entity` node (name + description) with FastEmbed (already in
Python venv; for Node use a one-time Python script to avoid new JS deps), store as
`e.embedding`, create a 384-dim vector index. Then ONE Cypher query = vector seed +
graph expansion — the exact Module 6 hybrid pattern.

**Script** (`scripts/embed_entities.py`, run once after each cognify):

```python
# 1. read entities missing embeddings  2. fastembed(384)  3. SET e.embedding
# 4. CREATE VECTOR INDEX entity_embeddings_idx IF NOT EXISTS
#    FOR (e:Entity) ON (e.embedding) OPTIONS {indexConfig:
#    {`vector.dimensions`: 384, `vector.similarity_function`: 'cosine'}}
```

**Demo query (the money shot — one Cypher, vector + graph)**:

```cypher
CALL db.index.vector.queryNodes('entity_embeddings_idx', 5, $queryEmbedding)
YIELD node, score
MATCH (node)-[r*1..2]-(related:Entity)
RETURN node.name AS seed, score, collect(DISTINCT related.name)[..5] AS connected
```

**Time**: ~45-60 min. **Risk**: medium — vector index creation syntax on AuraDB
5.27 must be tested once (safe: create on 10 nodes first). If AuraDB free blocks
vector indexes, fallback = keep LanceDB path (already working) and skip.

### U3. Text2Cypher endpoint (Module 6 — natural language → Cypher → results)

**File**: route in `server.js` + prompt in `backend/cypherPrompt.js`
**Endpoint**: `POST /api/graph/text2cypher { "question": "..." }`
**Flow**: fetch live schema (U4) → build prompt with schema + safety rules →
Nemotron (`thinking:false`) → extract single Cypher statement → enforce READ-ONLY
(reject `CREATE|MERGE|DELETE|SET|DROP|REMOVE|CALL apoc.` — regex, case-insensitive)
→ execute → return `{ cypher, records, synthesis }` — the generated Cypher is shown
in the UI (explainability!).
**Schema injection**: U4's output is embedded in the system prompt so the LLM only
uses real labels/rel types.
**Time**: ~45 min. **Risk**: low (read-only guard; bad Cypher → neo4j error logged,
returns 200 with error field — already the route contract).

### U4. Schema introspection — `GET /api/graph/schema`

**File**: route in `server.js` (neo4jService method `getSchema()`)
**What**: `CALL apoc.meta.schema()` → normalize to `{ labels: {Entity: {props,
count}}, relTypes: [...], }` — powers Text2Cypher prompt + a future model-explorer tab.
**Fallback**: if APOC call fails, derive from `MATCH (n) UNWIND labels(n)...` queries.
**Time**: ~25 min. **Risk**: low.

### U5. CSV import path (Module 4 — only if time permits / PS hints tabular data)

**File**: route `POST /api/graph/import-csv { url, label, mappings, uniqueKey }`
**What**: `LOAD CSV WITH HEADERS FROM $url AS row` + MERGE on uniqueKey +
`CALL {...} IN TRANSACTIONS OF 500 ROWS`. Constraints created first from mappings.
**Time**: ~40 min. **Risk**: medium — only build if PS hints tabular data; text
path (Cognee) is already strong.

### U6. Frontend upgrades (light touch, after U1-U3)

- Cognitive Studio: show **generated Cypher + reasoning trail** (from U1/U3
  responses) in the reasoning output panel — explainability visual.
- GraphVisualizer: highlight path for Text2Cypher results (nodes returned by the
  query get a `highlight` flag → brighter glow). ~30 min.
- Everything else stays — tabs already work.

### Explicitly NOT doing (discipline)

- No custom `graph_model` wiring into cognee (1.5.4 shape mismatch — proven risk)
- No React rewrite/state library — current structure works
- No GDS algorithms (not on AuraDB Free — APOC/Cypher only)
- No new heavy frontend deps

---

## 📌 PART 3 — PS-DAY EXECUTION (timeboxed)

### Phase A — PS drop → design locked (first 30 min)

1. **Courses.md cheat card** steps 1-2: list the 5 questions the PS demands;
   nouns→nodes, verbs→rels, adjectives→props.
2. Pick demo dataset slice (organizer data or crafted sample from PS text).
3. Tune directive prompt for the domain; run `/api/cognify/run` (fresh: 2-6 min —
   run immediately, it caches).
4. Decide dataset name per domain: `ps_<domain>` so demos never collide.

### Phase B — Build the domain layer (2-4 hrs)

1. Ingest all available data (claim-check for big files; batch text chunks).
2. Run U1 memory trace on every query during development (auto-accumulates the
   reasoning trail for the demo).
3. Re-embed entities (`embed_entities.py`) after each cognify → vector index fresh.
4. Apply **Module 3 refactoring** if ontology is generic (patterns 1-4, run via
   `/api/graph/query` as admin scripts):
   - label specialization: promote `:Entity` → `:Suspect`, `:Account` etc. per PS
   - relationship specialization for high-signal edges
5. Write **5 demo queries as Cypher templates** (Module 6 deterministic retrieval)
   - verify each returns meaningful results — the course's instance-model
     verification ritual.

### Phase C — Demo hardening (final hour)

1. `npm test` + `npm run build` green; push → CI green → live URLs fresh.
2. `curl /api/ai/keys` (5/5), `/api/graph/status` (isMock:false), `/api/cognify/status` (available).
3. Warm everything: one `/api/cognify/run` + one `/api/cognify/query` + memory trail
   query — so first judge click is instant.
4. Rehearse the 3-minute script (study.md §13) + the two new demo lines:
   - _"This answer is grounded — here's the generated Cypher and the reasoning trail."_
   - _"Vector similarity seeded it; the graph proved it — in one query."_

---

## 📌 PART 4 — RISKS & MITIGATIONS

| Risk                                     | Likelihood | Mitigation                                                                 |
| ---------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| AuraDB free blocks vector index creation | Low-Med    | Test with 10 nodes first; fallback = LanceDB hybrid path (already working) |
| Cognify slow on big PS data              | High       | Chunk inputs; run ingest before judges; cached re-runs are ~5s             |
| Nemotron latency spikes (up to 30s)      | Medium     | 120s timeout + key rotation + enable_thinking:false already handles        |
| PS domain breaks Cognee extraction       | Low        | Directive prompt + refactoring patterns are domain-agnostic                |
| Render credits missing for Workflows     | Medium     | Workflows is a bonus demo — core pipeline runs locally (proven)            |
| Time overrun on U1-U4                    | Medium     | Priority order U1 > U3 > U4 > U2 > U5 — cut from bottom                    |

## 📌 PART 5 — SUCCESS CRITERIA (before demo)

- [ ] `/api/ai/keys` → 5/5 alive
- [ ] `/api/graph/status` → isMock:false, nodeCount grew from PS data
- [ ] One `/api/cognify/query` → grounding: cognee_graph
- [ ] One Text2Cypher answer with generated Cypher shown
- [ ] One memory trail query returning ≥3 ReasoningSteps
- [ ] Vector+graph hybrid query returning scored connected entities (if U2 built)
- [ ] All demo queries rehearsed once
