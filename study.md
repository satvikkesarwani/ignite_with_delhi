# 📚 Master Architecture Encyclopedia: Cognee Knowledge Graphs, Open-Source Embeddings, Render Workflows & Neo4j Infrastructure

> **Enterprise Hackathon Reference Architecture & Production Blueprint**  
> Based on ArXiv 2603.25097v1 (_"A Knowledge-Grounded Cognitive Runtime for Trustworthy AI Agents"_), official Cognee internals, Render Workflows claim-check orchestration, and Neo4j AuraDB infrastructure constraints.

---

## 🧭 Table of Contents

0. [🏛️ Master End-to-End System Architecture (All Technologies Integrated)](#0-master-end-to-end-system-architecture-all-technologies-integrated)
1. [Theoretical Foundation: Cognitive Runtime vs. Standard Vector RAG](#1-theoretical-foundation-cognitive-runtime-vs-standard-vector-rag)
2. [Hackathon Evaluation Matrix (The 35 / 35 / 30 Scoring Rule)](#2-hackathon-evaluation-matrix-the-35--35--30-scoring-rule)
3. [Cognee ECL Pipeline: Custom DataPoint Schemas & SkipValidation](#3-cognee-ecl-pipeline-custom-datapoint-schemas--skipvalidation)
4. [Directive Extraction Prompting vs. Pydantic Schema Enforcement](#4-directive-extraction-prompting-vs-pydantic-schema-enforcement)
5. [Token-Based Chunking Configuration & Forensic Tuning](#5-token-based-chunking-configuration--forensic-tuning)
6. [Pluggable Zero-Cost Embedding Infrastructure (FastEmbed, NIM, Ollama)](#6-pluggable-zero-cost-embedding-infrastructure)
7. [Render Workflows: Inter-Task Communication & Claim-Check Architecture](#7-render-workflows-inter-task-communication--claim-check-architecture)
8. [Programmatic Task Triggering via Render REST API & Rate-Limit Handling](#8-programmatic-task-triggering-via-render-rest-api--rate-limit-handling)
9. [Neo4j AuraDB Free Constraints, Auto-Pause Maintenance & Warm-Up Routine](#9-neo4j-auradb-free-constraints-auto-pause-maintenance--warm-up-routine)
10. [APOC Procedure Restrictions & Native Cypher Multi-Hop Traversal](#10-apoc-procedure-restrictions--native-cypher-multi-hop-traversal)
11. [Triple-Store Memory Architecture & Declarative Deployment (`render.yaml`)](#11-triple-store-memory-architecture--declarative-deployment)
12. [Ready-to-Run Validation Scripts & Edge Cases](#12-ready-to-run-validation-scripts--edge-cases)
13. [Hackathon 3-Minute Winning Demo Script](#13-hackathon-3-minute-winning-demo-script)
14. [Works Cited & Official References](#14-works-cited--official-references)

---

# 0. 🏛️ Master End-to-End System Architecture (All Technologies Integrated)

```mermaid
graph TB
    %% ==========================================
    %% 1. CLIENT & PRESENTATION LAYER
    %% ==========================================
    subgraph Client_Layer ["🌐 Presentation Layer (Vercel Edge Network)"]
        UI["React + Vite Single-Page Application"]
        GraphViz["2D Force-Directed Graph Visualizer"]
        Console["Agentic Chat & Query Playground"]
        UI --- GraphViz
        UI --- Console
    end

    %% ==========================================
    %% 2. AUTOMATION & RESILIENCE RUNNER
    %% ==========================================
    subgraph Anti_Sleep ["⏰ Anti-Sleep Daemon (GitHub Actions CI/CD)"]
        CronRunner["10-Min Cron Keep-Alive Runner<br/>(.github/workflows/keep_alive.yml)"]
        AuraWarmup["Neo4j 24h Non-Blocking Warm-Up<br/>(scripts/warmup_neo4j.py)"]
    end

    %% ==========================================
    %% 3. CLOUD INGRESS & API GATEWAY TIER
    %% ==========================================
    subgraph Gateway_Tier ["⚡ Cloud Ingress & API Gateway (Render Web Service)"]
        API_GW["Express / FastAPI Gateway (Port 5001)"]
        RateLimiter["Rate Limiter (Max 100 req/min + Jitter Backoff)"]
        AuthModule["Bearer Auth & Session Guard"]
        ClaimUpload["Claim-Check Ingestion Controller"]

        API_GW --> RateLimiter
        RateLimiter --> AuthModule
        AuthModule --> ClaimUpload
    end

    %% ==========================================
    %% 4. STORAGE DECOUPLING (CLAIM-CHECK)
    %% ==========================================
    subgraph Storage_Tier ["💾 Decoupled Storage Tier (Claim-Check)"]
        ObjectStore["Shared Object Storage / Render Persistent Disk<br/>(AWS S3 / Cloudflare R2 / Disk Volume)"]
    end

    %% ==========================================
    %% 5. DISTRIBUTED WORKFLOWS & WORKERS
    %% ==========================================
    subgraph Workflow_Tier ["🔄 Distributed Orchestration Tier (Render Workflows)"]
        Broker["Render Workflow Broker<br/>(ctx.run lightweight dispatch)"]
        Worker["Background Workflow Worker Task<br/>(Stream file buffer from Claim URI)"]
        Broker -->|Dispatches Job| Worker
    end

    %% ==========================================
    %% 6. COGNEE ECL COGNITIVE RUNTIME
    %% ==========================================
    subgraph Cognee_Engine ["🧠 Cognee ECL Cognitive Runtime"]
        direction TB
        Extract["1. Extract: Token Chunker<br/>(CHUNK_SIZE=300-1500, CHUNK_OVERLAP=10)"]
        Cognify["2. Cognify: Directive Prompt + LLM Extraction<br/>(Filter corporate & conversational noise)"]
        Load["3. Load: Pydantic v2 DataPoints<br/>(SkipValidation + metadata index_fields)"]
        Extract --> Cognify --> Load
    end

    %% ==========================================
    %% 7. TRIPLE-STORE MEMORY SYSTEM
    %% ==========================================
    subgraph Triple_Store ["🗄️ Triple-Store Persistent Memory Layer"]
        RelDB[("Relational Layer<br/>(SQLite / PostgreSQL)<br/>Auth, Session History & Task Logs")]
        VecDB[("Dense Vector Store<br/>(LanceDB / PGVector)<br/>FastEmbed BAAI/bge-small-en-v1.5 ONNX")]
        GraphDB[("Property Graph Store<br/>(Neo4j AuraDB Free Tier)<br/>Typed Nodes & Labeled Edges<br/>Native Cypher 1-3 Hop Traversal")]
    end

    %% ==========================================
    %% 8. AI INFERENCE ENGINE
    %% ==========================================
    subgraph AI_Cluster ["🤖 Enterprise AI Inference Tier (NVIDIA NIM)"]
        KeyPool["5-Key Auto-Rotating API Pool<br/>(Failover & Round-Robin)"]
        Nemotron["NVIDIA Nemotron 3.5 Lightning 30B<br/>(nvidia/nemotron-3.5-lightning-30b-a3b)"]
        KeyPool --> Nemotron
    end

    %% ==========================================
    %% DATAFLOWS & CONNECTIONS
    %% ==========================================
    UI ==>|HTTPS / REST API / WSS| API_GW
    CronRunner -.->|HTTP GET /health (Every 10 min)| API_GW
    AuraWarmup -.->|Cypher Ping MATCH n RETURN count n| GraphDB

    ClaimUpload -->|1. Upload Raw 50MB+ Dataset| ObjectStore
    ClaimUpload -->|2. Trigger Task with URI Reference| Broker

    Worker -->|3. Pull File Stream into Buffer| ObjectStore
    Worker -->|4. Execute ECL Pipeline| Cognee_Engine

    Cognify <==>|Steer Extraction Prompts| Nemotron
    Load -->|Store Session & Metadata| RelDB
    Load -->|Serialize index_fields Embeddings| VecDB
    Load -->|Persist Topology & Labeled Edges| GraphDB

    %% Query / Hybrid Search Flow
    API_GW -->|Hybrid GraphRAG Search| Cognee_Engine
    Cognee_Engine -->|1. Vector Similarity Match| VecDB
    Cognee_Engine -->|2. Multi-Hop Cypher Traversal| GraphDB
    Cognee_Engine -->|3. Grounded Context Synthesis| Nemotron
    Nemotron -->|Stream Synthesized Response| API_GW
    API_GW -->|Visual Graph Data + AI Answer| UI

    %% Styling
    classDef client fill:#1e1e2f,stroke:#6366f1,stroke-width:2px,color:#fff;
    classDef gateway fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#fff;
    classDef storage fill:#1e293b,stroke:#f59e0b,stroke-width:2px,color:#fff;
    classDef workflow fill:#134e4a,stroke:#14b8a6,stroke-width:2px,color:#fff;
    classDef cognee fill:#311042,stroke:#c084fc,stroke-width:2px,color:#fff;
    classDef db fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#fff;
    classDef ai fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#fff;

    class UI,GraphViz,Console client;
    class API_GW,RateLimiter,AuthModule,ClaimUpload gateway;
    class ObjectStore storage;
    class Broker,Worker workflow;
    class Extract,Cognify,Load cognee;
    class RelDB,VecDB,GraphDB db;
    class KeyPool,Nemotron ai;
```

---

# 1. Theoretical Foundation: Cognitive Runtime vs. Standard Vector RAG

Standard Retrieval-Augmented Generation (RAG) breaks unstructured text into naive chunks and indexes them in a dense vector database using cosine distance. While effective for simple semantic similarity, **standard RAG inherently fails on complex, multi-hop reasoning**:

```mermaid
graph TD
    subgraph Standard Vector RAG (Fragile)
        Doc1["Unstructured Document"] --> Chunks["Naive Chunks (500 chars)"]
        Chunks --> Embed["Embedding Model"]
        Embed --> VDB["Vector DB (Top-K Cosine Sim)"]
        VDB -.-> Hallucination["❌ Hallucinates transitive relations, blind to entity links"]
    end

    subgraph Knowledge-Grounded Cognitive Runtime (Robust)
        Doc2["Unstructured Document"] --> ECL["Extract-Cognify-Load (ECL) Pipeline"]
        ECL --> Schemas["Custom Pydantic v2 DataPoints"]
        Schemas --> TriStore["Triple-Store Architecture"]
        TriStore --> RelDB["Relational: Auth & Sessions"]
        TriStore --> VecDB["Vector DB: Dense Chunk Semantics"]
        TriStore --> GraphDB["Neo4j: Typed Graph Nodes & Labeled Edges"]
        GraphDB ==> Deterministic["✅ Deterministic Multi-Hop Traversal & Zero Hallucination"]
    end
```

### Why Judges Value Cognitive Runtimes:

1. **Transitive Logic**: Vector search cannot deduce that if _Entity A owns Entity B_ and _Entity B controls Account C_, then _Entity A has beneficial ownership over Account C_. A graph traversal resolves this in $O(1)$ to $O(k)$ hops.
2. **Ontology Grounding**: Custom schemas enforce that entities adhere to verified database field types and structural rules rather than probabilistic LLM guesses.
3. **Auditable Lineage**: Every edge and node in Neo4j links back to the original source chunk ID, providing an immutable audit trail.

---

# 2. Hackathon Evaluation Matrix (The 35 / 35 / 30 Scoring Rule)

Evaluations of graph-augmented AI systems prioritize moving beyond naive RAG by scoring across three core technical pillars:

| Evaluation Pillar                     | Primary Technical Focus                                            | Key Metric / Feature Implementation                                                                                                        | Weight  |
| :------------------------------------ | :----------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :------ |
| **Knowledge Graph Depth & Reasoning** | Graph-Vector Hybrid Search, Ontology Grounding, Custom Data Models | Multi-hop graph retrieval accuracy, custom `DataPoint` schema enforcement, entity relation mapping over simple vector RAG.                 | **35%** |
| **Autonomous Agent Integration**      | Persistent Memory, Trace Optimization, Framework Interoperability  | Multi-agent execution (LangGraph / CrewAI), goal-aware memory retrieval, state updates across conversational turns, tool execution traces. | **35%** |
| **Production Infrastructure**         | Asynchronous Processing, Rate-Limit Management, Resilience         | Render Workflows task decoupling, API backoff handling, zero-cost embedding fallback options, database warm-up reliability.                | **30%** |

---

# 3. Cognee ECL Pipeline: Custom DataPoint Schemas & SkipValidation

Cognee's **Extract-Cognify-Load (ECL)** pipeline provides the framework for turning raw unstructured documents into persistent, verifiable memory graphs.

### Structural Schema Boundaries with Pydantic v2

Structural boundaries are defined using custom Pydantic v2 classes that inherit directly from Cognee's `DataPoint` base class:

- **`metadata: MetaData = {"index_fields": [...]}`**: Explicitly designates which attributes are serialized into dense vector embeddings for semantic similarity search. Remaining attributes persist as standard properties on graph nodes.
- **`destination: SkipValidation[Any] = None`**: **CRITICAL FOR PRODUCTION** — Prevents forward-reference and cyclic validation errors during Pydantic schema compilation when properties point to other `DataPoint` graph nodes.

```python
from typing import Any, Optional
from pydantic_core import SkipValidation
from cognee.infrastructure.engine import DataPoint
from cognee.infrastructure.engine.models.DataPoint import MetaData

class ShellAccount(DataPoint):
    account_number: str
    jurisdiction: str
    # Vector index created only for account number & jurisdiction
    metadata: MetaData = {"index_fields": ["account_number", "jurisdiction"]}

class FinancialTransaction(DataPoint):
    transaction_id: str
    amount: float
    currency: str
    # SkipValidation prevents Pydantic compilation errors for graph node links
    destination: SkipValidation[Any] = None
    metadata: MetaData = {"index_fields": ["transaction_id", "currency"]}
```

---

# 4. Directive Extraction Prompting vs. Pydantic Schema Enforcement

A common pitfall is attempting to handle all entity extraction logic inside the Pydantic schema alone, or entirely inside raw prompts. Cognee combines both:

1. **Pydantic Schemas**: Enforce database types, graph node properties, and vector indexing configurations.
2. **Directive Extraction Prompts (`custom_prompt`)**: Steer the underlying LLM during the extraction phase to filter out conversational noise, boilerplate, and peripheral details.

```python
import cognee

# Ingest raw text or documents
await cognee.add("raw_financial_filings.pdf", dataset_name="financial_audit")

# Direct model focus to isolate target entities before graph serialization
await cognee.cognify(
    datasets=["financial_audit"],
    custom_prompt=(
        "Extract exclusively financial transaction entities and shell company accounts. "
        "Ignore all conversational text, general corporate overview details, and non-financial data."
    )
)
```

> [!TIP]
> When `DataPoint` schemas and `custom_prompt` directives are used simultaneously, `cognify()` uses the prompt to isolate candidate facts from text and cleanly maps them into the graph structure defined by the `DataPoint` subclasses.

---

# 5. Token-Based Chunking Configuration & Forensic Tuning

Cognee splits unstructured text using **token-based chunking** rather than raw character counts. This guarantees that segment boundaries align with LLM context windows and embedding model tokenizers.

### Chunking Parameters (`CognifyConfig`):

Settings can be overridden at container startup or process initialization via environment variables:

| Configuration Parameter | Environment Variable | Default Value | Technical Description & Domain Tuning                                                                                                |
| :---------------------- | :------------------- | :------------ | :----------------------------------------------------------------------------------------------------------------------------------- |
| **Chunk Size**          | `CHUNK_SIZE`         | `1500`        | Maximum token limit per text segment. Set to `300–500` for high-density forensic analysis; set to `1500` for general corporate docs. |
| **Chunk Overlap**       | `CHUNK_OVERLAP`      | `10`          | Token overlap across adjacent segments to prevent cutting entities across boundaries. Increase to `50` for legal text.               |
| **Chunk Engine**        | `CHUNK_ENGINE`       | `token`       | Underlying tokenization engine driving document splitting.                                                                           |

### Chunk Size Strategy:

- **Small Chunks (`300–500 tokens`)**: Increases entity resolution density and extraction precision. Ideal for contracts, audit logs, financial ledgers, and source code.
- **Large Chunks (`1000–1500 tokens`)**: Preserves broader document context and long-range semantic narrative at the expense of granular entity extraction.

---

# 6. Pluggable Zero-Cost Embedding Infrastructure

Cognee defaults to OpenAI’s `text-embedding-3-small`. However, during a hackathon or enterprise deployment, third-party API rate limits and costs are major failure points. Cognee's vector abstraction layer (`VectorConfig`) supports zero-cost local and open-source embedding backends:

```python
from cognee.infrastructure.databases.vector import VectorConfig

# Zero-cost local FastEmbed integration (Runs embedded on CPU without PyTorch!)
vector_config = VectorConfig(
    embedding_provider="fastembed",
    embedding_model="BAAI/bge-small-en-v1.5",
    vector_db_provider="lancedb"
)
```

### Comprehensive Comparative Analysis of Embedding Backends:

| Embedding Provider            | Representative Model       | Hosting Architecture | Resource Cost               | Operational Considerations                                                                                     |
| :---------------------------- | :------------------------- | :------------------- | :-------------------------- | :------------------------------------------------------------------------------------------------------------- |
| **FastEmbed** _(Recommended)_ | `BAAI/bge-small-en-v1.5`   | Embedded CPU / Local | **Zero Cost (Open-Source)** | **Lightweight ONNX runtime without PyTorch overhead; ideal for memory-constrained local & Render containers.** |
| **SentenceTransformers**      | `all-MiniLM-L6-v2`         | Local Process / GPU  | Zero Cost (Open-Source)     | Requires heavy PyTorch dependencies; offers wide model availability via Hugging Face Hub.                      |
| **NVIDIA NIM**                | `nv-embedqa-mistral-7b-v2` | Cloud Microservice   | Free Tier / Microservice    | High-performance embedding generation tailored for enterprise retrieval QA workflows.                          |
| **Ollama**                    | `nomic-embed-text`         | Local Daemon         | Zero Cost (Open-Source)     | Provides local API endpoints for embedded deployment pipelines.                                                |
| **OpenAI**                    | `text-embedding-3-small`   | Cloud API            | Variable API Usage Fees     | Requires external internet access and API keys; subject to third-party rate limits.                            |

---

# 7. Render Workflows: Inter-Task Communication & Claim-Check Architecture

Render Workflows manage distributed background tasks by orchestrating execution across isolated runtime contexts (`ctx.run(task, payload)`).

### The Payload Limit Problem:

Data payloads passed into `ctx.run()` are serialized across the orchestration broker. Passing large datasets directly inline (e.g., a 50MB PDF document or raw JSON binary) causes:

1. Orchestration broker memory ballooning
2. Network serialization bottlenecks
3. Workflow task timeout failures

### The Solution: Storage-Decoupled Claim-Check Design Pattern

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Web as Render Web Service (FastAPI / Express)
    participant S3 as Object Storage (S3 / R2 / Render Disk)
    participant Broker as Render Workflow Broker
    participant Worker as Render Background Task Worker
    participant Neo4j as Neo4j AuraDB

    Client->>Web: Upload 50MB PDF Document
    Web->>S3: Stage 1: Upload raw binary to s3://bucket/contracts/doc_01.pdf
    Web->>Broker: Stage 2: Trigger task with lightweight JSON reference { docUri: "s3://bucket/contracts/doc_01.pdf" }
    Broker->>Worker: Dispatch task execution job
    Worker->>S3: Stage 3: Pull file into local filesystem buffer
    Worker->>Worker: Execute Cognee ECL Pipeline (Parse -> Chunk -> Vectorize)
    Worker->>Neo4j: Persist extracted graph entities & relationships
    Worker-->>Broker: Task Completed { status: "success", nodeCount: 142 }
    Broker-->>Web: Notify completion via webhook or status poll
```

1. **Ingestion Stage**: The web service uploads incoming raw datasets directly to cloud object storage (e.g., AWS S3, Cloudflare R2) or writes them to a shared Render Persistent Disk Volume.
2. **Task Handoff**: The web service triggers the workflow task by passing a **lightweight JSON payload** containing only the resource URI (e.g., `s3://bucket/document.pdf`), processing flags, and tenant identifiers.
3. **Execution Stage**: The worker task pulls the file directly from storage into its local filesystem buffer, performs parsing or `cognify()` operations, and persists transformed nodes directly to Neo4j.

---

# 8. Programmatic Task Triggering via Render REST API & Rate-Limit Handling

Render Workflows and background tasks can be programmatically triggered via Render's REST API using HTTP Bearer authentication:

```http
POST /v1/services/srv-damja2gu01pc73afuufg/jobs HTTP/1.1
Host: api.render.com
Authorization: Bearer rnd_7MlUwHv0aTee0wn64iUebzJqW3xJ
Content-Type: application/json

{
  "planId": "starter",
  "startCommand": "python -m tasks.process_dataset --url s3://bucket/data.pdf"
}
```

### Rate-Limit Management:

- **Rate Limit**: Render enforces a rate limit of **100 requests per minute** on task execution endpoints.
- **Handling Strategy**: Web services triggering automated tasks must queue external requests or implement exponential backoff algorithms with jitter:

```python
import time
import random
import requests

def trigger_render_task_with_backoff(service_id: str, api_key: str, command: str, max_retries: int = 5):
    url = f"https://api.render.com/v1/services/{service_id}/jobs"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {"planId": "starter", "startCommand": command}

    for attempt in range(max_retries):
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code == 201:
            return response.json()
        elif response.status_code == 429: # Rate limit hit
            wait_time = (2 ** attempt) + random.uniform(0.1, 0.5)
            print(f"[429 Rate Limit] Backing off for {wait_time:.2f}s...")
            time.sleep(wait_time)
        else:
            response.raise_for_status()
    raise RuntimeError("Failed to trigger Render task after max retries")
```

---

# 9. Neo4j AuraDB Free Constraints, Auto-Pause Maintenance & Warm-Up Routine

Deploying Cognee's graph storage layer on Neo4j AuraDB Free Tier requires accommodating resource quotas, auto-pause mechanics, and procedure restrictions.

### Storage Quotas & Operational Limits:

| Operational Parameter          | Free Tier Boundary Limit             | System Impact                                                  |
| :----------------------------- | :----------------------------------- | :------------------------------------------------------------- |
| **Maximum Node Count**         | `50,000` to `200,000` nodes          | Ingestion halts when node capacity is reached.                 |
| **Maximum Relationship Count** | `175,000` to `400,000` relationships | Graph edge creation fails when limits are exceeded.            |
| **Auto-Pause Threshold**       | **72 hours (3 days) of inactivity**  | Compute instance pauses; initial connections timeout.          |
| **Auto-Deletion Threshold**    | **30 consecutive days paused**       | Unresumed databases are permanently removed.                   |
| **Instance Limit**             | **1 active instance per account**    | Scalability must be handled within a single database instance. |

### Cold-Start Latency & Resuming:

- When an AuraDB Free instance is paused, incoming connections fail with connection refusal timeouts until the instance resumes.
- **Resuming a paused instance takes approximately 1 to 3 minutes**.

### Automated Database Warm-Up Routines:

To guarantee database availability during live demonstrations and evaluations:

1. **Cron Health Check**: Configure an automated health check (via GitHub Actions or Render background worker) to run every 24–48 hours.
2. **Simple Non-Blocking Cypher Query**:
   ```cypher
   MATCH (n) RETURN count(n) AS node_count LIMIT 1;
   ```
3. **15-Minute Pre-Evaluation Checklist**: Run a verification script 15 minutes before scheduled evaluations to confirm the instance state is active and avoid cold-start latency during live operations.

---

# 10. APOC Procedure Restrictions & Native Cypher Multi-Hop Traversal

Neo4j AuraDB Free restricts available APOC (Awesome Procedures on Cypher) plugins to prevent shared-resource over-allocation.

- **Permitted APOC Utilities**: Core utility functions like `apoc.meta.nodes.count` and collection utilities (`apoc.coll.*`).
- **Restricted APOC Procedures**: Resource-intensive algorithmic procedures like `apoc.algo.pageRank` and complex path expansion procedures (`apoc.path.subgraphAll`) are blocked or unavailable on the free tier.

### Native Cypher Variable-Length Path Matching (The Best Practice):

Applications should use **native Cypher variable-length path pattern matching** for multi-hop graph traversals instead of restricted APOC procedures:

```cypher
// Native Cypher alternative for 1-to-3 hop entity traversal with relationship weight filtering
MATCH path = (source:Entity {name: $entity_name})-[r:RELATION*1..3]-(target:Entity)
WHERE ALL(rel IN r WHERE rel.weight > 0.5)
RETURN path, nodes(path), relationships(path)
LIMIT 50;
```

> [!NOTE]
> Native Cypher pattern matching leverages AuraDB’s index lookup mechanisms while remaining entirely within free tier execution restrictions.

---

# 11. Triple-Store Memory Architecture & Declarative Deployment

Cognee partitions cognitive memory into three distinct datastores:

1. **Relational Layer (`SQLite` / `PostgreSQL`)**: Manages metadata, execution logs, user identity, and session authentication.
2. **Dense Vector Index (`LanceDB` / `Qdrant` / `PGVector`)**: Indexes text embeddings for fuzzy semantic concept search.
3. **Property Graph Layer (`Neo4j AuraDB`)**: Stores typed entities, labeled directional relationships, and ontological hierarchies.

### Declarative Blueprint (`render.yaml`)

This configuration establishes an interconnected web service and background workflow worker with shared Neo4j and AI credentials:

```yaml
services:
  # 1. User-Facing Web API (Node.js Express or Python FastAPI)
  - type: web
    name: agent-memory-api
    runtime: node
    plan: starter
    buildCommand: 'npm install'
    startCommand: 'npm start'
    envVars:
      - key: PORT
        value: '5001'
      - key: ENVIRONMENT
        value: production
      - fromGroup: cognee-neo4j-credentials

  # 2. Asynchronous Background Task Orchestration (Render Workflows)
  - type: workflow
    name: agent-memory-pipeline
    runtime: python
    plan: starter
    buildCommand: 'pip install -r requirements.txt'
    envVars:
      - key: PYTHON_VERSION
        value: '3.11.8'
      - key: DATASET_QUEUE_ENABLED
        value: 'true'
      - fromGroup: cognee-neo4j-credentials

# Shared Environment Variable Group
envVarGroups:
  - name: cognee-neo4j-credentials
    envVars:
      - key: LLM_PROVIDER
        value: 'openai'
      - key: LLM_MODEL
        value: 'nvidia/nemotron-3.5-lightning-30b-a3b'
      - key: LLM_BASE_URL
        value: 'https://integrate.api.nvidia.com/v1'
      - key: LLM_API_KEY
        sync: false
      - key: EMBEDDING_PROVIDER
        value: 'fastembed'
      - key: EMBEDDING_MODEL
        value: 'BAAI/bge-small-en-v1.5'
      - key: GRAPH_DATABASE_PROVIDER
        value: 'neo4j'
      - key: GRAPH_DATABASE_URL
        sync: false # e.g. neo4j+s://xxxxxx.databases.neo4j.io
      - key: GRAPH_DATABASE_USERNAME
        value: 'neo4j'
      - key: GRAPH_DATABASE_PASSWORD
        sync: false
      - key: GRAPH_DATASET_DATABASE_HANDLER
        value: 'neo4j_aura_dev' # Mandatory fix for Issue #2697
      - key: ENABLE_BACKEND_ACCESS_CONTROL
        value: 'false'
```

---

# 12. Ready-to-Run Validation Scripts & Edge Cases

### Script: Neo4j AuraDB Warm-Up & Connection Verifier

Save as `scripts/warmup_neo4j.py` to test connection and prevent auto-pause:

```python
import os
import sys
from neo4j import GraphDatabase

def test_and_warmup_neo4j():
    uri = os.environ.get("GRAPH_DATABASE_URL", os.environ.get("NEO4J_URI", "neo4j+s://demo.databases.neo4j.io"))
    user = os.environ.get("GRAPH_DATABASE_USERNAME", os.environ.get("NEO4J_USERNAME", "neo4j"))
    password = os.environ.get("GRAPH_DATABASE_PASSWORD", os.environ.get("NEO4J_PASSWORD", "secret"))

    print(f"Connecting to Neo4j AuraDB: {uri}...")
    try:
        driver = GraphDatabase.driver(uri, auth=(user, password))
        with driver.session() as session:
            result = session.run("MATCH (n) RETURN count(n) AS node_count LIMIT 1;")
            record = result.single()
            count = record["node_count"] if record else 0
            print(f"✅ Success! Neo4j AuraDB is active. Total nodes in graph: {count}")
        driver.close()
    except Exception as e:
        print(f"❌ Connection failed: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    test_and_warmup_neo4j()
```

### Critical Edge Cases & Fixes:

1. **Issue #2697 (Graph Handler Mismatch)**:
   - _Error_: `OSError: The selected graph dataset to database handler does not work with the configured graph database provider`.
   - _Fix_: Set `GRAPH_DATASET_DATABASE_HANDLER="neo4j_aura_dev"` whenever `GRAPH_DATABASE_PROVIDER="neo4j"`.
2. **Local Kùzu File Lock Contention**:
   - _Error_: `Could not set lock on file`.
   - _Fix_: Using Neo4j AuraDB completely avoids file locking. For local single-worker testing, configure `SUBPROCESS_OPEN_LOCK_RETRIES=5` and `SUBPROCESS_IDLE_TTL_SECONDS=0`.
3. **Pydantic Forward-Reference Exception**:
   - _Error_: `PydanticUndefinedAnnotation` or recursion limits during schema parsing.
   - _Fix_: Wrap target node attributes in `destination: SkipValidation[Any] = None`.

---

# 13. Hackathon 3-Minute Winning Demo Script

When presenting to judges tomorrow, structure your 3 minutes around the **35/35/30 rule**:

### Minute 1: The Problem with Naive Vector RAG (Pillar 1: 35%)

- _"Standard RAG takes text chunks and does cosine similarity. But what happens if you ask: 'Which subsidiaries in Panama have indirect transactions linked to Account X through 3 shell companies?' Vector search completely fails because the connection is topological, not linguistic."_
- **Action**: Show live query on frontend. Show the **Neo4j Force Graph visualizer** rendering the 3-hop relationship discovered dynamically by native Cypher variable-length traversal (`-[r:RELATION*1..3]-`).

### Minute 2: Autonomous Agent & Memory State (Pillar 2: 35%)

- _"Our agent doesn't just do single-turn question-answering. It uses Cognee's cognitive runtime with custom Pydantic DataPoint schemas to enforce structured domain boundaries."_
- **Action**: Show a multi-turn conversation. Agent recalls facts learned 5 turns ago, demonstrates goal-aware context filtering, and shows tool execution traces stored in the memory layer.

### Minute 3: Production Infrastructure & Resilience (Pillar 3: 30%)

- _"We engineered this for production reliability. We solved the broker payload bottleneck using the Claim-Check pattern on Render Workflows—passing lightweight URI claims instead of 50MB binaries inline."_
- _"We use zero-cost FastEmbed ONNX embeddings locally and our 5-key rotating NVIDIA NIM Nemotron LLM cluster, with automated AuraDB warm-up routines to prevent 72-hour cold-start pauses."_
- **Action**: Show live Render backend metrics, passing GitHub CI/CD badges, and instantaneous response times.

---

# 14. Works Cited & Official References

1. **A Knowledge-Grounded Cognitive Runtime for Trustworthy AI Agents**, [arXiv:2603.25097v1](https://arxiv.org/html/2603.25097v1) & [PDF](https://arxiv.org/pdf/2603.25097)
2. **How Cognee Builds AI Memory for Agents**, [cognee.ai/how-cognee-builds-ai-memory](https://www.cognee.ai/how-cognee-builds-ai-memory)
3. **Ontologies - Cognee Documentation**, [docs.cognee.ai/core-concepts/further-concepts/ontologies](https://docs.cognee.ai/core-concepts/further-concepts/ontologies)
4. **Custom Graph Model - Cognee Documentation**, [docs.cognee.ai/guides/custom-graph-model](https://docs.cognee.ai/guides/custom-graph-model)
5. **Custom Data Models - Cognee Documentation**, [docs.cognee.ai/guides/custom-data-models](https://docs.cognee.ai/guides/custom-data-models)
6. **CLAUDE.md - topoteretes/cognee GitHub**, [github.com/topoteretes/cognee/blob/main/CLAUDE.md](https://github.com/topoteretes/cognee/blob/main/CLAUDE.md)
7. **Chunkers - Cognee Documentation**, [docs.cognee.ai/core-concepts/further-concepts/chunkers](https://docs.cognee.ai/core-concepts/further-concepts/chunkers)
8. **Configuration - Cognee Documentation**, [docs.cognee.ai/rust/configuration](https://docs.cognee.ai/rust/configuration)
9. **Docker Deployment - Cognee Documentation**, [docs.cognee.ai/how-to-guides/cognee-sdk/deployment/docker](https://docs.cognee.ai/how-to-guides/cognee-sdk/deployment/docker)
10. **Total Agent Memory - vbcherepanov GitHub**, [github.com/vbcherepanov/total-agent-memory](https://github.com/vbcherepanov/total-agent-memory)
11. **AutoGen + Qdrant Integration**, [qdrant.tech/documentation/frameworks/autogen/](https://qdrant.tech/documentation/frameworks/autogen/)
12. **Sentence Transformers - Haystack Deepset AI**, [haystack.deepset.ai/integrations/sentence-transformers](https://haystack.deepset.ai/integrations/sentence-transformers)
13. **How to Trigger a Long-Running Task from a Web Service on Render**, [render.com/articles/how-to-trigger-a-long-running-task-from-a-web-service-on-render](https://render.com/articles/how-to-trigger-a-long-running-task-from-a-web-service-on-render)
14. **Deploying on Render**, [render.com/docs/deploys](https://render.com/docs/deploys)
15. **Limits and Pricing for Render Workflows**, [render.com/docs/workflows-limits](https://render.com/docs/workflows-limits)
16. **Limits - Vercel Documentation**, [vercel.com/docs/limits](https://vercel.com/docs/limits)
17. **Support Resources and FAQ for Aura Free Tier - Neo4j Support**, [support.neo4j.com/s/article/16094506528787-Support-resources-and-FAQ-for-Aura-Free-Tier](https://support.neo4j.com/s/article/16094506528787-Support-resources-and-FAQ-for-Aura-Free-Tier)
18. **Pause your Neo4j Aura Instance, Save 80% on Costs**, [neo4j.com/blog/auradb/pause-neo4j-aura-instance-save-80-percent/](https://neo4j.com/blog/auradb/pause-neo4j-aura-instance-save-80-percent/)
19. **APOC Support - Neo4j Aura**, [neo4j.com/docs/aura/apoc/](https://neo4j.com/docs/aura/apoc/)
20. **Free Graph Database - Neo4j**, [neo4j.com/free-graph-database/](https://neo4j.com/free-graph-database/)
21. **Announcing Early Access of Neo4j AuraDB Free Tier**, [neo4j.com/blog/news/announcing-early-access-neo4j-aura-free-tier/](https://neo4j.com/blog/news/announcing-early-access-neo4j-aura-free-tier/)
22. **Neo4j AuraDB Frequently Asked Questions**, [neo4j.com/cloud/platform/aura-graph-database/faq/](https://neo4j.com/cloud/platform/aura-graph-database/faq/)
23. **Aura Instance Access Issues: Understanding Pausing, Resuming & Auto-Delete Policy**, [support.neo4j.com/s/article/17480821630355--Aura-Instance-Access-Issues-Understanding-Pausing-Resuming-and-Auto-Delete-Policy](https://support.neo4j.com/s/article/17480821630355--Aura-Instance-Access-Issues-Understanding-Pausing-Resuming-and-Auto-Delete-Policy)
