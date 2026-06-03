#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';

function fail(message) {
  process.stderr.write(message + String.fromCharCode(10));
  process.exit(1);
}

const op = process.argv[2];
const target = process.env.ATOMIC_ROLLBACK_TARGET;
const tmp = process.env.ATOMIC_ROLLBACK_TMP;
const mode = process.env.ATOMIC_ROLLBACK_MODE;
if (!target) fail('ATOMIC_ROLLBACK_TARGET is required');

try {
  if (op === 'delete') {
    try {
      fs.unlinkSync(target);
    } catch (e) {
      if (!e || e.code !== 'ENOENT') throw e;
    }
    process.exit(0);
  }
  if (op === 'chmod') {
    if (!mode) fail('ATOMIC_ROLLBACK_MODE is required for chmod rollback');
    const parsedMode = Number(mode);
    if (!Number.isInteger(parsedMode)) fail('ATOMIC_ROLLBACK_MODE must be an integer');
    fs.chmodSync(target, parsedMode);
    process.exit(0);
  }
  if (op === 'write') {
    if (!tmp) fail('ATOMIC_ROLLBACK_TMP is required for write rollback');
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    try {
      fs.writeFileSync(tmp, Buffer.concat(chunks));
      fs.renameSync(tmp, target);
    } catch (e) {
      try { fs.rmSync(tmp, { force: true }); } catch { /* ignore cleanup failure */ }
      throw e;
    }
    process.exit(0);
  }
  fail('unknown rollback op: ' + String(op));
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
