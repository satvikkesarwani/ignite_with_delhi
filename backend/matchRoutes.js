/**
 * Match routes — implemented in phase C3.
 *
 * Currently answers 501 with the contract's failure envelope so a frontend built
 * against docs/CONTRACT.md fails legibly. Phase C3 REPLACES THIS FILE's handlers;
 * it is the only file that phase should need to touch for routing (crmRoutes.js
 * already mounts it).
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MOCKS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mocks');

export const matchRouter = express.Router();

const useMock = () => process.env.USE_MOCK === '1';
const mock = (n) => {
  const f = path.join(MOCKS, n);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};

const notYet = (what) => (req, res) => {
  if (useMock() && mock(`${what}.json`)) return res.json(mock(`${what}.json`));
  res.status(501).json({
    success: false,
    error: `${what} is implemented in phase C3 and is not available yet`,
    requestId: req.requestId,
  });
};

matchRouter.post('/api/crm/match', notYet('match'));
