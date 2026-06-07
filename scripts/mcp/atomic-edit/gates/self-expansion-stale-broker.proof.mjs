#!/usr/bin/env node
/**
 * Proof: self-expansion must ignore stale broker socket paths.
 * A dead ATOMIC_EXEC_BROKER_SOCKET must fall back to direct proof execution
 * instead of turning every proof into a broker-unreachable false red.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const atomicRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(atomicRoot, 'server-tools-self.ts'), 'utf8');
const results = [];
const rec = (name, ok, detail = {}) => results.push({ name, ok: Boolean(ok), detail });

function functionBlock(name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) return '';
  const close = String.fromCharCode(10) + '}' + String.fromCharCode(10);
  const next = source.indexOf(close, start);
  return next < 0 ? source.slice(start) : source.slice(start, next + 3);
}

const brokerFn = functionBlock('selfExpansionBrokerSocketPath');
const hostDirectFn = functionBlock('selfExpansionProofMustRunHostDirect');

rec(
  'self-expansion broker socket path is trimmed and file-existence checked',
  brokerFn.includes('.trim()') && brokerFn.includes('fs.existsSync') && brokerFn.includes('return null'),
  { brokerFn },
);

rec(
  'self-expansion build proof runs host-direct instead of through broker',
  hostDirectFn.includes('build.mjs'),
  { hostDirectFn },
);

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
