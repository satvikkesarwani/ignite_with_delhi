const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5001').replace(/\/$/, '');

/**
 * Thin fetch wrapper for the PersonaCRM API (docs/CONTRACT.md).
 * Throws an Error carrying `status` and `path` whenever the backend answers
 * with the contract's failure envelope, so every view can name what failed.
 */
export async function api(path, { method = 'GET', body, signal } = {}) {
  // A FormData body (resume upload) must go out as-is so the browser sets the multipart boundary.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      signal,
    });
  } catch (err) {
    throw Object.assign(new Error(`Backend unreachable (${path})`), {
      path,
      status: 0,
      cause: err,
    });
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    throw Object.assign(new Error(json?.error || `HTTP ${res.status}`), {
      path,
      status: res.status,
      requestId: json?.requestId,
    });
  }
  return json;
}
