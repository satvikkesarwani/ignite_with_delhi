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
import { GraphView } from './GraphView';

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
      {path === '/crm/graph' && <GraphView />}
    </CrmLayout>
  );
}
