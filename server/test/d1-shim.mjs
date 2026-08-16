// A D1-shaped facade over node:sqlite, so the REAL worker can be exercised
// without a Cloudflare account. Requires node --experimental-sqlite (Node 22+).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCHEMA = fileURLToPath(new URL('../schema.sql', import.meta.url));

// D1 binds numbered params (?1, ?2); node:sqlite only binds anonymous ?, and
// throws "column index out of range" on the numbered form. Rewrite to ? and
// remap the args in the order the numbers appear — a repeated ?N simply binds
// its value twice, which is why the remap is by index rather than by position.
function positional(sql) {
  const order = [];
  const text = sql.replace(/\?(\d+)/g, (_, n) => { order.push(Number(n) - 1); return '?'; });
  return { text, order };
}

// Returns { env, db } — env is what worker.fetch(request, env) expects.
export function makeEnv({ origins = 'http://localhost:5173', salt = 'test' } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(SCHEMA, 'utf8'));

  const DB = {
    prepare(sql) {
      const { text, order } = positional(sql);
      const stmt = db.prepare(text);
      let args = [];
      const api = {
        bind(...a) { args = order.map((i) => a[i]); return api; },
        all() { return { results: stmt.all(...args) }; },
        first() { const r = stmt.get(...args); return r === undefined ? null : r; },
        run() { return stmt.run(...args); },
      };
      return api;
    },
  };

  return { env: { DB, IP_SALT: salt, ALLOWED_ORIGINS: origins }, db };
}
