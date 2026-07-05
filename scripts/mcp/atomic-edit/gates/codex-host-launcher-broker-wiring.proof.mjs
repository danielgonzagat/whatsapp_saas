#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(sourceDir, 'codex-atomic-host-launcher.mjs'), 'utf8');

const checks = [
  {
    name: 'Codex host launcher declares atomic-exec broker path',
    ok: /atomic-exec-broker\.mjs/.test(source) && /const BROKER\b/.test(source),
  },
  {
    name: 'Codex host launcher starts broker before sandboxed child',
    ok: /function startBroker\(/.test(source) && /ATOMIC_BROKER_READY/.test(source),
  },
  {
    name: 'Codex host launcher uses a file broker endpoint that survives nested sandbox socket denial',
    ok: /pathToFileURL/.test(source) && /cleanupPath/.test(source) && /file:\/\//.test(source),
  },
  {
    name: 'Codex host launcher exports ATOMIC_EXEC_BROKER_SOCKET to child env',
    ok: /ATOMIC_EXEC_BROKER_SOCKET/.test(source) && /childEnv\(socket, codexHome\)/.test(source),
  },
  {
    name: 'Codex host launcher default-denies host effects while allowing Codex outbound network',
    ok: source.includes("'(deny default)'") && /allow network-outbound/.test(source) && !source.includes('(allow network*)'),
  },
  {
    name: 'Codex host launcher cleans broker endpoint on child exit',
    ok: /brokerChild\.kill\('SIGTERM'\)/.test(source) && /rmSync\(cleanupPath \?\? socket, \{ recursive: true, force: true \}\)/.test(source),
  },
  {
    name: "Codex host launcher persists broker state for MCP child env recovery",
    ok:
      /const BROKER_STATE\b/.test(source) &&
      /function writeBrokerState\(socket, codexHome\)/.test(source) &&
      /writeBrokerState\(socket, codexHome\)/.test(source) &&
      /function clearBrokerState\(socket\)/.test(source) &&
      /clearBrokerState\(socket\)/.test(source),
  },
];

const result = { ok: checks.every((entry) => entry.ok), results: checks };
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of checks) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(result.ok ? 0 : 1);
