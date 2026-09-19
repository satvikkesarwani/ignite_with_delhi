import dotenv from 'dotenv';
import { Agent, fetch as undiciFetch } from 'undici';
import { createLogger } from './logger.js';

dotenv.config();

const log = createLogger('cognify-bridge');

// Node's global fetch (built-in undici) aborts with "fetch failed" once its internal
// 300s headersTimeout fires — real cognify runs take 2-6 minutes. We use the external
// undici package's own fetch + Agent together (mixing its Agent with the global fetch
// throws "invalid onRequestStart method").
const longHaulAgent = new Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 15000 });

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

/**
 * fetchWithTimeout wraps the long-haul undici fetch with an abort deadline.
 * `requestId` is forwarded as X-Request-Id so the Python service logs every
 * stage with the same correlation id the Express request started with.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000, requestId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await undiciFetch(url, {
      ...options,
      headers: { ...(options.headers || {}), 'X-Request-Id': requestId || '-' },
      signal: controller.signal,
      dispatcher: longHaulAgent,
    });
  } finally {
    clearTimeout(timer);
  }
}

class CognifyService {
  constructor() {
    this.serviceUrl = COGNEE_URL;
    log.info('Cognify bridge initialized', { serviceUrl: this.serviceUrl || '(disabled)' });
  }

  async checkServiceHealth(requestId) {
    if (!this.serviceUrl) {
      log.debug('Health check skipped — service URL not configured');
      return { available: false, reason: 'COGNEE_SERVICE_URL not configured in this environment' };
    }
    const startedAt = Date.now();
    try {
      const res = await fetchWithTimeout(
        `${this.serviceUrl}/health`,
        {},
        HEALTH_TIMEOUT_MS,
        requestId
      );
      if (!res.ok) {
        log.warn('Cognee health check failed', {
          requestId,
          status: res.status,
          durationMs: Date.now() - startedAt,
        });
        return { available: false, reason: `Cognee service health returned HTTP ${res.status}` };
      }
      const info = await res.json();
      log.debug('Cognee health check OK', {
        requestId,
        durationMs: Date.now() - startedAt,
        graphProvider: info.graph_provider,
      });
      return { available: true, url: this.serviceUrl, info };
    } catch (err) {
      log.warn('Cognee health check unreachable', {
        requestId,
        durationMs: Date.now() - startedAt,
        error: err.message,
        abort: err.name === 'AbortError',
      });
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
  async runEclPipeline({ content, datasetName = 'hackathon_domain_memory', prompt, requestId }) {
    const startedAt = Date.now();
    const reqLog = log.withContext({
      requestId,
      dataset: datasetName,
      contentChars: content?.length,
    });
    const health = await this.checkServiceHealth(requestId);
    if (!health.available) {
      reqLog.warn('ECL pipeline degraded to simulation — service unavailable', {
        reason: health.reason,
      });
      return {
        mode: 'simulation',
        available: false,
        reason: health.reason,
        message:
          'Cognee microservice not reachable — ECL pipeline simulated. Start it with `npm run cognee:start` for live extraction.',
      };
    }

    const headers = { 'Content-Type': 'application/json' };

    reqLog.info('ECL stage 1/2: ingest →');
    const ingestStart = Date.now();
    const ingestRes = await fetchWithTimeout(
      `${this.serviceUrl}/api/ingest`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ content, dataset_name: datasetName }),
      },
      PIPELINE_TIMEOUT_MS,
      requestId
    );
    if (!ingestRes.ok) {
      const body = await ingestRes.text();
      reqLog.error('ECL ingest failed', { status: ingestRes.status, body: body.slice(0, 500) });
      throw new Error(`Cognee ingest failed: HTTP ${ingestRes.status} — ${body}`);
    }
    const ingest = await ingestRes.json();
    reqLog.info('ECL stage 1/2: ingest ←', {
      status: ingest.status,
      durationMs: Date.now() - ingestStart,
    });

    reqLog.info('ECL stage 2/2: cognify → (LLM extraction + graph load, can take minutes)');
    const cognifyStart = Date.now();
    const cognifyRes = await fetchWithTimeout(
      `${this.serviceUrl}/api/cognify`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ dataset_name: datasetName, custom_prompt: prompt }),
      },
      PIPELINE_TIMEOUT_MS,
      requestId
    );
    if (!cognifyRes.ok) {
      const body = await cognifyRes.text();
      reqLog.error('ECL cognify failed', {
        status: cognifyRes.status,
        durationMs: Date.now() - cognifyStart,
        body: body.slice(0, 500),
      });
      throw new Error(`Cognee cognify failed: HTTP ${cognifyRes.status} — ${body}`);
    }
    const cognify = await cognifyRes.json();
    reqLog.info('ECL stage 2/2: cognify ←', {
      status: cognify.status,
      durationMs: Date.now() - cognifyStart,
    });

    const elapsedMs = Date.now() - startedAt;
    reqLog.info('ECL pipeline complete', { mode: 'live', elapsedMs });
    return {
      mode: 'live',
      available: true,
      serviceUrl: this.serviceUrl,
      dataset: datasetName,
      ingest,
      cognify,
      elapsedMs,
    };
  }

  /**
   * GraphRAG retrieval from cognitive memory. Falls back to an empty result set
   * when the service is down — callers then synthesize from raw context instead.
   */
  async searchMemory({ query, datasetName = 'hackathon_domain_memory', requestId }) {
    const health = await this.checkServiceHealth(requestId);
    if (!health.available) {
      log.warn('GraphRAG retrieval fell back — service unavailable', {
        requestId,
        reason: health.reason,
      });
      return { mode: 'fallback', reason: health.reason, results: [] };
    }

    const startedAt = Date.now();
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
        SEARCH_TIMEOUT_MS,
        requestId
      );
      if (!res.ok) {
        log.warn('GraphRAG search HTTP failure', {
          requestId,
          status: res.status,
          durationMs: Date.now() - startedAt,
        });
        return { mode: 'fallback', reason: `search HTTP ${res.status}`, results: [] };
      }
      const data = await res.json();
      if (!data.success) {
        log.warn('GraphRAG search returned failure', {
          requestId,
          error: data.error,
          durationMs: Date.now() - startedAt,
        });
        return { mode: 'fallback', reason: data.error || 'search failed', results: [] };
      }
      log.info('GraphRAG search complete', {
        requestId,
        resultCount: (data.results || []).length,
        durationMs: Date.now() - startedAt,
      });
      return { mode: 'live', results: data.results || [] };
    } catch (err) {
      log.error('GraphRAG search request failed', {
        requestId,
        durationMs: Date.now() - startedAt,
        error: err.message,
        abort: err.name === 'AbortError',
      });
      return { mode: 'fallback', reason: err.message, results: [] };
    }
  }

  /**
   * Generic proxy for auxiliary cognee-service endpoints (embeddings, entity
   * embedding sync — U2). Returns { available:false } instead of throwing when
   * the microservice is down so routes can degrade honestly.
   */
  async proxyPost(path, body = {}, requestId, timeoutMs = SEARCH_TIMEOUT_MS) {
    const health = await this.checkServiceHealth(requestId);
    if (!health.available) {
      return { available: false, reason: health.reason };
    }
    try {
      const res = await fetchWithTimeout(
        `${this.serviceUrl}${path}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        timeoutMs,
        requestId
      );
      if (!res.ok) {
        return { available: false, reason: `${path} HTTP ${res.status}` };
      }
      return { available: true, data: await res.json() };
    } catch (err) {
      log.error('Cognee proxy call failed', { requestId, path, message: err.message });
      return { available: false, reason: err.message };
    }
  }
}

export const cognifyService = new CognifyService();
