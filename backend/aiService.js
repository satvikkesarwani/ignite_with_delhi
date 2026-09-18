import https from 'https';
import { createLogger } from './logger.js';

/**
 * NVIDIA NIM API Service with Smart Key Rotation & Automatic Failover
 * Rotates through 5 API keys with round-robin and automatic fallback on 429/errors.
 */

const log = createLogger('nvidia');

const DEFAULT_KEYS = [
  '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',
  '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',
  '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',
  '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',
  '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',
];

const API_KEYS = process.env.NVIDIA_API_KEYS
  ? process.env.NVIDIA_API_KEYS.split(',')
      .map((k) => k.trim())
      .filter(Boolean)
  : DEFAULT_KEYS;

const MODEL_NAME = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b';
let currentKeyIndex = 0;

function getNextKeyIndex() {
  const index = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return index;
}

/**
 * Makes an HTTP POST request to NVIDIA NIM API
 */
function makeNvidiaRequest(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const options = {
      hostname: 'integrate.api.nvidia.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 120000, // Nemotron emits a visible thinking phase; simple prompts take 25s+
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            const errorMsg = json.error?.message || json.message || `HTTP ${res.statusCode}`;
            const err = new Error(errorMsg);
            err.statusCode = res.statusCode;
            reject(err);
          }
        } catch {
          reject(new Error(`Invalid JSON response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('NVIDIA API request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Generate completion with automatic rotation and failover across all keys
 */
export async function generateChat({ messages, temperature = 0.6, maxTokens = 1024 }) {
  if (!API_KEYS.length) {
    log.error('No NVIDIA API keys configured');
    throw new Error('No NVIDIA API keys configured');
  }

  let attempts = 0;
  let lastError = null;
  const startedAt = Date.now();

  while (attempts < API_KEYS.length) {
    const keyIdx = getNextKeyIndex();
    const apiKey = API_KEYS[keyIdx];
    attempts++;
    const keyStartedAt = Date.now();

    try {
      const payload = {
        model: MODEL_NAME,
        messages,
        temperature,
        max_tokens: maxTokens,
      };

      const response = await makeNvidiaRequest(apiKey, payload);
      const choice = response.choices?.[0];
      const content = choice?.message?.content || choice?.text || '';

      log.info('Completion OK', {
        keyIndex: keyIdx + 1,
        attempts,
        durationMs: Date.now() - keyStartedAt,
        totalMs: Date.now() - startedAt,
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        contentChars: content.length,
      });

      return {
        success: true,
        content,
        model: MODEL_NAME,
        keyIndexUsed: keyIdx + 1,
        totalKeysAvailable: API_KEYS.length,
        usage: response.usage || null,
      };
    } catch (err) {
      lastError = err;
      log.warn('Key failed — rotating to next', {
        keyIndex: keyIdx + 1,
        attempt: attempts,
        httpStatus: err.statusCode || null,
        durationMs: Date.now() - keyStartedAt,
        message: err.message,
      });
      // If error is 429 (Rate Limit) or 5xx, continue to next key immediately
    }
  }

  log.error('All API keys exhausted', {
    totalKeys: API_KEYS.length,
    totalMs: Date.now() - startedAt,
    lastError: lastError?.message,
  });
  throw new Error(`All ${API_KEYS.length} NVIDIA API keys exhausted: ${lastError?.message}`);
}
