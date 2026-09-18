import dotenv from 'dotenv';

dotenv.config();

// In production (Render) there is no Python microservice unless COGNEE_SERVICE_URL is set;
// locally we default to the FastAPI service started via `npm run cognee:start` (port 8100 —
// 8000 is commonly squatted by other local projects).
const COGNEE_URL = (
  process.env.COGNEE_SERVICE_URL ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8100')
).replace(/\/$/, '');

const HEALTH_TIMEOUT_MS = 2500;
const PIPELINE_TIMEOUT_MS = 480000; // Nemotron reasoning makes a real cognify take 2-5 min
const SEARCH_TIMEOUT_MS = 180000;

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

class CognifyService {
  constructor() {
    this.serviceUrl = COGNEE_URL;
  }

  async checkServiceHealth() {
    if (!this.serviceUrl) {
      return { available: false, reason: 'COGNEE_SERVICE_URL not configured in this environment' };
    }
    try {
      const res = await fetchWithTimeout(`${this.serviceUrl}/health`, {}, HEALTH_TIMEOUT_MS);
      if (!res.ok) {
        return { available: false, reason: `Cognee service health returned HTTP ${res.status}` };
      }
      return { available: true, url: this.serviceUrl, info: await res.json() };
    } catch (err) {
      return {
        available: false,
        reason: `Cognee service unreachable (${err.name === 'AbortError' ? 'timeout' : err.message})`,
      };
    }
  }

  /**
   * Full ECL pipeline against the Python cognee microservice.
   * Returns mode:"live" on success, or mode:"simulation" when the service is down
   * so the UI can degrade gracefully instead of failing a demo.
   */
  async runEclPipeline({ content, datasetName = 'hackathon_domain_memory', prompt }) {
    const startedAt = Date.now();
    const health = await this.checkServiceHealth();
    if (!health.available) {
      return {
        mode: 'simulation',
        available: false,
        reason: health.reason,
        message:
          'Cognee microservice not reachable — ECL pipeline simulated. Start it with `npm run cognee:start` for live extraction.',
      };
    }

    const headers = { 'Content-Type': 'application/json' };

    const ingestRes = await fetchWithTimeout(
      `${this.serviceUrl}/api/ingest`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ content, dataset_name: datasetName }),
      },
      PIPELINE_TIMEOUT_MS
    );
    if (!ingestRes.ok) {
      throw new Error(`Cognee ingest failed: HTTP ${ingestRes.status} — ${await ingestRes.text()}`);
    }
    const ingest = await ingestRes.json();

    const cognifyRes = await fetchWithTimeout(
      `${this.serviceUrl}/api/cognify`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ dataset_name: datasetName, custom_prompt: prompt }),
      },
      PIPELINE_TIMEOUT_MS
    );
    if (!cognifyRes.ok) {
      throw new Error(
        `Cognee cognify failed: HTTP ${cognifyRes.status} — ${await cognifyRes.text()}`
      );
    }
    const cognify = await cognifyRes.json();

    return {
      mode: 'live',
      available: true,
      serviceUrl: this.serviceUrl,
      dataset: datasetName,
      ingest,
      cognify,
      elapsedMs: Date.now() - startedAt,
    };
  }

  /**
   * GraphRAG retrieval from cognitive memory. Falls back to an empty result set
   * when the service is down — callers then synthesize from raw context instead.
   */
  async searchMemory({ query, datasetName = 'hackathon_domain_memory' }) {
    const health = await this.checkServiceHealth();
    if (!health.available) {
      return { mode: 'fallback', reason: health.reason, results: [] };
    }

    try {
      const res = await fetchWithTimeout(
        `${this.serviceUrl}/api/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            dataset_name: datasetName,
            search_type: 'GRAPH_COMPLETION',
          }),
        },
        SEARCH_TIMEOUT_MS
      );
      if (!res.ok) {
        return { mode: 'fallback', reason: `search HTTP ${res.status}`, results: [] };
      }
      const data = await res.json();
      if (!data.success) {
        return { mode: 'fallback', reason: data.error || 'search failed', results: [] };
      }
      return { mode: 'live', results: data.results || [] };
    } catch (err) {
      return { mode: 'fallback', reason: err.message, results: [] };
    }
  }
}

export const cognifyService = new CognifyService();
