import crypto from 'crypto';
import neo4j from 'neo4j-driver';
import { neo4jService } from './neo4jService.js';
import { createLogger } from './logger.js';

const log = createLogger('memory');

/**
 * Agent Memory Context Graph (courses.md Module 6, the 35% agent pillar).
 * Every AI interaction persists as an auditable reasoning trail:
 *
 *   (:Session)-[:HAS_MESSAGE]->(:Message)-[:TRIGGERED]->(:ReasoningStep)
 *                                                        │
 *                                       [:RETRIEVED_ENTITY]->(:Entity)
 *
 * Three memory layers per the course pattern:
 *   - short-term: the Session's conversation chain
 *   - long-term:  the domain knowledge graph itself (already in AuraDB)
 *   - reasoning:  the exact tool calls + queries + retrieved entities per answer
 */
class MemoryService {
  isAvailable() {
    return !neo4jService.isMockMode && Boolean(neo4jService.driver);
  }

  /**
   * Persist one interaction. Called automatically after /api/cognify/query.
   * Never throws — memory failures are logged but must not break the answer.
   */
  async traceInteraction({
    sessionId,
    userText,
    toolUsed,
    executedQuery,
    grounding,
    retrievedEntities = [],
    responsePreview,
  }) {
    if (!this.isAvailable()) {
      return { stored: false, reason: 'graph in demo/mock mode' };
    }
    const sid = sessionId || crypto.randomUUID().slice(0, 12);
    const stepId = crypto.randomUUID().slice(0, 12);
    const session = neo4jService.getSession();

    try {
      const result = await session.run(
        `MERGE (s:Session {sessionId: $sessionId})
         CREATE (m:Message {role: 'user', text: $userText, ts: datetime()})
         CREATE (s)-[:HAS_MESSAGE]->(m)
         CREATE (step:ReasoningStep {
           stepId: $stepId, toolUsed: $toolUsed, executedQuery: $executedQuery,
           grounding: $grounding, responsePreview: $responsePreview, ts: datetime()
         })
         CREATE (m)-[:TRIGGERED]->(step)
         RETURN s.sessionId AS sessionId, step.stepId AS stepId`,
        {
          sessionId: sid,
          userText: String(userText || '').slice(0, 2000),
          stepId,
          toolUsed: toolUsed || 'unknown',
          executedQuery: String(executedQuery || '').slice(0, 2000),
          grounding: grounding || 'unknown',
          responsePreview: String(responsePreview || '').slice(0, 1500),
        }
      );
      const stepIdOut = result.records[0]?.get('stepId');

      // Link the entities this answer was grounded in (course pattern:
      // (step)-[:RETRIEVED_ENTITY]->(entity)). Cap to keep the trail readable.
      const names = [...new Set(retrievedEntities)].filter(Boolean).slice(0, 12);
      for (const name of names) {
        try {
          await session.run(
            `MATCH (step:ReasoningStep {stepId: $stepId})
             MERGE (e:Entity {name: $name})
             CREATE (step)-[:RETRIEVED_ENTITY]->(e)`,
            { stepId: stepIdOut, name }
          );
        } catch (err) {
          log.warn('Entity link failed', { stepId: stepIdOut, name, message: err.message });
        }
      }

      log.info('Interaction traced', { sessionId: sid, stepId: stepIdOut, entities: names.length });
      return { stored: true, sessionId: sid, stepId: stepIdOut, linkedEntities: names };
    } catch (err) {
      log.error('Trace failed', { message: err.message, stack: err.stack });
      return { stored: false, reason: err.message };
    } finally {
      await session.close();
    }
  }

  /**
   * High-level trace used by /api/cognify/query: matches entity names mentioned
   * in the answer/context against the graph (gazetteer matching) and persists
   * the full interaction. Never throws.
   */
  async traceQuery({ sessionId, query, grounding, answerText, contextText }) {
    let retrievedEntities = [];
    try {
      const session = neo4jService.getSession();
      if (session) {
        const r = await session.run('MATCH (e:Entity) RETURN collect(e.name) AS names');
        const names = r.records[0]?.get('names') || [];
        const hay = `${answerText || ''}\n${contextText || ''}`.toLowerCase();
        retrievedEntities = names.filter((n) => n && hay.includes(String(n).toLowerCase()));
        await session.close();
      }
    } catch (err) {
      log.warn('Entity mention matching failed', { message: err.message });
    }
    return this.traceInteraction({
      sessionId,
      userText: query,
      toolUsed: 'cognee_graph_retrieval + nemotron_synthesis',
      executedQuery: query,
      grounding,
      retrievedEntities,
      responsePreview: answerText,
    });
  }

  /** Full auditable trail for one session: messages → steps → retrieved entities. */
  async getSessionTrail(sessionId) {
    if (!this.isAvailable()) return { stored: false, reason: 'graph in demo/mock mode' };
    const session = neo4jService.getSession();
    try {
      const result = await session.run(
        `MATCH (s:Session {sessionId: $sessionId})-[:HAS_MESSAGE]->(m:Message)
         OPTIONAL MATCH (m)-[:TRIGGERED]->(step:ReasoningStep)
         OPTIONAL MATCH (step)-[:RETRIEVED_ENTITY]->(e)
         RETURN m.text AS userText, toString(m.ts) AS messageTs,
                step.stepId AS stepId, step.toolUsed AS toolUsed,
                step.executedQuery AS executedQuery, step.grounding AS grounding,
                step.responsePreview AS responsePreview,
                collect(DISTINCT e.name) AS retrievedEntities
         ORDER BY messageTs`,
        { sessionId }
      );
      const trail = result.records.map((r) => ({
        userText: r.get('userText'),
        messageTs: r.get('messageTs'),
        toolUsed: r.get('toolUsed'),
        executedQuery: r.get('executedQuery'),
        grounding: r.get('grounding'),
        responsePreview: r.get('responsePreview'),
        retrievedEntities: r.get('retrievedEntities').filter(Boolean),
      }));
      return { sessionId, interactions: trail.length, trail };
    } catch (err) {
      log.error('Trail retrieval failed', { sessionId, message: err.message, stack: err.stack });
      throw err;
    } finally {
      await session.close();
    }
  }

  /** Recent sessions — the demo's entry point ("show me what the agent remembers"). */
  async listSessions(limit = 10) {
    if (!this.isAvailable()) return { stored: false, reason: 'graph in demo/mock mode' };
    const session = neo4jService.getSession();
    try {
      const result = await session.run(
        `MATCH (s:Session)
         OPTIONAL MATCH (s)-[:HAS_MESSAGE]->(m:Message)
         WITH s, count(m) AS messages, max(m.ts) AS lastTs
         RETURN s.sessionId AS sessionId, messages, toString(lastTs) AS lastActivity
         ORDER BY lastTs DESC LIMIT $limit`,
        { limit: neo4j.int(Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50)) }
      );
      return { sessions: result.records.map((r) => r.toObject()) };
    } catch (err) {
      log.error('Session listing failed', { message: err.message, stack: err.stack });
      throw err;
    } finally {
      await session.close();
    }
  }
}

export const memoryService = new MemoryService();
