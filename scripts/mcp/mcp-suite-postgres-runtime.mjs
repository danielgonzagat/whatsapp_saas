import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function createPostgresRuntime({ root, runCommand, commandExists }) {
  const ROOT = root;

  function postgresConfig() {
    const direct =
      process.env.DATABASE_URL ||
      readEnvValue(join(ROOT, 'backend/.env'), 'DATABASE_URL') ||
      readEnvValue(join(ROOT, '.env'), 'DATABASE_URL');
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
    } catch {
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

  function runPsql(sql, timeoutMs) {
    const cfg = postgresConfig();
    if (!cfg) return { ok: false, error: 'DATABASE_URL is not configured' };
    if (!commandExists('psql')) return { ok: false, error: 'psql is not installed or not on PATH' };
    return runCommand(['psql', '-X', '--csv', '--set=ON_ERROR_STOP=1', '-c', sql], {
      timeoutMs,
      env: cfg.env,
    });
  }

  return {
    postgresConfig,
    assertReadOnly,
    capSelect,
    ident,
    runPsql,
  };
}
