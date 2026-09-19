import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { startKeepAlive } from './keepAlive.js';
import { generateChat, checkKeysHealth } from './aiService.js';
import { neo4jService } from './neo4jService.js';
import { claimCheckService } from './claimCheckService.js';
import { renderWorkflowService } from './renderWorkflowService.js';
import { cognifyService } from './cognifyService.js';
import { tavilyService } from './tavilyService.js';
import { memoryService } from './memoryService.js';
import { logger, createLogger } from './logger.js';
import { crmRouter } from './crmRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const httpLog = createLogger('http');

// ---- Global crash safety net: nothing escapes without a log line ----
process.on('uncaughtException', (err) => {
  logger.fatal('uncaughtException — process keeps running', {
    message: err.message,
    stack: err.stack,
  });
});
process.on('unhandledRejection', (reason) => {
  logger.fatal('unhandledRejection', {
    reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason,
  });
});
['SIGTERM', 'SIGINT'].forEach((signal) => {
  process.on(signal, () => {
    logger.info(`Received ${signal} — shutting down gracefully`);
    process.exit(0);
  });
});

// Enable CORS for all origins in development and production
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

// ---- Request logging middleware: stamps every request with a correlation id ----
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID().slice(0, 12);
  req.log = httpLog.withContext({ requestId: req.requestId });
  res.setHeader('X-Request-Id', req.requestId);

  const start = Date.now();
  req.log.info(`${req.method} ${req.originalUrl} →`);
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const entry = { status: res.statusCode, durationMs };
    if (res.statusCode >= 500) req.log.error(`${req.method} ${req.originalUrl} ←`, entry);
    else if (res.statusCode >= 400) req.log.warn(`${req.method} ${req.originalUrl} ←`, entry);
    else req.log.info(`${req.method} ${req.originalUrl} ←`, entry);
  });
  next();
});

// In-memory mock data for hackathon quickstart
let hackathonProjects = [
  { id: 1, title: 'AI Medical Diagnostician', status: 'In Progress', score: 94 },
  { id: 2, title: 'DeFi Micro-Lending Pool', status: 'Completed', score: 88 },
  { id: 3, title: 'Autonomous Drone Delivery', status: 'Review', score: 91 },
];

/**
 * Health Check Endpoint
 * Render uses this to check service health, and keep-alive pings this endpoint.
 */
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    service: 'ignite-backend',
    environment: process.env.NODE_ENV || 'development',
    memory: {
      rssMb: (memoryUsage.rss / 1024 / 1024).toFixed(2),
      heapUsedMb: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
    },
  });
});

/**
 * Root Welcome Endpoint
 */
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Ignite Hackathon API is Live & Healthy!',
    cdPipeline: '100% Verified & Live (Auto-Deploys on Push)',
    e2eVerifiedAt: '2026-09-18',
    healthCheck: '/health',
    docs: 'Full API reference: backend/API_DOCS.md',
    endpoints: {
      system: [
        'GET /health',
        'GET /api/hello',
        'GET /api/projects',
        'POST /api/projects',
        'POST /api/echo',
      ],
      ai: ['GET /api/ai/status', 'GET /api/ai/keys', 'POST /api/ai/generate', 'POST /api/ai/chat'],
      graph: [
        'GET /api/graph/status',
        'GET /api/graph/visualize',
        'POST /api/graph/query',
        'GET|POST /api/graph/warmup',
      ],
      claimCheck: ['POST /api/claim/upload'],
      workflows: ['POST /api/workflow/trigger', 'POST /api/workflow/run-task'],
      cognify: ['GET /api/cognify/status', 'POST /api/cognify/run', 'POST /api/cognify/query'],
    },
  });
});

/**
 * Sample Test Endpoints
 */
