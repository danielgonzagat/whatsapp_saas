#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const atomicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brokerSource = fs.readFileSync(path.join(atomicRoot, 'atomic-exec-broker.mjs'), 'utf8');
const execSource = fs.readFileSync(path.join(atomicRoot, 'server-tools-exec.ts'), 'utf8');
const results = [];
function check(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

check('file broker publishes a liveness marker with pid and protocol',
  brokerSource.includes("const marker = path.join(root, 'broker.json');") &&
    brokerSource.includes("protocol: 'atomic-file-broker-v1'") &&
    brokerSource.includes('pid: process.pid') &&
    brokerSource.includes('parentPid: process.ppid'),
  { hasMarkerPath: brokerSource.includes("const marker = path.join(root, 'broker.json');") },
);

check('server rejects file broker endpoints without marker protocol and live pid',
  execSource.includes("const markerFile = path.join(dir, 'broker.json');") &&
    execSource.includes("marker.protocol !== 'atomic-file-broker-v1'") &&
    execSource.includes('process.kill(pid, 0)') &&
    execSource.includes("error.code === 'EPERM'") &&
    execSource.includes('return null;'),
  { hasMarkerRead: execSource.includes("const markerFile = path.join(dir, 'broker.json');") },
);

check('stale requests/responses directories alone are no longer enough',
  !execSource.includes("return fs.existsSync(path.join(dir, 'requests')) && fs.existsSync(path.join(dir, 'responses')) ? trimmed : null;"),
  {},
);

const ok = results.every((result) => result.ok);
if (jsonMode || !ok) console.log(JSON.stringify({ ok, results }, null, 2));
process.exit(ok ? 0 : 1);
