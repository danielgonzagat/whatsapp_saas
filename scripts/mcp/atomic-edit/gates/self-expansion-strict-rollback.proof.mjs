#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(dir);
const effect = fs.readFileSync(path.join(root, 'server-helpers-effect.ts'), 'utf8');
const self = fs.readFileSync(path.join(root, 'server-tools-self.ts'), 'utf8');
const helper = fs.readFileSync(path.join(root, 'atomic-rollback-broker.mjs'), 'utf8');

const checks = [
  ['strict rollback export exists', effect.includes('export function rollbackEffectStrict')],
  ['strict rollback verifies residual diff', effect.includes('const residual = diffEffect(snap)')],
  ['strict rollback ignores transient broker scratch dirs', effect.includes('REPO_SCRATCH_PREFIXES') && effect.includes("'atomic-exec-broker-file-'")],
  ['effect snapshot skips scratch prefixes for root files', effect.includes('REPO_SCRATCH_PREFIXES.some((prefix) => name.startsWith(prefix))')],
  ['rollback uses broker fallback only for permission errors', effect.includes("code === 'EPERM'") && effect.includes("code === 'EACCES'")],
  ['rollback delete helper exists', effect.includes('function rollbackDelete')],
  ['rollback write helper exists', effect.includes('function rollbackWrite')],
  ['self-expansion imports strict rollback', self.includes('rollbackEffectStrict')],
  ['self-expansion no longer calls non-strict rollback', !self.includes(' rollbackEffect(snap, effects)')],
  ['broker helper deletes and writes', helper.includes("op === 'delete'") && helper.includes("op === 'write'")],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length > 0) {
  console.error(JSON.stringify({ ok: false, failed }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, checks: checks.map(([name]) => name) }, null, 2));
