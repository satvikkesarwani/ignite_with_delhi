import dotenv from 'dotenv';
import { createLogger } from './logger.js';
import { generateChat } from './aiService.js';
import { claimCheckService } from './claimCheckService.js';
import { cognifyService } from './cognifyService.js';

dotenv.config();

const log = createLogger('tavily');

const TAVILY_URL = 'https://api.tavily.com';
const SEARCH_TIMEOUT_MS = 45000;
const EXTRACT_TIMEOUT_MS = 90000;
const SEARCH_DEPTH_VALUES = new Set(['basic', 'advanced', 'fast', 'ultra-fast']);
const TOPIC_VALUES = new Set(['general', 'news', 'finance']);
const EXTRACT_DEPTH_VALUES = new Set(['basic', 'advanced']);

class TavilyError extends Error {
  constructor(message, status, retryAfterMs = null) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

async function tavilyFetch(path, body, apiKey, timeoutMs, requestId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${TAVILY_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Request-Id': requestId || '-',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (res.ok) {
      const data = await res.json();
      log.info('Tavily call OK', {
        requestId,
        path,
        durationMs: Date.now() - startedAt,
        credits: data.usage?.credits ?? null,
        resultCount: (data.results || []).length,
      });
      return data;
    }

    // 429: honor Tavily's Retry-After once before surfacing the error
    if (res.status === 429) {
      const retryAfterSec = parseFloat(res.headers.get('retry-after')) || 2;
      const waitMs = Math.min(retryAfterSec * 1000, 10000);
      log.warn('Tavily rate limited — honoring Retry-After', { requestId, waitMs });
      await new Promise((r) => setTimeout(r, waitMs));
      const retryRes = await fetch(`${TAVILY_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-Request-Id': requestId || '-',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (retryRes.ok) return await retryRes.json();
      const retryBody = await retryRes.text();
      throw new TavilyError(
        `Tavily ${path} failed after retry: HTTP ${retryRes.status} — ${retryBody.slice(0, 200)}`,
        retryRes.status
      );
    }

    const errBody = await res.text();
    const friendly =
      res.status === 401
        ? 'Invalid or missing Tavily API key'
        : res.status === 432
          ? 'Tavily key/plan usage limit exceeded — upgrade plan or check credits'
          : res.status === 433
            ? 'Tavily pay-as-you-go limit exceeded'
            : `Tavily ${path} failed: HTTP ${res.status}`;
    log.error('Tavily call failed', {
      requestId,
      path,
      status: res.status,
      durationMs: Date.now() - startedAt,
      body: errBody.slice(0, 300),
    });
    throw new TavilyError(`${friendly} — ${errBody.slice(0, 200)}`, res.status);
  } catch (err) {
    if (err instanceof TavilyError) throw err;
    if (err.name === 'AbortError') {
      log.error('Tavily call timed out', { requestId, path, timeoutMs });
      throw new TavilyError(`Tavily ${path} timed out after ${timeoutMs}ms`, 504);
    }
    log.error('Tavily request error', { requestId, path, message: err.message, stack: err.stack });
    throw new TavilyError(`Tavily ${path} request failed: ${err.message}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

class TavilyService {
  constructor() {
    this.apiKey = process.env.TAVILY_API_KEY || '';
    this.keyConfigured = Boolean(this.apiKey.trim());
    log.info('Tavily service initialized', { keyConfigured: this.keyConfigured });
  }

  isConfigured() {
    return this.keyConfigured;
  }

  getStatus() {
    return {
      keyConfigured: this.keyConfigured,
      keyPreview: this.apiKey ? `${this.apiKey.slice(0, 8)}…` : null,
      endpoints: [
        '/api/tavily/search',
        '/api/tavily/extract',
        '/api/tavily/research',
        '/api/tavily/ingest-to-graph',
      ],
      setupHint: 'Set TAVILY_API_KEY in backend/.env (format tvly-...) and restart the backend',
    };
  }

  requireKey() {
    if (!this.keyConfigured) {
      throw new TavilyError(
        'TAVILY_API_KEY not configured — set it in backend/.env (format tvly-...) and restart the backend',
        503
      );
    }
    return this.apiKey;
  }

  normalizeSearch(body = {}) {
    const query = (body.query || '').trim();
    if (!query) throw new TavilyError('query is required', 400);
    const searchDepth = SEARCH_DEPTH_VALUES.has(body.searchDepth) ? body.searchDepth : 'basic';
    const topic = TOPIC_VALUES.has(body.topic) ? body.topic : 'general';
    const maxResults = Math.min(Math.max(parseInt(body.maxResults, 10) || 5, 1), 20);
    return {
      query,
      search_depth: searchDepth,
      topic,
      max_results: maxResults,
      include_answer: body.includeAnswer !== undefined ? body.includeAnswer : 'basic',
      ...(body.timeRange ? { time_range: body.timeRange } : {}),
      ...(body.includeDomains?.length ? { include_domains: body.includeDomains } : {}),
      ...(body.excludeDomains?.length ? { exclude_domains: body.excludeDomains } : {}),
      ...(body.country ? { country: body.country } : {}),
      ...(body.includeRawContent ? { include_raw_content: 'markdown' } : {}),
    };
  }

  async search(body = {}, requestId) {
    const apiKey = this.requireKey();
    const payload = this.normalizeSearch(body);
    const data = await tavilyFetch('/search', payload, apiKey, SEARCH_TIMEOUT_MS, requestId);
    return {
      query: data.query,
      answer: data.answer || null,
      results: (data.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        score: r.score,
        publishedDate: r.published_date || null,
        ...(r.raw_content ? { rawContent: r.raw_content } : {}),
      })),
      responseTime: data.response_time,
      credits: data.usage?.credits ?? null,
    };
  }

  async extract(body = {}, requestId) {
    const apiKey = this.requireKey();
    const urls = body.urls;
    const urlList = Array.isArray(urls) ? urls : urls ? [urls] : [];
    if (!urlList.length) throw new TavilyError('urls is required (string or array, max 20)', 400);
    if (urlList.length > 20) throw new TavilyError('max 20 urls per extract call', 400);
    const extractDepth = EXTRACT_DEPTH_VALUES.has(body.extractDepth) ? body.extractDepth : 'basic';

    const payload = {
      urls: urlList,
      extract_depth: extractDepth,
      format: body.format === 'text' ? 'text' : 'markdown',
      ...(body.query ? { query: body.query } : {}),
    };
    const data = await tavilyFetch('/extract', payload, apiKey, EXTRACT_TIMEOUT_MS, requestId);
    return {
      results: (data.results || []).map((r) => ({ url: r.url, content: r.raw_content })),
      failedResults: data.failed_results || [],
      responseTime: data.response_time,
      credits: data.usage?.credits ?? null,
    };
  }

  /**
   * AI capability combo: live web search → Nemotron synthesis grounded in the
   * result snippets, with every source URL cited in the prompt.
   */
  async research({ query, maxResults = 5, topic = 'general' } = {}, requestId) {
    const search = await this.search(
      { query, maxResults, topic, searchDepth: 'advanced', includeAnswer: true },
      requestId
    );
    const sources = search.results
      .map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${r.snippet}`)
      .join('\n\n');

    const synthesis = await generateChat({
      messages: [
        {
          role: 'system',
          content:
            'You are a research assistant. Synthesize an answer ONLY from the supplied web search results. Cite sources as [1], [2]… inline. /no_think — output only the final answer.',
        },
        {
          role: 'user',
          content: `Web search results for "${query}":\n\n${sources}\n\nSynthesize a concise, well-cited answer.`,
        },
      ],
      maxTokens: 800,
    });

    return {
      query,
      sources: search.results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet })),
      synthesis,
    };
  }

  /**
   * THE bridge: fresh web data → Cognee ECL → AuraDB knowledge graph.
   * Search results become a source-attributed document, staged via
   * claim-check, then cognified — so web facts become graph facts.
   */
  async ingestToGraph(
    { query, datasetName = 'web_research', prompt, maxResults = 5 } = {},
    requestId
  ) {
    const logCtx = log.withContext({ requestId, dataset: datasetName });
    const search = await this.search({ query, maxResults, searchDepth: 'advanced' }, requestId);
    if (!search.results.length) {
      throw new TavilyError(`No web results for: ${query}`, 404);
    }

    const doc = [
      `# Web Research: ${query}`,
      `Retrieved: ${new Date().toISOString()}`,
      '',
      ...search.results.map(
        (r, i) => `## Source ${i + 1}: ${r.title}\nURL: ${r.url}\n${r.snippet}`
      ),
    ].join('\n');

    logCtx.info('Web research staged for graph ingestion', {
      resultCount: search.results.length,
      docChars: doc.length,
    });

    // Claim-check: stage the research document, pass only the URI downstream
    const claim = await claimCheckService.storePayload(
      `${datasetName}.md`,
      Buffer.from(doc, 'utf-8'),
      'text/markdown'
    );

    const pipeline = await cognifyService.runEclPipeline({
      content: doc,
      datasetName,
      prompt:
        prompt ||
        'Extract all entities, organizations, facts, and their relationships from this web research document. Preserve source URLs where mentioned.',
      requestId,
    });

    return {
      query,
      sourcesUsed: search.results.map((r) => r.url),
      claim,
      pipeline,
    };
  }
}

export const tavilyService = new TavilyService();
export { TavilyError };
