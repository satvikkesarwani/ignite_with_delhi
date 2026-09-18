/**
 * Anti-Sleep Self-Pinger for Render Free Tier
 * Render free instances sleep after 15 minutes of inactivity.
 * This helper periodically pings the server's public URL every 10 minutes.
 */
import https from 'https';
import http from 'http';

export function startKeepAlive() {
  const url = process.env.RENDER_EXTERNAL_URL || process.env.KEEP_ALIVE_URL;
  if (!url) {
    console.log(
      'ℹ️ Keep-alive: No public URL set (RENDER_EXTERNAL_URL or KEEP_ALIVE_URL). Skipping internal pinger.'
    );
    return;
  }

  const pingIntervalMinutes = parseInt(process.env.KEEP_ALIVE_INTERVAL || '10', 10);
  const intervalMs = pingIntervalMinutes * 60 * 1000;
  const healthEndpoint = `${url.replace(/\/$/, '')}/health`;

  console.log(
    `🛡️ Anti-Sleep Keep-Alive initialized. Pinging ${healthEndpoint} every ${pingIntervalMinutes}m.`
  );

  setInterval(() => {
    const client = healthEndpoint.startsWith('https') ? https : http;
    const req = client.get(healthEndpoint, (res) => {
      console.log(
        `[${new Date().toISOString()}] Keep-alive ping sent to ${healthEndpoint} - Status: ${res.statusCode}`
      );
    });

    req.on('error', (err) => {
      console.error(`[${new Date().toISOString()}] Keep-alive ping failed:`, err.message);
    });
  }, intervalMs);
}
