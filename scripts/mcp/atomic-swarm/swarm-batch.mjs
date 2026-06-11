/**
 * swarm_exec_batch — parallel read-only job fan-out THROUGH the atomic broker.
 *
 * No bypass: this module cannot run a shell command by itself. Every job is
 * delegated to the same out-of-sandbox broker that serves atomic_exec, which
 * re-applies a fresh deny-by-default sandbox per command (no writes, no
 * network) — so a parallel batch is exactly as governed as N sequential
 * atomic_exec calls, minus the wall-clock. Fail-closed: no reachable broker,
 * no batch; the swarm never falls back to unsandboxed spawn.
 *
 * Every job yields a receipt (real exit code, sha256 of stdout/stderr,
 * duration); the aggregate (with per-job receipt hashes, outputs stripped)
 * lands in .atomic/swarm-batch-ledger.jsonl.
 */
import * as fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { REPO_ROOT, appendLedger, redactSecrets, refusal, sha256Hex } from './swarm-core.mjs';

const MAX_JOBS = 64;
const MAX_PARALLEL = 16;
const OUTPUT_ECHO_LIMIT = 20000;

export function brokerEndpoint() {
  const explicit = process.env.ATOMIC_EXEC_BROKER_SOCKET?.trim();
  if (explicit && (explicit.startsWith('file://') || fs.existsSync(explicit))) return explicit;
  try {
    const statePath = path.join(REPO_ROOT, '.atomic', 'codex-broker-current.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const socket = typeof state.socket === 'string' ? state.socket.trim() : '';
    if (socket && fs.existsSync(socket)) return socket;
  } catch {
    // broker state is optional; absence means fail-closed below
  }
  return null;
}

export function sendToBroker(endpoint, request, timeoutMs) {
  return new Promise((resolve) => {
    if (endpoint.startsWith('file://')) {
      resolve({ ok: false, brokerUnreachable: true, error: 'file:// broker endpoint not supported by swarm v1' });
      return;
    }
    const sock = net.connect(endpoint);
    let buf = Buffer.alloc(0);
    let need = -1;
    let settled = false;
    const finish = (reply) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        sock.destroy();
      } catch {
        // best-effort socket teardown
      }
      resolve(reply);
    };
    const timer = setTimeout(() => {
      finish({ ok: false, brokerUnreachable: true, error: `broker reply timed out after ${timeoutMs + 5000}ms` });
    }, timeoutMs + 5000);
    sock.on('connect', () => {
      const body = Buffer.from(JSON.stringify(request), 'utf8');
      const head = Buffer.alloc(4);
      head.writeUInt32BE(body.length, 0);
      sock.write(Buffer.concat([head, body]));
    });
    sock.on('data', (data) => {
      buf = Buffer.concat([buf, data]);
      if (need < 0 && buf.length >= 4) {
        need = buf.readUInt32BE(0);
        buf = buf.subarray(4);
      }
      if (need >= 0 && buf.length >= need) {
        try {
          finish(JSON.parse(buf.subarray(0, need).toString('utf8')));
        } catch (error) {
          finish({ ok: false, error: 'broker returned unparseable reply: ' + String(error?.message ?? error) });
        }
      }
    });
    sock.on('error', (error) => {
      finish({ ok: false, brokerUnreachable: true, error: 'broker unreachable: ' + error.message });
    });
  });
}

export async function swarmExecBatch({ jobs, maxParallel = 8, timeoutMs: rawTimeout = 60000, cwd } = {}) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    throw refusal('swarm_exec_batch refused: jobs[] is required');
  }
  if (jobs.length > MAX_JOBS) {
    throw refusal(`swarm_exec_batch refused: max ${MAX_JOBS} jobs per batch`);
  }
  const endpoint = brokerEndpoint();
  if (!endpoint) {
    throw refusal(
      'swarm_exec_batch refused (fail-closed): atomic exec broker is not reachable; the swarm never runs shell commands unsandboxed',
    );
  }
  const timeoutMs = Math.max(1000, Math.min(300000, Number(rawTimeout) || 60000));
  const baseCwd = path.resolve(REPO_ROOT, String(cwd ?? '.'));
  const startedAt = Date.now();
  const queue = jobs.map((job, index) => ({
    index,
    label: String(job?.label ?? `job-${index}`),
    command: String(job?.command ?? ''),
    cwd: path.resolve(baseCwd, String(job?.cwd ?? '.')),
  }));
  for (const job of queue) {
    if (!job.command.trim()) throw refusal(`swarm_exec_batch refused: empty command for ${job.label}`);
  }
  const results = new Array(queue.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= queue.length) return;
      const job = queue[i];
      const jobStarted = Date.now();
      const reply = await sendToBroker(
        endpoint,
        { command: job.command, cwd: job.cwd, effectRoot: job.cwd, timeoutMs, env: {} },
        timeoutMs,
      );
      const stdout = redactSecrets(String(reply.stdout ?? ''));
      const stderr = redactSecrets(String(reply.stderr ?? reply.error ?? ''));
      results[i] = {
        label: job.label,
        command: job.command,
        ok: reply.ok === true && reply.exitCode === 0,
        exitCode: typeof reply.exitCode === 'number' ? reply.exitCode : null,
        brokerUnreachable: reply.brokerUnreachable === true ? true : undefined,
        stdoutSha256: sha256Hex(stdout),
        stderrSha256: sha256Hex(stderr),
        stdout: stdout.slice(0, OUTPUT_ECHO_LIMIT),
        stderr: stderr.slice(0, OUTPUT_ECHO_LIMIT),
        durationMs: Date.now() - jobStarted,
      };
    }
  };
  const parallel = Math.max(1, Math.min(MAX_PARALLEL, Number(maxParallel) || 8));
  await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, () => worker()));
  const aggregate = {
    tool: 'swarm_exec_batch',
    endpointKind: endpoint.startsWith('file://') ? 'file' : 'socket',
    jobs: queue.length,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    wallMs: Date.now() - startedAt,
    receipts: results.map(({ stdout, stderr, ...receipt }) => receipt),
  };
  appendLedger('swarm-batch-ledger.jsonl', aggregate);
  return { ok: aggregate.failed === 0, aggregate, results };
}
