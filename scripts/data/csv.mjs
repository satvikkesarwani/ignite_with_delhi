/** Minimal RFC-4180 CSV reader shared by the loader and the verifier. */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');

export function parseCsv(file) {
  const text = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows.shift();
  return rows.filter((r) => r.length === headers.length).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

export const readJson = (file) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));

/** CSV carries everything as text; the graph needs real types. */
export const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
export const bool = (v) => v === 'true' || v === true;
export const list = (v) => (v ? String(v).split('|').filter(Boolean) : []);
export const nullIfBlank = (v) => (v === '' || v === undefined ? null : v);

/** Matches the name_normalized property used by the resolver's exact-match tier. */
export const normalizeName = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
