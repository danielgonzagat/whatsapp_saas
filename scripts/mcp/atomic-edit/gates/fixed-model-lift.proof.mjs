#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
const proof = path.join(path.dirname(fileURLToPath(import.meta.url)), 'human-eval-lift-protocol.proof.mjs');
const res = spawnSync(process.execPath, [proof, ...process.argv.slice(2)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (res.stdout) process.stdout.write(res.stdout);
if (res.stderr) process.stderr.write(res.stderr);
process.exit(res.status ?? 1);
