# 📡 API Reference — Every Microservice Endpoint

> Single source of truth for every exposed endpoint across the stack, plus the
> step-by-step playbook to connect everything when the hackathon problem
> statement drops. Every endpoint below is LIVE-TESTED.

---

## 🗺️ Service Map

```
┌──────────────────┐  HTTP :5173 / Vercel   ┌─────────────────────┐
│  FRONTEND         │ ─────────────────────► │  BACKEND (Express)   │
│  React + Vite     │ ◄───────────────────── │  :5001 / Render      │
└──────────────────┘                         └───────┬─────────────┘
                                                     │
        ┌────────────────────┬───────────────────────┼──────────────────┐
        ▼                    ▼                       ▼                  ▼
┌──────────────┐  ┌───────────────────┐  ┌────────────────┐  ┌─────────────────┐
│ NVIDIA NIM    │  │ COGNEE SERVICE     │  │ NEO4J AURADB    │  │ RENDER WORKFLOWS│
│ (LLM, cloud)  │  │ Python :8100/local │  │ (graph, cloud)  │  │ (durable tasks) │
└──────────────┘  └─────────┬─────────┘  └────────────────┘  └─────────────────┘
                            │ Bolt + LLM calls
                            └────────► AuraDB + NVIDIA
```

| Service           | Base URL (local)        | Base URL (production)                            |
| ----------------- | ----------------------- | ------------------------------------------------ |
| Backend (Express) | `http://localhost:5001` | `https://ignite-backend-kt07.onrender.com`       |
| Cognee (Python)   | `http://localhost:8100` | _(not deployed — bridge degrades to simulation)_ |
| Frontend          | `http://localhost:5173` | `https://frontend-beryl-seven-82.vercel.app`     |

**Conventions**

- Every response header carries `X-Request-Id` — grep this id in
  `backend/logs/backend.log` AND `services/cognee-service/logs/cognee-service.log`
  to trace one request across both services.
- Body/response are JSON. Errors: `{ "success": false, "error": "..." }`.
- Degradation: if the Cognee microservice is down, `/api/cognify/*` returns
  explicit `simulation`/`fallback` modes instead of failing. If AuraDB creds
  are unset, graph endpoints serve the built-in 12-node demo graph.

---

## 1️⃣ System (Express)

| Method | Path            | Purpose                                             |
| ------ | --------------- | --------------------------------------------------- |
| GET    | `/health`       | Uptime, memory, environment — keep-alive pings this |
| GET    | `/`             | Service banner + endpoint index                     |
| GET    | `/api/hello`    | Connectivity smoke test                             |
| GET    | `/api/projects` | Sample project list (template)                      |
| POST   | `/api/projects` | Add project `{ title, status, score }`              |
| POST   | `/api/echo`     | Echo body + headers (debug)                         |

## 2️⃣ AI — NVIDIA NIM (5-key rotating pool)

| Method | Path               | Purpose                                          |
| ------ | ------------------ | ------------------------------------------------ |
| GET    | `/api/ai/status`   | Static pool info (model, rotation enabled)       |
| GET    | `/api/ai/keys`     | **LIVE per-key health check** — pings all 5 keys |
| POST   | `/api/ai/generate` | Single completion (thinking suppressed)          |
| POST   | `/api/ai/chat`     | Multi-turn conversation (messages array)         |

```bash
# Prove the whole key pool before your demo (5 tiny completions):
curl $BACKEND/api/ai/keys
# → { "aliveCount": 5, "total": 5, "keys": [{ "keyIndex": 1, "alive": true, "latencyMs": 784 }, ...] }

curl -X POST $BACKEND/api/ai/generate -H "Content-Type: application/json" \
  -d '{"prompt":"One-line pitch for X","systemPrompt":"You are...","maxTokens":200}'
# → { "success": true, "content": "...", "keyIndexUsed": 1, "usage": {...} }

curl -X POST $BACKEND/api/ai/chat -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"My name is Satvik"},{"role":"user","content":"What is my name?"}]}'
```

## 3️⃣ Graph — Neo4j AuraDB

| Method   | Path                            | Purpose                                                                       |
| -------- | ------------------------------- | ----------------------------------------------------------------------------- |
| GET      | `/api/graph/status`             | AuraDB connection state + node/rel counts (`isMock:false` = live)             |
| GET      | `/api/graph/visualize?limit=50` | `{ nodes, links }` for force-directed canvas (cognee internal nodes filtered) |
| POST     | `/api/graph/query`              | Raw Cypher execution `{ "cypher": "...", "params": {} }`                      |
| GET/POST | `/api/graph/warmup`             | Non-blocking AuraDB ping (prevents 72h auto-pause)                            |

