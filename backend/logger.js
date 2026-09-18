import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Structured logger for the Express backend.
 * - Leveled output (DEBUG/INFO/WARN/ERROR/FATAL), LOG_LEVEL env controls the floor.
 * - Every line goes to stdout (Render captures it) AND appends to backend/logs/backend.log.
 * - `meta` is JSON-stringified safely (Errors become {message, stack}, circular refs handled).
 * Usage: const log = createLogger('neo4j'); log.info('message', { key: value });
 */

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.join(moduleDir, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const LOG_FILE = path.join(logDir, 'backend.log');

const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40, FATAL: 50 };
const MIN_LEVEL = LEVELS[(process.env.LOG_LEVEL || 'DEBUG').toUpperCase()] ?? 10;

const MAX_META_LENGTH = 4000;

function safeMeta(meta) {
  if (meta == null) return undefined;
  if (meta instanceof Error) {
    return { name: meta.name, message: meta.message, stack: meta.stack };
  }
  if (typeof meta !== 'object') return meta;
  try {
    const seen = new WeakSet();
    const out = JSON.parse(
      JSON.stringify(meta, (_key, value) => {
        if (value instanceof Error) return { name: value.name, message: value.message };
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        if (typeof value === 'string' && value.length > 400) return value.slice(0, 400) + '…';
        return value;
      })
    );
    return out;
  } catch {
    return String(meta).slice(0, MAX_META_LENGTH);
  }
}

function emit(level, service, message, meta) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const ts = new Date().toISOString();
  const metaOut = safeMeta(meta);
  const line = `[${ts}] [${level.padEnd(5)}] [${service}] ${message}${
    metaOut !== undefined ? ` ${JSON.stringify(metaOut)}` : ''
  }`;

  if (level === 'ERROR' || level === 'FATAL') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);

  // Fire-and-forget file append — never let logging break the request path
  fs.appendFile(LOG_FILE, line + '\n', () => {});
}

export function createLogger(service) {
  return {
    debug: (message, meta) => emit('DEBUG', service, message, meta),
    info: (message, meta) => emit('INFO', service, message, meta),
    warn: (message, meta) => emit('WARN', service, message, meta),
    error: (message, meta) => emit('ERROR', service, message, meta),
    fatal: (message, meta) => emit('FATAL', service, message, meta),
    /** Returns a child logger that stamps every line with the same request id */
    withContext: (contextMeta) => ({
      debug: (message, meta) => emit('DEBUG', service, message, { ...contextMeta, ...meta }),
      info: (message, meta) => emit('INFO', service, message, { ...contextMeta, ...meta }),
      warn: (message, meta) => emit('WARN', service, message, { ...contextMeta, ...meta }),
      error: (message, meta) => emit('ERROR', service, message, { ...contextMeta, ...meta }),
      fatal: (message, meta) => emit('FATAL', service, message, { ...contextMeta, ...meta }),
    }),
  };
}

export const logger = createLogger('backend');
