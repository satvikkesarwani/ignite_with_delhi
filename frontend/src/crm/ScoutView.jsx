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
  'Who has won a prize but gone quiet?',
  'Who won the Neo4j track?',
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
  const [totalMatches, setTotalMatches] = useState(null);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [flashingUserId, setFlashingUserId] = useState(null);

  // Drawer & Modal state
  const [drawerUserId, setDrawerUserId] = useState(null);
  const [outreachModalOpen, setOutreachModalOpen] = useState(false);
  const [outreachTemplate, setOutreachTemplate] = useState('hackathon-invite');
  const [outreachBusy, setOutreachBusy] = useState(false);
  const [outreachResult, setOutreachResult] = useState(null);
  const [outreachError, setOutreachError] = useState(null);
  const [openCypherIndex, setOpenCypherIndex] = useState(null);

  // One id for the whole visit: the agent keeps "who we were just talking about" per session.
  const sessionIdRef = useRef(
    `scout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
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

  // Every message goes to the agent. It owns disambiguation, "he/she/they" follow-ups and segment
  // search, and keeps that state per sessionId, so the UI must not answer anything itself.
  const executeQuery = useCallback(
    async (queryText) => {
      const text = queryText.trim();
      if (!text || isLoading) return;

      setInputQuery('');
      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);
      setIsLoading(true);

      try {
        const res = await api('/api/agent/chat', {
          method: 'POST',
          body: { message: text, sessionId: sessionIdRef.current },
        });

        const agentId = `a-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: agentId,
            role: 'agent',
            text: res.answer,
            strategy: res.strategy,
            latency_ms: res.latency_ms ?? 0,
            llm_calls: res.llm_calls ?? 0,
            cypher: res.cypher || null,
            citations: res.citations || [],
            matches: res.matches || res.resolution?.matches || [],
            suggestions: res.suggestions || [],
          },
        ]);
        // The Cypher is the proof for a segment answer, so the newest one opens by itself.
        setOpenCypherIndex(res.cypher ? agentId : null);
        setTableRows(res.table || []);
        setRationaleMap(res.rationale_by_user_id || {});
        setTotalMatches(res.total_matches ?? null);
        setActiveQueryTitle(text);
        setSelectedRowIds(new Set());
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'agent',
            isError: true,
            text: `The agent request failed (${err.path || '/api/agent/chat'}): ${err.message}${
              err.requestId ? ` · request ${err.requestId}` : ''
            }`,
            strategy: 'error',
            latency_ms: 0,
            llm_calls: 0,
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

  const closeOutreach = () => {
    setOutreachModalOpen(false);
    setOutreachError(null);
    setOutreachResult(null);
  };

  const sendOutreach = async () => {
    setOutreachBusy(true);
    setOutreachError(null);
    try {
      const res = await api('/api/crm/outreach', {
        method: 'POST',
        body: { userIds: [...selectedRowIds], template: outreachTemplate },
      });
      setOutreachResult(res);
    } catch (err) {
      setOutreachError(err);
    } finally {
      setOutreachBusy(false);
    }
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
            {tableRows.length > 0
              ? totalMatches && totalMatches > tableRows.length
                ? `top ${tableRows.length} of ${totalMatches} people`
                : `${tableRows.length} ${tableRows.length === 1 ? 'person' : 'people'}`
              : '0 people'}
          </div>
        </div>

        {/* Table Body Area */}
        <div className="flex-1 overflow-y-auto">
          {tableRows.length === 0 && messages.length > 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="max-w-[360px]">
                <div className="crm-num text-[11px] uppercase tracking-[0.12em] text-faint">
                  {isLoading ? 'Working' : 'No rows for this question'}
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                  {isLoading
                    ? 'Waiting for the agent…'
                    : 'The answer is in the conversation on the right. People appear here when a question resolves to one person or a group.'}
                </p>
              </div>
            </div>
          ) : tableRows.length === 0 ? (
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
                  <th className="w-[16%] py-2 px-2 font-medium">Name</th>
                  <th className="w-[11%] py-2 px-2 font-medium">College</th>
                  <th className="w-[14%] py-2 px-2 font-medium">Skills</th>
                  <th className="w-[15%] py-2 px-2 font-medium">Persona</th>
                  <th className="w-[34%] py-2 px-2 font-medium text-accent">Match Reason</th>
                  <th className="w-[10%] py-2 pr-3 pl-1 text-right font-medium">Score</th>
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
                          // The cell also toggles on click; without this a click on the box toggles twice.
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => toggleSelectRow(r.user_id, e)}
                          className="size-3.5 rounded-none border border-border bg-surface accent-accent cursor-pointer"
                          aria-label={`Select ${r.full_name}`}
                        />
                      </td>

                      {/* Name: id under the name so a narrow column never clips either */}
                      <td className="py-1.5 px-2">
                        <div className="flex flex-col leading-tight">
                          <span className="truncate text-[12px] font-medium text-text">
                            {r.full_name?.trim()}
                          </span>
                          <span className="crm-num text-[10px] text-faint">{r.user_id}</span>
                        </div>
                      </td>

                      {/* College */}
                      <td className="py-1.5 px-2 text-[11.5px] leading-tight text-muted">
                        {r.college}
                      </td>

                      {/* Skills */}
                      <td className="py-1.5 px-2">
                        <div className="flex flex-wrap gap-1">
                          {r.top_skills?.slice(0, 2).map((s) => (
                            <span
                              key={s}
                              className="crm-num rounded-sm border border-border px-1 py-px text-[9.5px] text-muted"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Persona */}
                      <td className="py-1.5 px-2">
                        {r.personas?.[0] && (
                          <Badge
                            tone={PERSONA_TONE[r.personas[0]] || 'neutral'}
                            className="text-[9px] px-1 py-px leading-tight whitespace-normal"
                          >
                            {r.personas[0]}
                          </Badge>
                        )}
                      </td>

                      {/* Match Reason: the differentiator column, widest, allowed to wrap */}
                      <td className="py-1.5 px-2">
                        <span
                          className="crm-num line-clamp-3 text-[11px] leading-snug text-text/90"
                          title={rationale}
                        >
                          {rationale || '—'}
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
            messages.map((m) => {
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
              // The agent reports how many LLM calls it made (contract: 0 or 1); show that, not a guess.
              const usedLlm = (m.llm_calls || 0) > 0;
              const latencyLabel =
                m.latency_ms >= 1000
                  ? `${(m.latency_ms / 1000).toFixed(1)}s`
                  : `${Math.round(m.latency_ms || 0)}ms`;
              const isCypherOpen = openCypherIndex === m.id;

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
                            onClick={() =>
                              executeQuery(
                                `Select ${match.full_name} (${match.user_id}) from ${match.college}`
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                executeQuery(
                                  `Select ${match.full_name} (${match.user_id}) from ${match.college}`
                                );
                              }
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
                    {m.strategy && !m.isError && (
                      <span
                        className={cn(
                          'crm-num inline-flex items-center rounded-sm border px-1.5 py-px text-[10px] uppercase font-mono tracking-[0.06em]',
                          usedLlm
                            ? 'border-accent/50 bg-accent/10 text-accent'
                            : 'border-positive/50 bg-positive/10 text-positive'
                        )}
                        title={`strategy: ${m.strategy}`}
                      >
                        {usedLlm ? '1 LLM call' : '0 LLM calls'} · {latencyLabel}
                      </span>
                    )}
                    {m.strategy && !m.isError && (
                      <span className="crm-num font-mono text-[10.5px] text-faint">
                        {m.strategy}
                      </span>
                    )}

                    {m.cypher && (
                      <button
                        type="button"
                        onClick={() => setOpenCypherIndex(isCypherOpen ? null : m.id)}
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

                  {/* Nearest real names when the person is not in the database */}
                  {m.suggestions?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="crm-num text-[10.5px] uppercase tracking-[0.08em] text-faint mr-1">
                        Nearest names, not matches:
                      </span>
                      {m.suggestions.map((s) => (
                        <button
                          key={s.user_id}
                          type="button"
                          onClick={() => setDrawerUserId(s.user_id)}
                          className="rounded-sm border border-border bg-surface/60 px-1.5 py-0.5 text-[11px] text-muted hover:border-accent hover:text-text transition-colors"
                        >
                          {s.full_name} · {s.college}
                        </button>
                      ))}
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
        <div className="border-t border-border bg-surface/30 px-4 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
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

      {/* Outreach modal. The endpoint is a 501 stub for now: say so instead of pretending to send. */}
      {outreachModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-[1px] p-4">
          <div className="w-full max-w-[440px] rounded border border-border bg-surface p-5 text-text space-y-4 shadow-none">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-accent" />
                <h4 className="font-serif text-[16px] font-semibold">Outreach</h4>
              </div>
              <button
                type="button"
                onClick={closeOutreach}
                className="text-muted hover:text-text"
                aria-label="Close outreach"
              >
                <X size={15} />
              </button>
            </div>
            <p className="text-[12.5px] text-muted">
              Prepare invitations for{' '}
              <span className="crm-num text-text font-medium">{selectedRowIds.size}</span> selected{' '}
              {selectedRowIds.size === 1 ? 'person' : 'people'}. Anyone without consent is skipped
              and listed.
            </p>
            <div className="space-y-1.5">
              <label
                htmlFor="outreach-template"
                className="crm-num text-[10.5px] uppercase tracking-[0.1em] text-faint"
              >
                Template
              </label>
              <select
                id="outreach-template"
                value={outreachTemplate}
                onChange={(e) => setOutreachTemplate(e.target.value)}
                disabled={outreachBusy}
                className="w-full h-8 rounded border border-border bg-bg px-2.5 text-[12px] text-text"
              >
                <option value="hackathon-invite">Hackathon invite</option>
                <option value="mentor-invite">Mentor invitation</option>
                <option value="win-back">Win-back</option>
              </select>
            </div>

            {outreachError && (
              <div
                role="alert"
                className="rounded border border-danger/50 bg-danger/10 p-3 text-[12px] text-danger"
              >
                <div className="font-medium">
                  {outreachError.status === 501 ? 'Not available yet' : 'Outreach failed'}
                </div>
                <div className="mt-0.5 text-danger/90">
                  {outreachError.message}
                  {outreachError.requestId ? ` · request ${outreachError.requestId}` : ''}
                </div>
                <div className="mt-1 text-danger/80">Nothing was sent.</div>
              </div>
            )}

            {outreachResult && (
              <div className="rounded border border-border bg-bg p-3 text-[12px] text-text space-y-1">
                <div>
                  <span className="crm-num font-medium">{outreachResult.sent?.length ?? 0}</span>{' '}
                  sent
                </div>
                {outreachResult.skipped?.map((s) => (
                  <div key={s.user_id} className="text-muted">
                    Skipped <span className="crm-num">{s.user_id}</span>: {s.reason}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={closeOutreach}>
                {outreachResult ? 'Close' : 'Cancel'}
              </Button>
              {!outreachResult && (
                <Button variant="default" size="sm" onClick={sendOutreach} disabled={outreachBusy}>
                  {outreachBusy ? 'Sending…' : 'Send'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScoutView;
