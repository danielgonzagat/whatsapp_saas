import { WorkerLogger } from '../../logger';
import { prisma } from '../../db';
import { redis } from '../../redis-client';
import { persistSystemInsight } from '../../providers/commercial-intelligence';
import { forEachSequential } from '../../utils/async-sequence';
import { computeLearningSnapshot, recordDecisionLog } from '../cia/self-improvement';
import {
  anonymizeDecisionLog,
  buildGlobalStrategy,
  computeGlobalPatterns,
  inferWorkspaceDomain,
  persistGlobalPatterns,
} from '../cia/global-learning';
import { isAutonomousEnabled, type UnknownRecord, log } from './shared';

const ciaLearnLog = new WorkerLogger('autopilot:cia-learn');

export async function runCiaSelfImproveAll() {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, providerSettings: true },
    take: 500,
  });

  await forEachSequential(workspaces, async (workspace) => {
    const settings = (workspace.providerSettings ?? {}) as UnknownRecord;
    if (!isAutonomousEnabled(settings)) {
      return;
    }
    await runCiaSelfImproveWorkspace(workspace.id);
  });
}

export async function runCiaSelfImproveWorkspace(workspaceId: string) {
  const learning = await computeLearningSnapshot(prisma, workspaceId);
  if (!learning.totalLogs) {
    return learning;
  }

  await persistSystemInsight(prisma, {
    workspaceId,
    type: 'CIA_SELF_IMPROVEMENT',
    title: 'Aprendizado comercial atualizado',
    description: learning.topVariantKey
      ? `A variante ${learning.topVariantKey} lidera com score ${learning.topVariantScore}.`
      : 'Ainda não há variante vencedora consolidada.',
    severity: learning.failedCount > learning.sentCount ? 'WARNING' : 'INFO',
    metadata: { ...learning },
  });

  return learning;
}

export async function runCiaGlobalLearningAll() {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, providerSettings: true },
    take: 500,
  });

  const enabledWorkspaces = workspaces.filter((workspace: UnknownRecord) =>
    isAutonomousEnabled(workspace.providerSettings || {}),
  );
  const signals: NonNullable<ReturnType<typeof anonymizeDecisionLog>>[] = [];

  await forEachSequential(enabledWorkspaces, async (workspace) => {
    const domain = inferWorkspaceDomain(
      (workspace.providerSettings || {}) as Record<string, unknown>,
    );
    const logs = await prisma.kloelMemory
      .findMany({
        where: {
          workspaceId: workspace.id,
          category: 'decision_log',
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      .catch(() => []);

    for (const log of logs) {
      const signal = anonymizeDecisionLog({
        domain,
        log,
      });
      if (signal) {
        signals.push(signal);
      }
    }
  });

  const patterns = computeGlobalPatterns(signals);
  await persistGlobalPatterns(redis, patterns);

  await forEachSequential(enabledWorkspaces, async (workspace) => {
    const domain = inferWorkspaceDomain(
      (workspace.providerSettings || {}) as Record<string, unknown>,
    );
    const topPattern = patterns.find((pattern) => pattern.domain === domain);
    if (!topPattern) {
      return;
    }

    const strategy = buildGlobalStrategy({
      patterns,
      domain,
      intent: topPattern.intent,
    });

    await persistSystemInsight(prisma, {
      workspaceId: workspace.id,
      type: 'CIA_GLOBAL_LEARNING',
      title: `Aprendizado coletivo ativo para ${domain}`,
      description: `Estou aplicando o padrão ${topPattern.intent} com ${topPattern.samples} sinais e agressividade ${strategy.aggressiveness.toLowerCase()}.`,
      severity: topPattern.samples >= 20 ? 'INFO' : 'WARNING',
      metadata: {
        domain,
        topPattern,
        strategy,
        signalsAnalyzed: signals.length,
        patternsAvailable: patterns.length,
      },
    });
  });

  return {
    workspacesAnalyzed: enabledWorkspaces.length,
    signalsAnalyzed: signals.length,
    patternsAvailable: patterns.length,
  };
}
