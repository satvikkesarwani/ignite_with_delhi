# 🏗️ MICROSERVICES.md — PersonaCRM Service Catalog

> PersonaCRM = Context Layer (PS-3) + CRM downstream. Each service is a module in the
> Express gateway (single deployable, service-oriented internals) or the Python Cognee
> microservice (separate process). Every service: own logger, own credentials, own
> failure mode (honest 503/4xx — never fake success), request-id correlation throughout.

---

## 🗺️ SERVICE DEPENDENCY MAP

```
                        FRONTEND (React :5173 / Vercel)
                                   │ REST
                                   ▼
                     ┌──────────────────────────┐
                     │  S0. API GATEWAY          │  server.js
                     │  request-id · CORS · JSON │
                     └─┬───┬───┬───┬───┬───┬───┬─┘
        ┌──────────────┘   │   │   │   │   │   └───────────────┐
        ▼                  ▼   ▼   ▼   ▼   ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
│ S7 CRM INTAKE │  │ S9 BRAIN      │  │ S8 OUTREACH   │  │ S10 MATCHMAKING      │
│ form·sheet·pdf│  │ ask·segment   │  │ gmail·certs   │  │ vector teammate match│
└──┬───────┬───┘  └───┬──────┬───┘  └──────────────┘  └──────────┬───────────┘
   │         │          │      │                                   │
   ▼         ▼          │      │                                   │
┌──────────────┐  ┌────▼──────▼───┐                               │
│ S6 RESUME     │  │ S4 AGENT       │                              │
│ PARSER        │  │ MEMORY (U1)    │                              │
│ pdf→LLM→JSON  │  │ trails·audit   │                              │
└──────┬───────┘  └────────────────┘                               │
       │         ┌──────────────────────────────┐                  │
       └────────►│ S3 CONTEXT BUILDER            │◄─────────────────┘
                 │ parsed+scraped → PersonaGraph │
                 │ + ContextProfile synthesis    │
                 └───────┬──────────────┬────────┘
                         ▼              ▼
              ┌────────────────┐  ┌──────────────────────────┐
              │ S2 GRAPH STORE  │  │ S5 WEB INTELLIGENCE       │
              │ Neo4j AuraDB    │  │ Tavily: search·extract·   │
              │ (AuraDB cloud)  │  │ website-profile scrape ★  │
              └────────────────┘  └──────────────────────────┘
                         ▼              ▼
              ┌────────────────┐  ┌──────────────────────────┐
              │ S1 AI INFERENCE │  │ S11 WORKFLOWS DISPATCHER  │
              │ NVIDIA 5-key    │  │ Render Jobs/Task-Runs     │
              └────────────────┘  └──────────────────────────┘
   (S3a COGNEE ECL — Python :8100 — used by cognify bridge for doc ingestion)
```

---

## S0 — API GATEWAY (`server.js`)
- **Owns**: routing, CORS, JSON body parsing, request-id middleware (`X-Request-Id` in
  every response), 404 + unhandled-error catch-alls, global crash nets
  (uncaughtException / unhandledRejection / SIGTERM).
- **Port**: 5001 local, Render production.
- **Env**: PORT, NODE_ENV, LOG_LEVEL.
- **Note**: no business logic lives here — routes delegate to services below.

## S1 — AI INFERENCE (`aiService.js` — NVIDIA NIM)
- **Owns**: 5-key rotating pool, thinking suppression (`chat_template_kwargs`), timeouts.
- **Used by**: resume parser (structured extraction), context synthesis, Brain agent,
  Text2Cypher, research synthesis.
- **Key functions**: `generateChat({messages, maxTokens, thinking})`,
  `checkKeysHealth()` → per-key live status.
- **Env**: `NVIDIA_API_KEYS` (comma pool), `NVIDIA_MODEL`.
- **Failure mode**: rotates all keys on 429/5xx/timeout → honest error after exhaustion.

## S2 — GRAPH STORE (`neo4jService.js` — Neo4j AuraDB)
- **Owns**: ALL graph persistence + queries. Vector index `entity_embeddings_idx`.
- **Key functions**: `runCypherQuery`, `getSchema` (APOC + samples), `importCsvNodes/
  importCsvRelationships` (U5), `hybridVectorQuery` (U2), `warmUp`, `getSession()`
  for custom-Cypher services.
- **Env**: `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`.
- **Failure mode**: mock-mode fallback (`isMock:true`) when creds missing; query errors
  logged with stacks.

## S3 — COGNEE ECL (Python microservice, `services/cognee-service/`, :8100)
- **Owns**: unstructured → graph pipeline (Extract-Cognify-Load), FastEmbed embeddings,
  graph embedding sync (`/api/graph/embed-entities`, `/api/embed`).
- **Bridge**: `cognifyService.js` (S3a) — timeouts, health checks, proxyPost, simulation
  fallback.
- **Use in PersonaCRM**: resumes/website/docs text → cognify → entities in graph.
- **Failure mode**: bridge degrades to explicit simulation mode; never fake success.

## S4 — AGENT MEMORY (`memoryService.js` — U1)
- **Owns**: `(:Session)-[:HAS_MESSAGE]->(:Message)-[:TRIGGERED]->(:ReasoningStep)
  -[:RETRIEVED_ENTITY]->(:Entity)` trails.
- **Endpoints**: `POST /api/memory/trace`, `GET /api/memory/session/:id`,
  `GET /api/memory/sessions`.
