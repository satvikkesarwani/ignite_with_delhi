import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
// The original playground and the CRM are separate lazy chunks so neither one's global CSS reaches the other.
const LegacyApp = lazy(() => import('./LegacyApp.jsx'));

// PersonaCRM lives at /crm and is code-split, so its Tailwind layer and fonts never load for "/".
const CrmApp = lazy(() => import('./crm/CrmApp.jsx'));
const isCrm = window.location.pathname.startsWith('/crm');
// index.css is imported by LegacyApp.jsx, deliberately not here.

// ---- Frontend error net: every uncaught error/rejection is timestamped in console ----
// Judges ke saamne kuch bhi toote toh console mein turant dikhta hai (F12 se).
const logError = (label, detail) => {
  const entry = {
    ts: new Date().toISOString(),
    label,
    detail,
  };
  // Keep the last 25 errors around for quick inspection / screenshots
  window.__frontendErrors = [...(window.__frontendErrors || []), entry].slice(-25);
  console.error(`[${entry.ts}] [FRONTEND] ${label}:`, detail);
};

window.addEventListener('error', (event) => {
  logError('uncaughtError', {
    message: event.message,
    source: `${event.filename}:${event.lineno}:${event.colno}`,
    stack: event.error?.stack,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  logError('unhandledRejection', {
    reason: event.reason instanceof Error ? event.reason.stack : String(event.reason),
  });
});

// Trace every API call the app makes: url, status, duration — 400/500 flag themselves
const originalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
  const startedAt = performance.now();
  try {
    const res = await originalFetch(...args);
    const durationMs = Math.round(performance.now() - startedAt);
    const fn = res.status >= 500 ? console.error : res.status >= 400 ? console.warn : console.info;
    fn(`[FRONTEND] API ${url} → ${res.status} (${durationMs}ms)`);
    return res;
  } catch (err) {
    console.error(
      `[FRONTEND] API ${url} → FAILED (${Math.round(performance.now() - startedAt)}ms):`,
      err.message
    );
    throw err;
  }
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isCrm ? (
      <Suspense fallback={null}>
        <CrmApp />
      </Suspense>
    ) : (
      <Suspense fallback={null}>
        <LegacyApp />
      </Suspense>
    )}
  </StrictMode>
);
