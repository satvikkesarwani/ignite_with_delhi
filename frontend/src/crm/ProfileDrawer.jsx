import { useEffect, useState, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { api } from './api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const PERSONA_TONE = {
  'Serial Winner': 'accent',
  'Rising Star': 'positive',
  'Mentor Material': 'positive',
  'Consistent Builder': 'positive',
  'Steady Participant': 'neutral',
  'Dormant High-Potential': 'warning',
  'Starter, Not Finisher': 'warning',
  'One-Time Participant': 'neutral',
  Newcomer: 'neutral',
  'Registered, Never Attended': 'warning',
  Ghost: 'danger',
};

export const STATUS_TONE = {
  active: 'positive',
  cooling: 'warning',
  dormant: 'warning',
  lapsed: 'danger',
};

/** Hand-written bare inline SVG sparkline for score_series (no libraries, ~48px tall, ochre) */
function ScoreSparkline({ series }) {
  const width = 360;
  const height = 48;
  const padX = 8;
  const padY = 8;

  const points = useMemo(() => {
    if (!series || series.length === 0) return [];
    if (series.length === 1) {
      const y = height / 2;
      return [
        { x: padX, y, score: series[0].score, date: series[0].date },
        { x: width - padX, y, score: series[0].score, date: series[0].date },
      ];
    }
    return series.map((pt, i) => {
      const x = padX + (i / (series.length - 1)) * (width - 2 * padX);
      const s = Math.max(0, Math.min(100, pt.score ?? 50));
      const y = height - padY - (s / 100) * (height - 2 * padY);
      return { x, y, score: pt.score, date: pt.date, projectId: pt.project_id };
    });
  }, [series]);

  if (!series || series.length === 0) {
    return (
      <div className="crm-num flex h-12 items-center text-[12px] text-faint">
        No score series available
      </div>
    );
  }

  const pointsStr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-12 w-full overflow-visible"
        aria-label="Score trajectory sparkline"
      >
        <polyline
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pointsStr}
        />
        {points.map((pt, i) => (
          <g key={i}>
            <circle
              cx={pt.x}
              cy={pt.y}
              r="2.5"
              fill="var(--bg)"
              stroke="var(--accent)"
              strokeWidth="1.5"
            />
          </g>
        ))}
      </svg>
      <div className="crm-num mt-1 flex justify-between text-[10.5px] text-faint">
        <span>{series[0]?.date || 'First'}</span>
        <span>Best: {Math.max(...series.map((s) => s.score || 0))} pts</span>
        <span>{series[series.length - 1]?.date || 'Latest'}</span>
      </div>
    </div>
  );
}

