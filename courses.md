# 🎓 courses.md — GraphAcademy Mastery Summary (Applied to Our Project)

> Source: Neo4j GraphAcademy — 4 core courses completed:
> **Neo4j Fundamentals · Cypher Fundamentals · Graph Data Modeling Fundamentals · Importing Data Fundamentals**
> Purpose: instant recall during hackathon project building. Every section ends with
> **"→ Project Application"** — how the concept plugs into OUR Cognee + AuraDB stack.
> Full curriculum detail: `Neo4j GraphAcademy Study Guide.pdf` (study guide summary by the team).

---

## Module 1 — Graph Theory Foundations & Neo4j Architecture

**Why graphs beat RDBMS/NoSQL for our domain (fraud/networks/compliance):**

- RDBMS: joins scale O(N log N) to O(N²) as dataset + hop-depth grow.
- Document NoSQL: fast single-entity reads, terrible for many-to-many traversals.
- Graph (LPG): **O(k)** where k = local adjacent edges — traversal time is
  independent of total DB volume. Relationships are first-class, physically stored.

**LPG model — 4 primitives:**

| Primitive    | Rule                                                                            |
| ------------ | ------------------------------------------------------------------------------- |
| Node         | Domain entity (Person, Account, Transaction)                                    |
| Label        | Categorical tag(s), `:Person` — index boundary + query entry point              |
| Relationship | Directed, exactly ONE type, UPPER_SNAKE_CASE `:ACTED_IN`; traversable both ways |
| Property     | key-value on nodes AND relationships (String/Int/Float/Bool/Temporal/arrays)    |

**Index-Free Adjacency (IFA)**: every node holds direct memory pointers to adjacent
relationship records (doubly-linked). Constant-time per hop — no global index lookups.
This is THE selling point for judges: _"multi-hop fraud traces stay fast regardless of data size."_

**→ Project Application:** our AuraDB graph IS this — `(:Entity {name:"meridian_bvi"})-[:forwarded_funds]->(:Entity)`.
Multi-hop proof we already ran: meridian_bvi → harborview_lux → triggered_violation_alert → cssf_lux in 2 hops.

---

## Module 2 — Cypher Cheat Sheet (read/write patterns)

**Syntax anchors**: nodes `()`, labels `:Label`, relationships `-[r:TYPE]->`, props `{key: value}`.
Cypher = GQL standard (ISO/IEC 39075). Declarative — describe the pattern, engine optimizes.

**Read patterns:**

```cypher
// Multi-hop: co-actor pattern (course classic) — same shape as fraud layering
MATCH (d:Person {name:"Quentin Tarantino"})-[:DIRECTED]->(m:Movie)<-[:ACTED_IN]-(a:Person)
RETURN m.title, a.name;

// Filter + aggregate + order (implicit grouping by non-aggregated RETURN vars)
MATCH (p:Person)-[r:RATED]->(m:Movie)
WHERE m.released STARTS WITH '1995' AND r.rating >= 4 AND 'Drama' IN m.genres
RETURN p.name, m.title, r.rating ORDER BY r.rating DESC LIMIT 10;
```

**Write patterns — CREATE vs MERGE (idempotency is the interview answer):**

```cypher
// CREATE duplicates on repeat. MERGE = match-or-create (idempotent):
MERGE (p:Person {tmdbId: 1136406})
ON CREATE SET p.name = "Tom Holland", p.createdAt = timestamp()
ON MATCH SET p.lastUpdated = timestamp();
// DELETE refuses nodes with relationships → DETACH DELETE removes both.
```

**→ Project Application:**

- Cognee already writes with MERGE semantics + a uniqueness constraint on
  `__Node__.id` (we verified the constraint ONLINE in AuraDB) — that's why
  re-running cognify is idempotent/incremental.
- **If organizers give us CSV/JSON datasets tomorrow**: write
  `MERGE ... ON CREATE SET` ingestion queries — re-runs never duplicate.
- `CALL { ... } IN TRANSACTIONS OF 5000 ROWS` for big batch imports.

---

## Module 3 — Query-Driven Graph Data Modeling (THE methodology for PS day)

**Core principle**: model for the QUESTIONS the app must answer, not for normalized tables.
Workflow: identify business questions → sketch instance model with sample data →
translate to primitives → profile with test queries → refactor.

**Mapping framework (translate any PS into a graph in minutes):**

| Domain concept                                | Graph primitive                          |
| --------------------------------------------- | ---------------------------------------- |
| Discrete objects/actors/assets                | **Nodes**                                |
| Categories/functional sets                    | **Labels**                               |
| Verbs/actions/connections                     | **Relationships**                        |
| Descriptive attributes                        | **Properties**                           |
| Repeated text attributes shared by many nodes | **Extract into standalone shared nodes** |

