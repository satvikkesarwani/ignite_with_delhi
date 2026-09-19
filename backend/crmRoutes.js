/**
 * PersonaCRM REST API — the endpoints fixed in docs/CONTRACT.md.
 *
 * Fallback order for every read: live graph -> profiles on disk -> mock
 * fixtures. USE_MOCK=1 forces the fixtures so the frontend is never blocked on
 * the backend, and the graph being unreachable never produces a blank screen.
 *
 * Endpoints for later phases (intake, outreach, match) are registered now and
 * answer with a clear "not implemented" envelope rather than a bare 404, so a
 * frontend built against the contract fails loudly and legibly.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getStats, listCandidates, getProfile, getSubgraph } from './contextService.js';
import { resolve } from './resolveService.js';
import { segment } from './retrievalService.js';
import { chat } from './agentService.js';
import { getGraphOverview } from './graphOverview.js';
import { intakeRouter } from './intakeRoutes.js';
import { outreachRouter } from './outreachRoutes.js';
import { matchRouter } from './matchRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCKS = path.join(__dirname, 'mocks');

export const crmRouter = express.Router();

const useMock = () => process.env.USE_MOCK === '1';

function mock(name) {
  const f = path.join(MOCKS, name);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

/** Wraps a handler so a thrown error becomes the contract's failure envelope. */
const route = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    req.log?.error('CRM route failed', {
      path: req.originalUrl,
      message: err.message,
      stack: err.stack,
    });
    res
      .status(err.status || 500)
      .json({ success: false, error: err.message, requestId: req.requestId });
  }
};

const fail = (req, res, status, error) =>
  res.status(status).json({ success: false, error, requestId: req.requestId });

// ------------------------------------------------------------------- reads

crmRouter.get(
  '/api/crm/stats',
  route(async (req, res) => {
    if (useMock()) return res.json(mock('stats.json') || { success: true, mode: 'mock' });
    res.json(await getStats());
  })
);

crmRouter.get(
  '/api/crm/candidates',
  route(async (req, res) => {
    if (useMock()) return res.json(mock('candidates.json'));
    res.json(listCandidates(req.query));
  })
);

crmRouter.get(
  '/api/crm/candidates/:userId',
  route(async (req, res) => {
    const id = req.params.userId.toUpperCase();
    if (useMock()) {
      const m = mock(`profile.${id}.json`);
      return m
        ? res.json({ success: true, profile: m })
        : fail(req, res, 404, `No mock profile for ${id}`);
    }
    const profile = getProfile(id);
    if (!profile) return fail(req, res, 404, `No profile for ${id}`);
    res.json({ success: true, profile });
  })
);

crmRouter.get(
  '/api/crm/candidates/:userId/graph',
  route(async (req, res) => {
    const id = req.params.userId.toUpperCase();
    if (useMock()) {
      const m = mock(`subgraph.${id}.json`);
      return m
        ? res.json({ success: true, ...m })
        : fail(req, res, 404, `No mock subgraph for ${id}`);
    }
    const g = await getSubgraph(id);
    if (!g) return fail(req, res, 404, `No profile for ${id}`);
    res.json({ success: true, ...g });
  })
);

// ------------------------------------------------------ resolve / segment / chat

crmRouter.post(
  '/api/crm/resolve',
  route(async (req, res) => {
    const name = req.body?.name;
    if (!name) return fail(req, res, 400, 'name is required');
    if (useMock())
      return res.json(mock('resolve.json') || { success: true, status: 'not_found', matches: [] });
    res.json(await resolve(name));
  })
);

crmRouter.post(
  '/api/crm/segment',
  route(async (req, res) => {
    const query = req.body?.query;
    if (!query) return fail(req, res, 400, 'query is required');
    if (useMock()) return res.json(mock('segment.json'));
    const out = await segment(query);
    res.json({ ...out, cypher: out.cypher, strategy: out.strategy, latency_ms: out.latency_ms });
  })
);

crmRouter.post(
  '/api/agent/chat',
  route(async (req, res) => {
    const { message, sessionId } = req.body || {};
    if (!message) return fail(req, res, 400, 'message is required');
    if (useMock()) return res.json(mock('chat.json'));
    res.json(await chat({ message, sessionId }));
  })
);

// Dense slice of the context graph for the /crm/graph view.
crmRouter.get(
  '/api/crm/graph/overview',
  route(async (req, res) => {
    res.json({ success: true, ...(await getGraphOverview(req.query)) });
  })
);

// ------------------------------------------- later phases, one router file each
// C2 owns intakeRoutes.js; C3 owns outreachRoutes.js and matchRoutes.js. Splitting them means
// parallel phases never edit the same file.
crmRouter.use(intakeRouter);
crmRouter.use(outreachRouter);
crmRouter.use(matchRouter);
