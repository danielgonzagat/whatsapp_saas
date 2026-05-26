#!/usr/bin/env node
// extractors/runtime-railway.mjs
//
// Live-overlay: cada API endpoint / BullMQ queue ganha campos de telemetria
// derivados dos logs Railway das últimas N minutos.
//
// Não chama LLM. Não faz inferência — só correlaciona strings observadas em log
// (route paths, queue names) com nodes já existentes no grafo.
//
// Requer:
//   • RAILWAY_TOKEN ou RAILWAY_API_TOKEN (account-level) no env
//   • RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT_ID
//   • IDs do backend/worker em RAILWAY_BACKEND_SERVICE_ID / RAILWAY_WORKER_SERVICE_ID
//
// Se as envs não estão presentes, o extractor faz no-op (nenhum erro).
// Use `tools/graphify-plus/lib/railway-env.mjs` se quiser carregar de .env.pulse.local.

import { argv } from 'node:process';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { makeShard, addNode, addEdge, writeShard, nid } from '../lib/graph.mjs';

const ROOT = argv[2] || process.cwd();
const OUT = argv[3] || `${ROOT}/graphify-out/shards/runtime-railway.json`;
const SINCE = argv.find((a) => a.startsWith('--since='))?.split('=')[1] || '60m';

const RAILWAY_GRAPHQL = 'https://backboard.railway.com/graphql/v2';
const TOKEN = process.env.RAILWAY_TOKEN || process.env.RAILWAY_API_TOKEN || process.env.RAILWAY_PROJECT_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const ENV_ID = process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_ENV_ID;
const BACKEND_ID = process.env.RAILWAY_BACKEND_SERVICE_ID;
const WORKER_ID = process.env.RAILWAY_WORKER_SERVICE_ID;

const PATH_RE = /"url":"(\/[\w/:\-.]*?)"/g;
const STATUS_RE = /"statusCode":(\d{3})/g;
const DURATION_RE = /"duration_ms":(\d+)/g;
const QUEUE_RE = /\b(queue|jobs?)[:_]([a-zA-Z][\w-]+)\b/g;
const SEVERITY_RE = /\b(WARN|ERROR|FATAL)\b/g;

async function main() {
  if (!TOKEN || !PROJECT_ID || !ENV_ID) {
    console.log('[runtime-railway] no Railway env present — emitting empty shard (no-op)');
    await emitEmpty();
    return;
  }

  const shard = makeShard();
  const sinceMs = parseSince(SINCE);
  const now = Date.now();
  const cutoff = now - sinceMs;

  for (const [name, serviceId] of [['backend', BACKEND_ID], ['worker', WORKER_ID]]) {
    if (!serviceId) continue;
    try {
      const deployments = await gqlListDeployments(serviceId);
      // Take the most recent SUCCESS deployment.
      const success = deployments.find((d) => d.status === 'SUCCESS') || deployments[0];
      if (!success) continue;

      const logs = await gqlLogs(success.id, 1500);
      ingestLogs(shard, name, logs, cutoff);
    } catch (err) {
      console.warn(`[runtime-railway] ${name}: ${err.message}`);
    }
  }

  await writeShard(shard, OUT);
  console.log(`[runtime-railway] wrote ${OUT} — ${shard.nodes.length} nodes, ${shard.edges.length} edges`);
  console.log(`[runtime-railway] stats: ${JSON.stringify(shard.stats)}`);
}

function parseSince(s) {
  const m = s.match(/^(\d+)([smhd])$/);
  if (!m) return 60 * 60_000;
  const n = Number(m[1]);
  const u = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return n * u;
}

function ingestLogs(shard, service, logs, cutoff) {
  const pathStats = new Map(); // route → { calls, errors, latencies[] }
  const queueWarns = new Map(); // queue → count
  let totalWarns = 0;

  for (const entry of logs) {
    const ts = Date.parse(entry.timestamp || '');
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    const message = String(entry.message || '');
    const sev = String(entry.severity || '').toLowerCase();

    // HTTP request stats.
    let path, status, dur;
    const pm = [...message.matchAll(PATH_RE)][0];
    const sm = [...message.matchAll(STATUS_RE)][0];
    const dm = [...message.matchAll(DURATION_RE)][0];
    if (pm && sm) {
      path = normPath(pm[1]);
      status = Number(sm[1]);
      dur = dm ? Number(dm[1]) : null;
      const s = pathStats.get(path) || { calls: 0, errors: 0, latencies: [] };
      s.calls++;
      if (status >= 400) s.errors++;
      if (dur != null) s.latencies.push(dur);
      pathStats.set(path, s);
    }

    // BullMQ queue warns.
    for (const q of message.matchAll(QUEUE_RE)) {
      const qname = q[2];
      if (sev === 'warn' || sev === 'error' || /WARN|ERROR|FATAL/.test(message)) {
        queueWarns.set(qname, (queueWarns.get(qname) || 0) + 1);
      }
    }
    if (sev === 'warn' || /\bWARN\b/.test(message)) totalWarns++;
  }

  // Emit overlay nodes — one per route/queue with stats — and edges from the structural endpoint.
  for (const [path, s] of pathStats.entries()) {
    const overlayId = nid('runtime', service, path);
    addNode(shard, {
      id: overlayId,
      label: `runtime ${service} ${path}`,
      type: 'runtime-overlay',
      meta: {
        service,
        path,
        calls: s.calls,
        errors: s.errors,
        error_rate: s.calls ? s.errors / s.calls : 0,
        p50: percentile(s.latencies, 50),
        p95: percentile(s.latencies, 95),
        sample_size: s.latencies.length,
      },
    });
    // Link to all matching endpoints (any HTTP method).
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      addEdge(shard, overlayId, nid('api-endpoint', method, path), 'observes');
    }
  }
  for (const [qname, count] of queueWarns.entries()) {
    const overlayId = nid('runtime-queue', service, qname);
    addNode(shard, {
      id: overlayId,
      label: `runtime ${service} queue:${qname}`,
      type: 'runtime-queue-overlay',
      meta: { service, queueName: qname, warns: count },
    });
    addEdge(shard, overlayId, nid('queue', qname), 'observes');
  }

  shard.stats[`stats:${service}:total_warns`] = totalWarns;
  shard.stats[`stats:${service}:paths_observed`] = pathStats.size;
  shard.stats[`stats:${service}:queues_with_warns`] = queueWarns.size;
}

function percentile(arr, p) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

function normPath(p) {
  return p.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:param').replace(/\/[0-9a-f-]{20,}(?=\/|$)/g, '/:param');
}

async function gqlListDeployments(serviceId) {
  const data = await gql(
    `query($input: DeploymentListInput!, $first: Int) {
       deployments(input: $input, first: $first) {
         edges { node { id status createdAt } }
       }
     }`,
    { input: { projectId: PROJECT_ID, environmentId: ENV_ID, serviceId, includeDeleted: false }, first: 8 },
  );
  return data?.deployments?.edges?.map((e) => e.node) || [];
}

async function gqlLogs(deploymentId, limit) {
  const data = await gql(
    `query($deploymentId: String!, $limit: Int) {
       deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
         timestamp message severity
       }
     }`,
    { deploymentId, limit },
  );
  return data?.deploymentLogs || [];
}

async function gql(query, variables) {
  const res = await fetch(RAILWAY_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

async function emitEmpty() {
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ nodes: [], edges: [], stats: { noop: true } }, null, 2));
}

await main();
