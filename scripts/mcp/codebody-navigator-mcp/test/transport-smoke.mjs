#!/usr/bin/env node
// Spawn the MCP server, speak JSON-RPC + LSP framing, exercise initialize,
// tools/list, tools/call(nav_health), tools/call(nav_explore_capability_gap).

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const SERVER = resolve('scripts/mcp/codebody-navigator-mcp/server.mjs');

const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });

let buf = '';
const pending = new Map();
let nextId = 1;
let initialized = false;

child.stderr.on('data', (d) => process.stderr.write(`[srv-err] ${d}`));
let bufB = Buffer.alloc(0);
child.stdout.on('data', (chunk) => {
  bufB = Buffer.concat([bufB, chunk]);
  while (true) {
    const headerEnd = bufB.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const header = bufB.slice(0, headerEnd).toString('utf8');
    const m = /Content-Length: (\d+)/i.exec(header);
    if (!m) {
      bufB = bufB.slice(headerEnd + 4);
      continue;
    }
    const len = Number(m[1]);
    const totalNeeded = headerEnd + 4 + len;
    if (bufB.length < totalNeeded) break;
    const body = bufB.slice(headerEnd + 4, totalNeeded).toString('utf8');
    bufB = bufB.slice(totalNeeded);
    handleMessage(body);
  }
});

function sendRpc(method, params) {
  const id = nextId++;
  const msg = { jsonrpc: '2.0', id, method, params };
  const json = JSON.stringify(msg);
  child.stdin.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`);
  return new Promise((resolveP, rejectP) => pending.set(id, { resolveP, rejectP }));
}

function handleMessage(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id != null && pending.has(msg.id)) {
    const { resolveP, rejectP } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rejectP(new Error(msg.error.message));
    else resolveP(msg.result);
  }
}

async function main() {
  let pass = 0;
  let fail = 0;
  function check(name, cond, info) {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name} :: ${info}`); }
  }

  // Hard timeout safety: if anything stalls, exit.
  const watchdog = setTimeout(() => {
    console.error('transport smoke watchdog tripped at 30s');
    child.kill('SIGKILL');
    process.exit(2);
  }, 30_000);
  watchdog.unref();

  const init = await sendRpc('initialize', {});
  check('initialize returns serverInfo', init?.serverInfo?.name === 'kloel-codebody-navigator', JSON.stringify(init).slice(0, 200));

  const list = await sendRpc('tools/list', {});
  check('tools/list returns array', Array.isArray(list?.tools) && list.tools.length >= 30, `count=${list?.tools?.length}`);

  const health = await sendRpc('tools/call', { name: 'nav_health', arguments: {} });
  const healthParsed = JSON.parse(health.content[0].text);
  check('nav_health via RPC ok', healthParsed.ok === true, JSON.stringify(healthParsed).slice(0, 200));

  const cap = await sendRpc('tools/call', { name: 'nav_explore_capability_gap', arguments: { domain: 'whatsapp', capability: 'connect whatsapp via chat' } });
  const capParsed = JSON.parse(cap.content[0].text);
  check('explore_capability_gap via RPC ok', capParsed.ok === true && capParsed.domain?.key === 'whatsapp', JSON.stringify(capParsed).slice(0, 200));

  const sess = await sendRpc('tools/call', { name: 'nav_start_session', arguments: { goal: 'transport smoke' } });
  const sessParsed = JSON.parse(sess.content[0].text);
  check('start_session via RPC ok', !!sessParsed.session?.id, JSON.stringify(sessParsed).slice(0, 200));

  console.log(`\nTransport smoke: ${pass} pass / ${fail} fail`);
  child.kill('SIGINT');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  child.kill('SIGINT');
  process.exit(2);
});
