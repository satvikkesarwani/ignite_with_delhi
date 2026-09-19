import { useCallback, useEffect, useState } from 'react';
import { Database, MessageSquare, FilePlus2, Network, ArrowUpRight } from 'lucide-react';
import '@fontsource-variable/fraunces';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './crm.css';
import { api } from './api';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const NAV = [
  {
    path: '/crm',
    label: 'Database',
    icon: Database,
    title: 'Participant directory',
    blurb: 'Every person the platform has ever seen, with the context built from what they did.',
  },
  {
    path: '/crm/scout',
    label: 'AI Scout',
    icon: MessageSquare,
    title: 'AI Scout',
    blurb: 'Ask about a person or a group in plain language. Answers cite their sources.',
  },
  {
    path: '/crm/intake',
    label: 'Intake',
    icon: FilePlus2,
    title: 'Intake',
    blurb: 'Add a new participant and watch their context get built.',
  },
  {
    path: '/crm/graph',
    label: 'Graph',
    icon: Network,
    title: 'Context graph',
    blurb: 'The relationships underneath the profiles.',
  },
];

const PERSONA_TONE = {
  'Serial Winner': 'accent',
  'Rising Star': 'positive',
  'Mentor Material': 'positive',
  'Dormant High-Potential': 'warning',
  'Starter, Not Finisher': 'warning',
  Ghost: 'danger',
};
const STATUS_TONE = {
  active: 'positive',
  cooling: 'warning',
  dormant: 'warning',
  lapsed: 'danger',
};

function useLocationPath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((to) => {
    if (to === window.location.pathname) return;
    window.history.pushState({}, '', to);
    setPath(to);
  }, []);
  return [path, go];
}

/** Rail footer dot: tells the room, quietly, whether what they're looking at is live. */
function connectionState(stats, error) {
  if (error) return { label: 'OFFLINE', tone: 'bg-danger', hint: 'backend unreachable' };
  if (!stats) return { label: '…', tone: 'bg-faint', hint: 'connecting' };
  if (stats.mode === 'mock') return { label: 'MOCK', tone: 'bg-accent', hint: 'serving fixtures' };
  if (stats.graph === 'offline')
    return { label: 'OFFLINE', tone: 'bg-danger', hint: 'graph down, serving cached profiles' };
  return { label: 'LIVE', tone: 'bg-positive', hint: 'AuraDB connected' };
}