**Instance model verification**: before demo, write the app's use-case queries and run
them (the course's 10 use cases = our demo query list). If a use case needs a join-like
pattern, the model is wrong — refactor.

**4 refactoring patterns (schema evolution — use when adapting to the PS):**

1. **Label specialization**: `MATCH (p:Person)-[:ACTED_IN]->() WITH DISTINCT p SET p:Actor;`
   → narrows query scan to relevant nodes.
2. **Array → shared nodes**: `UNWIND m.languages AS lang MERGE (l:Language {name:lang})
MERGE (m)-[:IN_LANGUAGE]->(l) SET m.languages = null;`
   → kills string duplication, creates multi-hop paths.
3. **Relationship specialization**: `:RATED {rating:5}` → `:RATED_5` → skip irrelevant edges.
4. **Hyperedge / intermediate nodes**: binary edge with rich data
   `(p)-[:ACTED_IN {role}]->(m)` → `(p)-[:PLAYED]->(:Role {character})-[:IN_MOVIE]->(m)`
   → model complex facts (roles, scenes, multi-party transactions).

**→ Project Application:**

- PS aate hi: list 5 questions the app must answer → map nouns→nodes, verbs→rels,
  adjectives→props → refit our directive prompt so Cognee extracts THOSE entities.
- If Cognee's default ontology gives generic `:Entity`/`is_a` edges and the PS needs
  domain edges (e.g., `:SUSPECT_OF`, `:LOCATED_IN`), apply **refactoring pattern 2/3**
  on the loaded graph: MERGE specialized rels from properties, then demo the clean model.
- Intermediate-node pattern = perfect for **transactions with multiple attributes**
  (amount, timestamp, bank) — `(Txn {id})-[:FROM]->(src), (Txn)-[:TO]->(dst)`.

---

## Module 4 — Data Import Pipelines (pick by volume)

| Tool                 | Context     | Volume    | Use when                                                          |
| -------------------- | ----------- | --------- | ----------------------------------------------------------------- |
| Neo4j Data Importer  | Visual UI   | < 10M     | Prototyping, no-code mapping                                      |
| **Cypher LOAD CSV**  | Script      | < 10M     | **Our case: scriptable batch ETL from organizer CSVs**            |
| neo4j-admin import   | Offline CLI | 100M+     | Massive one-time migration (not on Aura)                          |
| **Language drivers** | App code    | Streaming | **Our case: real-time ingestion via our Express/Python services** |

```cypher
// LOAD CSV with type casting + idempotency + batched transactions:
LOAD CSV WITH HEADERS FROM 'https://.../data.csv' AS row
MERGE (m:Movie {tmdbId: toInteger(row.movieId)})
ON CREATE SET m.title = row.title, m.released = row.releaseDate
// large files:
CALL { WITH row ... } IN TRANSACTIONS OF 5000 ROWS;
```

**Constraints BEFORE import** (integrity + auto-backed indexes for MERGE):

```cypher
CREATE CONSTRAINT unique_movie_id IF NOT EXISTS FOR (m:Movie) REQUIRE m.tmdbId IS UNIQUE;
CREATE INDEX movie_released_idx IF NOT EXISTS FOR (m:Movie) ON (m.released);
CREATE FULLTEXT INDEX movie_title_fulltext IF NOT EXISTS FOR (m:Movie) ON EACH [m.title];
```

**→ Project Application:**

- If organizers hand **CSV/Excel data**: LOAD CSV path above + constraints first.
- If they hand **unstructured text/PDFs**: our Cognee ECL pipeline (already built).
- Our AuraDB already has the `__Node__.id` uniqueness constraint — verified.

---

## Module 5 — APOC & Infrastructure

- **APOC Core** (official, pre-installed on Aura) vs **APOC Extended** (community).
  Our AuraDB instance HAS APOC 2026.09.0 (verified live).
- Useful procedures: `apoc.cypher.runFile`, `apoc.export.cypher.all`
  (backup/migrate), `apoc.meta.schema()` (introspect labels/props/indexes
  dynamically — great for auto-building the demo's model view).
- Aura = managed OLTP; AuraDS = managed data science (GDS algorithms).
  Note: GDS is NOT available on AuraDB Free — implement algorithms in Cypher
  (e.g., path finding) if needed.

**→ Project Application:** `apoc.meta.schema()` can power a live "model explorer"
tab if we want to impress — shows the graph schema of whatever domain we ingest.

---

## Module 6 — GenAI, GraphRAG & Agent Memory ⭐ (the hackathon gold)

**Why GraphRAG beats vector-only RAG** (this is our project's thesis — quote-ready):
vector-only RAG fails multi-step reasoning, relationship tracking, and global
structural context. GraphRAG = knowledge graph (structured facts) + vector search
→ grounded, explainable answers with fewer hallucinations.

**Three complementary retrieval mechanisms** (we have ALL THREE in some form):

1. **Vector similarity search** — our LanceDB via Cognee.
2. **Cypher query templates** — pre-configured parameterized queries =
   deterministic accuracy for aggregations/metrics (our `/api/graph/query`).
3. **Text2Cypher** — LLM translates natural language to Cypher for multi-hop paths
   (easy add-on: Nemotron already has the graph schema in the synthesis prompt).

**Neo4j-native vector index + hybrid retrieval (course pattern — deployable on our AuraDB):**

```cypher
CREATE VECTOR INDEX contract_embeddings_idx IF NOT EXISTS
FOR (c:Chunk) ON (c.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}};

// Hybrid GraphRAG: vector seed → graph expansion (THE pattern to demo)
CALL db.index.vector.queryNodes('contract_embeddings_idx', 5, $queryEmbedding)
YIELD node AS chunk, score
MATCH (chunk)<-[:HAS_CHUNK]-(doc:Document)-[:BIND_TO]->(party:Party)
RETURN chunk.text, doc.title, party.name, score ORDER BY score DESC;
```

**Agent Memory via Context Graphs (3 layers — maps to the 35% agent pillar):**

```cypher
CREATE (session:Session {sessionId: "sess_9876"})
CREATE (msg:Message {role:"user", text:"...", timestamp: timestamp()})
CREATE (session)-[:HAS_MESSAGE]->(msg)
MERGE (agent:Agent {agentId:"hr_assistant"})
CREATE (step:ReasoningStep {toolUsed:"CypherTemplate_CountSkill", executedQuery:"MATCH..."})
CREATE (msg)-[:TRIGGERED]->(step)
CREATE (step)-[:RETRIEVED_ENTITY]->(:Skill {name:"Python"});
```

- **Short-term**: active conversation chains + session state
- **Long-term**: extracted domain knowledge (survives resets)
- **Reasoning memory**: auditable trace of tool calls + queries + retrieved entities

**→ Project Application (implement tomorrow — ~1 hour, huge demo value):**
Add a `POST /api/memory/trace` endpoint: every user query + the Cypher/cognee call

- retrieved entities gets MERGED into a Context Graph. Then the demo line:
  _"Ask the agent anything — and inspect its full reasoning trail stored as a graph."_
  That's Autonomous Agent Integration (35% pillar) with explainability evidence.

**MCP ecosystem**: Neo4j ships official MCP servers (`get_schema`, `read_query`,
`write_query`, `mcp-neo4j-aura-manager`, `mcp-neo4j-data-modeling`) — mention it as
integration-ready; Neo4j Aura Agent platform = production GraphRAG agent hosting.

---

## Module 7 — Certification Domain Weights (what Neo4j itself prioritizes)

| Domain                | Weight | Implication for our build                               |
| --------------------- | ------ | ------------------------------------------------------- |
| Cypher Query Language | 40%    | Our live multi-hop queries = the core competency        |
| Neo4j Fundamentals    | 13.75% | IFA/LPG talking points for judges                       |
| Schema & Indexes      | 11.25% | Constraints pre-import ✓ done, indexes ON               |
| Driver Development    | 10%    | Our Express + Python drivers with sessions/transactions |
| Graph Data Modeling   | 10%    | Query-driven modeling = PS-day methodology              |
| Importing Data        | 7.5%   | LOAD CSV batch pattern ready                            |

---

## ⚡ Tomorrow's Cheat Card (condensed)

1. **Model**: PS → 5 questions → nouns=nodes, verbs=rels, adjectives=props → tune directive prompt.
2. **Ingest**: unstructured → Cognee ECL (`/api/cognify/run`); CSV → LOAD CSV + MERGE + constraints.
3. **Refactor** to domain edges if ontology is too generic (patterns 1-4 above).
4. **Query**: multi-hop Cypher + hybrid GraphRAG; Text2Cypher for dynamic questions.
5. **Agent memory**: Context Graph (Session/Message/ReasoningStep) = explainability demo.
6. **Talking points**: IFA O(k) vs joins O(N²) · MERGE idempotency · query-driven modeling ·
   GraphRAG grounding · vector+graph hybrid retrieval · MCP-ready.