export function ProfileDrawer({ userId, onClose, initialProfile }) {
  const [fetchedProfile, setFetchedProfile] = useState(null);
  const [error, setError] = useState(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [expandedSkill, setExpandedSkill] = useState(null);

  const profile =
    initialProfile && initialProfile.user_id === userId ? initialProfile : fetchedProfile;

  useEffect(() => {
    if (!userId) return;
    if (initialProfile && initialProfile.user_id === userId) {
      return;
    }
    let alive = true;

    api(`/api/crm/candidates/${userId}`)
      .then((data) => {
        if (!alive) return;
        setFetchedProfile(data.profile);
        setError(null);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err);
      });

    return () => {
      alive = false;
    };
  }, [userId, initialProfile]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const identity = profile?.identity || {};
  const facts = profile?.facts || {};
  const trajectory = profile?.trajectory || {};
  const engagement = profile?.engagement || {};
  const components = engagement?.components || {};

  const sortedSkills = useMemo(() => {
    if (!profile || !profile.skills) return [];
    // Claim gaps first: an audit reader wants the unsupported claims before the long tail of verified skills.
    return [...profile.skills].sort(
      (a, b) =>
        Number(Boolean(b.claim_gap)) - Number(Boolean(a.claim_gap)) ||
        (b.confidence || 0) - (a.confidence || 0)
    );
  }, [profile]);

  const claimGaps = sortedSkills.filter((s) => s.claim_gap);
  const evidencedInstead = sortedSkills.filter((s) => s.hidden_strength).slice(0, 3);

  if (!userId) return null;

  const isLoading = (profile?.user_id !== userId && !error) || (!profile && !error);

  const trajectoryDirectionIcon = {
    rising: <TrendingUp size={14} className="text-positive" />,
    declining: <TrendingDown size={14} className="text-danger" />,
    steady: <Minus size={14} className="text-warning" />,
  }[trajectory.direction] || <Minus size={14} className="text-muted" />;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-bg/80 backdrop-blur-[1px] transition-opacity duration-120"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 520px Slide-over Drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-full flex-col border-l border-border bg-surface text-text',
          'transition-transform duration-120 ease-out'
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        {/* Drawer Header Bar */}
        <div className="flex h-13 shrink-0 items-center justify-between border-b border-border px-6">
          <div className="flex items-center gap-2">
            <span className="crm-num text-[11px] uppercase tracking-[0.14em] text-muted">
              Profile Intelligence
            </span>
            <span className="text-border">/</span>
            <span className="crm-num text-[11px] font-medium text-accent">{userId}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 p-0 text-muted hover:text-text"
            aria-label="Close drawer"
          >
            <X size={16} strokeWidth={1.5} />
          </Button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isLoading ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="crm-skeleton h-6 w-3/4" />
                <div className="crm-skeleton h-4 w-1/2" />
              </div>
              <div className="crm-skeleton h-24 w-full" />
              <div className="crm-skeleton h-36 w-full" />
              <div className="crm-skeleton h-48 w-full" />
            </div>
          ) : error ? (
            <div className="border border-danger/60 bg-danger/5 p-4 text-[13px] text-danger">
              <div className="crm-num font-mono text-[11px] uppercase tracking-[0.1em]">
                Endpoint Failed: {error.path || `/api/crm/candidates/${userId}`}
              </div>
              <p className="mt-1 text-text">
                {error.message || 'Could not load candidate profile'}
              </p>
            </div>
          ) : (
            <div className="space-y-7">
              {/* 1. IDENTITY */}
              <section className="border-b border-border pb-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2
                      id="drawer-title"
                      className="font-serif text-[22px] font-semibold leading-tight text-text"
                    >
                      {identity.full_name?.trim() || userId}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted">
                      <span>{identity.college}</span>
                      {identity.grad_year && (
                        <>
                          <span className="text-border">•</span>
                          <span className="crm-num">Class of {identity.grad_year}</span>
                        </>
                      )}
                      {identity.city && (
                        <>
                          <span className="text-border">•</span>
                          <span>{identity.city}</span>
                        </>
                      )}
                    </div>
                    {(identity.degree || identity.branch) && (
                      <div className="mt-0.5 text-[12px] text-faint">
                        {[identity.degree, identity.branch].filter(Boolean).join(' in ')}
                      </div>
                    )}
                  </div>
                  {identity.role_pref && (
                    <Badge tone="accent" className="shrink-0">
                      {identity.role_pref}
                    </Badge>
                  )}
                </div>

                {/* Contact & Links */}
                <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px]">
                  {identity.email && <span className="crm-num text-muted">{identity.email}</span>}
                  {identity.github_username && (
                    <a
                      href={`https://github.com/${identity.github_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 font-mono text-accent hover:underline"
                    >
                      <span>gh/{identity.github_username}</span>
                      <ExternalLink size={11} strokeWidth={1.5} />
                    </a>
                  )}
                  {identity.linkedin_url && (
                    <a
                      href={identity.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-muted hover:text-text hover:underline"
                    >
                      <span>LinkedIn</span>
                      <ExternalLink size={11} strokeWidth={1.5} />
                    </a>
                  )}
                  <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-mono uppercase">
                    {identity.consent_flag ? (
                      <span className="text-positive flex items-center gap-1">
                        <CheckCircle2 size={11} /> consented
                      </span>
                    ) : (
                      <span className="text-danger">no consent</span>
                    )}
                  </span>
                </div>
              </section>

              {/* CLAIM GAP — declared skills nothing supports, stated up front so it cannot be missed */}
              {claimGaps.length > 0 && (
                <section
                  role="note"
                  className="border border-danger/50 border-l-[3px] border-l-danger bg-danger/10 px-4 py-3"
                >
                  <div className="flex items-center gap-2 text-danger">
                    <AlertTriangle size={14} strokeWidth={2} className="shrink-0" />
                    <span className="crm-num text-[11px] font-medium uppercase tracking-[0.12em]">
                      Claim gap · {claimGaps.length} declared{' '}
                      {claimGaps.length === 1 ? 'skill' : 'skills'} with no evidence
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-text">
                    Declares{' '}
                    <strong className="font-semibold">
                      {claimGaps.map((s) => s.skill).join(', ')}
                    </strong>
                    , but no repository or project supports it.
                    {evidencedInstead.length > 0 && (
                      <>
                        {' '}
                        The evidence points to{' '}
                        {evidencedInstead
                          .map((s) => {
                            const src = s.sources?.find((x) => x.type !== 'declared');
                            return src ? `${s.skill} (${src.detail})` : s.skill;
                          })
                          .join(', ')}
                        , which was never declared.
                      </>
                    )}
                  </p>
                </section>
              )}

              {/* 2. NARRATIVE — Synthesized paragraph */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <span className="crm-num text-[11px] uppercase tracking-[0.12em] text-muted flex items-center gap-1.5">
                    <Sparkles size={12} className="text-accent" />
                    Synthesized Context Narrative
                  </span>
                  <Badge tone={profile.narrative_status === 'llm' ? 'positive' : 'warning'}>
                    {profile.narrative_status === 'llm' ? 'LLM synthesis' : 'Template'}
                  </Badge>
                </div>
                <div className="border-l-2 border-accent bg-bg/40 pl-4 py-2 text-[14.5px] leading-[1.65] text-text/95">
                  {profile.narrative || (
                    <span className="italic text-muted">No synthesized narrative available.</span>
                  )}
                </div>
              </section>

              {/* 3. PERSONAS + ENGAGEMENT SCORE & 4 COMPONENTS */}
              <section className="border-y border-border py-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="crm-num text-[11px] uppercase tracking-[0.12em] text-muted">
                      Persona Classification
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {profile.personas?.map((p) => (
                        <Badge key={p} tone={PERSONA_TONE[p] || 'neutral'}>
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="crm-num text-[11px] uppercase tracking-[0.12em] text-muted">
                      Engagement Score
                    </div>
                    <div className="crm-num text-[26px] font-semibold leading-none text-text mt-1">
                      {engagement.value ?? '—'}
                      <span className="text-[13px] font-normal text-faint"> / 100</span>
                    </div>
                  </div>
                </div>

                {/* 4 Components breakdown (answers "why 78?") */}
                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border/60">
                  {[
                    { label: 'Recency', val: components.recency },
                    { label: 'Frequency', val: components.frequency },
                    { label: 'Depth', val: components.depth },
                    { label: 'Outcome', val: components.outcome },
                  ].map(({ label, val }) => (
                    <div key={label} className="space-y-1">
                      <div className="flex justify-between text-[10.5px]">
                        <span className="crm-num text-faint uppercase">{label}</span>
                        <span className="crm-num text-text">{val ?? 0}</span>
                      </div>
                      <div className="h-[3px] w-full bg-border-strong">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${Math.min(100, val ?? 0)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 4. SKILLS — Sorted by confidence, prominent claim gaps & hidden strengths */}
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <span className="crm-num text-[11px] uppercase tracking-[0.12em] text-muted">
                    Demonstrated & Claimed Skills ({sortedSkills.length})
                  </span>
                  <span className="crm-num text-[10.5px] text-faint">
                    claim gaps first, then confidence
                  </span>
                </div>

                <div className="space-y-2">
                  {sortedSkills.map((s) => {
                    const isExpanded = expandedSkill === s.skill;
                    const pct = Math.round((s.confidence || 0) * 100);

                    return (
                      <div
                        key={s.skill}
                        className={cn(
                          'border border-border bg-bg/50 px-3 py-2 transition-colors duration-100',
                          s.claim_gap && 'border-danger/40 bg-danger/5',
                          s.hidden_strength && 'border-positive/40 bg-positive/5'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-text">{s.skill}</span>
                            {s.cluster && (
                              <span className="crm-num text-[10.5px] text-faint">
                                [{s.cluster}]
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <div className="h-[3px] w-16 bg-border-strong">
                                <div
                                  className={cn(
                                    'h-full',
                                    s.hidden_strength ? 'bg-positive' : 'bg-accent'
                                  )}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="crm-num w-8 text-right text-[11.5px] text-muted">
                                {pct}%
                              </span>
                            </div>
                            {s.sources?.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedSkill(isExpanded ? null : s.skill)}
                                className="text-faint hover:text-text"
                                aria-label="Toggle skill evidence"
                              >
                                <ChevronDown
                                  size={13}
                                  className={cn(
                                    'transition-transform duration-100',
                                    isExpanded && 'rotate-180'
                                  )}
                                />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Prominent Flags — NEVER hidden behind a toggle */}
                        {s.claim_gap && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-danger">
                            <AlertTriangle size={13} strokeWidth={2} className="shrink-0" />
                            <span>declared, no supporting evidence in repos or submissions</span>
                          </div>
                        )}
                        {s.hidden_strength && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-positive">
                            <CheckCircle2 size={13} strokeWidth={2} className="shrink-0" />
                            <span>hidden strength · verified in project implementations</span>
                          </div>
                        )}

                        {/* Evidence Sources Detail */}
                        {isExpanded && s.sources && (
                          <div className="mt-2.5 border-t border-border/70 pt-2 space-y-1">
                            {s.sources.map((src, idx) => (
                              <div
                                key={idx}
                                className="flex items-start gap-2 text-[11px] leading-relaxed text-muted"
                              >
                                <span className="crm-num text-[10px] uppercase text-accent shrink-0">
                                  [{src.type}]
                                </span>
                                <span>{src.detail}</span>
                                {src.weight && (
                                  <span className="crm-num text-faint ml-auto shrink-0">
                                    wt: {src.weight}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* 5. TRAJECTORY — Inline SVG Sparkline, direction & tech drift */}
              <section className="border-t border-border pt-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="crm-num text-[11px] uppercase tracking-[0.12em] text-muted">
                    Performance Trajectory
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-[12px] font-mono capitalize text-text">
                      {trajectoryDirectionIcon}
                      {trajectory.direction || 'Steady'}
                    </span>
                    <Badge tone={STATUS_TONE[trajectory.status] || 'neutral'}>
                      {trajectory.status || 'Active'}
                    </Badge>
                  </div>
                </div>

                <div className="rounded border border-border bg-bg/40 p-3">
                  <ScoreSparkline series={trajectory.score_series} />
                </div>

                {/* Tech Drift */}
                {trajectory.tech_drift && (
                  <div className="mt-3 flex items-center gap-2 text-[12px] text-muted">
                    <span className="crm-num text-[10.5px] uppercase tracking-[0.1em] text-faint shrink-0">
                      Tech Drift:
                    </span>
                    <span className="font-mono text-faint">
                      {trajectory.tech_drift.from?.join(', ') || 'None'}
                    </span>
                    <ArrowRight size={12} className="text-accent shrink-0" />
                    <span className="font-mono text-accent">
                      {trajectory.tech_drift.to?.join(', ') || 'Current'}
                    </span>
                  </div>
                )}
              </section>

              {/* 6. ACTIVITY FACTS — Compact 2-column key/value grid, mono numbers */}
              <section className="border-t border-border pt-5">
                <div className="mb-3 crm-num text-[11px] uppercase tracking-[0.12em] text-muted">
                  Activity Facts
                </div>
                <div className="grid grid-cols-2 gap-px border border-border bg-border">
                  {[
                    {
                      label: 'Events Participated',
                      val: `${facts.hackathons_attended ?? 0} / ${facts.hackathons_registered ?? 0} (No-shows: ${facts.no_shows ?? 0})`,
                    },
                    {
                      label: 'Submissions',
                      val: `${facts.projects_submitted ?? 0} (${Math.round((facts.submission_rate || 0) * 100)}% rate)`,
                    },
                    {
                      label: 'Prizes Won',
                      val: `${facts.prize_count ?? 0} (Best finish: Rank ${facts.best_rank ?? '—'})`,
                    },
                    {
                      label: 'Avg Project Score',
                      val: facts.avg_score ? `${facts.avg_score} pts` : '—',
                    },
                    {
                      label: 'Mentor Sessions',
                      val: `${facts.mentor_sessions ?? 0} sessions (${facts.avg_mentor_score ?? '—'} / 5.0)`,
                    },
                    {
                      label: 'Community Actions',
                      val: `${facts.interactions ?? 0} interactions · ${facts.workshops ?? 0} workshops`,
                    },
                    {
                      label: 'Teammates',
                      val: `${facts.distinct_teammates ?? 0} distinct (${facts.repeat_teammates?.length ?? 0} repeat)`,
                    },
                    {
                      label: 'Outreach History',
                      val: `${facts.outreach?.sent ?? 0} sent · ${facts.outreach?.opened ?? 0} opened · ${facts.outreach?.replied ?? 0} replied`,
                    },
                  ].map(({ label, val }) => (
                    <div key={label} className="bg-surface px-3 py-2">
                      <div className="crm-num text-[10.5px] uppercase tracking-[0.08em] text-faint">
                        {label}
                      </div>
                      <div className="crm-num text-[12.5px] text-text mt-0.5">{val}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 7. EVIDENCE TRAIL — Collapsible, shows claim count */}
              <section className="border-t border-border pt-5">
                <details
                  className="group rounded border border-border bg-bg/40"
                  open={evidenceOpen}
                  onToggle={(e) => setEvidenceOpen(e.currentTarget.open)}
                >
                  <summary className="flex cursor-pointer select-none items-center justify-between px-3.5 py-2.5 text-[12px] font-mono text-muted hover:text-text">
                    <span className="uppercase tracking-[0.08em]">
                      Evidence Trail · {profile.evidence?.length || 0} claims
                    </span>
                    <ChevronDown
                      size={14}
                      className="transition-transform duration-100 group-open:rotate-180 text-faint"
                    />
                  </summary>
                  <div className="border-t border-border divide-y divide-border/60 max-h-72 overflow-y-auto px-3.5 py-1">
                    {profile.evidence?.map((ev, idx) => (
                      <div key={idx} className="py-2 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[12.5px] text-text font-sans">{ev.claim}</span>
                          <span className="crm-num text-[10.5px] uppercase text-accent border border-accent/40 px-1 py-0.2 rounded-sm shrink-0">
                            {ev.source_type || 'CSV'}
                          </span>
                        </div>
                        <div className="crm-num flex items-center justify-between text-[10.5px] text-faint">
                          <span>Ref: {ev.source_ref || 'unspecified'}</span>
                          {ev.observed_at && <span>{ev.observed_at}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </section>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export default ProfileDrawer;