- **Used by**: Brain agent (N3), cognify/query (auto-trace).
- **Failure mode**: memory errors logged + swallowed (never break an answer).

## S5 — WEB INTELLIGENCE (`tavilyService.js` — Tavily)
- **Owns**: search / extract / research / ingest-to-graph + **NEW `websiteProfile`**:
  user's personal website → Tavily extract (advanced, markdown) → Nemotron structured
  profile (bio, role, skills, projects, socials) → optional graph merge with provenance.
- **Endpoints**: `/api/tavily/status|search|extract|research|ingest-to-graph`,
  **`POST /api/tavily/website-profile { url, personId? }`** ★NEW
- **Env**: `TAVILY_API_KEY` (tvly-…).
- **Failure mode**: 503 without key; 401/432/433 mapped to friendly errors; 429 honors
  Retry-After with one retry; timeouts surfaced honestly.

## S6 — RESUME PARSER (`resumeParser.js` ★NEW)
- **Owns**: PDF → text (pdf-parse, pure JS) → Nemotron structured extraction:
  `{ name, email, phone, location, education[], experience[], internships[], skills[],
  projects[], links[] }` — JSON-schema-forced output.
- **Input**: uploaded PDF buffer (multer memory storage, 10 MB cap).
- **Failure mode**: unreadable/scanned PDF → honest 422 with extracted-text length
  diagnostics; LLM JSON malformed → one re-ask with stricter prompt → else 502.

## S7 — CRM INTAKE (`crmIntakeService.js` ★NEW)
- **Owns**: onboarding orchestration — form JSON + parsed resume + sheet rows →
  dedupe (email match) → Person/Lead/RawEvent writes (via S2) → kicks S8 build.
- **Endpoints**: `POST /api/crm/intake` (multipart: fields + resume.pdf),
  `POST /api/crm/sync-sheet { url }` (published Google Sheet CSV — Google Form flow).
- **Data owned**: intake state only; canonical person data lives in the graph (S2).
- **Failure mode**: duplicate email → updates existing Person (MERGE) + flags `updated`
  instead of creating; invalid resume → creates Person from form alone, parser error
  reported in response.

## S8 — CONTEXT BUILDER (`contextBuilder.js` ★NEW — THE CONTEXT LAYER)
- **Owns**: transforming parsed signals into the PersonaGraph + synthesized profiles.
- **Writes**: Skills, Institutions, Companies, `HAS_SKILL/STUDIED_AT/INTERNING_AT/
  WORKED_AT` edges, `RawEvent {source}` provenance per signal, and the
  **ContextProfile**: Nemotron synthesizes a narrative paragraph from all signals →
  `(:ContextProfile {text, builtAt, signalsCount})-[:ABOUT]->(:Person)`.
- **Endpoints**: `POST /api/context/build { personId }` (rebuild one), `POST
  /api/context/build-all` (rebuild all — also refreshes embeddings via S3).
- **Why this is the "layer"**: raw signals in → synthesized, provenance-backed
  understanding out — the PS's exact definition.
- **Failure mode**: synthesis LLM failure → profile marked `synthesisFailed`, raw
  graph context still queryable.

## S9 — CRM OUTREACH (`outreachService.js` ★NEW)
- **Owns**: bulk email (nodemailer + Gmail App Password SMTP), templates
  (hackathon-invite / certificate / custom with `{{name}}` merge), status transitions
  on Lead (`new→contacted→invited`).
- **Endpoints**: `POST /api/crm/outreach { personIds[], template, extra? }`,
  `GET /api/crm/outreach/log`.
- **Env**: `GMAIL_USER`, `GMAIL_APP_PASSWORD` (fallback: Ethereal SMTP for demos).
- **Failure mode**: per-recipient try/catch — one bad email never aborts the batch;
  per-send result array returned.

## S10 — MATCHMAKING (`matchService.js` ★NEW — bonus)
- **Owns**: teammate/opportunity matching over user context vectors (S3 embeddings).
- **Endpoint**: `GET /api/crm/match/:personId?for=<track>` → hybrid: context-vector
  similarity between people + complementary-skill logic → ranked candidates with reasons.
- **Failure mode**: falls back to Cypher skill-overlap ranking when embeddings absent.

## S11 — WORKFLOWS DISPATCHER (`renderWorkflowService.js` — Render)
- **Owns**: Jobs API trigger + Workflows task-run trigger (`/v1/task-runs`).
- **PersonaCRM use**: scheduled "context refresh" — new resumes/docs → ECL → verify.
- **Failure mode**: 429 backoff; honest errors when credits absent.

---

## 🔑 SHARED CONVENTIONS
- **Auth of data flow**: every context claim carries `RawEvent {source: 'form'|'resume'
  |'tavily-website'|'sheet', ts, payload}` provenance — synthesized ≠ invented.
- **Idempotency**: people deduped by email (MERGE); imports by unique keys; cognify by
  cognee's internal hashing.
- **Observability**: every service logs via `createLogger(<service>)`; correlation via
  `X-Request-Id` end-to-end.
- **Generalizability**: `data/contextSchema.json` declares the use case's sources —
  swapping the platform = swap this file + raw data, not the services.

---

## 🚦 BUILD ORDER (hackathon day)
1. S6 → S7 → S8 (core context layer; test with a real resume)
2. S9 Brain agent → segment query
3. S5 website-profile ★ (already implemented) → S9 outreach → S10 matchmaking
4. Sheet sync → frontend CRM tab → rehearsal
