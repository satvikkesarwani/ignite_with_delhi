# ⚡ PersonaCRM — Universal Context Layer for Hackathon Organizers

> **Ignite with Delhi · Context Layer Track**  
> *Transforming dead participant databases into an intelligent, verified Knowledge Graph with zero-hallucination AI scouting, claim-gap detection, and automated talent matching.*

---

## 📌 Executive Summary

Most developer communities and hackathon platforms store user data in silos: a flat registration CSV here, an attendance log there. None of these fragments reveal who a developer actually is: **what they build, what they are genuinely good at, and how their reliability evolves over time.**

When an organizer plans their next hackathon, they face high-stakes questions:
- *Who are our top PyTorch builders from Delhi colleges who actually ship and win?*
- *Who won a prize in past editions but has gone quiet in the last 90 days?*
- *Who claims AI/ML on their form but has an empty GitHub profile (Claim Gap)?*
- *Who would make a reliable, patient mentor for beginner tracks?*

**PersonaCRM** builds a living **Graph Context Layer (Neo4j AuraDB)** over 600 past participants across 24 hackathons. It cross-verifies platform submissions against external GitHub commit histories, synthesizes behavioral personas, and exposes the entire context layer to organizers through an instant, **zero-hallucination AI Scout**.

---

## 🏛️ Architecture & System Design

PersonaCRM follows a strict 3-tier architecture separating raw storage, context synthesis, and downstream intelligence:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             PRESENTATION TIER                            │
│   React 18 + Vite 6 · Tailwind CSS · Fraunces + IBM Plex Design System   │
│                                                                          │
│  [/crm] Directory & Drawer │ [/crm/scout] AI Scout │ [/crm/intake] Intake│
└────────────────────────────────────▲─────────────────────────────────────┘
                                     │ REST / Streaming
┌────────────────────────────────────▼─────────────────────────────────────┐
│                           CONTEXT LAYER TIER                             │
│                                                                          │
│  ┌───────────────────────┐   ┌────────────────────────────────────────┐  │
│  │   Neo4j AuraDB Graph  │   │        Context Synthesis Engine        │  │
│  │  7,500+ Nodes         │◄──┤  • Independent Evidence Formula        │  │
│  │  21,000+ Relationships│   │  • Least-Squares Trajectory Regression │  │
│  │  Multi-Hop Traversal  │   │  • Claim-vs-Evidence Gap Detection     │  │
│  └───────────────────────┘   └────────────────────────────────────────┘  │
│                                                   ▲                      │
│                                                   │ Ingestion            │
│  ┌───────────────────────────┐       ┌────────────┴───────────────────┐  │
│  │ Cognee Semantic GraphRAG  │       │  Deterministic Entity Resolver │  │
│  │ (Unstructured Text & PDF) │       │  (Exact -> Fuzzy -> Disambig)  │  │
│  └───────────────────────────┘       └────────────────────────────────┘  │
└────────────────────────────────────▲─────────────────────────────────────┘
                                     │ Batch & Real-Time Sync
┌────────────────────────────────────▼─────────────────────────────────────┐
│                             RAW DATA TIER                                │
│   Platform Database: Users, Participations, Projects, Results, Mentors   │
│   External Data: GitHub Commits, Repositories, LinkedIn History          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Key Capabilities & Features

### 1. 🗃️ Talent Directory & Profile Drawer (`/crm`)
- **600 Candidate Directory**: High-density 32px rows, live engagement score meter, facet chips (College, Skill, Persona, Status), and 25-per-page pagination.
- **Keyboard-First Navigation**: Use `j` and `k` to navigate rows, `Enter` to open profile drawer, and `Esc` to close.
- **7-Section Context Profile Drawer**:
  - **⚠️ Claim-vs-Evidence Gap**: Flags candidates whose self-reported resume claims lack verified GitHub or project backing (e.g., *"Declared Machine Learning; GitHub is 88% JavaScript/FastAPI"*).
  - **Behavioral Personas**: Deterministic badges (`Serial Winner`, `Rising Star`, `Dormant High-Potential`, `Consistent Builder`, `Starter, Not Finisher`, `Ghost`).
  - **Temporal Trajectory & Tech Drift**: Chronological score progression via SVG sparkline and technology drift tracking (*Set difference between earliest and latest projects*).
  - **Verifiable Evidence Trail**: Every single claim links directly to the originating hackathon, project repo, or commit log.

### 2. 🤖 AI Scout Command Center (`/crm/scout`)
- **58% / 42% Responsive Split Screen**: Real-time candidate table on the left, natural language intelligence briefing on the right.
- **Zero-Hallucination & Sub-100ms Latency**:
  - **Tier 1 Composable Cypher Templates**: Executes pre-compiled graph queries in <100ms without LLM latency or hallucination risk.
  - **Tier 2 Guarded Text2Cypher**: NVIDIA Nemotron with schema injection and AST read-only enforcement (`CREATE`/`DELETE`/`DROP` blocked).
