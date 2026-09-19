# PersonaCRM — Execution Plan (revised)

Ignite with Delhi · Context Layer Track · 8 hours · 2 people
Use case: **hackathon listing platform**.

---

## 1. What I changed from the previous plan, and why

The previous plan was strong on demo choreography and weak on the thing that is actually
scored. Seven changes, in order of how much they matter.

### 1.1 The graph was a resume parser, not a hackathon context layer — FIXED

The old node model was `Person → Skill / Company / Institution`. That is a resume. The
problem statement defines context as *"what they do, what they are good at, and how they
behave over time"* and names the signals explicitly: hackathons participated, projects
submitted, mentoring scores, events attended, comments and interactions.

**None of those existed in the old graph.** We add `Hackathon`, `Team`, `Project`,
`Result`, `MentorSession`, `Interaction`, `OutreachEvent`. This is the difference between
scoring on *Context quality* and not.

### 1.2 The 600-row CSV was silently dropped — FIXED

The old plan is 100% form-intake. But an organizer asking *"is this person in our user
base"* needs a user base. The CSV **is** the platform's historical database.

Unified story: **CSV = the platform's existing users. The form = the live ingestion path.
Both write to the same graph through the same Context Builder.** One pipeline, two
entry points. This is also what makes the architecture score well.

### 1.3 The live demo ritual is physically impossible as written — FIXED

`backend/cognifyService.js:24` — `PIPELINE_TIMEOUT_MS = 480000` with the comment *"real
cognify takes 2-5 min"*. The old plan shows a 4-stage stepper (parse → Nemotron → Tavily →
Cognee → graph) completing live on stage in seconds. **It will hang in front of the judge.**

Fix: Cognee runs **offline, in batch, over the text corpus**. The live intake path does
deterministic graph writes plus one Nemotron call (~25s), and enqueues the cognify job as a
background task whose real status the stepper displays. The stepper stays honest and still
looks great.

### 1.4 Nemotron latency will kill the AI Scout — FIXED

`backend/aiService.js:49` — *"Nemotron emits a visible thinking phase; simple prompts take
25s+"*. The old Scout design chains 4 LLM calls (intent classifier → text2cypher →
reranker rationale → answer). That is **100+ seconds of dead air per query.**

Budget: **one LLM call on the hot path, ever.** Everything else is precomputed or
deterministic:
- Narratives are generated at profile-build time and stored on the node.
- Common query intents hit hand-written parameterized Cypher templates (0 LLM calls, <100ms).
- Per-row match rationale is generated from graph facts by string template, not by an LLM.
- Only genuinely novel questions fall through to text2cypher.

### 1.5 No existence check or disambiguation — FIXED

*"Accuracy and usefulness of answers to open-ended questions, **including existence
checks**"* is a named judging criterion. The old plan had nothing. Judges will probe it with
exactly the trap the dataset plants: two different people both named Shiv Sharma.

We build `find_person` as a first-class resolver: exact → normalized → fuzzy → **ask which
one** → honest "not in the database". Never a hallucinated answer.

### 1.6 Unconstrained text2cypher will hallucinate on stage — FIXED

Template-first routing, schema injected into the prompt, read-only guard that rejects any
generated Cypher containing `CREATE`/`MERGE`/`DELETE`/`SET`/`DROP`, `LIMIT` forced, and a
graceful "I could not answer that reliably" path.

### 1.7 Outreach as `p.status='invited'` loses all history — FIXED

A status column is not a CRM. `(:Person)-[:RECEIVED]->(:OutreachEvent)` gives queryable
history, matches the CSV's `crm_touchpoints`, and lets the agent answer *"who have we
emailed twice with no reply?"* — which is a far better demo than a badge changing colour.

### 1.8 Things I am adding that neither plan had

| Addition | Why it scores |
|---|---|
| **Evidence + confidence per claim** | "Context quality — not just a data dump". Every sentence traces to a source row. |
| **Trajectory / time-awareness** | PS says "behave over time". Rising vs dormant vs lapsed, score series, tech drift. |
| **Claim-vs-evidence gap detection** | Flags the user who *declares* ML but whose GitHub is 90% JS. Nobody else will have this. |
| **Eval harness (25 questions, computed ground truth)** | "Agent quality" becomes a number you can show, not a vibe. |
| **`config/domain.*.json`** | "Could it generalize to other use cases?" — swap in a food-delivery config live. |

---

## 2. Stack — decided, do not relitigate

Keep the existing monorepo exactly as it is. A rewrite is not survivable in 8 hours.

| Layer | Choice | Note |
|---|---|---|
| Backend | **Express (Node, ESM)** — `backend/` | Already has logging, request-id, error nets, deploy |
| LLM | **NVIDIA Nemotron** via `backend/aiService.js` | 5-key rotation already works. ~25s/call — budget for it |
| Graph | **Neo4j AuraDB** via `backend/neo4jService.js` | `runCypherQuery` is generic and ready |
| Semantic | **Cognee** Python sidecar, port 8100 | Batch only, never on the hot path |
| External | **Tavily** — `backend/tavilyService.js` | Does not exist yet. We create it |
| Frontend | **React + Vite** + **Tailwind + shadcn/ui** | Vite stays. We add Tailwind. `lucide-react` already installed |
| Email | **Nodemailer**, Gmail SMTP + Ethereal fallback | Keep — the Ethereal preview idea is genuinely good |

