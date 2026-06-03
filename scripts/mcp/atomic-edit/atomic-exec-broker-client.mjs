#!/usr/bin/env node
/**
 * atomic-exec-broker-client - synchronous bridge from atomic_exec to the broker.
 *
 * atomic_exec uses spawnSync everywhere; Node has no synchronous unix-socket
 * API. This client is invoked via execFileSync: it reads a JSON request from
 * stdin, sends it to the broker, prints the broker's JSON reply to stdout, and
 * exits 0. The REAL command exit code travels INSIDE that JSON
 * (reply.exitCode), read by atomic_exec from the payload.
 *
 * Endpoints:
 * - plain path: legacy Unix socket framing
 * - file://dir: no-socket filesystem RPC, using atomic request/response renames
 *
 * Fail-closed: if the broker is missing/unreachable it prints
 * { ok:false, brokerUnreachable:true, error } and exits non-zero, so atomic_exec
 * refuses rather than running the command unsandboxed.
 */
import crypto from 'node:crypto';
import * as fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const endpoint = process.argv[2] || process.env.ATOMIC_EXEC_BROKER_SOCKET;

function writeStdoutAndExit(text, code) {
  process.stdout.write(text, () => process.exit(code));
}

function emit(obj, code) {
  writeStdoutAndExit(JSON.stringify(obj), code);
}

function writeJsonAtomic(file, obj) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function sendViaFiles(endpointValue, req) {
  let root;
  try {
    root = fileURLToPath(endpointValue);
  } catch (error) {
    emit({ ok: false, brokerUnreachable: true, error: 'broker file endpoint invalid: ' + String(error?.message || error) }, 1);
    return;
  }
  const requests = path.join(root, 'requests');
  const responses = path.join(root, 'responses');
  const id = process.pid + '-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex');
  const requestFile = path.join(requests, id + '.json');
  const responseFile = path.join(responses, id + '.json');
  const timeoutMs = Math.max(1000, Number(req.timeoutMs || 120000) + 5000);
  const deadline = Date.now() + timeoutMs;
  try {
    fs.mkdirSync(requests, { recursive: true, mode: 0o700 });
    fs.mkdirSync(responses, { recursive: true, mode: 0o700 });
    writeJsonAtomic(requestFile, req);
  } catch (error) {
    emit({ ok: false, brokerUnreachable: true, error: 'broker file request failed: ' + String(error?.message || error) }, 1);
    return;
  }
  const poll = () => {
    try {
      if (fs.existsSync(responseFile)) {
        const text = fs.readFileSync(responseFile, 'utf8');
        fs.rmSync(responseFile, { force: true });
        writeStdoutAndExit(text, 0);
      }
    } catch (error) {
      emit({ ok: false, brokerUnreachable: true, error: 'broker file response failed: ' + String(error?.message || error) }, 1);
      return;
    }
    if (Date.now() > deadline) {
      emit({ ok: false, brokerUnreachable: true, error: 'broker file endpoint timed out' }, 1);
      return;
    }
    setTimeout(poll, 25);
  };
  poll();
}

function sendViaSocket(socketPath, req) {
  const sock = net.connect(socketPath);
  let buf = Buffer.alloc(0);
  let need = -1;
  sock.on('connect', () => {
    const body = Buffer.from(JSON.stringify(req), 'utf8');
    const head = Buffer.alloc(4);
    head.writeUInt32BE(body.length, 0);
    sock.write(Buffer.concat([head, body]));
  });
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    if (need < 0 && buf.length >= 4) {
      need = buf.readUInt32BE(0);
      buf = buf.subarray(4);
    }
    if (need >= 0 && buf.length >= need) {
      writeStdoutAndExit(buf.subarray(0, need).toString('utf8'), 0);
    }
  });
  sock.on('error', (e) => {
    emit({ ok: false, brokerUnreachable: true, error: 'broker unreachable: ' + e.message }, 1);
  });
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  input += d;
});
process.stdin.on('end', () => {
  if (!endpoint) {
    emit({ ok: false, brokerUnreachable: true, error: 'broker endpoint not configured (ATOMIC_EXEC_BROKER_SOCKET)' }, 1);
    return;
  }
  let req;
  try {
    req = JSON.parse(input);
  } catch {
    emit({ ok: false, error: 'broker client: bad input json' }, 1);
    return;
  }
  if (endpoint.startsWith('file://')) sendViaFiles(endpoint, req);
  else sendViaSocket(endpoint, req);
});
