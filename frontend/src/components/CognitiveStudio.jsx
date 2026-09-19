import { useState, useRef } from 'react';

const PRESETS = [
  {
    id: 'financial',
    title: '🚨 Financial Forensics',
    prompt:
      'Extract exclusively financial transactions, offshore shell accounts, beneficial ownership links, and jurisdiction anomalies. Ignore corporate marketing and conversational text.',
    sampleText:
      'Investigation Report: Atlas Global Corp (Delaware) transferred $1.2M USD on March 1, 2026 to Apex Holding Ltd (Account KY-99201 in Cayman Islands). Apex Holding immediately layered $450K EUR to Vortex Capital SA (Panama, Account PA-10488) controlled by Director Sarah Vance. Vortex Capital then disbursed split payments to Zenith Logistics (Hong Kong) triggering Sanctions Risk Alert.',
    sampleQuery:
      'Which entities in Panama are linked to transactions originating from Atlas Global?',
  },
  {
    id: 'code_audit',
    title: '🛡️ Code Security Audit',
    prompt:
      'Extract software components, classes, functions, unvalidated API routes, and security vulnerability patterns. Map dependencies across modules.',
    sampleText:
      'Audit Log: Server module routes /api/upload to unauthenticated FileHandler without file extension sanitization. Database driver exposes runRawQuery allowing potential SQL/Cypher injection. Function signToken uses hardcoded HMAC secret key in config.py.',
    sampleQuery: 'What vulnerability patterns exist in the authentication and upload routes?',
  },
  {
    id: 'medical',
    title: '🏥 Medical Records',
    prompt:
      'Extract patient symptoms, clinical diagnoses, prescribed pharmaceuticals, contraindications, and specialist physician referrals.',
    sampleText:
      'Patient 4029 presented with acute hypertension and elevated creatinine levels. Dr. Alvarez prescribed Lisinopril 20mg daily. Patient reports history of severe angioedema with ACE inhibitors, indicating high-risk drug contraindication.',
    sampleQuery: 'What drug contraindications exist for Patient 4029?',
  },
];

