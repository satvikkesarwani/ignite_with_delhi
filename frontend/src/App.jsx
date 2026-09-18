import { useState, useEffect, useCallback } from 'react';

export default function App() {
  const defaultApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [healthData, setHealthData] = useState(null);
  const [healthStatus, setHealthStatus] = useState('checking'); // 'healthy', 'offline', 'checking'
  const [latency, setLatency] = useState(null);
  const [activeEndpoint, setActiveEndpoint] = useState('/api/hello');
  const [requestMethod, setRequestMethod] = useState('GET');
  const [requestBody, setRequestBody] = useState(
    '{\n  "title": "Hackathon Demo Project",\n  "status": "Ready",\n  "score": 99\n}'
  );
  const [apiResponse, setApiResponse] = useState(null);
  const [loadingReq, setLoadingReq] = useState(false);

  // NVIDIA AI Playground State
  const [aiPrompt, setAiPrompt] = useState(
    'Write a 2-sentence pitch for our hackathon project that saves lives.'
  );
  const [aiOutput, setAiOutput] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const checkHealth = useCallback(async () => {
    const startTime = performance.now();
    try {
      const cleanUrl = apiUrl.replace(/\/$/, '');
      const res = await fetch(`${cleanUrl}/health`, { method: 'GET' });
      const duration = Math.round(performance.now() - startTime);
      setLatency(duration);

      if (res.ok) {
        const data = await res.json();
        setHealthData(data);
        setHealthStatus('healthy');
      } else {
        setHealthStatus('offline');
        setHealthData({ error: `HTTP ${res.status}: ${res.statusText}` });
      }
    } catch (err) {
      setHealthStatus('offline');
      setLatency(null);
      setHealthData({ error: err.message || 'Cannot reach backend' });
    }
  }, [apiUrl]);

  useEffect(() => {
    let isSubscribed = true;
    const runCheck = async () => {
      if (isSubscribed) {
        await checkHealth();
      }
    };
    runCheck();
    const interval = setInterval(runCheck, 15000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [checkHealth]);

  const sendApiRequest = async () => {
    setLoadingReq(true);
    setApiResponse(null);
    try {
      const cleanUrl = apiUrl.replace(/\/$/, '');
      const options = {
        method: requestMethod,
        headers: { 'Content-Type': 'application/json' },
      };

      if (requestMethod === 'POST') {
        options.body = requestBody;
      }

      const res = await fetch(`${cleanUrl}${activeEndpoint}`, options);
      const data = await res.json();
      setApiResponse(data);
    } catch (err) {
      setApiResponse({ error: err.message || 'Request failed' });
    } finally {
      setLoadingReq(false);
    }
  };

  const runAiGeneration = async () => {
    setLoadingAi(true);
    setAiOutput(null);
    const start = performance.now();
    try {
      const cleanUrl = apiUrl.replace(/\/$/, '');
      const res = await fetch(`${cleanUrl}/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, maxTokens: 512 }),
      });
      const data = await res.json();
      const elapsed = Math.round(performance.now() - start);
      setAiOutput({ ...data, elapsedMs: elapsed });
    } catch (err) {
      setAiOutput({ success: false, error: err.message || 'AI request failed' });
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div className="container">
      {/* Top Header */}
      <header className="header">
        <div className="brand">
          <div className="logo-badge">⚡</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1>Ignite Hackathon Stack</h1>
              <span
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  color: '#10b981',
                  padding: '0.15rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                }}
              >
                🟢 CD Live Verified
              </span>
            </div>
            <p>Continuous Deployment Monorepo (Vercel + Render + CI/CD)</p>
          </div>
        </div>
        <a
          href="https://github.com/satvikkesarwani/ignite_with_delhi"
          target="_blank"
          rel="noreferrer"
          className="repo-pill"
        >
          <span>📁 GitHub Repo</span>
          <span>↗</span>
        </a>
      </header>

      {/* API Configuration Bar */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label className="input-label" htmlFor="api-url-input">
            Target Backend API Base URL (Live Render or Localhost):
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <input
              id="api-url-input"
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="e.g. http://localhost:5000 or https://ignite-backend.onrender.com"
              className="text-input"
              style={{ flex: 1, minWidth: '260px' }}
            />
            <button onClick={checkHealth} className="btn btn-secondary">
              🔄 Check Connection
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Health Monitor + API Playground */}
      <div className="grid-2">
        {/* Backend Live Status Card */}
        <div className="card">
          <div className="card-title">
            <div className="icon-wrap">
              <span>🩺</span>
              <span>Backend Status</span>
            </div>
            <span className={`status-badge ${healthStatus}`}>
              <span className="ping-dot" />
              {healthStatus}
            </span>
          </div>

          <div className="stat-row">
            <span className="stat-label">Latency (Round-trip)</span>
            <span className="stat-value" style={{ color: latency < 300 ? '#10b981' : '#f59e0b' }}>
              {latency !== null ? `${latency} ms` : '--'}
            </span>
          </div>

          <div className="stat-row">
            <span className="stat-label">Server Uptime</span>
            <span className="stat-value">
              {healthData?.uptimeSeconds !== undefined ? `${healthData.uptimeSeconds}s` : '--'}
            </span>
          </div>

          <div className="stat-row">
            <span className="stat-label">Environment</span>
            <span className="stat-value">{healthData?.environment || 'unknown'}</span>
          </div>

          <div className="stat-row">
            <span className="stat-label">Render Anti-Sleep</span>
            <span className="stat-value" style={{ color: '#06b6d4' }}>
              Active (10m Ping)
            </span>
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <span className="input-label">Raw Health Payload:</span>
            <pre className="response-box" style={{ marginTop: '0.5rem', maxHeight: '130px' }}>
              {healthData ? JSON.stringify(healthData, null, 2) : 'Connecting...'}
            </pre>
          </div>
        </div>

        {/* API Playground Card */}
        <div className="card">
          <div className="card-title">
            <div className="icon-wrap">
              <span>🧪</span>
              <span>API Playground</span>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                onClick={() => {
                  setRequestMethod('GET');
                  setActiveEndpoint('/api/hello');
                }}
                className={`btn ${activeEndpoint === '/api/hello' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
              >
                GET /hello
              </button>
              <button
                onClick={() => {
                  setRequestMethod('GET');
                  setActiveEndpoint('/api/projects');
                }}
                className={`btn ${activeEndpoint === '/api/projects' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
              >
                GET /projects
              </button>
              <button
                onClick={() => {
                  setRequestMethod('POST');
                  setActiveEndpoint('/api/projects');
                }}
                className={`btn ${activeEndpoint === '/api/projects' && requestMethod === 'POST' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
              >
                POST /projects
              </button>
            </div>
          </div>

          {requestMethod === 'POST' && (
            <div className="input-group">
              <label className="input-label" htmlFor="json-payload">
                JSON Body:
              </label>
              <textarea
                id="json-payload"
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
                rows={3}
                className="text-input"
                style={{ resize: 'vertical' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            <button
              onClick={sendApiRequest}
              disabled={loadingReq}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              {loadingReq ? 'Sending...' : `Send ${requestMethod} ${activeEndpoint}`}
            </button>
          </div>

          <div>
            <span className="input-label">Response:</span>
            <pre className="response-box" style={{ marginTop: '0.5rem', maxHeight: '160px' }}>
              {apiResponse
                ? JSON.stringify(apiResponse, null, 2)
                : '// Click send to test endpoint'}
            </pre>
          </div>
        </div>
      </div>

      {/* NVIDIA AI Section */}
      <div
        className="card"
        style={{
          marginBottom: '2rem',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          background:
            'linear-gradient(180deg, rgba(26, 20, 48, 0.6) 0%, rgba(18, 24, 38, 0.8) 100%)',
        }}
      >
        <div className="card-title">
          <div className="icon-wrap">
            <span style={{ fontSize: '1.25rem' }}>🤖</span>
            <span>NVIDIA Nemotron 3.5 Lightning (30B) — Key Rotation Active</span>
          </div>
          <span
            className="status-badge healthy"
            style={{
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#c084fc',
              borderColor: 'rgba(168, 85, 247, 0.3)',
            }}
          >
            5 API Keys Rotating
          </span>
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="ai-prompt-input">
            Test AI Prompt (Endpoint: <code>POST /api/ai/generate</code>):
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <input
              id="ai-prompt-input"
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Ask anything..."
              className="text-input"
              style={{ flex: 1, minWidth: '280px' }}
              onKeyDown={(e) => e.key === 'Enter' && runAiGeneration()}
            />
            <button
              onClick={runAiGeneration}
              disabled={loadingAi}
              className="btn btn-primary"
              style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)', minWidth: '140px' }}
            >
              {loadingAi ? '⚡ Generating...' : '✨ Ask AI'}
            </button>
          </div>
        </div>

        {aiOutput && (
          <div
            style={{
              marginTop: '1rem',
              background: 'rgba(0, 0, 0, 0.35)',
              padding: '1rem',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
                fontSize: '0.8rem',
                color: '#94a3b8',
              }}
            >
              <span>
                Model:{' '}
                <code style={{ color: '#38bdf8' }}>
                  {aiOutput.model || 'nvidia/nemotron-3.5-lightning-30b-a3b'}
                </code>
              </span>
              <span>
                Key: <strong style={{ color: '#10b981' }}>#{aiOutput.keyIndexUsed || 1}</strong> |
                Time: {aiOutput.elapsedMs || '--'}ms
              </span>
            </div>
            <div
              style={{
                color: '#f1f5f9',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
                fontSize: '0.92rem',
              }}
            >
              {aiOutput.content || aiOutput.error || JSON.stringify(aiOutput)}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Checklist: Hackathon Readiness */}
      <div className="grid-3">
        <div className="card">
          <h3
            style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#a855f7' }}
          >
            ⚡ 1-Click CI/CD Setup
          </h3>
          <div className="checklist-item">
            <span className="check-icon">✓</span>
            <span>
              Vercel Root: <code>frontend</code>
            </span>
          </div>
          <div className="checklist-item">
            <span className="check-icon">✓</span>
            <span>
              Render Root: <code>backend</code>
            </span>
          </div>
          <div className="checklist-item">
            <span className="check-icon">✓</span>
            <span>
              Auto-deploy on <code>git push origin main</code>
            </span>
          </div>
        </div>

        <div className="card">
          <h3
            style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#06b6d4' }}
          >
            🛡️ Anti-Sleep Active
          </h3>
          <div className="checklist-item">
            <span className="check-icon">✓</span>
            <span>GitHub Action ping every 10 mins</span>
          </div>
          <div className="checklist-item">
            <span className="check-icon">✓</span>
            <span>Zero cold-starts during judging</span>
          </div>
          <div className="checklist-item">
            <span className="check-icon">✓</span>
            <span>Internal Express self-pinger</span>
          </div>
        </div>

        <div className="card">
          <h3
            style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#10b981' }}
          >
            🧹 Zero-Friction Workflow
          </h3>
          <div className="checklist-item">
            <span className="check-icon">✓</span>
            <span>Pre-commit lint auto-fix</span>
          </div>
          <div className="checklist-item">
            <span className="check-icon">✓</span>
            <span>GitHub Actions build error checker</span>
          </div>
          <div className="checklist-item">
            <span className="check-icon">✓</span>
            <span>
              Single <code>npm run dev</code> starts both
            </span>
          </div>
        </div>
      </div>

      {/* Pro-Tips for Hackathon */}
      <div className="hack-tip">
        <strong>🔥 Hackathon Fast-Track Tip:</strong> Whenever you code new features tomorrow, just
        save and run{' '}
        <code>
          git add . &amp;&amp; git commit -m &apos;feat: added new feature&apos; &amp;&amp; git push
          origin main
        </code>
        . Both Vercel and Render will auto-deploy within 90 seconds without manual intervention!
      </div>
    </div>
  );
}
