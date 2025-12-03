import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from "prom-client";
import { connection, autopilotQueue, queueRegistry, queueOptions } from "./queue";
import { Queue } from "bullmq";

const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const jobCounter = new Counter({
  name: "worker_jobs_total",
  help: "Total de jobs processados",
  labelNames: ["queue", "name", "status"],
  registers: [registry],
});

export const jobDuration = new Histogram({
  name: "worker_job_duration_seconds",
  help: "Duração dos jobs",
  labelNames: ["queue", "name", "status"],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10, 20],
  registers: [registry],
});

export const rateLimitCounter = new Counter({
  name: "worker_rate_limit_events_total",
  help: "Eventos de rate limit por escopo",
  labelNames: ["scope", "workspaceId", "result", "plan"],
  registers: [registry],
});

export const planLimitCounter = new Counter({
  name: "worker_plan_limit_events_total",
  help: "Checagens de limite de plano (mensagens, assinatura)",
  labelNames: ["workspaceId", "type", "result", "plan"],
  registers: [registry],
});

export const flowStatusCounter = new Counter({
  name: "worker_flow_status_total",
  help: "Transições de status de execuções de fluxo",
  labelNames: ["workspaceId", "status"],
  registers: [registry],
});

export const autopilotDecisionCounter = new Counter({
  name: "worker_autopilot_decisions_total",
  help: "Decisões do Autopilot por workspace/intent/ação",
  labelNames: ["workspaceId", "intent", "action", "result"],
  registers: [registry],
});

export const autopilotGhostCloserCounter = new Counter({
  name: "worker_autopilot_ghost_closer_total",
  help: "Execuções de GhostCloser/LeadUnlocker",
  labelNames: ["workspaceId", "action", "result"],
  registers: [registry],
});

// Gauge de profundidade da fila Autopilot por estado (waiting, active, delayed...)
const autopilotQueueGauge = new Gauge({
  name: "worker_autopilot_queue_jobs",
  help: "Tamanho da fila Autopilot por estado",
  labelNames: ["state"],
  registers: [registry],
});

// Gauge genérico para todas as filas (main e DLQ)
const queueGauge = new Gauge({
  name: "worker_queue_jobs",
  help: "Tamanho das filas por estado",
  labelNames: ["queue", "state", "type"], // type: main|dlq
  registers: [registry],
});

export async function getMetrics() {
  await refreshQueueMetrics();
  return registry.metrics();
}

export async function getHealth() {
  try {
    const [pong, counts] = await Promise.all([
      connection.ping(),
      autopilotQueue.getJobCounts(),
    ]);
    return {
      status: pong === "PONG" ? "ok" : "degraded",
      redis: pong,
      queues: {
        autopilot: counts,
      },
    };
  } catch (err: any) {
    return { status: "down", error: err?.message };
  }
}

async function refreshQueueMetrics() {
  try {
    const counts = await autopilotQueue.getJobCounts();
    autopilotQueueGauge.reset();
    Object.entries(counts).forEach(([state, value]) => {
      autopilotQueueGauge.labels(state).set(typeof value === "number" ? value : 0);
    });
  } catch (err) {
    // Swallow errors to avoid breaking /metrics
    autopilotQueueGauge.labels("error").set(1);
  }

  // All queues + DLQs
  try {
    queueGauge.reset();
    const queueNames = Object.keys(queueRegistry);
    for (const name of queueNames) {
      const q = queueRegistry[name];
      const mainCounts = await q.getJobCounts();
      Object.entries(mainCounts).forEach(([state, value]) => {
        queueGauge.labels(name, state, "main").set(typeof value === "number" ? value : 0);
      });

      const dlq = new Queue(`${name}-dlq`, queueOptions);
      const dlqCounts = await dlq.getJobCounts();
      Object.entries(dlqCounts).forEach(([state, value]) => {
        queueGauge.labels(`${name}-dlq`, state, "dlq").set(typeof value === "number" ? value : 0);
      });
    }
  } catch (err: any) {
    queueGauge.labels("unknown", "error", "main").set(1);
  }
}
