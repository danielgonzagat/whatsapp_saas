#!/usr/bin/env node
/**
 * atomic-exec-broker-client — synchronous bridge from atomic_exec to the broker.
 *
 * atomic_exec uses spawnSync everywhere; Node has no synchronous unix-socket
 * API. This client is invoked via execFileSync: it reads a JSON request from
 * stdin, connects to the broker socket, sends the length-prefixed frame, prints
 * the broker's JSON reply to stdout, and exits 0. The REAL command exit code
 * travels INSIDE that JSON (reply.exitCode), read by atomic_exec from the payload.
 *
 * Fail-closed: if the socket is missing/unreachable it prints
 * { ok:false, brokerUnreachable:true, error } and exits non-zero, so atomic_exec
 * refuses rather than running the command unsandboxed.
 */
import net from 'node:net';

const socketPath = process.argv[2] || process.env.ATOMIC_EXEC_BROKER_SOCKET;

function emit(obj, code) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(code);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  input += d;
});
process.stdin.on('end', () => {
  if (!socketPath) {
    emit({ ok: false, brokerUnreachable: true, error: 'broker socket not configured (ATOMIC_EXEC_BROKER_SOCKET)' }, 1);
    return;
  }
  let req;
  try {
    req = JSON.parse(input);
  } catch {
    emit({ ok: false, error: 'broker client: bad input json' }, 1);
    return;
  }
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
      process.stdout.write(buf.subarray(0, need).toString('utf8'));
      process.exit(0);
    }
  });
  sock.on('error', (e) => {
    emit({ ok: false, brokerUnreachable: true, error: 'broker unreachable: ' + e.message }, 1);
  });
});
