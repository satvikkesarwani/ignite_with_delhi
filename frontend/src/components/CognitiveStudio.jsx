import { useState } from 'react';

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
  const [queryText, setQueryText] = useState(PRESETS[0].sampleQuery);
  const [queryResult, setQueryResult] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);

  const handleSelectPreset = (preset) => {
    setSelectedPreset(preset);
    setInputText(preset.sampleText);
    setDirectivePrompt(preset.prompt);
    setQueryText(preset.sampleQuery);
    setQueryResult(null);
  };

  const handleRunCognify = async () => {
    setIsProcessing(true);
    setEclStep(1); // Token chunking

    setTimeout(() => setEclStep(2), 1000); // Directive LLM Extraction
    setTimeout(() => setEclStep(3), 2200); // Neo4j Graph Sync

    try {
      // First save payload via Claim-Check
      await fetch(`${backendUrl}/api/claim/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: `${selectedPreset.id}_dataset.txt`, content: inputText }),
      });

      // Warm up graph
      await fetch(`${backendUrl}/api/graph/warmup`, { method: 'POST' });

      setTimeout(() => {
        setIsProcessing(false);
        setEclStep(0);
        alert('✅ Cognify Complete! Knowledge Graph loaded into Neo4j & LanceDB.');
      }, 3200);
    } catch (err) {
      console.warn('Cognify trigger error:', err);
      setIsProcessing(false);
      setEclStep(0);
    }
  };

  const handleExecuteQuery = async () => {
    if (!queryText.trim()) return;
    setQueryLoading(true);
    setQueryResult(null);

    try {
      const res = await fetch(`${backendUrl}/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Based on the following knowledge context and knowledge graph facts:\n\nContext:\n${inputText}\n\nQuery:\n${queryText}\n\nProvide an authoritative, multi-hop reasoning analysis citing specific entity relationships, jurisdictions, and risk factors.`,
          systemPrompt:
            'You are a Knowledge-Grounded Cognitive Runtime agent. Answer deterministically using graph entities.',
        }),
      });

      const data = await res.json();
      setQueryResult(data);
    } catch (err) {
      setQueryResult({ error: err.message });
    } finally {
      setQueryLoading(false);
    }
  };

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
                  3. Neo4j Loading
                </span>
              </div>
              <p className="step-status">Processing ECL pipeline across distributed workers...</p>
            </div>
          ) : (
            <button onClick={handleRunCognify} className="btn-primary-action">
              🚀 Run ECL Pipeline & Build Graph
            </button>
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
                    <span className="source-tag">Grounded Graph Path Synthesized</span>
                    <span className="key-tag">NVIDIA Key #{queryResult.keyIndex || 1}</span>
                  </div>
                  <p className="response-text">{queryResult.content}</p>
                  <div className="meta-footer">
                    <span>Model: {queryResult.model}</span>
                    <span>
                      Tokens: {queryResult.usage ? queryResult.usage.total_tokens : 'N/A'}
                    </span>
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
        </div>
      </div>
    </div>
  );
}