- **First-Class Disambiguation**: Proactively detects identical names (e.g., *Shiv Sharma at IIT Delhi* vs *Shiv Sharma at Amity Noida*) and prompts the organizer to choose with interactive cards.
- **Interactive Citation Grounding**: Clicking numbered chips (`[1]`, `[2]`) in the briefing scrolls and flashes the corresponding table row in glowing gold for 600ms.
- **Match Reason Differentiator**: Explicit qualification reasoning displayed per row.
- **Downstream Action Bar**: Multi-select candidates to trigger batch hackathon invites or mentor assignments.

### 3. ⚡ Real-Time Participant Intake (`/crm/intake`)
- **Dynamic Ingestion Form**: 440px form with drag-and-drop resume PDF validation (≤10MB) and one-click sample loader.
- **5-Stage Live Concurrent Stepper**:
  - Stage 1: Ingest PDF & extract text
  - **Stages 2 & 3 run concurrently**: External GitHub commit verification and Neo4j graph resolution execute in parallel.
  - Stage 4: Claim-gap and hidden strength derivation
  - Stage 5: Context narrative generation
- **Live Elapsed Stopwatch** and real-time **Cognee Async Indexing** status.
- **Instant Profile Swap**: Form transforms into an actionable profile card with deep links: *"View in database →"* and *"Ask the Scout about them →"*.

### 4. 🕸️ Interactive Knowledge Graph Explorer (`/crm/graph`)
- Live 2D force-directed WebGL/Canvas simulation connected to Neo4j AuraDB.
- Visual node encoding: Gold concentric circles for Winners, Green squares for Hackathons, Red triangles for Skill hubs, Orange diamonds for Prize projects, and Hollow squares for Colleges.
- **Click-to-Trace**: Click any person node to illuminate their entire hackathon, team, project, and skill network.

### 5. 🌐 Domain Generalizability
- The context layer is strictly domain-agnostic.
- Swap `config/domain.hackathon.json` with `config/domain.fooddelivery.json` to immediately repurpose the engine for delivery partner retention, customer spending patterns, and driver churn prediction with zero code changes.

---

## 🧪 Evaluator Verification & Quick Test Guide

Start the servers locally:
```bash
# Terminal 1: Backend
npm run dev:backend

# Terminal 2: Frontend
npm run dev:frontend
```
Open **[http://localhost:5173/crm](http://localhost:5173/crm)** in your browser.

### Recommended Evaluation Prompts (in AI Scout `/crm/scout`):

| Test Category | Prompt to Enter | Expected Result | Response Time |
| :--- | :--- | :--- | :---: |
| **Ambiguity & Identity** | `Is Shiv Sharma in our database?` | Triggers **2-Card Disambiguation UI** (IIT Delhi vs Amity Noida) | **~90ms** |
| **Hallucination Check** | `Is Aarav Malhotra in our database?` | Deterministic **"Not in database"** — zero fake profiles | **~15ms** |
| **Typo Tolerance** | `Do we have anyone called Ananya Iyar?` | Auto-corrects to Ananya Iyer (`U0007`) via fuzzy resolver | **~10ms** |
| **Fraud / Claim Gap** | `Tell me about Devansh Kapoor` | Explains ML claim vs 88% JS/FastAPI reality | **~2ms** |
| **Churned Talent** | `Who should we re-invite who has gone quiet since winning?` | Filters `Dormant High-Potential` past podium winners | **~350ms** |
| **Mentor Scouting** | `Who would make a good mentor this year?` | Ranks past winners by peer review & submission rate | **~130ms** |
| **Hinglish Query** | `Jo log jeete hain lekin ab gayab hain unhe dikhao` | Native Hinglish extraction of dormant winners | **~190ms** |
| **Track Discovery** | `Find ML builders from Delhi colleges who have won something` | Full Cypher query reveal + table citations | **~300ms** |

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite 6, Tailwind CSS | High-density CRM client, Popstate routing |
| **Design System** | Fraunces (Serif), IBM Plex Sans & Mono | Production typography, 32px dense tables |
| **Primary Graph DB** | **Neo4j AuraDB** (Cloud) | 7,500+ nodes, 21,000+ relationships, multi-hop Cypher |
| **Semantic Memory** | **Cognee** (Python FastAPI) | ECL pipeline (Extract-Cognify-Load) for GraphRAG |
| **LLM & Inference** | **NVIDIA Nemotron 3.5 30B** | 5-key pool rotation, context narrative synthesis |
| **Backend API** | Node.js Express (ESM) | REST API, streaming endpoints, route guardrails |
| **CI / CD** | GitHub Actions, Prettier, ESLint | Automated linting, code quality & test verification |

---

## 👥 Ignite with Delhi — Team

- **Track:** Context Layer Track
- **Project:** PersonaCRM
- **Repository:** [https://github.com/satvikkesarwani/ignite_with_delhi](https://github.com/satvikkesarwani/ignite_with_delhi)