function Rail({ path, go, conn }) {
  return (
    <aside className="fixed inset-y-0 left-0 flex w-[220px] flex-col border-r border-border bg-bg">
      <div className="px-5 pb-6 pt-6">
        <div className="font-serif text-[19px] font-semibold leading-none tracking-[-0.01em]">
          PersonaCRM
        </div>
        <div className="crm-num mt-1.5 text-[10.5px] uppercase tracking-[0.12em] text-faint">
          context layer
        </div>
      </div>
      <nav className="flex-1">
        <ul>
          {NAV.map(({ path: p, label, icon: Icon }) => {
            const active = path === p;
            return (
              <li key={p}>
                <a
                  href={p}
                  onClick={(e) => {
                    e.preventDefault();
                    go(p);
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-9 items-center gap-3 border-l-2 px-[18px] text-[13px] transition-colors duration-100',
                    active
                      ? 'border-accent bg-surface text-text'
                      : 'border-transparent text-muted hover:bg-surface hover:text-text'
                  )}
                >
                  <Icon size={18} strokeWidth={1.5} />
                  {label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-border px-5 py-4" title={conn.hint}>
        <div className="flex items-center gap-2">
          <span className={cn('size-1.5 rounded-full', conn.tone)} />
          <span className="crm-num text-[11px] tracking-[0.1em] text-muted">{conn.label}</span>
        </div>
        <div className="mt-1 text-[11px] text-faint">{conn.hint}</div>
      </div>
    </aside>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex-1 border-l border-border px-6 first:border-l-0 first:pl-0">
      <div className="crm-num text-[28px] font-medium leading-none tracking-[-0.02em]">
        {value ?? <span className="text-faint">—</span>}
      </div>
      <div className="mt-2 text-[11px] uppercase tracking-[0.1em] text-muted">{label}</div>
    </div>
  );
}

function StatsStrip({ stats }) {
  const fmt = (n) => (n === undefined || n === null ? null : Number(n).toLocaleString('en-IN'));
  return (
    <div className="flex border-b border-border py-6">
      <Stat label="People" value={fmt(stats?.people)} />
      <Stat label="Hackathons" value={fmt(stats?.hackathons)} />
      <Stat label="Projects" value={fmt(stats?.projects)} />
      <Stat label="Active · 90 days" value={fmt(stats?.active_last_90d)} />
    </div>
  );
}

function EngagementBar({ value }) {
  return (
    <div className="flex items-center justify-end gap-2.5">
      <div className="h-[3px] w-14 bg-border">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="crm-num w-6 text-right text-[12px]">{value}</span>
    </div>
  );
}

/** Placeholder directory — phase B1 replaces this with the full view. It proves the pipe and the palette. */
function DatabasePreview() {
  const [state, setState] = useState({ loading: true, rows: [], total: 0, error: null });
  const [q, setQ] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api(`/api/crm/candidates?limit=14${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        signal: ctrl.signal,
      })
        .then((d) => setState({ loading: false, rows: d.rows, total: d.total, error: null }))
        .catch(
          (e) =>
            e.name !== 'AbortError' && setState({ loading: false, rows: [], total: 0, error: e })
        );
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className="pt-6">
      <div className="mb-4 flex items-center justify-between gap-6">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, college, skill"
          className="max-w-[340px]"
        />
        <span className="crm-num text-[12px] text-muted">
          {state.loading ? '…' : `${state.rows.length} of ${state.total}`}
        </span>
      </div>

      {state.error ? (
        <div className="border border-danger/50 px-4 py-3 text-[13px] text-danger">
          <span className="crm-num">{state.error.path}</span> — {state.error.message}
        </div>
      ) : (
        <table>
          <thead>
            <tr className="border-b border-border-strong text-left text-[11px] uppercase tracking-[0.08em] text-muted">
              <th className="py-2 pr-4 font-medium">Person</th>
              <th className="py-2 pr-4 font-medium">College</th>
              <th className="py-2 pr-4 font-medium">Persona</th>
              <th className="py-2 pr-4 text-right font-medium">Events</th>
              <th className="py-2 pr-4 text-right font-medium">Prizes</th>
              <th className="py-2 pr-4 text-right font-medium">Engagement</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {state.loading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="h-8 border-b border-border">
                    <td colSpan={7}>
                      <div
                        className="crm-skeleton h-3"
                        style={{ width: `${60 + ((i * 7) % 35)}%` }}
                      />
                    </td>
                  </tr>
                ))
              : state.rows.map((r) => (
                  <tr
                    key={r.user_id}
                    className="h-8 border-b border-border transition-colors duration-100 hover:bg-surface"
                  >
                    <td className="pr-4">
                      <span className="text-[13px]">{r.full_name.trim()}</span>
                      <span className="crm-num ml-2 text-[11px] text-faint">{r.user_id}</span>
                    </td>
                    <td className="pr-4 text-[13px] text-muted">{r.college}</td>
                    <td className="pr-4">
                      <span className="flex gap-1.5">
                        {r.personas.slice(0, 2).map((p) => (
                          <Badge key={p} tone={PERSONA_TONE[p] || 'neutral'}>
                            {p}
                          </Badge>
                        ))}
                      </span>
                    </td>
                    <td className="crm-num pr-4 text-right text-[13px]">{r.hackathons_attended}</td>
                    <td className="crm-num pr-4 text-right text-[13px]">
                      {r.prize_count || <span className="text-faint">0</span>}
                    </td>
                    <td className="pr-4">
                      <EngagementBar value={r.engagement} />
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status}</Badge>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Placeholder({ phase }) {
  return (
    <div className="mt-10 max-w-[420px] border border-border px-5 py-4">
      <div className="crm-num text-[11px] uppercase tracking-[0.1em] text-accent">
        phase {phase}
      </div>
      <p className="mt-2 text-[13px] text-muted">
        This view is built in a later phase. The shell, tokens and API connection are in place.
      </p>
    </div>
  );
}

export default function CrmApp() {
  const [path, go] = useLocationPath();
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);

  useEffect(() => {
    let alive = true;
    api('/api/crm/stats')
      .then((s) => alive && setStats(s))
      .catch((e) => alive && setStatsError(e));
    return () => {
      alive = false;
    };
  }, []);

  const current = NAV.find((n) => n.path === path) || NAV[0];
  const conn = connectionState(stats, statsError);

  return (
    <div className="crm-root" data-theme="dark">
      <Rail path={current.path} go={go} conn={conn} />
      <main className="ml-[220px] min-h-screen px-10 pb-16 pt-8">
        <header className="flex items-baseline gap-5">
          <h1 className="font-serif text-[24px] font-semibold leading-tight tracking-[-0.01em]">
            {current.title}
          </h1>
          <p className="max-w-[560px] text-[13px] text-muted">{current.blurb}</p>
        </header>
        <div className="mt-6">
          <StatsStrip stats={stats} />
        </div>
        {current.path === '/crm' && <DatabasePreview />}
        {current.path === '/crm/scout' && <Placeholder phase="B2" />}
        {current.path === '/crm/intake' && <Placeholder phase="B3" />}
        {current.path === '/crm/graph' && <Placeholder phase="B1" />}
        <footer className="mt-16 flex items-center gap-1.5 text-[11px] text-faint">
          Synthetic dataset · external profiles labelled{' '}
          <span className="crm-num">synthetic_seed</span>
          <ArrowUpRight size={12} strokeWidth={1.5} />
        </footer>
      </main>
    </div>
  );
}
