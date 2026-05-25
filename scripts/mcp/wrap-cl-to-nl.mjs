#!/usr/bin/env node
/**
 * CL-framing adapter: converts Content-Length framed MCP responses to
 * newline-delimited JSON for clients that expect JSONL.
 *
 * MCP Content-Length is byte-based. Keep stdout buffering as Buffer, not UTF-8
 * strings, so non-ASCII tool descriptions cannot stall tools/list parsing.
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

const childScript = process.argv[2];
if (!childScript) {
  console.error('Usage: wrap-cl-to-nl.mjs <child-script-path>');
  process.exit(1);
}

const child = spawn('node', [childScript], {
  stdio: ['pipe', 'pipe', 'inherit'],
  cwd: process.cwd(),
  env: process.env,
});

process.stdin.pipe(child.stdin);

let buffer = Buffer.alloc(0);
child.stdout.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd).toString('utf8');
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) return;
    const body = buffer.slice(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.slice(bodyEnd);
    process.stdout.write(`${body}\n`);
  }
});

child.on('close', (code) => { process.exit(code ?? 0); });
child.on('error', (err) => { console.error('Adapter child error:', err.message); process.exit(1); });
