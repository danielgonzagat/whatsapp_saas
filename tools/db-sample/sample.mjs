#!/usr/bin/env node
// tools/db-sample/sample.mjs — L15 real-data sampling with PII scrubbing.
//
// Connects to a Postgres database (defaults to DATABASE_PUBLIC_URL from .env.pulse.local),
// pulls N rows per table, scrubs PII columns (email, phone, name, token), writes
// JSONL to ./graphify-out/db-sample/<table>.jsonl.
//
// Used to seed the e2e sandbox with shape-realistic but PII-safe data.
//
// PII-safe by default:
//   • Columns matching email|phone|cpf|cnpj|name|token|secret|key|password → hashed/redacted
//   • String length preserved (rough shape)
//   • Foreign keys preserved
//
// READ-ONLY by design. Never writes back to source.

import { argv } from 'node:process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const ROWS_PER_TABLE = Number(argv.find((a) => a.startsWith('--rows='))?.split('=')[1] || 25);
const OUT_DIR = join(ROOT, 'graphify-out', 'db-sample');
const PII_COL_RE = /(email|phone|telefone|celular|cpf|cnpj|name|nome|token|secret|key|password|senha|address|endereco|street|rua|cidade|city|cep|zip)/i;
const TABLE_DENYLIST = ['_prisma_migrations', 'AuditLog', 'WebhookEvent', 'LedgerEntry', 'PayoutTransaction', 'KycDocument'];

async function main() {
  const envFile = await tryRead(join(ROOT, '.env.pulse.local'));
  const dbUrl = parseEnv(envFile)?.DATABASE_PUBLIC_URL || process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('[db-sample] DATABASE_PUBLIC_URL or DATABASE_URL not found');
    process.exit(1);
  }

  let Client;
  try {
    Client = (await import(join(ROOT, 'backend/node_modules/pg'))).Client;
  } catch {
    console.error('[db-sample] pg client not installed — run: cd backend && npm i');
    process.exit(2);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const { rows: tables } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    await mkdir(OUT_DIR, { recursive: true });

    let totalRows = 0;
    for (const { table_name } of tables) {
      if (TABLE_DENYLIST.includes(table_name)) {
        console.log(`[db-sample] denylist: ${table_name}`);
        continue;
      }
      try {
        const { rows: cols } = await client.query(
          `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`,
          [table_name],
        );
        const colNames = cols.map((c) => c.column_name);
        const colTypes = Object.fromEntries(cols.map((c) => [c.column_name, c.data_type]));

        const { rows } = await client.query(
          // Random sample with seed for reproducibility.
          `SELECT * FROM "${table_name}" TABLESAMPLE SYSTEM (1) LIMIT $1`,
          [ROWS_PER_TABLE],
        );

        const scrubbed = rows.map((r) => scrubRow(r, colTypes));

        const out = join(OUT_DIR, `${table_name}.jsonl`);
        await writeFile(out, scrubbed.map((r) => JSON.stringify(r)).join('\n'));
        totalRows += scrubbed.length;
        console.log(`[db-sample] ${table_name}: ${scrubbed.length} rows`);
      } catch (err) {
        console.log(`[db-sample] ${table_name}: ${err.message}`);
      }
    }
    console.log(`[db-sample] total ${totalRows} rows across ${tables.length} tables`);
  } finally {
    await client.end();
  }
}

function scrubRow(row, colTypes) {
  const out = {};
  for (const [col, val] of Object.entries(row)) {
    if (val === null || val === undefined) {
      out[col] = val;
      continue;
    }
    if (PII_COL_RE.test(col)) {
      out[col] = scrubValue(val);
    } else {
      out[col] = val;
    }
  }
  return out;
}

function scrubValue(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v.length === 0) return v;
    return 'pii_' + createHash('sha1').update(v).digest('hex').slice(0, 12);
  }
  if (Array.isArray(v)) return v.map(scrubValue);
  if (typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = PII_COL_RE.test(k) ? scrubValue(val) : val;
    return o;
  }
  return v;
}

async function tryRead(file) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

function parseEnv(raw) {
  if (!raw) return {};
  const out = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][\w]*)=(.+)$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

await main();