> Earlier in chat I suggested FastAPI + Next.js. **That was before I read the repo — ignore
> it.** Cognee already lives in Python where it belongs; everything else is Node and works.

---

## 3. Do this in the first 5 minutes

```bash
git pull                      # you are 5 commits behind origin/main
```

Then, in parallel, one person:
1. Creates the Neo4j AuraDB instance and puts creds in `backend/.env` **and**
   `services/cognee-service/.env`. Without this everything runs in mock mode.
2. Gets the Tavily API key into `backend/.env`.
3. Runs `GET /api/ai/keys` once to prove the Nemotron pool is alive.

**Security note:** `backend/aiService.js:11-17` has five NVIDIA keys hardcoded as
`DEFAULT_KEYS` and committed to a GitHub repo. Move them to `.env` after the hackathon and
rotate them. Not worth fixing now — just know it.

---

## 4. Timeline — mentor round at T+3:00

Two tracks. **A** = backend/context layer. **B** = frontend. One person each.

| Time | Track A (backend) | Track B (frontend) |
|---|---|---|
| 0:00–0:30 | **P0** Foundation & contracts | reads contract, installs Tailwind (part of P0) |
| 0:30–1:15 | **A1** CSV → Neo4j | **B1** Shell + Database view + drawer (on mocks) |
| 1:15–2:15 | **A2** Context Builder ← *core IP* | **B1** cont. → **B2** AI Scout (on mocks) |
| 2:15–2:45 | **A3** Retrieval + agent v1 | **B2** cont. |
| 2:45–3:00 | **C1** Integration — mocks off, real API on | rehearse together |
| **3:00** | **MENTOR ROUND** | |
| 3:30–4:20 | **C2** Live intake (form + resume + Tavily) | **B3** Intake view + stepper |
| 4:20–5:10 | **C3** Outreach + matchmaking | polish, Playwright pass |
| 5:10–6:00 | **C4** Cognee batch + eval harness | help on C3/C4 |
| 6:00–6:30 | **FEATURE FREEZE** — demo script, cache responses | |
| 6:30–8:00 | Rehearse ×3, record fallback video, deploy | |

### What to show the mentor at T+3:00

Do **not** attempt the full form→email ritual at the mentor round. You will not have it, and
mentors do not expect a finished product at the 3-hour mark. Show instead:

1. 600 real users in the graph, with 2 years of hackathon history.
2. A profile drawer: synthesized narrative + traits + **evidence trail per claim**.
3. The agent answering *"Is Shiv Sharma in our database?"* → **it asks which one**.
4. The agent answering *"Tell me about Ananya — what has she built and how active is she?"*

That is precisely the problem statement, demonstrated. Then say: *"next we're adding live
intake and one-click outreach."* Mentors reward a clear spine over a broad shell.

---

## 5. The contract everything hangs on

Full schema lives in `docs/CONTRACT.md` (generated by P0). Summary:

```
ContextProfile {
  user_id, identity{}, 
  facts{}        // deterministic. Computed by Cypher. NEVER by an LLM.
  skills[]       // {skill, confidence, sources[]}
  traits[]       // {trait, score, evidence[]}
  personas[]     // "Serial Winner", "Dormant High-Potential", ...
  trajectory{}   // direction, score_series[], status: active|dormant|lapsed
  narrative      // LLM. Generated once at build time, stored on the node.
  evidence[]     // {claim, source_type, source_ref, observed_at, confidence}
  engagement{}   // {value, components{recency,frequency,depth,outcome}}
}
```

**The one rule that decides Agent Quality: the LLM never computes a number.** Counts, rates,
dates and rankings come from Cypher. The LLM only narrates values handed to it. This is how
you avoid the failure mode where the agent confidently says "3 hackathons" when it was 7.

---

## 6. Risk register

| Risk | Mitigation |
|---|---|
| AuraDB paused/slow on stage | Keep-alive is already wired. Also: profile JSON snapshot on disk, served if graph is down |
| Nemotron 25s latency | One LLM call max on hot path; narratives precomputed; show a real progress state |
| Cognee cognify hangs | Batch-only, off the hot path, behind a feature flag, never blocks a request |
| Mock graph shows money-laundering data | **P0 replaces `getMockGraph()`** — this would be humiliating on stage |
| Tavily rate limits | Cache every response to `backend/cache/tavily/*.json`, committed |
| CSV generator produces broken FKs | A1 validates and reports before loading anything |
| Real emails to 600 fake addresses | Hard allowlist; default to Ethereal preview mode |

---

## 7. Phase prompts

One file per phase in `docs/phases/`. Open the file, copy the whole thing, paste into a
fresh Claude chat in VS Code.

| File | Track | Depends on |
|---|---|---|
| `P0.md` | both | — |
| `A1.md` | A | P0 |
| `A2.md` | A | A1 |
| `A3.md` | A | A2 |
| `B1.md` | B | P0 |
| `B2.md` | B | B1 |
| `C1.md` | both | A3 + B2 |
| `C2.md` | A | C1 |
| `B3.md` | B | C1 |
| `C3.md` | A | C2 |
| `C4.md` | either | C1 |