```bash
# Multi-hop trace (study.md §10 pattern):
curl -X POST $BACKEND/api/graph/query -H "Content-Type: application/json" \
  -d '{"cypher":"MATCH (s:Entity)-[r*1..3]-(t:Entity) WHERE s.name CONTAINS \"meridian\" RETURN s.name, t.name, size(r) AS hops LIMIT 5"}'
```

## 4️⃣ Claim-Check Storage

| Method | Path                | Purpose                                                                                           |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------- |
| POST   | `/api/claim/upload` | Stage raw payload `{ filename, content, mimeType }` → returns claim `{ claimId, uri, sizeBytes }` |

The claim URI (`file://…` locally, disk/S3/R2 in production) is what background
tasks receive — never the raw payload (study.md §7).

## 5️⃣ Cognee Bridge — Node ⇄ Python (ECL pipeline + GraphRAG)

| Method | Path                  | Purpose                                                                            | Cognee down?                     |
| ------ | --------------------- | ---------------------------------------------------------------------------------- | -------------------------------- |
| GET    | `/api/cognify/status` | Is the Python service reachable?                                                   | returns `available:false` + hint |
| POST   | `/api/cognify/run`    | **Full ECL**: `{ content, prompt, datasetName? }` → claim + ingest + cognify       | `mode:"simulation"`              |
| POST   | `/api/cognify/query`  | **GraphRAG**: `{ query, context?, datasetName? }` → retrieval + Nemotron synthesis | falls back to raw-text grounding |

```bash
# Build the graph from unstructured text (2-6 min on fresh data, cached after):
curl -X POST $BACKEND/api/cognify/run -H "Content-Type: application/json" \
  -d '{"content":"Atlas Global transferred $1.2M to Apex Holding...","prompt":"Extract transactions and shell accounts."}'
# → { "claim": {...}, "pipeline": { "mode": "live", "cognify": { "status": "cognified" }, "elapsedMs": ... } }

# Multi-hop GraphRAG query (cognee retrieval + Nemotron synthesis):
curl -X POST $BACKEND/api/cognify/query -H "Content-Type: application/json" \
  -d '{"query":"Which entities are linked to Meridian Trust?","datasetName":"aura_live_demo"}'
# → { "grounding": "cognee_graph", "retrievalResults": 1, "synthesis": { "content": "..." } }
```

## 6️⃣ Cognee Microservice (Python, :8100 — started by `npm run cognee:start`)

| Method | Path                   | Body                                                                   |
| ------ | ---------------------- | ---------------------------------------------------------------------- |
| GET    | `/health`              | — (embedding/graph/llm config summary)                                 |
| POST   | `/api/ingest`          | `{ content, dataset_name }`                                            |
| POST   | `/api/cognify`         | `{ dataset_name, custom_prompt }`                                      |
| POST   | `/api/search`          | `{ query, dataset_name, search_type }` — `CHUNKS`/`GRAPH_COMPLETION`/… |
| POST   | `/api/generate-schema` | `{ problem_statement }` → Nemotron-generated DataPoint classes         |

These are also reachable directly during development; the Express bridge is the
production-safe path.

## 7️⃣ Render Workflows

| Method | Path                     | Purpose                                                                                                     |
| ------ | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| POST   | `/api/workflow/trigger`  | Legacy one-off Jobs API `{ command, planId }`                                                               |
| POST   | `/api/workflow/run-task` | **Workflows SDK trigger** `{ task: "ignite-cognee-pipeline/pipeline", input: [claimUri, dataset, prompt] }` |

`workflows.py` defines the durable pipeline: `ingest → cognify → verify`
(each task has independent retries + timeout; `verify` re-checks AuraDB counts
and vector retrieval and returns `{ verified: true/false }`).

---

## 8️⃣ Tavily — Live Web Search (fresh data for the graph)

