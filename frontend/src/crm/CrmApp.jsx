import { useCallback, useEffect, useState } from 'react';
import '@fontsource-variable/fraunces';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './crm.css';
import { api } from './api';
import { CrmLayout } from './CrmLayout';
import { DatabaseView } from './DatabaseView';
import { ScoutView } from './ScoutView';
import { IntakeView } from './IntakeView';

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

function PhasePlaceholder({ phase, title, description }) {
  return (
    <div className="mt-8 max-w-[500px] border border-border bg-surface/30 p-6">
      <div className="crm-num text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
        Upcoming Module · Phase {phase}
      </div>
      <h3 className="font-serif mt-2 text-[18px] font-semibold text-text">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{description}</p>
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

  return (
    <CrmLayout currentPath={path} onNavigate={go} stats={stats} statsError={statsError}>
      {path === '/crm' && <DatabaseView />}
      {path === '/crm/scout' && <ScoutView />}
      {path === '/crm/intake' && <IntakeView onNavigate={go} />}
      {path === '/crm/graph' && (
        <PhasePlaceholder
          phase="C1 / Graph"
          title="Context Graph Explorer"
          description="Interactive subgraph exploration showing participant, project, hackathon, and skill relationship topologies."
        />
      )}
    </CrmLayout>
  );
}
