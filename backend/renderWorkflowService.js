import dotenv from 'dotenv';

dotenv.config();

class RenderWorkflowService {
  constructor() {
    this.apiKey = process.env.RENDER_API_KEY || 'rnd_7MlUwHv0aTee0wn64iUebzJqW3xJ';
    this.serviceId = process.env.RENDER_SERVICE_ID || 'srv-damja2gu01pc73afuufg';
    this.baseUrl = 'https://api.render.com/v1';
  }

  async triggerTask(command, planId = 'starter', maxRetries = 3) {
    const url = `${this.baseUrl}/services/${this.serviceId}/jobs`;
    const payload = {
      planId,
      startCommand: command,
    };

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
          return {
            success: true,
            jobId: data.id,
            status: data.status,
            createdAt: data.createdAt,
          };
        }

        if (response.status === 429) {
          const waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          console.warn(
            `[RenderWorkflow] ⚠️ 429 Rate Limit hit. Backing off for ${waitMs.toFixed(0)}ms...`
          );
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        const errorText = await response.text();
        return {
          success: false,
          status: response.status,
          error: errorText,
        };
      } catch (err) {
        if (attempt >= maxRetries) {
          return { success: false, error: err.message };
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return { success: false, error: 'Max retries exceeded' };
  }
}

export const renderWorkflowService = new RenderWorkflowService();
