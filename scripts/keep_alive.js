/**
 * Render Anti-Sleep Keep-Alive Script
 * Usage: node scripts/keep_alive.js [OPTIONAL_URL]
 * e.g.: node scripts/keep_alive.js https://ignite-backend.onrender.com
 */

const https = require('https');
const http = require('http');

const targetUrl = process.argv[2] || process.env.RENDER_URL || 'http://localhost:5001';
const healthEndpoint = `${targetUrl.replace(/\/$/, '')}/health`;
const INTERVAL_MS = parseInt(process.env.INTERVAL_MINUTES || '10', 10) * 60 * 1000;

console.log('=====================================================');
console.log('🛡️  Render Anti-Sleep Keep-Alive Daemon Running');
console.log(`🎯 Target URL: ${healthEndpoint}`);
console.log(`⏱️  Ping Interval: every ${INTERVAL_MS / 60000} minutes`);
console.log('=====================================================');

function ping() {
  const startTime = Date.now();
  const client = healthEndpoint.startsWith('https') ? https : http;

  const req = client.get(healthEndpoint, (res) => {
    res.on('data', () => {});
    res.on('end', () => {
      const duration = Date.now() - startTime;
      console.log(
        `[${new Date().toLocaleTimeString()}] ✅ Ping Success | HTTP ${res.statusCode} | Latency: ${duration}ms`
      );
    });
  });

  req.on('error', (err) => {
    console.error(`[${new Date().toLocaleTimeString()}] ❌ Ping Failed:`, err.message);
  });

  req.setTimeout(15000, () => {
    req.destroy();
    console.error(`[${new Date().toLocaleTimeString()}] ⚠️ Ping Request Timed Out`);
  });
}

// First immediate ping
ping();

// Periodic cron
setInterval(ping, INTERVAL_MS);
