🎯 PS-3 FINAL PLAN: "PersonaCRM" — Context Layer + CRM for a Hackathon/Talent Platform
Verdict on your idea: STRONG — approve with 3 refinements (below).
The CRM flow (form + resume → context graph → NL query → table → bulk outreach) is exactly the "downstream application proving the layer is genuinely useful" that the Bonus Points demand — we're building the bonus INTO the core.

1️⃣ USE CASE + CONTEXT DEFINITION (evaluation criterion #1 — we state this upfront)
Platform: A hackathon listing & talent platform (the PS's worked example — meta-authentic since we demo AT a hackathon; recruiters/sponsors are the "organizer-type user").

What "context" means here (our justified source table):

Context type	Source	Signals
Identity	Google Form signup	name, email, phone, city, college
Professional	Resume PDF (uploaded)	education, skills, experience, internships, projects, links
External	Tavily (GitHub/LinkedIn search + extract)	GitHub profile/repos, public presence
Behavioral	platform activity (simulated events)	hackathons participated, submissions, ratings
Trajectory	synthesized	"currently interning", skill trend, lead score
3 refinements to your idea (why they make it stronger):

Dual intake: Google Form (your flow) + our own UI form with PDF upload (demo-reliable fallback — no internet/OAuth risk on stage). Both feed the same pipeline.
Resume parsing via LLM, not regex: PDF→text (pdf-parse) → Nemotron structured extraction → guaranteed JSON (name/education/skills/experience/internships/links). Messy resumes still parse cleanly.
Every person gets a synthesized ContextProfile (the PS's "context layer above the raw database" requirement) — a narrative paragraph built from all signals, stored as (:ContextProfile)-[:ABOUT]->(:Person), plus RawEvent provenance nodes so every context claim traces back to its source signal (synthesized, not a data dump).
2️⃣ COMPLETE FLOW (your idea, end-to-end)

text
Google Form ──► Google Sheet ──► "Sync Sheet" (CRM fetches published CSV)
     │                                   │
 UI Form + Resume PDF upload ───────────┤
                                        ▼
                          RESUME PARSER ENGINE (pdf-parse → Nemotron JSON)
                                        ▼
                          CRM INTAKE → (:Person) + (:Lead) + (:Resume) nodes
                                        ▼
                          CONTEXT BUILDER → Skills/Institution/Company nodes
                          + (:ContextProfile) synthesis per person
                                        ▼
          ┌─────────────────────────────┴──────────────────────┐
          ▼                                                    ▼
 NL QUERY AGENT                                  CRM OUTREACH
 "find students interning now"                   select people → bulk actions:
 → Text2Cypher/GraphRAG → RESULTS TABLE          Gmail invite / certificate / custom
          │                                                    │
          └──MATCHMAKING (bonus): vector similarity──┐         │
                                                     ▼         ▼
                                        teammate suggestions · leads
3️⃣ GRAPH MODEL (PersonaCRM — Neo4j)

text
(:Person {name, email, phone, city, college, source, status})
-[:HAS_SKILL {level, source}]->(:Skill {name})
-[:STUDIED_AT {degree, year}]->(:Institution {name})
-[:INTERNING_AT {role, since}]->(:Company {name})     // "interning right now" query
-[:WORKED_AT {role, duration}]->(:Company)
-[:UPLOADED]->(:Resume {file, parsedChars})
-[:SUBMITTED]->(:FormResponse {ts})
-[:HAS_PROFILE]->(:ContextProfile {text, builtAt, signalsCount})
(:Lead {score, status: 'new|contacted|invited|converted', capturedAt})-[:ABOUT]->(:Person)
(:RawEvent {source: 'form|resume|tavily', ts, payload})-[:ABOUT]->(:Person)
Demo query mapping: "find students doing internships right now" → MATCH (p:Person)-[:INTERNING_AT]->(c:Company) WHERE p.college CONTAINS 'Institute' ... Text2Cypher generates this from NL — results land in the side table.

4️⃣ NEW BUILD (backend — on existing stack)
#	Component	Details	Est
N1	PDF intake + parser	multer for uploads → pdf-parse (pure JS) → text → Nemotron structured extraction (JSON: name/education/skills/experience/internships/links) → backend/resumeParser.js	60 min
N2	CRM service	backend/crmService.js: intake (form JSON + resume) → Person/Lead/RawEvent graph writes → ContextProfile synthesis (Nemotron) → lead scoring (skills × activity)	60 min
N3	Context agent	POST /api/brain/ask { question } → existence check (fuzzy Person match: "Is Shiv in our database?") → context assembly → grounded synthesis + memory trail (U1 reuse)	45 min
N4	Segment query	POST /api/crm/segment { question } → Text2Cypher (U3) → person records → returns rows for the side table	30 min
N5	Outreach engine	nodemailer + Gmail App Password; templates: hackathon-invite / certificate / custom; POST /api/crm/outreach { personIds, template } bulk send + status updates	45 min
N6	Google Sheet sync	POST /api/crm/sync-sheet { url } → fetch published-sheet CSV → intake each row (same pipeline as N2, minus resume)	30 min
N7	Matchmaking (bonus)	GET /api/crm/match/:personId → user context embeddings (U2 infra) → ranked similar/complementary people	40 min
N8	Certificate PDF (stretch)	pdfkit templated certificate per person	30 min (optional)
5️⃣ FRONTEND — new "🗂️ Context CRM" tab (the side-screen table)
Onboard card: mini form + PDF upload → parse preview (extracted JSON shown!) → "Add to CRM"
Ask bar: NL question → POST /api/crm/segment → results table (checkbox rows)
Bulk actions bar: "📧 Invite to Hackathon" / "🎓 Send Certificate" / "✉️ Custom" → status flips to contacted/invited
Leads panel: scored lead list + capture status
Ask-the-Brain console: existence check + open-ended Q&A (uses U1/U3 patterns)
Est: 90 min. Reuses existing studio CSS patterns.
6️⃣ DEMO SCRIPT (3 min — mapped to evaluation criteria)
Use-case clarity (30s): "Platform: hackathon talent platform. Context = form + resume
GitHub + activity. Raw DB is a silo; we build the layer above it — per-person synthesized profiles."
Magic moment (60s): upload a resume PDF LIVE → parser extracts structured JSON on screen → "Add to CRM" → context graph grows → ContextProfile paragraph generated.
Agent quality (60s): "Is Aarav in our database? What do we know about him?" → synthesized answer citing sources → "find students doing internships right now" → side table appears → select all → send hackathon invites via Gmail → show sent mail.
Bonus (30s): matchmaking suggestions + lead leaderboard. "The context layer isn't a data pipeline — it's a CRM, a matchmaker, and an auditable memory."
7️⃣ EXECUTION ORDER (start on approval — total ~6 hrs)
N1+U5-verify: parser + intake + first person in graph (45 min) — test with YOUR real resume
N2 context builder + N3 agent (60 min)
N4 segment + N5 outreach (60 min) — Gmail App Password needed from you (Google account → 2FA → App Password; fallback = Ethereal SMTP demo inbox)
N6 sheet sync + N7 matchmaking (60 min)
Frontend CRM tab (90 min)
Docs (API_DOCS section 10) + rehearsal + push (45 min)
Commit checkpoints after each phase — CI stays green throughout.

8️⃣ RISKS & MITIGATIONS
Risk	Mitigation
Gmail App Password setup friction	Do it TONIGHT; fallback Ethereal SMTP (emails viewable in demo inbox)
Resume PDF parsing quality varies	LLM-based extraction handles messy text; demo PDF = clean one-page resume
Google Form live dependency	Dual intake (UI form primary); Sheet sync pre-tested before demo
Tavily key still missing	Tavily enrichment is optional in flow (resume covers professional context); GitHub via Tavily only if key arrives
Time overrun	Cut order: N7 matchmaking → N8 certificates → N6 sheet sync (UI intake covers the demo)
9️⃣ REQUIREMENTS CHECKLIST (PS-3 mapping)
 Use case + context definition justified → talent platform, 5 source types (§1)
 Ingest relevant context → form + resume + Tavily/GitHub + activity (N1/N2/N6)
 Context layer ABOVE raw DB → ContextProfile synthesis + RawEvent provenance (N2)
 Conversational agent with existence check + open-ended Q&A (N3)
 Generalizable design → contextSchema config, use-case-agnostic builder (N2)
 BONUS matchmaking (N7) + downstream CRM app (N5 — the whole outreach engine)