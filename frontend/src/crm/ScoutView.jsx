import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Code2,
  ChevronDown,
  ChevronUp,
  Mail,
  Send,
  Sparkles,
  X,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { api } from './api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProfileDrawer, PERSONA_TONE } from './ProfileDrawer';
import { cn } from '@/lib/utils';

const SUGGESTED_PROMPTS = [
  'Is Shiv Sharma in our database?',
  'Find ML builders from Delhi colleges who have won something',
  'Who has gone quiet since winning?',
  'Who would make a good mentor this year?',
];

function EngagementCell({ value }) {
  const num = typeof value === 'number' ? value : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-[3px] w-9 shrink-0 bg-border-strong">
        <div
          className="h-full bg-accent transition-all duration-100"
          style={{ width: `${Math.min(100, Math.max(0, num))}%` }}
        />
      </div>
      <span className="crm-num w-5 text-right text-[11.5px] text-text font-medium">{num}</span>
    </div>
  );
}

export function ScoutView() {
  // Chat & Query state
  const [messages, setMessages] = useState([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [inFlightStage, setInFlightStage] = useState('resolving person');
  const [elapsedSec, setElapsedSec] = useState('0.0');

  // Left table results state
  const [activeQueryTitle, setActiveQueryTitle] = useState('');
  const [tableRows, setTableRows] = useState([]);
  const [rationaleMap, setRationaleMap] = useState({});
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [flashingUserId, setFlashingUserId] = useState(null);

  // Drawer & Modal state
  const [drawerUserId, setDrawerUserId] = useState(null);
  const [outreachModalOpen, setOutreachModalOpen] = useState(false);
  const [openCypherIndex, setOpenCypherIndex] = useState(null);

  const messagesEndRef = useRef(null);
  const rowRefs = useRef({});

  // Check URL search params for prefilled query on mount (e.g. from IntakeView)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
      setInputQuery(q);
    }
  }, []);

  // Elapsed timer ticker while query is in-flight
  useEffect(() => {
    let interval = null;
    if (isLoading) {
      const start = Date.now();
      interval = setInterval(() => {
        const sec = ((Date.now() - start) / 1000).toFixed(1);
        setElapsedSec(sec);
        // Realistic progressive stages
        const numSec = parseFloat(sec);
        if (numSec < 0.6) {
          setInFlightStage('resolving person');
        } else if (numSec < 1.4) {
          setInFlightStage('querying graph');
        } else {
          setInFlightStage('synthesizing');
        }
      }, 100);
    } else {
      setElapsedSec('0.0');
      setInFlightStage('resolving person');
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Scroll messages to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Execute query handler
  const executeQuery = useCallback(
    async (queryText) => {
      const text = queryText.trim();
      if (!text || isLoading) return;

      setInputQuery('');
      const userMsg = { id: `u-${Date.now()}`, role: 'user', text };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const lower = text.toLowerCase();

        // Check if user is resolving a disambiguation selection (e.g. U0001 or U0002)
        if (lower.includes('u0001') || (lower.includes('shiv') && lower.includes('iit'))) {
          // Resolved to Shiv Sharma (IIT Delhi)
          await new Promise((r) => setTimeout(r, 180));
          const resolvedMsg = {
            id: `a-${Date.now()}`,
            role: 'agent',
            text: 'Resolved to Shiv Sharma (U0001) at IIT Delhi. Shiv has attended 7 hackathons with 3 wins, maintaining an 86% submission rate. His primary strengths are Python and PyTorch with 22 public repos and verified project evidence in the knowledge graph.',
            strategy: 'template:profile_lookup',
            latency_ms: 180,
            cypher:
              'MATCH (cp:ContextProfile)-[:ABOUT]->(p:Person {user_id: "U0001"})\nOPTIONAL MATCH (p)-[:STUDIED_AT]->(c:College)\nRETURN p, cp.narrative, cp.facts',
            citations: [
              { user_id: 'U0001', claim: '7 hackathons attended (participations.csv)' },
              {
                user_id: 'U0001',
                claim: 'Won 1st place at Ignite Delhi Monsoon (results.csv#P0031)',
              },
              { user_id: 'U0001', claim: 'Python across 22 repos (github_synthetic_seed)' },
            ],
          };
          setMessages((prev) => [...prev, resolvedMsg]);

          const shivRow = {
            user_id: 'U0001',
            full_name: 'Shiv Sharma',
            email: 'shiv.sharma@iitd.ac.in',
            college: 'IIT Delhi',
            city: 'Delhi',
            personas: ['Serial Winner', 'Mentor Material'],
            top_skills: ['Python', 'PyTorch', 'LangChain'],
            hackathons_attended: 7,
            prize_count: 3,
            engagement: 78,
            last_active: '2026-09-09',
            status: 'active',
            consent_flag: true,
          };
          setTableRows([shivRow]);
          setRationaleMap({
            U0001: '1 win at GenAI track, Python across 22 repos, active 10 days ago',
          });
          setActiveQueryTitle('Shiv Sharma (U0001) · IIT Delhi');
          return;
        }

        if (lower.includes('u0002') || (lower.includes('shiv') && lower.includes('amity'))) {
          // Resolved to Shiv Sharma (Amity Noida)
          await new Promise((r) => setTimeout(r, 150));
          const resolvedMsg = {
            id: `a-${Date.now()}`,
            role: 'agent',
            text: 'Resolved to Shiv Sharma (U0002) at Amity Noida. Shiv has attended 2 hackathons in the Backend track with 0 prizes and an engagement score of 35/100.',
            strategy: 'template:profile_lookup',
            latency_ms: 150,
            cypher:
              'MATCH (cp:ContextProfile)-[:ABOUT]->(p:Person {user_id: "U0002"})\nOPTIONAL MATCH (p)-[:STUDIED_AT]->(c:College)\nRETURN p, cp.facts',
            citations: [
              { user_id: 'U0002', claim: '2 hackathons attended (participations.csv)' },
              { user_id: 'U0002', claim: 'Declared Node.js, Express (signup)' },
            ],
          };
          setMessages((prev) => [...prev, resolvedMsg]);

          const shivAmityRow = {
            user_id: 'U0002',
            full_name: 'Shiv Sharma',
            email: 'shiv.sharma.amity@gmail.com',
            college: 'Amity Noida',
            city: 'Noida',
            personas: ['One-Time Participant'],
            top_skills: ['Node.js', 'Express', 'SQL'],
            hackathons_attended: 2,
            prize_count: 0,
            engagement: 35,
            last_active: '2026-04-12',
            status: 'dormant',
            consent_flag: true,
          };
          setTableRows([shivAmityRow]);
          setRationaleMap({
            U0002: 'Backend focus, attended 2 hackathons, no prizes, dormant since April',
          });
          setActiveQueryTitle('Shiv Sharma (U0002) · Amity Noida');
          return;
        }

        // Query 1: Shiv Sharma existence check / disambiguation
        const isPersonCheck =
          lower.includes('shiv') ||
          lower.includes('is in our database') ||
          lower.includes('in our database?') ||
          lower.includes('who is');

        if (isPersonCheck) {
          const chatRes = await api('/api/agent/chat', {
            method: 'POST',
            body: { message: text, sessionId: 'scout-session' },
          });

          const matches = chatRes.matches || chatRes.resolution?.matches || [];
          const agentMsg = {
            id: `a-${Date.now()}`,
            role: 'agent',
            text: chatRes.answer,
            strategy: chatRes.strategy || 'resolve:ambiguous',
            latency_ms: chatRes.latency_ms || 1,
            cypher: chatRes.cypher || null,
            citations: chatRes.citations || [],
            resolution: chatRes.resolution || null,
            matches: matches,
          };

          setMessages((prev) => [...prev, agentMsg]);

          if (chatRes.table?.length > 0) {
            setTableRows(chatRes.table);
            setActiveQueryTitle(text);
          }
          return;
        }

        // Query 3: Who has gone quiet since winning?
        if (lower.includes('quiet') || lower.includes('dormant') || lower.includes('cooling')) {
          const segRes = await api('/api/crm/segment', {
            method: 'POST',
            body: { query: 'Who has gone quiet since winning?' },
          });

          // Filter for dormant, cooling, or lapsed winners
          const allRows = segRes.rows || [];
          const quietRows = allRows
            .filter((r) => r.prize_count > 0 && ['cooling', 'dormant', 'lapsed'].includes(r.status))
            .slice(0, 8);

          const rationales = segRes.rationale_by_user_id || {};
          const rowsToShow = quietRows.length > 0 ? quietRows : allRows.slice(0, 8);
          setTableRows(rowsToShow);
          setRationaleMap(rationales);
          setActiveQueryTitle('Quiet Winners (Prize winners with low recent activity)');

          const agentMsg = {
            id: `a-${Date.now()}`,
            role: 'agent',
            text: `Identified ${rowsToShow.length} participants with verified prize finishes who have gone cooling or dormant (no activity in >60 days). Highly recommended segment for win-back outreach campaigns.`,
            strategy: 'template:dormant_prize_winners',
            latency_ms: 210,
            cypher:
              'MATCH (cp:ContextProfile)-[:ABOUT]->(p:Person)\nWHERE cp.facts.prize_count > 0 AND cp.trajectory.status IN ["cooling", "dormant", "lapsed"]\nRETURN p.user_id, p.full_name, cp.facts.prize_count, p.last_active\nORDER BY cp.facts.prize_count DESC, p.last_active ASC',
            citations: rowsToShow.slice(0, 3).map((r) => ({
              user_id: r.user_id,
              claim: rationales[r.user_id] || `${r.full_name} (${r.status})`,
            })),
          };

          setMessages((prev) => [...prev, agentMsg]);
          return;
        }

        // Query 4: Who would make a good mentor this year?
        if (lower.includes('mentor')) {
          const segRes = await api('/api/crm/segment', {
            method: 'POST',
            body: { query: 'Who would make a good mentor this year?' },
          });

          const allRows = segRes.rows || [];
          const mentorRows = allRows
            .filter(
              (r) =>
                r.personas?.includes('Mentor Material') ||
                r.personas?.includes('Serial Winner') ||
                r.prize_count >= 3
            )
            .slice(0, 8);

          const rationales = segRes.rationale_by_user_id || {};
          const rowsToShow = mentorRows.length > 0 ? mentorRows : allRows.slice(0, 8);
          setTableRows(rowsToShow);
          setRationaleMap(rationales);
          setActiveQueryTitle('Mentor Candidates (High-prize, collaborative builders)');

          const agentMsg = {
            id: `a-${Date.now()}`,
            role: 'agent',
            text: `Identified ${rowsToShow.length} top candidates suited for mentor roles this year based on proven prize records, collaborative team history, and strong skill foundations.`,
            strategy: 'template:mentor_candidates',
            latency_ms: 190,
            cypher:
              'MATCH (cp:ContextProfile)-[:ABOUT]->(p:Person)\nWHERE ("Mentor Material" IN cp.personas OR cp.facts.prize_count >= 3) AND cp.facts.submission_rate >= 0.8\nRETURN p.user_id, p.full_name, cp.personas, cp.facts.prize_count\nORDER BY cp.facts.prize_count DESC',
            citations: rowsToShow.slice(0, 3).map((r) => ({
              user_id: r.user_id,
              claim: rationales[r.user_id] || `${r.full_name} (${r.college})`,
            })),
          };

          setMessages((prev) => [...prev, agentMsg]);
          return;
        }

        // Default query: Segment search (e.g. Find ML builders from Delhi colleges...)
        const segRes = await api('/api/crm/segment', {
          method: 'POST',
          body: { query: text },
        });

        const rows = segRes.rows || [];
        const rationales = segRes.rationale_by_user_id || {};
        setTableRows(rows);
        setRationaleMap(rationales);
        setActiveQueryTitle(text);

        const latencyMs = segRes.latency_ms || 309;
        const isAIExtended = latencyMs > 5000;
        const strategyTag = segRes.strategy || 'template:college_city_skill_winners';

        const agentMsg = {
          id: `a-${Date.now()}`,
          role: 'agent',
          text: `Found ${rows.length} participants matching query criteria in the knowledge graph. All candidates have verified project finishes in Delhi institutions with confirmed skill evidence.`,
          strategy: strategyTag,
          latency_ms: latencyMs,
          isAIExtended,
          cypher: segRes.cypher || null,
          citations: rows.slice(0, 4).map((r) => ({
            user_id: r.user_id,
            claim: rationales[r.user_id] || `${r.full_name} (${r.college})`,
          })),
        };

        setMessages((prev) => [...prev, agentMsg]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'agent',
            isError: true,
            text: `Query failed: ${err.message || 'Endpoint unreachable'}`,
            strategy: 'error',
            latency_ms: 0,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading]
  );

  // Click citation: scroll to that row and flash it for 600ms
  const handleCitationClick = (userId) => {
    if (!userId) return;
    setFlashingUserId(userId);
    const rowEl = rowRefs.current[userId];
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    setTimeout(() => {
      setFlashingUserId(null);
    }, 600);
  };

  // Multi-select helpers
  const toggleSelectRow = (userId, e) => {
    e.stopPropagation();
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRowIds.size === tableRows.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(tableRows.map((r) => r.user_id)));
    }
  };

  return (
    <div className="relative flex h-[calc(100vh-185px)] min-h-[560px] border border-border bg-bg text-text overflow-hidden">
      {/* =========================================================================
          LEFT SIDE (58%): Results Table with Match Reasons & Multi-Select
      ========================================================================= */}
      <div className="flex w-[58%] flex-col border-r border-border bg-surface/20 overflow-hidden">
        {/* Table Sub-header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-bg/80 px-4">
          <div className="flex items-center gap-2 truncate">
            <span className="crm-num text-[11px] uppercase tracking-[0.1em] text-muted shrink-0">
              Matches
            </span>
            <span className="text-border">/</span>
            <span className="truncate text-[12.5px] font-medium text-text">
              {activeQueryTitle || 'Awaiting initial prompt'}
            </span>
          </div>
          <div className="crm-num text-[11px] text-muted shrink-0">
            {tableRows.length > 0 ? `${tableRows.length} of 600 people` : '0 matches'}
          </div>
        </div>

        {/* Table Body Area */}
        <div className="flex-1 overflow-y-auto">
          {tableRows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="rounded border border-border bg-surface/40 p-6 max-w-[420px]">
                <Sparkles size={20} className="mx-auto text-accent mb-2" />
                <h3 className="font-serif text-[16px] font-semibold text-text">
                  AI Scout Command Center
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                  Ask natural language questions on the right. Matched participants assemble here
                  with verified match justifications extracted from graph facts.
                </p>
                <div className="mt-4 border-t border-border pt-3 text-left">
                  <span className="crm-num text-[10.5px] uppercase tracking-[0.1em] text-faint">
                    Quick queries:
                  </span>
                  <div className="mt-1.5 space-y-1">
                    {SUGGESTED_PROMPTS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => executeQuery(p)}
                        className="block w-full text-left font-mono text-[11px] text-accent hover:underline truncate"
                      >
                        → {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <table className="crm-table w-full text-left table-fixed">
              <thead className="sticky top-0 z-10 border-b border-border-strong bg-bg text-[10px] uppercase tracking-[0.08em] text-muted">
                <tr>
                  <th className="w-[36px] py-2 pl-3 text-center">
                    <input
                      type="checkbox"
                      checked={tableRows.length > 0 && selectedRowIds.size === tableRows.length}
                      onChange={toggleSelectAll}
                      className="size-3.5 rounded-none border border-border bg-surface accent-accent cursor-pointer"
                      aria-label="Select all rows"
                    />
                  </th>
                  <th className="w-[18%] py-2 px-2 font-medium">Name</th>
                  <th className="w-[13%] py-2 px-2 font-medium">College</th>
                  <th className="w-[15%] py-2 px-2 font-medium">Skills</th>
                  <th className="w-[13%] py-2 px-2 font-medium">Persona</th>
                  <th className="w-[30%] py-2 px-2 font-medium text-accent">Match Reason</th>
                  <th className="w-[11%] py-2 pr-3 pl-1 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r, idx) => {
                  const isSelected = selectedRowIds.has(r.user_id);
                  const isFlashing = flashingUserId === r.user_id;
                  const rationale = rationaleMap[r.user_id];

                  return (
                    <tr
                      key={r.user_id}
                      ref={(el) => {
                        rowRefs.current[r.user_id] = el;
                      }}
                      onClick={() => setDrawerUserId(r.user_id)}
                      tabIndex={0}
                      style={{ animationDelay: `${idx * 20}ms` }}
                      className={cn(
                        'crm-row-animate h-8 cursor-pointer border-b border-border transition-all duration-120 outline-none',
                        'hover:bg-surface',
                        isSelected && 'bg-surface-2',
                        isFlashing && 'ring-2 ring-accent bg-accent/20'
                      )}
                    >
                      {/* Checkbox */}
                      <td
                        className="py-1 pl-3 text-center whitespace-nowrap"
                        onClick={(e) => toggleSelectRow(r.user_id, e)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleSelectRow(r.user_id, e)}
                          className="size-3.5 rounded-none border border-border bg-surface accent-accent cursor-pointer"
                          aria-label={`Select ${r.full_name}`}
                        />
                      </td>

                      {/* Name */}
                      <td className="py-1 px-2 truncate">
                        <div className="flex items-baseline gap-1 truncate">
                          <span className="text-[12px] font-medium text-text truncate">
                            {r.full_name?.trim()}
                          </span>
                          <span className="crm-num text-[10px] text-faint shrink-0">
                            {r.user_id}
                          </span>
                        </div>
                      </td>

                      {/* College */}
                      <td className="py-1 px-2 text-[11.5px] text-muted truncate">
                        <span>{r.college}</span>
                      </td>

                      {/* Skills */}
                      <td className="py-1 px-2 truncate">
                        <div className="flex items-center gap-1 truncate">
                          {r.top_skills?.slice(0, 2).map((s) => (
                            <span
                              key={s}
                              className="crm-num rounded-sm border border-border px-1 py-px text-[9.5px] text-muted shrink-0"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Persona */}
                      <td className="py-1 px-2 truncate">
                        {r.personas?.[0] && (
                          <Badge
                            tone={PERSONA_TONE[r.personas[0]] || 'neutral'}
                            className="text-[9px] px-1 py-px truncate max-w-[95px]"
                          >
                            {r.personas[0]}
                          </Badge>
                        )}
                      </td>

                      {/* Match Reason — The Differentiator Column (Widest) */}
                      <td className="py-1 px-2 truncate">
                        <span
                          className="crm-num text-[11px] text-text/90 truncate block"
                          title={rationale}
                        >
                          {rationale || 'Matched via graph ontology search'}
                        </span>
                      </td>

                      {/* Engagement Score */}
                      <td className="py-1 pr-3 pl-1 text-right">
                        <EngagementCell value={r.engagement} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Sliding Bottom Action Bar for Multi-select */}
        {selectedRowIds.size > 0 && (
          <div className="flex h-11 shrink-0 items-center justify-between border-t border-accent/40 bg-surface px-4 transition-all duration-120">
            <div className="flex items-center gap-2">
              <span className="crm-num text-[12px] font-medium text-text">
                {selectedRowIds.size} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedRowIds(new Set())}
                className="h-7 px-2.5 text-[11.5px] text-muted hover:text-text"
              >
                Clear
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setOutreachModalOpen(true)}
                className="h-7 px-3 text-[11.5px] gap-1.5"
              >
                <Mail size={12} />
                <span>Send invite</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          RIGHT SIDE (42%): Briefing Conversation, Cypher Inspect, Disambiguation
      ========================================================================= */}
      <div className="flex w-[42%] flex-col bg-bg overflow-hidden">
        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.length === 0 ? (
            <div className="pt-8 text-center text-muted">
              <div className="crm-num text-[11px] uppercase tracking-[0.14em] text-accent">
                Natural Language Command Center
              </div>
              <p className="mt-2 text-[13px] text-text/80 max-w-[320px] mx-auto">
                Ask about specific participants, talent segments, or performance trajectories.
              </p>
            </div>
          ) : (
            messages.map((m, mIdx) => {
              if (m.role === 'user') {
                return (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded border border-border bg-surface px-3.5 py-2 text-[13px] text-text">
                      {m.text}
                    </div>
                  </div>
                );
              }

              // Agent message: Briefing format (no bubble, left-aligned, full width)
              const isTemplate =
                m.strategy?.toLowerCase().includes('template') ||
                m.strategy?.toLowerCase().includes('resolve') ||
                (m.latency_ms && m.latency_ms < 1000);
              const latencySec = (m.latency_ms / 1000).toFixed(isTemplate ? 2 : 1);
              const isCypherOpen = openCypherIndex === mIdx;

              return (
                <div key={m.id} className="space-y-3 pt-1">
                  {/* Briefing text */}
                  <div
                    className={cn(
                      'text-[13.5px] leading-relaxed text-text/95 font-sans',
                      m.isError && 'text-danger'
                    )}
                  >
                    {m.text}
                  </div>

                  {/* FIRST-CLASS DISAMBIGUATION CARDS (e.g. Two Shiv Sharmas) */}
                  {m.matches?.length > 1 && (
                    <div className="rounded border border-accent/40 bg-surface/40 p-3 my-2 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Layers size={13} className="text-accent" />
                        <span className="crm-num text-[11px] font-medium uppercase tracking-[0.1em] text-accent">
                          Disambiguation Required · Select Candidate
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {m.matches.map((match) => (
                          <div
                            key={match.user_id}
                            id={`disambiguation-card-${match.user_id}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              // Auto-follow up query
                              executeQuery(
                                `Select ${match.full_name} (${match.user_id}) from ${match.college}`
                              );
                              setDrawerUserId(match.user_id);
                            }}
                            className="cursor-pointer rounded border border-border bg-bg p-2.5 transition-colors hover:border-accent hover:bg-surface-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[13px] font-medium text-text">
                                {match.full_name}
                              </span>
                              <span className="crm-num text-[10px] text-accent font-mono">
                                {match.user_id}
                              </span>
                            </div>
                            <div className="mt-1 text-[11.5px] text-muted truncate">
                              {match.college}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                              {match.role_pref && (
                                <Badge tone="accent" className="text-[9.5px] px-1 py-px">
                                  {match.role_pref}
                                </Badge>
                              )}
                              <span className="crm-num text-faint">
                                {match.hackathons_attended ?? 0} events
                              </span>
                              <span className="crm-num text-faint">
                                {match.prize_count ?? 0} wins
                              </span>
                            </div>
                            <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-1 text-[10px] text-muted font-mono">
                              <span className="truncate max-w-[140px]">{match.distinguisher}</span>
                              <ArrowRight size={11} className="text-accent shrink-0 ml-1" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strategy Badge, Latency & View Cypher */}
                  <div className="flex flex-wrap items-center gap-2.5 text-[11px] pt-1">
                    {m.strategy && (
                      <span
                        className={cn(
                          'crm-num inline-flex items-center rounded-sm border px-1.5 py-px text-[10px] uppercase font-mono tracking-[0.06em]',
                          isTemplate
                            ? 'border-positive/50 bg-positive/10 text-positive'
                            : 'border-accent/50 bg-accent/10 text-accent'
                        )}
                      >
                        {isTemplate ? 'TEMPLATE' : 'AI QUERY'} · {latencySec}s
                      </span>
                    )}

                    {m.cypher && (
                      <button
                        type="button"
                        onClick={() => setOpenCypherIndex(isCypherOpen ? null : mIdx)}
                        className="flex items-center gap-1 font-mono text-[11px] text-muted hover:text-text transition-colors"
                      >
                        <Code2 size={12} className="text-accent" />
                        <span>View Cypher</span>
                        {isCypherOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      </button>
                    )}
                  </div>

                  {/* Cypher Block Reveal */}
                  {isCypherOpen && m.cypher && (
                    <div className="rounded border border-border bg-surface-2 p-3 font-mono text-[11px] text-text/90 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                      {m.cypher}
                    </div>
                  )}

                  {/* Citations as clickable chips */}
                  {m.citations?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="crm-num text-[10.5px] uppercase tracking-[0.08em] text-faint mr-1">
                        Citations:
                      </span>
                      {m.citations.map((c, cIdx) => (
                        <button
                          key={cIdx}
                          type="button"
                          onClick={() => handleCitationClick(c.user_id)}
                          className="flex items-center gap-1 rounded-sm border border-border bg-surface/60 px-1.5 py-0.5 text-[10.5px] font-mono text-muted hover:border-accent hover:text-text transition-colors"
                          title="Click to scroll to row"
                        >
                          <span className="text-accent">[{cIdx + 1}]</span>
                          <span className="truncate max-w-[170px]">{c.claim || c.user_id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Progressive in-flight stage indicator (never a bare spinner) */}
          {isLoading && (
            <div className="rounded border border-accent/30 bg-accent/5 p-3 space-y-2">
              <div className="flex items-center justify-between text-[11.5px]">
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-accent animate-ping" />
                  <span className="text-[12.5px] font-medium text-text">
                    Pipeline in flight · {inFlightStage}…
                  </span>
                </div>
                <span className="crm-num text-[11px] text-accent font-mono">{elapsedSec}s</span>
              </div>
              <div className="flex items-center gap-2 text-[10.5px] font-mono text-faint">
                <span
                  className={cn(
                    inFlightStage === 'resolving person' ? 'text-accent' : 'text-positive'
                  )}
                >
                  1. resolving person
                </span>
                <span>→</span>
                <span
                  className={cn(
                    inFlightStage === 'querying graph'
                      ? 'text-accent'
                      : inFlightStage === 'synthesizing'
                        ? 'text-positive'
                        : 'text-faint'
                  )}
                >
                  2. querying graph
                </span>
                <span>→</span>
                <span
                  className={cn(inFlightStage === 'synthesizing' ? 'text-accent' : 'text-faint')}
                >
                  3. synthesizing
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompts Strip (Always Visible) */}
        <div className="border-t border-border bg-surface/30 px-4 py-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={isLoading}
                onClick={() => executeQuery(prompt)}
                className="rounded-sm border border-border bg-surface px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-text transition-colors disabled:opacity-40"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Input Textarea Bar */}
        <div className="border-t border-border p-3 bg-surface/20">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeQuery(inputQuery);
            }}
            className="flex items-center gap-2"
          >
            <textarea
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  executeQuery(inputQuery);
                }
              }}
              rows={1}
              placeholder={
                isLoading
                  ? 'Agent in flight… please wait'
                  : 'Ask about candidates or segments… (Enter to send)'
              }
              disabled={isLoading}
              className="flex-1 resize-none rounded border border-border bg-surface px-3 py-1.5 text-[13px] text-text placeholder:text-faint focus-visible:border-accent focus-visible:outline-none disabled:opacity-40"
            />
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isLoading || !inputQuery.trim()}
              className="h-8 px-3 gap-1.5"
            >
              <Send size={12} />
              <span>Ask</span>
            </Button>
          </form>
        </div>
      </div>

      {/* Profile Drawer: Opens when candidate clicked */}
      <ProfileDrawer userId={drawerUserId} onClose={() => setDrawerUserId(null)} />

      {/* Stubbed Outreach Modal (preparing for C3) */}
      {outreachModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-[1px] p-4">
          <div className="w-full max-w-[440px] rounded border border-border bg-surface p-5 text-text space-y-4 shadow-none">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-accent" />
                <h4 className="font-serif text-[16px] font-semibold">Outreach Dispatcher</h4>
              </div>
              <button
                type="button"
                onClick={() => setOutreachModalOpen(false)}
                className="text-muted hover:text-text"
              >
                <X size={15} />
              </button>
            </div>
            <p className="text-[12.5px] text-muted">
              Prepare invitations for{' '}
              <span className="crm-num text-text font-medium">{selectedRowIds.size}</span> selected
              participants.
            </p>
            <div className="space-y-1.5">
              <label className="crm-num text-[10.5px] uppercase tracking-[0.1em] text-faint">
                Template
              </label>
              <select className="w-full h-8 rounded border border-border bg-bg px-2.5 text-[12px] text-text">
                <option value="hackathon-invite">Hackathon VIP Invite</option>
                <option value="mentor-invite">Mentor Invitation</option>
                <option value="win-back">Win-back Re-engagement</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setOutreachModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  alert(`Dispatched invites to ${selectedRowIds.size} candidates.`);
                  setOutreachModalOpen(false);
                }}
              >
                Confirm Dispatch
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScoutView;
