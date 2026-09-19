import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createLogger } from './logger.js';

const log = createLogger('neo4j');

const candidateEnvs = [
  path.resolve('.env'),
  path.resolve('backend/.env'),
  path.resolve('../backend/.env'),
];
for (const envPath of candidateEnvs) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}
dotenv.config();

class Neo4jService {
  constructor() {
    this.driver = null;
    this.isMockMode = false;
    this.initDriver();
  }

  initDriver() {
    const uri = process.env.NEO4J_URI || process.env.GRAPH_DATABASE_URL;
    const user = process.env.NEO4J_USERNAME || process.env.GRAPH_DATABASE_USERNAME || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || process.env.GRAPH_DATABASE_PASSWORD;

    if (!uri || !password || uri.includes('example') || uri.includes('xxxx')) {
      log.warn('No valid NEO4J_URI configured — operating in DEMO/MOCK graph mode', {
        uriSet: Boolean(uri),
        passwordSet: Boolean(password),
      });
      this.isMockMode = true;
      return;
    }

    try {
      this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
        maxConnectionPoolSize: 50,
        connectionTimeout: 5000,
        maxTransactionRetryTime: 10000,
      });
      log.info('Driver configured for AuraDB', {
        uri: uri.replace(/\/\/([^@]+@)?/, '//***@'),
        poolSize: 50,
      });
    } catch (err) {
      log.error('Driver creation failed — falling back to MOCK mode', {
        message: err.message,
        stack: err.stack,
      });
      this.isMockMode = true;
    }
  }

  /** Raw session accessor for services with custom Cypher (memory, schema). Null in mock mode. */
  getSession() {
    if (this.isMockMode || !this.driver) return null;
    return this.driver.session();
  }

  /**
   * Live graph schema via apoc.meta.schema() with a manual Cypher fallback.
   * Powers Text2Cypher prompts (U3) and any model-explorer surface (U4).
   */
  async getSchema() {
    if (this.isMockMode || !this.driver) {
      const mock = this.getMockGraph();
      return {
        isMock: true,
        source: 'mock',
        labels: Object.fromEntries(
          [...new Set(mock.nodes.map((n) => n.type))].map((l) => [
            l,
            { count: mock.nodes.filter((n) => n.type === l).length, properties: {} },
          ])
        ),
        relationships: Object.fromEntries(
          [...new Set(mock.links.map((l) => l.type))].map((t) => [t, { count: 1 }])
        ),
      };
    }

    const session = this.driver.session();
    try {
      const apocRes = await session.run('CALL apoc.meta.schema() YIELD value AS schemaMap');
      const schemaMap = apocRes.records[0]?.get('schemaMap') || {};
      const labels = {};
      const relationships = {};
      for (const [key, val] of Object.entries(schemaMap)) {
        if (val?.type === 'node') {
          labels[key] = {
            count: val.count || 0,
            properties: Object.fromEntries(
              Object.entries(val.properties || {}).map(([p, meta]) => [
                p,
                { type: meta.type, indexed: Boolean(meta.indexed), unique: Boolean(meta.unique) },
              ])
            ),
          };
        } else if (val?.type === 'relationship') {
          relationships[key] = { count: val.count || 0 };
        }
      }
      log.info('Schema introspected via APOC', {
        labels: Object.keys(labels).length,
        relTypes: Object.keys(relationships).length,
      });

      // Instance samples (courses.md Module 3): LLMs write far better Cypher when
      // the prompt shows a few real node values, not just the structural schema.
      const INTERNAL_LABELS = new Set([
        'DocumentChunk',
        'TextSummary',
        'GraphMetadata',
        '__Node__',
      ]);
      const samples = {};
      const topLabels = Object.entries(labels)
        .filter(([l]) => !INTERNAL_LABELS.has(l))
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 4);
      for (const [label] of topLabels) {
        try {
          const r = await session.run(`MATCH (n:\`${label}\`) RETURN n LIMIT 5`);
          samples[label] = r.records
            .map((rec) => {
              const p = rec.get('n').properties || {};
              return (
                p.name ||
                p.account_number ||
                p.id ||
                (p.description ? String(p.description).slice(0, 40) : null)
              );
            })
            .filter(Boolean);
        } catch (sampleErr) {
          log.warn('Sampling failed for label', { label, message: sampleErr.message });
        }
      }
      return { source: 'apoc.meta.schema', labels, relationships, samples };
    } catch (err) {
      log.warn('APOC schema failed — deriving schema via plain Cypher', { message: err.message });
      const labels = {};
      const labelCounts = await session.run(
        'MATCH (n) UNWIND labels(n) AS l RETURN l AS label, count(*) AS cnt'
      );
      for (const r of labelCounts.records)
        labels[r.get('label')] = { count: r.get('cnt').toNumber(), properties: {} };
      const propCounts = await session.run(
        'MATCH (n) UNWIND labels(n) AS l UNWIND keys(n) AS k RETURN l AS label, k AS prop, count(*) AS cnt'
      );
      for (const r of propCounts.records) {
        const l = r.get('label');
        if (labels[l]) labels[l].properties[r.get('prop')] = { type: 'unknown' };
      }
      const relCounts = await session.run(
        'MATCH ()-[r]->() UNWIND type(r) AS t RETURN t AS relType, count(*) AS cnt'
      );
      const relationships = {};
      for (const r of relCounts.records)
        relationships[r.get('relType')] = { count: r.get('cnt').toNumber() };
      return { source: 'cypher-fallback', labels, relationships };
    } finally {
      await session.close();
    }
  }

  /**
  /**
   * U5 — CSV import (courses.md Module 4): LOAD CSV + MERGE (idempotent) +
   * batched transactions. Identifiers are whitelisted — they cannot be
   * parameterized in Cypher, so injection-safe validation is mandatory.
   */
  assertIdent(name, what) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name))) {
      throw new Error(`Invalid ${what}: "${name}" (allowed: letters, digits, underscore)`);
    }
    return String(name);
  }

  async importCsvNodes({ url, label, uniqueKey }) {
    this.assertIdent(label, 'label');
    this.assertIdent(uniqueKey, 'uniqueKey');
    const session = this.driver.session();
    try {
      await session.run(
        `CREATE CONSTRAINT import_${label}_${uniqueKey} IF NOT EXISTS
         FOR (n:\`${label}\`) REQUIRE n.\`${uniqueKey}\` IS UNIQUE`
      );
      const result = await session.run(
        `LOAD CSV WITH HEADERS FROM $url AS row
         CALL {
           WITH row
           MERGE (n:\`${label}\` { \`${uniqueKey}\`: row[$uniqueKeyCol] })
           SET n += row
         } IN TRANSACTIONS OF 500 ROWS`,
        { url, uniqueKeyCol: uniqueKey }
      );
      const counters = result.summary.counters || {};
      // driver v6 exposes counters as direct properties; v5 used updates()
      const stats =
        typeof counters.updates === 'function'
          ? counters.updates()
          : { nodesCreated: counters.nodesCreated, propertiesSet: counters.propertiesSet };
      log.info('CSV nodes imported', { label, url: url.slice(0, 80), stats });
      return {
        success: true,
        label,
        nodesCreated: stats.nodesCreated || 0,
        propertiesSet: stats.propertiesSet || 0,
      };
    } finally {
      await session.close();
    }
  }

  async importCsvRelationships({ url, type, fromLabel, fromKey, fromCol, toLabel, toKey, toCol }) {
    [type, fromLabel, fromKey, toLabel, toKey].forEach((v, i) =>
      this.assertIdent(v, ['type', 'fromLabel', 'fromKey', 'toLabel', 'toKey'][i])
    );
    const session = this.driver.session();
    try {
      const result = await session.run(
        `LOAD CSV WITH HEADERS FROM $url AS row
         CALL {
           WITH row
           MATCH (a:\`${fromLabel}\` { \`${fromKey}\`: row[$fromCol] })
           MATCH (b:\`${toLabel}\` { \`${toKey}\`: row[$toCol] })
           MERGE (a)-[r:\`${type}\`]->(b)
           SET r += row
         } IN TRANSACTIONS OF 500 ROWS`,
        { url, fromCol, toCol }
      );
      const counters = result.summary.counters || {};
      const stats =
        typeof counters.updates === 'function'
          ? counters.updates()
          : { relationshipsCreated: counters.relationshipsCreated };
      log.info('CSV relationships imported', { type, stats });
      return {
        success: true,
        type,
        relationshipsCreated: stats.relationshipsCreated || 0,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * U2 — Hybrid GraphRAG (courses.md Module 6): vector-seeded nodes expanded
   * through graph traversal in ONE query. `embedding` comes from the Cognee
   * microservice's FastEmbed model (same model built the index).
   */
  async hybridVectorQuery(embedding, { topK = 5, hops = 2 } = {}) {
    if (this.isMockMode || !this.driver) {
      return { isMock: true, seeds: [], message: 'Live Neo4j not configured' };
    }
    const safeHops = Math.min(Math.max(parseInt(hops, 10) || 2, 1), 3);
    const cypher = `
      CALL db.index.vector.queryNodes('entity_embeddings_idx', $topK, $embedding)
      YIELD node, score
      MATCH (node)-[r*1..${safeHops}]-(related)
      WHERE related <> node
      WITH node, score, related, [rel IN r | type(rel)] AS relTypes
      RETURN node.name AS seed,
             score,
             collect(DISTINCT related.name)[..8] AS connectedEntities,
             head(relTypes) AS firstRelationship
      ORDER BY score DESC LIMIT $topK`;
    const startedAt = Date.now();
    log.info('Hybrid vector+graph query →', { topK, hops: safeHops });
    const session = this.driver.session();
    try {
      const result = await session.run(cypher, {
        topK: neo4j.int(topK),
        embedding,
      });
      const rows = result.records.map((r) => ({
        seed: r.get('seed'),
        score: r.get('score'),
        connectedEntities: r.get('connectedEntities'),
        firstRelationship: r.get('firstRelationship'),
      }));
      log.info('Hybrid vector+graph query ←', {
        seeds: rows.length,
        durationMs: Date.now() - startedAt,
      });
      return { isMock: false, seeds: rows };
    } catch (err) {
      log.error('Hybrid query failed', { message: err.message, stack: err.stack });
      throw err;
    } finally {
      await session.close();
    }
  }

  async checkHealth() {
    if (this.isMockMode || !this.driver) {
      return {
        status: 'demo_fallback',
        connected: false,
        isMock: true,
        message: 'Operating in Demo Mock Graph mode (Neo4j AuraDB credentials not configured).',
        stats: {
          nodeCount: 12,
          relCount: 16,
          labels: ['ShellAccount', 'Director', 'Organization', 'Jurisdiction', 'RiskAlert'],
        },
      };
    }

    const session = this.driver.session();
    try {
      const nodeResult = await session.run('MATCH (n) RETURN count(n) AS count;');
      const relResult = await session.run('MATCH ()-[r]->() RETURN count(r) AS count;');

      const nodeCount = nodeResult.records[0].get('count').toNumber();
      const relCount = relResult.records[0].get('count').toNumber();

      log.info('AuraDB health check OK', { nodeCount: nodeCount, relCount: relCount });
      return {
        status: 'connected',
        connected: true,
        isMock: false,
        message: 'Successfully connected to Neo4j AuraDB',
        stats: {
          nodeCount,
          relCount,
        },
      };
    } catch (err) {
      log.error('Health check failed — using mock fallback', {
        message: err.message,
        code: err.code,
        stack: err.stack,
      });
      return {
        status: 'demo_fallback',
        connected: false,
        isMock: true,
        error: err.message,
        message: 'Neo4j AuraDB instance unavailable or paused. Operating in Demo Mock Graph mode.',
        stats: {
          nodeCount: 12,
          relCount: 16,
          labels: ['ShellAccount', 'Director', 'Organization', 'Jurisdiction', 'RiskAlert'],
        },
      };
    } finally {
      await session.close();
    }
  }

  async getGraphVisualization(limit = 100) {
    if (this.isMockMode || !this.driver) {
      return this.getMockGraph();
    }

    const session = this.driver.session();
    try {
      // Hide cognee's internal bookkeeping nodes (chunking/summary/metadata) so the
      // canvas shows only meaningful domain entities and their relationships.
      const cypher = `
        MATCH (n)-[r]->(m)
        WHERE NOT n:DocumentChunk AND NOT n:TextSummary AND NOT n:GraphMetadata
          AND NOT m:DocumentChunk AND NOT m:TextSummary AND NOT m:GraphMetadata
        RETURN n, r, m
        LIMIT $limit
      `;
      const result = await session.run(cypher, { limit: neo4j.int(limit) });

      if (result.records.length === 0) {
        return this.getMockGraph();
      }

      // Cognee labels every node "__Node__" plus its real type — pick the real one.
      const displayType = (labels) => labels.find((l) => l !== '__Node__') || labels[0] || 'Entity';
      // UUID-ish names are internal entities — prefer a human description when present.
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      const displayLabel = (props, type, fallbackId) => {
        const name = props.name || props.account_number || props.id;
        if (name && !UUID_RE.test(String(name))) return String(name);
        if (props.description) return String(props.description).slice(0, 48);
        return `${type}_${String(fallbackId).slice(-6)}`;
      };

      const nodesMap = new Map();
      const links = [];

      result.records.forEach((record) => {
        const n = record.get('n');
        const r = record.get('r');
        const m = record.get('m');

        const nId = n.elementId || n.identity.toString();
        const mId = m.elementId || m.identity.toString();

        if (!nodesMap.has(nId)) {
          const type = displayType(n.labels);
          nodesMap.set(nId, {
            id: nId,
            label: displayLabel(n.properties, type, nId),
            type,
            group: type,
            properties: n.properties,
          });
        }

        if (!nodesMap.has(mId)) {
          const type = displayType(m.labels);
          nodesMap.set(mId, {
            id: mId,
            label: displayLabel(m.properties, type, mId),
            type,
            group: type,
            properties: m.properties,
          });
        }

        links.push({
          id: r.elementId || r.identity.toString(),
          source: nId,
          target: mId,
          label: r.type,
          type: r.type,
          properties: r.properties,
        });
      });

      log.info('Visualization query complete', {
        nodes: nodesMap.size,
        links: links.length,
        limit,
      });
      return {
        nodes: Array.from(nodesMap.values()),
        links,
        isMock: false,
        totalNodes: nodesMap.size,
        totalLinks: links.length,
      };
    } catch (err) {
      log.error('Visualization query failed — returning mock data', {
        message: err.message,
        code: err.code,
        stack: err.stack,
      });
      return this.getMockGraph();
    } finally {
      await session.close();
    }
  }

  async runCypherQuery(cypher, params = {}) {
    const startedAt = Date.now();
    log.info('Cypher query →', { cypher: cypher.slice(0, 200), params });
    if (this.isMockMode || !this.driver) {
      return {
        success: true,
        isMock: true,
        message: 'Mock Cypher query executed (Live Neo4j not configured)',
        records: [
          { entity: 'Orion Holdings Ltd', jurisdiction: 'Panama', risk_score: 0.89 },
          { entity: 'Apex Trading LLC', jurisdiction: 'Cayman Islands', risk_score: 0.94 },
        ],
      };
    }

    const session = this.driver.session();
    try {
      const result = await session.run(cypher, params);
      const records = result.records.map((rec) => {
        const obj = {};
        rec.keys.forEach((k) => {
          const val = rec.get(k);
          obj[k] = val && val.properties ? val.properties : val;
        });
        return obj;
      });
      log.info('Cypher query ←', {
        records: records.length,
        durationMs: Date.now() - startedAt,
      });
      return { success: true, isMock: false, records };
    } catch (err) {
      log.error('Cypher query failed', {
        cypher: cypher.slice(0, 200),
        message: err.message,
        code: err.code,
        stack: err.stack,
      });
      return { success: false, error: err.message };
    } finally {
      await session.close();
    }
  }

  async warmUp() {
    if (this.isMockMode || !this.driver) {
      return {
        success: true,
        message: 'Mock warm-up completed (No remote instance configured).',
        timestamp: new Date().toISOString(),
      };
    }

    const session = this.driver.session();
    try {
      const result = await session.run('MATCH (n) RETURN count(n) AS node_count LIMIT 1;');
      const count = result.records[0].get('node_count').toNumber();
      return {
        success: true,
        message: 'AuraDB instance pinged and active.',
        nodeCount: count,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      await session.close();
    }
  }

  getMockGraph() {
    return {
      isMock: true,
      message: 'Demo Forensic Knowledge Graph (Simulated Cognee ECL Dataset)',
      nodes: [
        {
          id: '1',
          label: 'Atlas Global Corp',
          type: 'Organization',
          group: 'Organization',
          properties: { jurisdiction: 'Delaware', established: 2019 },
        },
        {
          id: '2',
          label: 'Sarah Vance',
          type: 'Director',
          group: 'Director',
          properties: { role: 'Managing Director', nationality: 'UK' },
        },
        {
          id: '3',
          label: 'Apex Holding Ltd',
          type: 'ShellAccount',
          group: 'ShellAccount',
          properties: { account_number: 'KY-99201', jurisdiction: 'Cayman Islands' },
        },
        {
          id: '4',
          label: 'Vortex Capital SA',
          type: 'ShellAccount',
          group: 'ShellAccount',
          properties: { account_number: 'PA-10488', jurisdiction: 'Panama' },
        },
        {
          id: '5',
          label: 'TX-901842 ($1.2M)',
          type: 'Transaction',
          group: 'Transaction',
          properties: { amount: 1200000, currency: 'USD', date: '2026-03-01' },
        },
        {
          id: '6',
          label: 'TX-901843 ($450K)',
          type: 'Transaction',
          group: 'Transaction',
          properties: { amount: 450000, currency: 'EUR', date: '2026-03-02' },
        },
        {
          id: '7',
          label: 'Sanction Risk Flag',
          type: 'RiskAlert',
          group: 'RiskAlert',
          properties: { severity: 'CRITICAL', rule: 'Layered Shell Structure' },
        },
        {
          id: '8',
          label: 'Michael Zhang',
          type: 'Director',
          group: 'Director',
          properties: { role: 'Beneficial Owner', nationality: 'Singapore' },
        },
        {
          id: '9',
          label: 'Zenith Logistics',
          type: 'Organization',
          group: 'Organization',
          properties: { jurisdiction: 'Hong Kong' },
        },
        {
          id: '10',
          label: 'TX-901844 ($890K)',
          type: 'Transaction',
          group: 'Transaction',
          properties: { amount: 890000, currency: 'USD', date: '2026-03-03' },
        },
        {
          id: '11',
          label: 'Cayman Islands',
          type: 'Jurisdiction',
          group: 'Jurisdiction',
          properties: { tax_haven: true, risk_rating: 'High' },
        },
        {
          id: '12',
          label: 'Panama',
          type: 'Jurisdiction',
          group: 'Jurisdiction',
          properties: { tax_haven: true, risk_rating: 'High' },
        },
      ],
      links: [
        { id: 'l1', source: '2', target: '1', label: 'DIRECTOR_OF', type: 'DIRECTOR_OF' },
        { id: 'l2', source: '1', target: '3', label: 'BENEFICIAL_OWNER', type: 'BENEFICIAL_OWNER' },
        {
          id: 'l3',
          source: '3',
          target: '4',
          label: 'TRANSFERRED_FUNDS',
          type: 'TRANSFERRED_FUNDS',
        },
        { id: 'l4', source: '3', target: '5', label: 'INITIATED', type: 'INITIATED' },
        { id: 'l5', source: '5', target: '4', label: 'DESTINATION', type: 'DESTINATION' },
        {
          id: 'l6',
          source: '4',
          target: '6',
          label: 'SPLIT_TRANSACTION',
          type: 'SPLIT_TRANSACTION',
        },
        { id: 'l7', source: '6', target: '9', label: 'PAID_TO', type: 'PAID_TO' },
        { id: 'l8', source: '4', target: '7', label: 'TRIGGERED', type: 'TRIGGERED' },
        {
          id: 'l9',
          source: '8',
          target: '3',
          label: 'CONTROLLING_SHAREHOLDER',
          type: 'CONTROLLING_SHAREHOLDER',
        },
        { id: 'l10', source: '3', target: '11', label: 'LOCATED_IN', type: 'LOCATED_IN' },
        { id: 'l11', source: '4', target: '12', label: 'LOCATED_IN', type: 'LOCATED_IN' },
        { id: 'l12', source: '9', target: '10', label: 'FEE_PAYMENT', type: 'FEE_PAYMENT' },
        { id: 'l13', source: '10', target: '1', label: 'REPATRIATED_TO', type: 'REPATRIATED_TO' },
        {
          id: 'l14',
          source: '7',
          target: '5',
          label: 'FLAGGED_TRANSACTION',
          type: 'FLAGGED_TRANSACTION',
        },
      ],
      totalNodes: 12,
      totalLinks: 14,
    };
  }

  async close() {
    if (this.driver) {
      await this.driver.close();
    }
  }
}

export const neo4jService = new Neo4jService();
