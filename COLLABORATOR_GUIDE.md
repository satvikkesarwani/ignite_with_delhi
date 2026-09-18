# 🤝 Collaborator & AI Quickstart Guide

> **Hey Teammate / AI Assistant!** 👋
> This repository is pre-configured with a **complete full-stack architecture, 24/7 anti-sleep continuous deployment, and NVIDIA AI integration**.
> You do **NOT** need to configure servers, CORS, build scripts, or deployment pipelines. Everything is already live and auto-syncs on every git push!

---

## ⚡ Live Production Endpoints

| Resource                 | Service    | Live Production URL                                                                                              |
| :----------------------- | :--------- | :--------------------------------------------------------------------------------------------------------------- |
| 🖥️ **Frontend Web App**  | Vercel     | [https://frontend-beryl-seven-82.vercel.app](https://frontend-beryl-seven-82.vercel.app)                         |
| 📡 **Backend REST API**  | Render     | [https://ignite-backend-kt07.onrender.com](https://ignite-backend-kt07.onrender.com)                             |
| 🩺 **Health Check**      | Render     | [https://ignite-backend-kt07.onrender.com/health](https://ignite-backend-kt07.onrender.com/health)               |
| 🤖 **NVIDIA AI Engine**  | NVIDIA NIM | [https://ignite-backend-kt07.onrender.com/api/ai/status](https://ignite-backend-kt07.onrender.com/api/ai/status) |
| 📁 **GitHub Repository** | GitHub     | [https://github.com/satvikkesarwani/ignite_with_delhi](https://github.com/satvikkesarwani/ignite_with_delhi)     |

---

## 🤖 Prompt to Give Your AI (Cursor / Claude / Copilot / ChatGPT)

If you or your team member is using an AI coding tool, paste this exact prompt at the start of your session:

```text
I am working on the "ignite_with_delhi" hackathon project.
Here is the existing setup:
- Monorepo with npm workspaces: `frontend/` (React + Vite) and `backend/` (Express.js).
- Backend is live on Render (Port 5001 locally) with CORS pre-configured.
- Frontend is live on Vercel (Port 5173 locally).
- AI Engine: NVIDIA Nemotron 3.5 Lightning (30B) endpoint is already active at `POST /api/ai/generate` with a 5-key auto-rotating failover pool.
- Pre-commit hooks (Husky + ESLint + Prettier) and GitHub Actions CI are active.
- Every push to `main` auto-deploys to Vercel and Render in 60 seconds.

Please write clean, modular code that fits inside this existing structure.
Our problem statement for this hackathon is: [PASTE PROBLEM STATEMENT HERE]
```

---

## 🚀 How to Run Locally

### 1. Clone and Install

```bash
git clone https://github.com/satvikkesarwani/ignite_with_delhi.git
cd ignite_with_delhi
npm install
```

### 2. Start Both Frontend & Backend in 1 Command

```bash
npm run dev
```

- Frontend will open at: **http://localhost:5173**
- Backend will run at: **http://localhost:5001**

---

## 🧠 How to Use the Built-in AI (NVIDIA Nemotron 3.5 Lightning 30B)

You do **NOT** need to handle API keys in frontend! The backend has a **5-key auto-rotating pool** that automatically handles rate limits and failovers.

### In Frontend (Call AI in 3 Lines of Code):

```javascript
const response = await fetch('/api/ai/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Diagnose this symptom or summarize this text...',
    systemPrompt: 'You are an expert assistant for [Your Use Case].',
    temperature: 0.6,
    maxTokens: 1024,
  }),
});

const data = await response.json();
console.log(data.content); // 👈 Here is your generated AI answer!
```

---

## 🛠️ Where to Add Your Code

### 1. Adding New Backend Routes:

Open `backend/server.js`:

```javascript
app.get('/api/your-feature', (req, res) => {
  res.json({ success: true, data: [] });
});
```

### 2. Adding New Frontend UI / Pages:

- Main UI component: `frontend/src/App.jsx`
- Styling tokens & glassmorphic classes: `frontend/src/index.css`
- Assets & icons: `lucide-react` is already installed (`import { Zap, Heart, Shield } from 'lucide-react'`).

## 🧠 Built-in Services & Architecture

### 1. 🕸️ Neo4j Knowledge Graph Visualizer:

- **Interactive 2D Canvas**: Open tab **"🕸️ Neo4j Knowledge Graph"** in the frontend to explore real-time force-directed entity relations, drag nodes, zoom/pan, and inspect node properties.
- **Backend API**:
  - `GET /api/graph/status`: Live connection health & stats.
  - `GET /api/graph/visualize`: Formatted `{ nodes, links }` for canvas rendering.
  - `POST /api/graph/query`: Execute Cypher queries.
  - `GET /api/graph/warmup`: Pings Neo4j to prevent 72h auto-pause.

### 2. 🧠 Cognitive Memory Studio (Cognee ECL):

- **Unstructured Ingestion**: Open tab **"🧠 Cognitive ECL Studio"** to paste documents or problem statements.
- **Directive Extraction**: Uses `custom_prompt` to filter corporate/conversational noise.
- **Zero-Cost Embeddings**: FastEmbed ONNX runs locally on CPU with zero OpenAI bill!
- **Multi-Hop Reasoning**: Side-by-side graph path traversal + NVIDIA Nemotron 30B response.
- **Backend API** (auto-detects the Python microservice; falls back to simulation mode if it's down):
  - `GET /api/cognify/status`: Is the Cognee microservice reachable?
  - `POST /api/cognify/run`: Full ECL pipeline — `{ content, prompt }` → claim token + graph build.
  - `POST /api/cognify/query`: GraphRAG retrieval + Nemotron synthesis — `{ query, context }`.
- **Python microservice** (`services/cognee-service/`, Port **8100**): FastAPI with Cognee 1.5.4, FastEmbed `BAAI/bge-small-en-v1.5`, and an embedded Ladybug graph by default. Uses Neo4j AuraDB automatically when `GRAPH_DATABASE_*` credentials are set.

### 3. 🛠️ Useful Commands:

```bash
# Start Frontend & Backend concurrently
npm run dev

# In a SECOND terminal: start the Cognee microservice (Port 8100)
# Without this, the Cognitive Studio runs in honest simulation mode
npm run cognee:start

# Run full monorepo test (syntax + build)
npm test

# Run Cognee & schema unit tests
npm run cognee:test

# Ping Neo4j AuraDB instance to keep warm
npm run graph:warmup
```

---

## 🚀 How to Deploy (Continuous Deployment)

You do **NOT** need to open Vercel or Render dashboards.

Simply commit and push:

```bash
git add .
git commit -m "feat: added core feature"
git push origin main
```

### What happens automatically:

1. **Husky**: Auto-formats your code with Prettier and checks ESLint before finalizing the commit.
2. **GitHub Actions**: Verifies build correctness.
3. **Vercel**: Detects push and deploys the frontend live in ~20s.
4. **Render**: Detects push and deploys the backend live in ~60s.
5. **Anti-Sleep Bot**: Automatically pings the server every 10 minutes so judges never experience cold starts!

**Good luck and happy hacking! 🏆🔥**
