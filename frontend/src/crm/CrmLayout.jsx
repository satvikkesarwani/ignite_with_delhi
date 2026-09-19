import { Database, MessageSquare, FilePlus2, Network, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const NAV_ITEMS = [
  {
    path: '/crm',
    label: 'Database',
    icon: Database,
    title: 'Participant directory',
    blurb:
      'Every person the platform has ever seen, with context synthesized from verified history.',
  },
  {
    path: '/crm/scout',
    label: 'AI Scout',
    icon: MessageSquare,
    title: 'AI Scout',
    blurb: 'Ask about a person or a group in natural language. Answers cite graph evidence.',
  },
  {
    path: '/crm/intake',
    label: 'Intake',
    icon: FilePlus2,
    title: 'Participant intake',
    blurb: 'Register participants, parse resumes, and construct graph profiles in real time.',
  },
  {
    path: '/crm/graph',
    label: 'Graph',
    icon: Network,
    title: 'Context graph',
    blurb: 'Knowledge graph relationships, provenance trails, and entity clusters.',
  },
];

function connectionState(stats, error) {
  if (error) {
    return {
      label: 'OFFLINE',
      tone: 'bg-danger',
      // status 0 means the request never got an answer; anything else is the server's own message
      hint: error.status ? `stats failed: ${error.message}` : 'backend unreachable',
    };
  }
  if (!stats) {
    return { label: '…', tone: 'bg-faint', hint: 'connecting' };
  }
  if (stats.mode === 'mock') {
    return { label: 'MOCK', tone: 'bg-accent', hint: 'serving fixtures' };
  }
  if (stats.graph === 'offline') {
    return { label: 'OFFLINE', tone: 'bg-danger', hint: 'graph down, serving cached profiles' };
  }
  return { label: 'LIVE', tone: 'bg-positive', hint: 'AuraDB connected' };
}

function StatItem({ label, value }) {
  return (
    <div className="flex-1 border-l border-border px-5 first:border-l-0 first:pl-0">
      <div className="crm-num text-[28px] font-medium leading-none tracking-[-0.02em] text-text">
        {value ?? <span className="text-faint">—</span>}
      </div>
      <div className="mt-2 text-[11px] uppercase tracking-[0.1em] text-muted">{label}</div>
    </div>
  );
}

function HeaderStatsStrip({ stats }) {
  const formatNum = (n) =>
    n === undefined || n === null ? null : Number(n).toLocaleString('en-IN');

  return (
    <div className="flex border-b border-border py-5">
      <StatItem label="People" value={formatNum(stats?.people)} />
      <StatItem label="Hackathons" value={formatNum(stats?.hackathons)} />
      <StatItem label="Projects" value={formatNum(stats?.projects)} />
      <StatItem label="Active · 90 days" value={formatNum(stats?.active_last_90d)} />
    </div>
  );
}

export function CrmLayout({ currentPath, onNavigate, stats, statsError, children }) {
  const currentNav = NAV_ITEMS.find((n) => n.path === currentPath) || NAV_ITEMS[0];
  const conn = connectionState(stats, statsError);

  return (
    <div className="crm-root min-h-screen bg-bg text-text" data-theme="dark">
      {/* 220px Fixed Left Rail */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[220px] flex-col border-r border-border bg-bg">
        {/* Terminal Brand Header */}
        <div className="px-5 pb-6 pt-6">
          <div className="font-serif text-[20px] font-semibold leading-none tracking-[-0.01em] text-text">
            PersonaCRM
          </div>
          <div className="crm-num mt-1.5 text-[10.5px] uppercase tracking-[0.14em] text-faint">
            context layer
          </div>
        </div>

        {/* Navigation items: 2px ochre left border active state, not a filled pill */}
        <nav className="flex-1 py-1">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const isActive = currentPath === path;
              return (
                <li key={path}>
                  <a
                    href={path}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(path);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex h-9 items-center gap-3 border-l-2 px-[18px] text-[13px] font-sans transition-colors duration-100',
                      isActive
                        ? 'border-accent bg-surface text-text'
                        : 'border-transparent text-muted hover:bg-surface hover:text-text'
                    )}
                  >
                    <Icon size={18} strokeWidth={1.5} className="shrink-0" />
                    <span>{label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Rail Footer: Connection Status Badge */}
        <div className="border-t border-border px-5 py-4" title={conn.hint}>
          <div className="flex items-center gap-2">
            <span className={cn('size-1.5 shrink-0 rounded-full', conn.tone)} />
            <span className="crm-num text-[11px] font-medium tracking-[0.1em] text-muted">
              {conn.label}
            </span>
          </div>
          <div className="mt-1 text-[11px] leading-tight text-faint">{conn.hint}</div>
        </div>
      </aside>

      {/* Main Content Area (24px gutters, asymmetric) */}
      <main className="ml-[220px] min-h-screen px-6 pb-16 pt-6">
        {/* Page Title beside description (not stacked and centered) */}
        <header className="flex flex-wrap items-baseline gap-4 md:gap-6">
          <h1 className="font-serif text-[24px] font-semibold leading-tight tracking-[-0.01em] text-text">
            {currentNav.title}
          </h1>
          <p className="max-w-[620px] text-[13px] leading-normal text-muted">{currentNav.blurb}</p>
        </header>

        {/* 4-Stat Strip with Hairline Dividers */}
        <div className="mt-5">
          <HeaderStatsStrip stats={stats} />
        </div>

        {/* Page Content Outlet */}
        <div className="mt-5">{children}</div>

        {/* Footer Provenance Note */}
        <footer className="mt-14 flex items-center gap-1.5 border-t border-border pt-5 text-[11px] text-faint">
          <span>Synthetic dataset · external profiles labelled</span>
          <span className="crm-num text-muted">synthetic_seed</span>
          <ArrowUpRight size={12} strokeWidth={1.5} className="shrink-0 text-faint" />
        </footer>
      </main>
    </div>
  );
}

export default CrmLayout;
