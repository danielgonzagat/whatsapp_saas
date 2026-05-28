import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { commandExists } from './mcp-suite-child-proxy.mjs';

export async function postgresTool(name, args, root, runCommand) {
  if (name === 'pg_status') {
    const cfg = postgresConfig(root);
    return {
      ok: true,
      configured: !!cfg,
      psqlAvailable: commandExists('psql'),
      source: cfg?.source || null,
      host: cfg?.safe.host || null,
      database: cfg?.safe.database || null,
      user: cfg?.safe.user || null,
    };
  }
  if (name === 'pg_query') {
    const sql = capSelect(args.sql, args.limit || 100);
    return runPsql(root, runCommand, sql, args.timeoutMs || 30_000);
  }
  if (name === 'pg_tables') {
    return runPsql(
      root,
      runCommand,
      "select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog','information_schema') order by table_schema, table_name limit 250",
      30_000,
    );
  }
  if (name === 'pg_table_describe') {
    const schema = ident(args.schema || 'public');
    const table = ident(args.table);
    return runPsql(
      root,
      runCommand,
      `select column_name, data_type, is_nullable from information_schema.columns where table_schema='${schema}' and table_name='${table}' order by ordinal_position`,
      30_000,
    );
  }
  if (name === 'pg_count') {
    const schema = ident(args.schema || 'public');
    const table = ident(args.table);
    return runPsql(root, runCommand, `select count(*) from "${schema}"."${table}"`, 30_000);
  }
  if (name === 'pg_recent') {
    const schema = ident(args.schema || 'public');
    const table = ident(args.table);
    const orderBy = ident(args.orderBy || 'createdAt');
    const limit = Math.min(Number(args.limit || 25), 100);
    return runPsql(
      root,
      runCommand,
      `select * from "${schema}"."${table}" order by "${orderBy}" desc limit ${limit}`,
      30_000,
    );
  }
  if (name === 'pg_explain') {
    const sql = assertReadOnly(args.sql);
    return runPsql(root, runCommand, `explain ${sql}`, args.timeoutMs || 30_000);
  }
  if (name === 'pg_mesh_routes') {
    return {
      ok: true,
      routes: [
        'pg_tables -> codebody nav_trace_prisma_model',
        'pg_query -> runtime proof receipts',
        'pg_recent -> sentry/railway incident triage',
      ],
    };
  }
  throw new Error(`unknown postgres tool: ${name}`);
}

function postgresConfig(root) {
  const direct =
    process.env.DATABASE_URL ||
    readEnvValue(join(root, 'backend/.env'), 'DATABASE_URL') ||
    readEnvValue(join(root, '.env'), 'DATABASE_URL');
  if (!direct) return null;
  try {
    const url = new URL(stripQuotes(direct));
    return {
      source: process.env.DATABASE_URL ? 'env' : 'backend/.env',
      env: {
        PGHOST: url.hostname,
        PGPORT: url.port || '5432',
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
        PGSSLMODE: url.searchParams.get('sslmode') || process.env.PGSSLMODE || 'prefer',
      },
      safe: {
        host: url.hostname,
        database: decodeURIComponent(url.pathname.replace(/^\//, '')),
        user: decodeURIComponent(url.username),
      },
    };
  } catch (error) {
    process.stderr.write(
      `[mcp-suite:postgres] invalid DATABASE_URL: ${error.message || String(error)}\n`,
    );
    return null;
  }
}

function readEnvValue(file, key) {
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) return line.slice(key.length + 1);
  }
  return null;
}

function stripQuotes(value) {
  return value.replace(/^["']|["']$/g, '');
}

function assertReadOnly(sql) {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  const normalized = trimmed
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
  if (!/^(select|with|show)\b/i.test(normalized))
    throw new Error('only SELECT/WITH/SHOW queries are allowed');
  if (
    /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|merge)\b/i.test(
      normalized,
    )
  ) {
    throw new Error('query contains a forbidden write/DDL keyword');
  }
  return trimmed;
}

function capSelect(sql, limit) {
  const checked = assertReadOnly(sql);
  if (/^show\b/i.test(checked)) return checked;
  const capped = Math.min(Number(limit || 100), 100);
  return `select * from (${checked}) as mcp_readonly_query limit ${capped}`;
}

function ident(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value || ''))
    throw new Error(`invalid SQL identifier: ${value}`);
  return value;
}

function runPsql(root, runCommand, sql, timeoutMs) {
  const cfg = postgresConfig(root);
  if (!cfg) return { ok: false, error: 'DATABASE_URL is not configured' };
  if (!commandExists('psql')) return { ok: false, error: 'psql is not installed or not on PATH' };
  return runCommand(['psql', '-X', '--csv', '--set=ON_ERROR_STOP=1', '-c', sql], {
    timeoutMs,
    env: cfg.env,
  });
}