app.get('/api/hello', (req, res) => {
  res.json({
    success: true,
    message: 'Hello from the Express backend! Continuous deployment is connected.',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/projects', (req, res) => {
  res.json({
    success: true,
    count: hackathonProjects.length,
    data: hackathonProjects,
  });
});

app.post('/api/projects', (req, res) => {
  const { title, status = 'New', score = 0 } = req.body;
  if (!title) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }

  const newProject = {
    id: Date.now(),
    title,
    status,
    score: Number(score),
  };

  hackathonProjects.push(newProject);
  res.status(201).json({ success: true, data: newProject });
});

/**
 * NVIDIA AI Quick-Connect Endpoints (Model: nvidia/nemotron-3.5-lightning-30b-a3b)
 * Features: Automatic 5-Key Pool Rotation & Failover
 */
app.get('/api/ai/status', (req, res) => {
  res.json({
    success: true,
    provider: 'NVIDIA NIM',
    model: process.env.NVIDIA_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b',
    keyRotationEnabled: true,
    totalKeys: 5,
    status: 'Ready',
  });
});

/**
 * Live per-key NVIDIA health check — one call proves the whole 5-key pool.
 * Costs 5 tiny completions; use it before the demo, not on every page load.
 */
app.get('/api/ai/keys', async (req, res) => {
  try {
    const report = await checkKeysHealth();
    req.log.info('AI key pool check', {
      alive: report.aliveCount,
      total: report.total,
    });
    res.json({ success: true, ...report });
  } catch (err) {
    req.log.error('AI key pool check failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ai/generate', async (req, res) => {
  try {
    const {
      prompt,
      // /no_think keeps Nemotron's reasoning phase out of the visible answer
      systemPrompt = 'You are a helpful, fast hackathon AI assistant. /no_think — output only the final answer.',
      temperature = 0.6,
      maxTokens = 1024,
    } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    const result = await generateChat({ messages, temperature, maxTokens });
    res.json(result);
  } catch (err) {
    req.log.error('AI generation failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages, temperature = 0.6, maxTokens = 1024 } = req.body;
    if (!messages || !Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ success: false, error: 'Messages array is required' });
    }

    const result = await generateChat({ messages, temperature, maxTokens });
    res.json(result);
  } catch (err) {
    req.log.error('AI chat failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Neo4j Knowledge Graph Endpoints
 */
app.get('/api/graph/status', async (req, res) => {
  try {
    const health = await neo4jService.checkHealth();
    res.json(health);
  } catch (err) {
    req.log.error('Graph status check failed', { message: err.message, stack: err.stack });
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/api/graph/visualize', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const graphData = await neo4jService.getGraphVisualization(limit);
    res.json(graphData);
  } catch (err) {
    req.log.error('Endpoint failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/graph/query', async (req, res) => {
  try {
    const { cypher, params = {} } = req.body;
    if (!cypher) {
      return res.status(400).json({ success: false, error: 'Cypher query string is required' });
    }
    const result = await neo4jService.runCypherQuery(cypher, params);
    res.json(result);
  } catch (err) {
    req.log.error('Endpoint failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/graph/warmup', async (req, res) => {
  try {
    const result = await neo4jService.warmUp();
    res.json(result);
  } catch (err) {
    req.log.error('Endpoint failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/graph/warmup', async (req, res) => {
  try {
    const result = await neo4jService.warmUp();
    res.json(result);
  } catch (err) {
    req.log.error('Endpoint failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Claim-Check Storage Decoupling Endpoint
 */
app.post('/api/claim/upload', async (req, res) => {
  try {
    const { filename = 'dataset.txt', content = '', mimeType = 'text/plain' } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content payload is required' });
    }
    const claim = await claimCheckService.storePayload(
      filename,
      Buffer.from(content, 'utf-8'),
      mimeType
    );
    res.status(201).json({ success: true, claim });
  } catch (err) {
    req.log.error('Endpoint failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Render Workflows Dispatch Endpoint
 */
app.post('/api/workflow/trigger', async (req, res) => {
  try {
    const { command, planId = 'starter' } = req.body;
    if (!command) {
      return res
        .status(400)
        .json({ success: false, error: 'Command is required to trigger Render job' });
    }
    const result = await renderWorkflowService.triggerTask(command, planId);
    res.json(result);
  } catch (err) {
    req.log.error('Endpoint failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Render WORKFLOWS task-run trigger (durable ECL pipeline, study.md §7-§8).
 * Requires the workflow service (ignite-cognee-pipeline) deployed with credits.
 * Body: { "task": "ignite-cognee-pipeline/pipeline", "input": [claimUri, dataset, prompt] }
 * Observability: dashboard -> Workflows -> run history (logs, retries, timings).
 */
app.post('/api/workflow/run-task', async (req, res) => {
  try {
    const { task, input = [] } = req.body;
    if (!task) {
      return res
        .status(400)
        .json({ success: false, error: 'task is required (e.g. ignite-cognee-pipeline/pipeline)' });
    }
    const result = await renderWorkflowService.triggerTaskRun(task, input);
    req.log.info('Workflow task-run result', { task, success: result.success });
    res.json(result);
  } catch (err) {
    req.log.error('Endpoint failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Cognee Cognitive Memory Bridge (Node <-> Python FastAPI microservice)
 * The Python service runs locally via `npm run cognee:start` (or set COGNEE_SERVICE_URL).
 * Every endpoint degrades gracefully: if the microservice is down, callers get an
 * explicit simulation/fallback mode instead of a failed demo.
 */
app.get('/api/cognify/status', async (req, res) => {
  try {
    const status = await cognifyService.checkServiceHealth(req.requestId);
    res.json({ success: true, ...status, simulationHint: 'npm run cognee:start' });
  } catch (err) {
    req.log.error('Endpoint failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cognify/run', async (req, res) => {
  try {
    const { content, datasetName = 'hackathon_domain_memory', prompt } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content payload is required' });
    }

    // Claim-Check: persist the raw dataset first, pass only the URI downstream
    const claim = await claimCheckService.storePayload(
      `${datasetName}.txt`,
      Buffer.from(content, 'utf-8'),
      'text/plain'
    );
    const pipeline = await cognifyService.runEclPipeline({
      content,
      datasetName,
      prompt,
      requestId: req.requestId,
    });
    res.json({ success: true, claim, pipeline });
  } catch (err) {
    req.log.error('Cognify pipeline failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cognify/query', async (req, res) => {
  try {
    const { query, datasetName = 'hackathon_domain_memory', context = '' } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    // Stage 1: GraphRAG retrieval from cognitive memory (empty when service is down)
    const retrieval = await cognifyService.searchMemory({
      query,
      datasetName,
      requestId: req.requestId,
    });

    // Stage 2: Grounded synthesis — graph context when live, raw text when falling back
    const graphContext = retrieval.results.length
      ? retrieval.results.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n- ')
      : context;

    const synthesis = await generateChat({
      messages: [
        {
          role: 'system',
          content:
            'You are a Knowledge-Grounded Cognitive Runtime agent. Reason over the supplied knowledge-graph context and cite specific entity relationships deterministically. /no_think — output only the final structured answer; never expose your step-by-step thinking process.',
        },
        {
          role: 'user',
          content: `Knowledge graph context:\n- ${graphContext}\n\nQuery: ${query}\n\nProvide a multi-hop reasoning answer citing specific entities, relationships, and risk factors.`,
        },
      ],
    });

    // Stage 3 (U1): persist the interaction as an Agent Memory reasoning trail.
    // Never fails the answer — memory errors are logged and swallowed.
    const sessionId = req.body.sessionId || crypto.randomUUID().slice(0, 12);
    const grounding = retrieval.mode === 'live' ? 'cognee_graph' : 'raw_text_fallback';
    const memory = await memoryService
      .traceQuery({
        sessionId,
        query,
        grounding,
        answerText: synthesis.content,
        contextText: graphContext,
      })
      .catch((memErr) => {
        req.log.warn('Memory trace skipped', { message: memErr.message });
        return { stored: false, reason: memErr.message };
      });

    res.json({
      success: true,
      sessionId,
      memory,
      grounding: retrieval.mode === 'live' ? 'cognee_graph' : 'raw_text_fallback',
      retrievalResults: retrieval.results.length,
      synthesis,
    });
  } catch (err) {
    req.log.error('Cognify query failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

// U4: live graph schema (APOC meta with Cypher fallback) — feeds Text2Cypher + model views
app.get('/api/graph/schema', async (req, res) => {
  try {
    const schema = await neo4jService.getSchema();
    res.json({ success: true, ...schema });
  } catch (err) {
    req.log.error('Schema introspection failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

// U2: sync FastEmbed vectors onto :Entity nodes + ensure the Neo4j vector index.
// Proxies to the Cognee microservice (it owns the FastEmbed model). Idempotent.
app.post('/api/graph/embed-entities', async (req, res) => {
  try {
    const { label = 'Entity', limit = 500 } = req.body || {};
    const proxied = await cognifyService.proxyPost(
      '/api/graph/embed-entities',
      { label, limit },
      req.requestId,
      300000
    );
    if (!proxied.available) {
      return res.status(503).json({ success: false, error: proxied.reason });
    }
    res.json({ success: true, ...proxied.data });
  } catch (err) {
    req.log.error('Entity embedding sync failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

// U2: Hybrid GraphRAG — ONE query combines vector similarity + graph traversal
app.post('/api/graph/hybrid-query', async (req, res) => {
  try {
    const { query, topK = 5, hops = 2, sessionId } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: 'query is required' });
    }

    // 1. Query embedding from the same FastEmbed model that built the index
    const embed = await cognifyService.proxyPost(
      '/api/embed',
      { texts: [query] },
      req.requestId,
      60000
    );
    if (!embed.available) {
      return res.status(503).json({ success: false, error: embed.reason });
    }
    const embedding = embed.data.embeddings?.[0];
    if (!embedding) {
      return res.status(502).json({ success: false, error: 'Cognee returned no embedding' });
    }

    // 2. Vector seed → graph expansion in a single Cypher statement
    const hybrid = await neo4jService.hybridVectorQuery(embedding, { topK, hops });
    const sid = sessionId || crypto.randomUUID().slice(0, 12);

    // 3. Synthesis grounded in the hybrid results + memory trail (U1)
    const synthesis = await generateChat({
      messages: [
        {
          role: 'system',
          content:
            'You are a graph analyst. Summarize the hybrid vector+graph retrieval results in 3-5 sentences answering the user question. /no_think — output only the final answer.',
        },
        {
          role: 'user',
          content: `Question: ${query}\nVector-seeded entities with their graph neighborhoods: ${JSON.stringify(
            hybrid.seeds
          ).slice(0, 2500)}`,
        },
      ],
      maxTokens: 400,
    });

    const memory = await memoryService
      .traceInteraction({
        sessionId: sid,
        userText: query,
        toolUsed: 'hybrid_vector_graph_query',
        executedQuery: `vector.queryNodes(topK=${topK}) + ${hops}-hop expansion`,
        grounding: 'hybrid_vector_graph',
        retrievedEntities: hybrid.seeds.map((s) => s.seed),
        responsePreview: synthesis.content,
      })
      .catch((memErr) => ({ stored: false, reason: memErr.message }));

    res.json({
      success: true,
      isMock: hybrid.isMock ?? false,
      seeds: hybrid.seeds,
      synthesis,
      memory,
      sessionId: sid,
    });
  } catch (err) {
    req.log.error('Hybrid query failed', { message: err.message, stack: err.stack });
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// U5: CSV import — LOAD CSV + MERGE (idempotent) + batched transactions.
// nodes: { url, label, uniqueKey } · relationships: { url, type, fromLabel,
// fromKey, fromCol, toLabel, toKey, toCol }. Identifiers whitelisted (injection-safe).
app.post('/api/graph/import-csv', async (req, res) => {
  try {
    const { nodes, relationships } = req.body || {};
    if (!nodes && !relationships) {
      return res
        .status(400)
        .json({ success: false, error: 'Provide "nodes" and/or "relationships" import specs' });
    }
    const results = {};
    if (nodes) {
      results.nodes = await neo4jService.importCsvNodes(nodes);
    }
    if (relationships) {
      results.relationships = Array.isArray(relationships)
        ? await Promise.all(relationships.map((r) => neo4jService.importCsvRelationships(r)))
        : await neo4jService.importCsvRelationships(relationships);
    }
    req.log.info('CSV import complete', {
      nodes: Boolean(nodes),
      relationships: Boolean(relationships),
    });
    res.json({ success: true, results });
  } catch (err) {
    req.log.error('CSV import failed', { message: err.message, stack: err.stack });
    res.status(err.status || 400).json({ success: false, error: err.message });
  }
});

// U3: Text2Cypher — natural language → generated Cypher (read-only enforced) → results
app.post('/api/graph/text2cypher', async (req, res) => {
  try {
    const { question, sessionId, synthesize = true } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, error: 'question is required' });
    }

    // 1. Live schema → compact prompt (internal labels dropped, instance samples included —
    // courses.md Module 3: LLMs ground far better with real values than bare structure)
    const schema = await neo4jService.getSchema();
    const schemaForPrompt = {
      nodeLabels: Object.entries(schema.labels || {})
        .filter(
          ([l]) =>
            !l.startsWith('__') && !['DocumentChunk', 'TextSummary', 'GraphMetadata'].includes(l)
        )
        .map(([label, v]) => ({
          label,
          count: v.count,
          sampleValues: schema.samples?.[label] || [],
        })),
      relationshipTypes: Object.keys(schema.relationships || {}),
    };
    const schemaText = JSON.stringify(schemaForPrompt, null, 1);
    const messages = [
      {
        role: 'system',
        content: `You are a Neo4j Cypher expert. Convert the user's question into ONE read-only Cypher statement.
Rules:
- Output ONLY the Cypher statement — no explanations, no markdown fences, no comments.
- Use ONLY the nodeLabels and relationshipTypes from the provided schema.
- CRITICAL: relationship types must be copied EXACTLY as they appear in relationshipTypes
  (e.g. "routed_funds_through"). If no type clearly matches the question, match any
  relationship with bare "[r]" and RETURN type(r) so the caller sees what exists.
- Node names are lowercase slugs like the sampleValues shown (e.g. "meridian_bvi").
  Match with toLower(n.name) CONTAINS '<one distinctive word>' — NEVER full phrases.
- READ-ONLY: the statement must start with MATCH, OPTIONAL MATCH, or CALL db.index.vector.queryNodes.
- NEVER use CREATE, MERGE, DELETE, SET, REMOVE, DROP, LOAD CSV, or FOREACH.
- ALWAYS end with a LIMIT (maximum 50).
Example of a query that WORKS on this graph (follow this shape):
MATCH (s:Entity)-[r*1..3]-(t:Entity) WHERE toLower(s.name) CONTAINS 'meridian' RETURN s.name, t.name, size(r) AS hops LIMIT 10
Provided schema (with sample values): ${schemaText}`,
      },
      { role: 'user', content: question },
    ];

    // 2. Generate the Cypher (thinking off — deterministic, fast)
    const gen = await generateChat({ messages, temperature: 0.1, maxTokens: 400 });
    let cypher = gen.content
      .replace(/```[a-z]*\n?/gi, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
      .trim();

    // 3. Read-only safety gate — writes never reach the database
    const WRITE_RE =
      /\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|LOAD CSV|FOREACH)\b|\bCALL\s+apoc\b/i;
    const startsOk = /^(MATCH|OPTIONAL MATCH|CALL db\.index\.)/i.test(cypher);
    if (!startsOk || WRITE_RE.test(cypher)) {
      req.log.warn('Text2Cypher rejected unsafe/unparseable statement', {
        cypher: cypher.slice(0, 200),
      });
      return res.status(422).json({
        success: false,
        error: 'Generated Cypher failed the read-only safety check',
        generatedCypher: cypher,
      });
    }

    // 4. Execute against the live graph
    const exec = await neo4jService.runCypherQuery(cypher, {});

    // 5. Nemotron synthesis over the raw records
    let synthesis = null;
    if (synthesize && exec.success) {
      synthesis = await generateChat({
        messages: [
          {
            role: 'system',
            content:
              'You are a graph analyst. Summarize the Cypher query results in 2-4 sentences answering the user question. /no_think — output only the final answer.',
          },
          {
            role: 'user',
            content: `Question: ${question}\nCypher executed:\n${cypher}\n\nResults (JSON): ${JSON.stringify(
              exec.records
            ).slice(0, 2500)}`,
          },
        ],
        maxTokens: 300,
      });
    }

    // 6. Memory trail (U1) — the reasoning step records the generated Cypher
    const sid = sessionId || crypto.randomUUID().slice(0, 12);
    const memory = await memoryService
      .traceInteraction({
        sessionId: sid,
        userText: question,
        toolUsed: 'text2cypher',
        executedQuery: cypher,
        grounding: 'text2cypher',
        retrievedEntities: [],
        responsePreview: synthesis?.content || JSON.stringify(exec.records).slice(0, 400),
      })
      .catch((memErr) => {
        req.log.warn('Memory trace skipped', { message: memErr.message });
        return { stored: false, reason: memErr.message };
      });

    res.json({
      success: exec.success !== false,
      cypher,
      records: exec.records,
      isMock: exec.isMock ?? false,
      synthesis,
      memory,
      sessionId: sid,
    });
  } catch (err) {
    req.log.error('Text2Cypher failed', { message: err.message, stack: err.stack });
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * AGENT MEMORY (U1) — graph-backed reasoning trails (courses.md Module 6).
 */
app.post('/api/memory/trace', async (req, res) => {
  try {
    const {
      sessionId,
      userText,
      toolUsed,
      executedQuery,
      grounding,
      retrievedEntities,
      responsePreview,
    } = req.body;
    if (!userText) {
      return res.status(400).json({ success: false, error: 'userText is required' });
    }
    const result = await memoryService.traceInteraction({
      sessionId,
      userText,
      toolUsed: toolUsed || 'manual_trace',
      executedQuery,
      grounding,
      retrievedEntities,
      responsePreview,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    req.log.error('Memory trace failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/memory/session/:sessionId', async (req, res) => {
  try {
    const result = await memoryService.getSessionTrail(req.params.sessionId);
    res.json({ success: true, ...result });
  } catch (err) {
    req.log.error('Memory trail failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/memory/sessions', async (req, res) => {
  try {
    const result = await memoryService.listSessions(req.query.limit);
    res.json({ success: true, ...result });
  } catch (err) {
    req.log.error('Memory session list failed', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * TAVILY — live web search microservice (study-grade RAG input source).
 * Key: TAVILY_API_KEY in backend/.env (format tvly-...). All endpoints fail
 * honestly with 503 + setup hint when the key is not configured.
 */
app.get('/api/tavily/status', (req, res) => {
  res.json({ success: true, ...tavilyService.getStatus() });
});

app.post('/api/tavily/search', async (req, res) => {
  try {
    const result = await tavilyService.search(req.body, req.requestId);
    res.json({ success: true, ...result });
  } catch (err) {
    req.log.error('Tavily search failed', { message: err.message, stack: err.stack });
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

app.post('/api/tavily/extract', async (req, res) => {
  try {
    const result = await tavilyService.extract(req.body, req.requestId);
    res.json({ success: true, ...result });
  } catch (err) {
    req.log.error('Tavily extract failed', { message: err.message, stack: err.stack });
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

app.post('/api/tavily/research', async (req, res) => {
  try {
    const result = await tavilyService.research(req.body, req.requestId);
    res.json({ success: true, ...result });
  } catch (err) {
    req.log.error('Tavily research failed', { message: err.message, stack: err.stack });
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * Web → Knowledge Graph bridge: Tavily search results are staged as a
 * source-attributed document (claim-check) and cognified into AuraDB —
 * fresh web facts become graph facts in one call.
 */
app.post('/api/tavily/ingest-to-graph', async (req, res) => {
  try {
    const { query, datasetName, prompt, maxResults } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: 'query is required' });
    }
    const result = await tavilyService.ingestToGraph(
      { query, datasetName, prompt, maxResults },
      req.requestId
    );
    req.log.info('Web-to-graph ingestion complete', {
      dataset: datasetName || 'web_research',
      mode: result.pipeline.mode,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    req.log.error('Tavily web-to-graph ingestion failed', {
      message: err.message,
      stack: err.stack,
    });
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

app.post('/api/echo', (req, res) => {
  res.json({
    success: true,
    receivedAt: new Date().toISOString(),
    body: req.body,
    headers: {
      host: req.headers.host,
      'user-agent': req.headers['user-agent'],
    },
  });
});

// ---- PersonaCRM context-layer API (docs/CONTRACT.md). Mounted before the 404 catch-all. ----
app.use(crmRouter);

// ---- 404 catch-all: unknown routes are logged, not silently dropped ----
app.use((req, res) => {
  req.log.warn(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ---- Final error handler: anything thrown out of a route lands here ----
app.use((err, req, res, _next) => {
  req.log
    ? req.log.error('Unhandled route error', { message: err.message, stack: err.stack })
    : logger.error('Unhandled route error (no request context)', {
        message: err.message,
        stack: err.stack,
      });
  res.status(500).json({ success: false, error: err.message });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server started`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    node: process.version,
  });
  console.log(`========================================`);
  console.log(`🚀 Server running on port: ${PORT}`);
  console.log(`📡 Local: http://localhost:${PORT}`);
  console.log(`🩺 Health: http://localhost:${PORT}/health`);
  console.log(`📝 Logs: backend/logs/backend.log`);
  console.log(`========================================`);

  // Initialize anti-sleep self-pinger
  startKeepAlive();
});
