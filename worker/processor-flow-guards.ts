import type { Job } from 'bullmq';
import { FlowEngineGlobal } from './flow-engine-global';
import { WorkerLogger } from './logger';
import { PlanLimitsProvider } from './providers/plan-limits';

type SkippedFlowResult = { ok: false; skipped: true; reason: string };

export async function checkFlowSubscription(
  _jobId: string | undefined,
  workspaceId: string,
): Promise<SkippedFlowResult | null> {
  const subStatus = await PlanLimitsProvider.checkSubscriptionStatus(workspaceId);
  if (subStatus.active) {
    return null;
  }
  return { ok: false, skipped: true, reason: subStatus.reason ?? 'subscription_inactive' };
}

export async function checkFlowRateLimit(
  _jobId: string | undefined,
  workspaceId: string,
): Promise<SkippedFlowResult | null> {
  const rate = await PlanLimitsProvider.checkFlowRunRate(workspaceId);
  if (rate.allowed) {
    return null;
  }
  return { ok: false, skipped: true, reason: rate.reason ?? 'rate_limited' };
}

export async function resolveFlowDefinition(
  engine: FlowEngineGlobal,
  job: Job,
  flowId: string,
  workspaceId: string | undefined,
): Promise<Awaited<ReturnType<FlowEngineGlobal['loadFlow']>>> {
  if (!job.data.flow?.nodes) {
    return engine.loadFlow(flowId, workspaceId);
  }
  const flowDef = engine.parseFlowDefinition(
    flowId || 'temp-run',
    job.data.flow.nodes,
    job.data.flow.edges,
    job.data.workspace?.id || 'default',
  );
  if (job.data.startNode) {
    flowDef.startNode = job.data.startNode;
  }
  return flowDef;
}

export async function checkIdempotentCompletion(
  engine: FlowEngineGlobal,
  _jobId: Job['id'],
  executionId: string | undefined,
  workspaceId: string | undefined,
): Promise<{ ok: true; skipped: true; reason: 'already_completed' } | null> {
  if (!executionId) {
    return null;
  }
  const existingExec = await engine.getExecution(executionId, workspaceId);
  if (!existingExec) {
    return null;
  }
  if (existingExec.status !== 'COMPLETED' && existingExec.status !== 'FAILED') {
    return null;
  }
  return { ok: true, skipped: true, reason: 'already_completed' };
}

export async function runSubscriptionAndRateGuards(
  jobId: Job['id'],
  workspaceId: string | undefined,
  subscriptionChecked: boolean,
): Promise<SkippedFlowResult | null> {
  if (!subscriptionChecked && workspaceId) {
    const blocked = await checkFlowSubscription(jobId, workspaceId);
    if (blocked) {
      return blocked;
    }
  }

  if (workspaceId) {
    const blocked = await checkFlowRateLimit(jobId, workspaceId);
    if (blocked) {
      return blocked;
    }
  }
  return null;
}

export async function executeResolvedFlow(
  engine: FlowEngineGlobal,
  log: WorkerLogger,
  job: Job,
  flowDef: Awaited<ReturnType<typeof resolveFlowDefinition>>,
  user: string,
  flowId: string | undefined,
  initialVars: Parameters<typeof engine.startFlow>[2],
  executionId: string | undefined,
): Promise<void> {
  if (flowDef) {
    await engine.startFlow(user, flowDef, initialVars, executionId);
    log.info('flow_completed', { jobId: job.id, flowId, user });
  } else {
    log.error('flow_not_found', { jobId: job.id, flowId });
  }
}
