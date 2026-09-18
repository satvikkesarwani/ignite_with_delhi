import dotenv from 'dotenv';
import { createLogger } from './logger.js';

dotenv.config();

const log = createLogger('render-workflow');

class RenderWorkflowService {
  constructor() {
    this.apiKey = process.env.RENDER_API_KEY || 'rnd_7MlUwHv0aTee0wn64iUebzJqW3xJ';
    this.serviceId = process.env.RENDER_SERVICE_ID || 'srv-damja2gu01pc73afuufg';
    this.baseUrl = 'https://api.render.com/v1';
    log.info('Render Workflows dispatcher initialized', {
      serviceId: this.serviceId,
      apiKeySet: Boolean(this.apiKey),
    });
  }

  async triggerTask(command, planId = 'starter', maxRetries = 3) {
    const url = `${this.baseUrl}/services/${this.serviceId}/jobs`;
    const payload = {
      planId,
      startCommand: command,
    };
    const startedAt = Date.now();
    log.info('Task trigger →', { command: command.slice(0, 200), planId, maxRetries });

    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 201) {
          const data = await response.json();
          log.info('Task triggered', {
            jobId: data.id,
            jobStatus: data.status,
            attempt,
            durationMs: Date.now() - startedAt,
          });
          return {
            success: true,
            jobId: data.id,
            status: data.status,
            createdAt: data.createdAt,
          };
        }

        if (response.status === 429) {
          const waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          log.warn('429 rate limited — backing off with jitter', {
            attempt,
            waitMs: Math.round(waitMs),
          });
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        const errorText = await response.text();
        log.error('Task trigger rejected', {
          status: response.status,
          attempt,
          body: errorText.slice(0, 400),
        });
        return {
          success: false,
          status: response.status,
          error: errorText,
        };
      } catch (err) {
        log.warn('Task trigger request error', {
          attempt,
          message: err.message,
          stack: err.stack,
        });
        if (attempt >= maxRetries) {
          log.error('Task trigger failed — retries exhausted', { message: err.message });
          return { success: false, error: err.message };
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    log.error('Task trigger failed — max retries exceeded', { attempts: maxRetries });
    return { success: false, error: 'Max retries exceeded' };
  }

  /**
   * Render WORKFLOWS trigger (the newer product — study.md §8):
   *   POST /v1/task-runs  { "task": "<workflow>/<task>", "input": [...] }
   * Requires a deployed workflow service (type: workflow in render.yaml) and
   * workspace credits — the pipeline task itself retries + is observable in
   * dashboard run history.
   */
  async triggerTaskRun(taskName, input = [], maxRetries = 3) {
    const url = `${this.baseUrl}/task-runs`;
    const payload = { task: taskName, input };
    const startedAt = Date.now();
    log.info('Workflow task-run trigger →', { task: taskName, inputCount: input.length });

    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 200 || response.status === 201) {
          const data = await response.json();
          log.info('Workflow task-run started', {
            task: taskName,
            runId: data.id,
            status: data.status,
            attempt,
            durationMs: Date.now() - startedAt,
          });
          return { success: true, runId: data.id, status: data.status, raw: data };
        }

        if (response.status === 429) {
          const waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          log.warn('Workflow trigger 429 — backing off', { attempt, waitMs: Math.round(waitMs) });
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        const errorText = await response.text();
        log.error('Workflow task-run rejected', {
          status: response.status,
          attempt,
          body: errorText.slice(0, 400),
        });
        return { success: false, status: response.status, error: errorText };
      } catch (err) {
        log.warn('Workflow trigger request error', { attempt, message: err.message });
        if (attempt >= maxRetries) {
          log.error('Workflow trigger failed — retries exhausted', { message: err.message });
          return { success: false, error: err.message };
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    log.error('Workflow trigger failed — max retries exceeded', { attempts: maxRetries });
    return { success: false, error: 'Max retries exceeded' };
  }
}

export const renderWorkflowService = new RenderWorkflowService();