| Method | Path                          | Purpose                                                                                                                  |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/tavily/status`          | Key configured? + setup hint                                                                                             |
| POST   | `/api/tavily/search`          | Web search: `{ query, searchDepth?, topic?, maxResults?, timeRange?, includeDomains?, excludeDomains?, includeAnswer? }` |
| POST   | `/api/tavily/extract`         | Pull clean page content: `{ urls (1-20), query?, extractDepth?, format? }`                                               |
| POST   | `/api/tavily/research`        | **Search + Nemotron synthesis**: cited answer from live web results                                                      |
| POST   | `/api/tavily/ingest-to-graph` | **Web → Knowledge Graph**: search results → claim-check → Cognee ECL → AuraDB                                            |

Key: `TAVILY_API_KEY` in `backend/.env` (format `tvly-...`). Without a key every
endpoint returns honest `503` + setup hint (never fake success). Credits: basic
search = 1, advanced = 2; 429 responses honor Tavily's `Retry-After` automatically.

```bash
# Live web search (with LLM answer):
curl -X POST $BACKEND/api/tavily/search -H "Content-Type: application/json" \
  -d '{"query":"latest FATF regulations 2026","topic":"news","maxResults":5}'

# THE KILLER COMBO — fresh web data becomes knowledge-graph facts in one call:
curl -X POST $BACKEND/api/tavily/ingest-to-graph -H "Content-Type: application/json" \
  -d '{"query":"latest shell company enforcement cases","datasetName":"web_research"}'
# → sources staged via claim-check → cognified → queryable via /api/cognify/query

# Web-grounded cited answer:
curl -X POST $BACKEND/api/tavily/research -H "Content-Type: application/json" \
  -d '{"query":"...","maxResults":5}'
```

---

# 🚨 PS DROP PLAYBOOK — new problem statement → fully connected demo

### Step 0 — Boot (1 min)

```bash
npm run dev           # terminal 1: frontend :5173 + backend :5001
npm run cognee:start  # terminal 2: cognee microservice :8100
```

### Step 1 — Health sweep (1 min)

```bash
curl -s $BACKEND/health | grep healthy
curl -s $BACKEND/api/graph/status | grep -o '"isMock":[a-z]*'
curl -s $BACKEND/api/cognify/status | grep -o '"available":[a-z]*'
curl -s $BACKEND/api/ai/keys | grep aliveCount     # expect 5
```

### Step 2 — Wire the PS domain (5 min)

1. Paste the **problem statement** into `POST /api/cognify/run` as `content`
   (or the Cognitive Studio tab) with a tuned directive `prompt`.
2. Get domain-specific DataPoint schemas:
   `POST :8100/api/generate-schema {"problem_statement": "..."}` — use these to
   align your directive prompt and demo queries.

### Step 3 — Bring the data (10-30 min)

- Organizers gave text/logs → paste/pipe into `/api/cognify/run`.
- Organizers gave files → `POST /api/claim/upload` (JSON body) or host the file
  and pass its URL — the workflows `ingest` task accepts `http(s)://` claims.
- Wait for `mode:"live"` + `cognify.status:"cognified"` (fresh data: 2-6 min;
  repeated runs are cached and fast).

### Step 4 — Verify everything connected (2 min)

```bash
curl -s $BACKEND/api/graph/status        # nodeCount should have grown
curl -s "$BACKEND/api/graph/visualize"   # nodes/links for your domain
curl -X POST $BACKEND/api/cognify/query -H "Content-Type: application/json" \
  -d '{"query":"<a multi-hop question from the PS>","datasetName":"<your dataset>"}'
# grounding:"cognee_graph" = the graph answered, not just raw text
```

### Step 5 — Demo (the 35/35/30 minute)

- **Graph tab**: live force-graph of YOUR domain entities (refresh after cognify
  is automatic — the studio dispatches `graph:refresh`).
- **Cognitive Studio**: re-run pipeline + multi-hop query console side-by-side.
- **AI Playground**: any question, 5-key pool, clean answers.

### Step 6 — Optional: Render Workflows deployment (when credits land)

1. Render dashboard → **Apply Blueprint** (render.yaml declares
   `ignite-cognee-pipeline`, type: workflow) → paste Neo4j/NVIDIA env values.
2. Trigger: `POST /api/workflow/run-task` with the pipeline task.
3. Observability: dashboard → Workflows → run history (logs, retries, timings).

### 🔧 Troubleshooting

| Symptom             | Check                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `mode:"simulation"` | Cognee service down → `npm run cognee:start`, then `curl :8100/health`                                              |
| `isMock:true`       | AuraDB creds missing/paused → `npm run graph:warmup`, check `backend/.env`                                          |
| Request hangs >120s | Normal for fresh cognify (2-6 min); watch the studio progress bar                                                   |
| Anything else       | `grep <X-Request-Id from response header> backend/logs/backend.log services/cognee-service/logs/cognee-service.log` |
