/**
 * Anti-Sleep Self-Pinger for Render Free Tier
 * Render free instances sleep after 15 minutes of inactivity.
 * This helper periodically pings the server's public URL every 10 minutes.
 */
import https from 'https';
import http from 'http';
import { createLogger } from './logger.js';

const log = createLogger('keep-alive');

export function startKeepAlive() {
  const url = process.env.RENDER_EXTERNAL_URL || process.env.KEEP_ALIVE_URL;
  if (!url) {
    log.info(
      'No public URL set (RENDER_EXTERNAL_URL or KEEP_ALIVE_URL) — internal pinger disabled'
    );
    return;
  }

  const pingIntervalMinutes = parseInt(process.env.KEEP_ALIVE_INTERVAL || '10', 10);
  const intervalMs = pingIntervalMinutes * 60 * 1000;
  const healthEndpoint = `${url.replace(/\/$/, '')}/health`;

  log.info('Anti-sleep pinger initialized', {
    endpoint: healthEndpoint,
    intervalMinutes: pingIntervalMinutes,
  });

  setInterval(() => {
    const startedAt = Date.now();
    const client = healthEndpoint.startsWith('https') ? https : http;
    const req = client.get(healthEndpoint, (res) => {
      log.info('Self-ping sent', {
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    req.on('error', (err) => {
      log.error('Self-ping failed', { message: err.message, code: err.code });
    });
  }, intervalMs);
}