export default function CognitiveStudio({ backendUrl }) {
  const [selectedPreset, setSelectedPreset] = useState(PRESETS[0]);
  const [inputText, setInputText] = useState(PRESETS[0].sampleText);
  const [directivePrompt, setDirectivePrompt] = useState(PRESETS[0].prompt);
  const [isProcessing, setIsProcessing] = useState(false);
  const [eclStep, setEclStep] = useState(0); // 0: idle, 1: token chunking, 2: directive extraction, 3: neo4j graph sync
  const [pipelineResult, setPipelineResult] = useState(null);
  const [queryText, setQueryText] = useState(PRESETS[0].sampleQuery);
  const [queryResult, setQueryResult] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [text2cResult, setText2cResult] = useState(null);
  const [text2cLoading, setText2cLoading] = useState(false);
  const [trail, setTrail] = useState(null);
  const [trailLoading, setTrailLoading] = useState(false);
  const stepTimerRef = useRef(null);

  const handleSelectPreset = (preset) => {
    setSelectedPreset(preset);
    setInputText(preset.sampleText);
    setDirectivePrompt(preset.prompt);
    setQueryText(preset.sampleQuery);
    setQueryResult(null);
    setPipelineResult(null);
  };

  const handleRunCognify = async () => {
    setIsProcessing(true);
    setPipelineResult(null);
    setEclStep(1); // Token chunking starts immediately

    // Advance to the LLM extraction stage while the real pipeline is running
    clearTimeout(stepTimerRef.current);
    stepTimerRef.current = setTimeout(() => setEclStep(2), 2500);

    try {
      const res = await fetch(`${backendUrl}/api/cognify/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: inputText, prompt: directivePrompt }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      clearTimeout(stepTimerRef.current);
      setEclStep(3); // Graph sync complete
      setPipelineResult(data);
      // Notify the graph canvas to pull the freshly built topology
      window.dispatchEvent(new CustomEvent('graph:refresh'));
      setTimeout(() => {
        setIsProcessing(false);
        setEclStep(0);
      }, 700);
    } catch (err) {
      clearTimeout(stepTimerRef.current);
      console.warn('Cognify trigger error:', err);
      setPipelineResult({ success: false, error: err.message });
      setIsProcessing(false);
      setEclStep(0);
    }
  };

  const handleExecuteQuery = async () => {
    if (!queryText.trim()) return;
    setQueryLoading(true);
    setQueryResult(null);
    setText2cResult(null);

    try {
      const res = await fetch(`${backendUrl}/api/cognify/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText, context: inputText, sessionId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setQueryResult(data);
      setSessionId(data.sessionId || sessionId);
    } catch (err) {
      setQueryResult({ success: false, error: err.message });
    } finally {
      setQueryLoading(false);
    }
  };

  // U3: Text2Cypher — natural language → generated Cypher (shown for explainability)
  const handleText2Cypher = async () => {
    if (!queryText.trim()) return;
    setText2cLoading(true);
    setText2cResult(null);

    try {
      const res = await fetch(`${backendUrl}/api/graph/text2cypher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: queryText, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setText2cResult(data);
      setSessionId(data.sessionId || sessionId);
      // Highlight the matched entities on the graph canvas
      const names = (data.records || [])
        .flatMap((r) => Object.values(r))
        .filter((v) => typeof v === 'string' && v.length < 60);
      window.dispatchEvent(new CustomEvent('graph:highlight', { detail: { names } }));
    } catch (err) {
      setText2cResult({ success: false, error: err.message });
    } finally {
      setText2cLoading(false);
    }
  };

  // U1: pull the auditable reasoning trail for this session from the graph
  const handleShowTrail = async () => {
    if (!sessionId) return;
    setTrailLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/memory/session/${sessionId}`);
      const data = await res.json();
      setTrail(data);
    } catch (err) {
      setTrail({ success: false, error: err.message });
    } finally {
      setTrailLoading(false);
    }
  };

  const pipelineMode = pipelineResult?.pipeline?.mode;
  const synthesis = queryResult?.synthesis;

  return (
    <div className="cognitive-studio-container">
      {/* Header & Presets */}
      <div className="studio-header">
        <div>
          <h3>🧠 Cognitive Memory Studio (Cognee ECL + GraphRAG)</h3>
          <p className="subtitle">
            Extract-Cognify-Load (ECL) pipeline with directive prompting, FastEmbed ONNX, and NVIDIA
            Nemotron 30B reasoning.
          </p>
        </div>

        <div className="preset-selector">
          <span className="preset-label">Domain Presets:</span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`btn-preset ${selectedPreset.id === p.id ? 'active' : ''}`}
              onClick={() => handleSelectPreset(p)}
            >
              {p.title}
            </button>
          ))}
        </div>
      </div>

      <div className="studio-grid">
        {/* Left Column: ECL Pipeline Ingestion */}
        <div className="card studio-card">
          <div className="card-header-bar">
            <h4>📥 1. Unstructured Domain Ingestion</h4>
            <span className="badge badge-info">Token Chunking: 500 tokens</span>
          </div>

          <label className="input-label">Raw Dataset or Problem Statement:</label>
          <textarea
            className="code-textarea"
            rows={7}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste raw documents, problem statement, or audit logs here..."
          />

          <label className="input-label">Directive Extraction Prompt (`custom_prompt`):</label>
          <input
            type="text"
            className="input-text"
            value={directivePrompt}
            onChange={(e) => setDirectivePrompt(e.target.value)}
            placeholder="Direct model focus to isolate target entities..."
          />

          {isProcessing ? (
            <div className="pipeline-progress">
              <div className="step-indicator">
                <span className={`step-badge ${eclStep >= 1 ? 'active' : ''}`}>
                  1. Token Chunker
                </span>
                <span className="step-arrow">➔</span>
                <span className={`step-badge ${eclStep >= 2 ? 'active' : ''}`}>
                  2. Directive LLM
                </span>
                <span className="step-arrow">➔</span>
                <span className={`step-badge ${eclStep >= 3 ? 'active' : ''}`}>
                  3. Graph Loading
                </span>
              </div>
              <p className="step-status">
                Processing ECL pipeline (first live run can take 1-3 minutes: model warm-up + LLM
                extraction)...
              </p>
            </div>
          ) : (
            <button onClick={handleRunCognify} className="btn-primary-action">
              🚀 Run ECL Pipeline &amp; Build Graph
            </button>
          )}

          {pipelineResult && !isProcessing && (
            <div
              className={`pipeline-result ${pipelineResult.success ? 'result-live' : 'result-error'}`}
            >
              {pipelineResult.success ? (
                <>
                  <div className="result-badges">
                    <span
                      className={`mode-badge ${pipelineMode === 'live' ? 'badge-live' : 'badge-sim'}`}
                    >
                      {pipelineMode === 'live'
                        ? '🟢 LIVE Cognee ECL Pipeline'
                        : '🟡 Simulated ECL (microservice down)'}
                    </span>
                    {pipelineMode === 'live' && pipelineResult.pipeline.elapsedMs != null && (
                      <span className="elapsed-badge">
                        {(pipelineResult.pipeline.elapsedMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  <p className="result-detail">
                    Claim <code>{pipelineResult.claim?.claimId}</code> staged (
                    {pipelineResult.claim?.sizeBytes ?? 0} bytes)
                    {pipelineMode === 'live' && (
                      <>
                        {' '}
                        • dataset <code>{pipelineResult.pipeline.dataset}</code> →{' '}
                        {pipelineResult.pipeline.cognify?.status || 'processed'}
                      </>
                    )}
                  </p>
                  {pipelineMode !== 'live' && (
                    <p className="result-hint">
                      Run <code>npm run cognee:start</code> in a second terminal, then re-run the
                      pipeline for real Cognee extraction (FastEmbed + Neo4j persistence).
                    </p>
                  )}
                </>
              ) : (
                <p className="result-error-text">❌ Pipeline failed: {pipelineResult.error}</p>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Multi-Hop GraphRAG Reasoning */}
        <div className="card studio-card">
          <div className="card-header-bar">
            <h4>🔍 2. Multi-Hop GraphRAG Reasoning Console</h4>
            <span className="badge badge-success">NVIDIA Nemotron 30B</span>
          </div>

          <label className="input-label">Natural Language Query:</label>
          <div className="query-input-group">
            <input
              type="text"
              className="input-text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Ask a multi-hop reasoning question..."
            />
            <button onClick={handleExecuteQuery} disabled={queryLoading} className="btn-query">
              {queryLoading ? 'Reasoning...' : '⚡ Query Graph'}
            </button>
            <button
              onClick={handleText2Cypher}
              disabled={text2cLoading}
              className="btn-query"
              title="LLM generates read-only Cypher, executes it, and shows the query"
            >
              {text2cLoading ? 'Generating…' : '🧬 Ask via Cypher'}
            </button>
          </div>

          <div className="query-chips">
            <span className="chip-label">Quick test:</span>
            <button onClick={() => setQueryText(selectedPreset.sampleQuery)} className="chip-btn">
              {selectedPreset.sampleQuery}
            </button>
          </div>

          <div className="reasoning-output-panel">
            {queryLoading ? (
              <div className="loading-shimmer">
                <div className="shimmer-line" />
                <div className="shimmer-line" style={{ width: '80%' }} />
                <div className="shimmer-line" style={{ width: '60%' }} />
              </div>
            ) : queryResult ? (
              queryResult.success ? (
                <div className="result-content">
                  <div className="result-header">
                    <span className="source-tag">
                      {queryResult.grounding === 'cognee_graph'
                        ? '🕸️ Cognee Graph Context'
                        : '📄 Raw Text Context (start cognee service for graph grounding)'}
                    </span>
                    <span className="key-tag">
                      NVIDIA Key #{synthesis?.keyIndexUsed || 1}
                      {queryResult.retrievalResults > 0 &&
                        ` • ${queryResult.retrievalResults} graph facts`}
                    </span>
                  </div>
                  <p className="response-text">{synthesis?.content}</p>
                  <div className="meta-footer">
                    <span>Model: {synthesis?.model}</span>
                    <span>Tokens: {synthesis?.usage ? synthesis.usage.total_tokens : 'N/A'}</span>
                  </div>
                </div>
              ) : (
                <div className="error-box">
                  <p>❌ Error: {queryResult.error}</p>
                </div>
              )
            ) : (
              <div className="empty-state">
                <p>
                  Click <strong>&quot;Query Graph&quot;</strong> to execute multi-hop reasoning
                  across entities.
                </p>
              </div>
            )}
          </div>

          {/* U3: Text2Cypher result — generated Cypher shown for explainability */}
          {text2cResult && (
            <div
              className={`text2c-panel ${text2cResult.success ? 'result-live' : 'result-error'}`}
            >
              <div className="result-badges">
                <span className={`mode-badge ${text2cResult.success ? 'badge-live' : 'badge-sim'}`}>
                  {text2cResult.success
                    ? '🧬 Generated Cypher (read-only)'
                    : '❌ Generation failed'}
                </span>
              </div>
              {text2cResult.success ? (
                <>
                  <pre className="cypher-code">{text2cResult.cypher}</pre>
                  {text2cResult.synthesis?.content && (
                    <p className="response-text">{text2cResult.synthesis.content}</p>
                  )}
                </>
              ) : (
                <p className="result-error-text">{text2cResult.error}</p>
              )}
            </div>
          )}

          {/* U1: auditable reasoning trail from the Agent Memory Context Graph */}
          <div className="trail-bar">
            <button
              onClick={handleShowTrail}
              disabled={trailLoading || !sessionId}
              className="btn-query"
            >
              {trailLoading ? 'Loading…' : '🧾 Show Reasoning Trail'}
            </button>
          </div>
          {trail && (
            <div className="trail-panel">
              {trail.success ? (
                trail.trail.length ? (
                  trail.trail.map((t, i) => (
                    <div key={i} className="trail-step">
                      <div className="trail-q">Q: {t.userText}</div>
                      <div className="trail-meta">
                        tool: <code>{t.toolUsed}</code> · grounding: <code>{t.grounding}</code> ·
                        entities: <code>{t.retrievedEntities.join(', ') || '—'}</code>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="result-detail">No interactions recorded for this session yet.</p>
                )
              ) : (
                <p className="result-error-text">{trail.error}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
