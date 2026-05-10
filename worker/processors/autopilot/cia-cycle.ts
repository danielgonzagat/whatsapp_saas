import { prisma } from '../../db';
import { redis } from '../../redis-client';
import { autopilotQueue } from '../../queue';
import { buildQueueJobId } from '../../job-id';
import { publishAgentEvent } from '../../providers/agent-events';
import {
  persistBusinessSnapshot,
  persistMarketSignals,
  persistSystemInsight,
} from '../../providers/commercial-intelligence';
import { getWorkspaceLocalHour, isWithinWorkspaceWindow } from '../../providers/timezone';
import { forEachSequential } from '../../utils/async-sequence';
import {
  type GlobalLearningPattern,
  inferWorkspaceDomain,
  buildGlobalStrategy,
} from '../cia/global-learning';
import { computeLearningSnapshot } from '../cia/self-improvement';
import { buildCiaWorkspaceState } from '../cia/build-state';
import { planCiaActions, summarizeDecisionCognition } from '../cia/brain';
import {
  assertCiaExhaustion,
  assertCiaGuarantees,
  buildCiaExhaustionReport,
  buildCiaGuaranteeReport,
} from '../cia/contracts';
import { assertConversationTacticPlan } from '../cia/conversation-tactics';
import {
  isCiaAutonomyMode,
  isCiaProactiveCycleEnabled,
  log,
  type UnknownRecord,
  WINDOW_START,
  WINDOW_END,
  SILENCE_HOURS,
  CIA_MAIN_LOOP_LIMIT,
  CIA_MAX_ACTIONS_PER_CYCLE,
} from './shared';
import {
  refreshOpportunityUniverse,
  persistCiaCycleProof,
  listCanonicalWorkItems,
  persistAccountProofSnapshot,
} from './score';

async function loadWorkspaceGlobalStrategy(input: {
  settings: UnknownRecord;
  intentHint?: string;
}) {
  const domain = inferWorkspaceDomain(input.settings || {});
  const raw = await redis.get('cia:global-patterns:v1').catch(() => null /* not found */);
  if (!raw) {
    return buildGlobalStrategy({
      patterns: [],
      domain,
      intent: input.intentHint || 'generic',
    });
  }

  try {
    const parsed = JSON.parse(raw) as {
      patterns?: GlobalLearningPattern[];
    };
    return buildGlobalStrategy({
      patterns: parsed?.patterns || [],
      domain,
      intent: input.intentHint || 'generic',
    });
  } catch (err: unknown) {
    log.warn('build_local_strategy_fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return buildGlobalStrategy({
      patterns: [],
      domain,
      intent: input.intentHint || 'generic',
    });
  }
}

export async function runCiaCycleAll() {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, providerSettings: true },
    take: 500,
  });

  await forEachSequential(workspaces, async (workspace) => {
    const settings = (workspace.providerSettings ?? {}) as UnknownRecord;
    if (settings?.billingSuspended === true) {
      return;
    }
    if (!isCiaAutonomyMode(settings)) {
      return;
    }
    await runCiaCycleWorkspace(workspace.id, settings);
  });
}

export async function runCiaCycleWorkspace(workspaceId: string, presetSettings?: UnknownRecord) {
  const settings = presetSettings
    ? presetSettings
    : ((
        await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { providerSettings: true },
        })
      )?.providerSettings as UnknownRecord);

  if (settings?.billingSuspended === true || !isCiaAutonomyMode(settings)) {
    return {
      queued: 0,
      reason: settings?.billingSuspended === true ? 'billing_suspended' : 'autopilot_disabled',
    };
  }

  const now = new Date();
  const nowHour = getWorkspaceLocalHour(settings, now);
  const withinWindow = isWithinWorkspaceWindow({
    settings,
    startHour: WINDOW_START,
    endHour: WINDOW_END,
    now,
  });
  if (!withinWindow) {
    return {
      queued: 0,
      reason: 'outside_window',
      localHour: nowHour,
    };
  }

  const state = await buildCiaWorkspaceState(prisma, workspaceId, {
    limit: CIA_MAIN_LOOP_LIMIT,
    silenceHours: SILENCE_HOURS,
    allowProactive: isCiaProactiveCycleEnabled(settings),
  });

  await persistBusinessSnapshot(prisma, {
    workspaceId,
    snapshot: state.snapshot,
  });
  await persistMarketSignals(prisma, {
    workspaceId,
    signals: state.marketSignals,
  });
  const opportunityRefresh = await refreshOpportunityUniverse(workspaceId).catch(
    (error: unknown) => ({
      refreshed: false as const,
      reason:
        (error instanceof Error ? error.message : String(error)) || 'opportunity_refresh_failed',
    }),
  );

  const globalStrategy = await loadWorkspaceGlobalStrategy({
    settings,
    intentHint:
      state.clusters.PAYMENT.length > 0
        ? 'payment_recovery'
        : state.candidates[0]?.cognitiveState?.intent ||
          state.candidates[0]?.suggestedAction ||
          'followup',
  });

  const learning = await computeLearningSnapshot(prisma, workspaceId);
  if (learning.totalLogs > 0) {
    await persistSystemInsight(prisma, {
      workspaceId,
      type: 'CIA_SELF_IMPROVEMENT',
      title: 'Ciclo de autoaprendizado atualizado',
      description: learning.topVariantKey
        ? `A melhor variante recente é ${learning.topVariantKey} com score ${learning.topVariantScore}.`
        : 'Ainda estou coletando dados suficientes para refinar as variantes.',
      severity: learning.failedCount > learning.sentCount ? 'WARNING' : 'INFO',
      metadata: { ...learning },
    });
  }

  const batch = planCiaActions(state, {
    maxActionsPerCycle: CIA_MAX_ACTIONS_PER_CYCLE,
    strategy: globalStrategy,
  });
  const guaranteeReport = buildCiaGuaranteeReport(state, batch, CIA_MAX_ACTIONS_PER_CYCLE);
  const exhaustionReport = buildCiaExhaustionReport(
    state,
    batch,
    CIA_MAX_ACTIONS_PER_CYCLE,
    globalStrategy,
  );
  const cycleProofId = buildQueueJobId(
    'cia-cycle-proof',
    workspaceId,
    state.generatedAt,
    state.candidates.length,
    batch.actions.length,
  );

  try {
    assertCiaGuarantees(guaranteeReport);
    assertCiaExhaustion(exhaustionReport);
    for (const action of batch.actions) {
      assertConversationTacticPlan({
        action: action.type,
        selectedTactic: action.conversationTactic,
        selectedTacticUtility: action.selectedTacticUtility,
        selectedTacticRank: action.selectedTacticRank,
        betterTacticCount: action.betterTacticCount,
        nextBestTactic: action.nextBestTactic,
        nextBestTacticUtility: action.nextBestTacticUtility,
        executableCount: action.conversationTacticUniverse.length,
        blockedCount: 0,
        silentCount: 0,
        exhaustive: action.conversationTacticUniverse.length > 0,
        candidates: action.conversationTacticUniverse,
      });
    }
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    await publishAgentEvent({
      type: 'error',
      workspaceId,
      phase: 'cia_contract_violation',
      persistent: true,
      message:
        'Detectei uma violação interna de contrato no ciclo CIA e bloqueei o despacho automático deste tick.',
      meta: {
        error: errInstanceofError?.message || 'cia_contract_violation',
        guaranteeReport,
        exhaustionReport,
        cycleProofId,
        opportunityRefresh,
      },
    });
    await persistSystemInsight(prisma, {
      workspaceId,
      type: 'CIA_CONTRACT_VIOLATION',
      title: 'Ciclo CIA bloqueado por contrato interno',
      description:
        errInstanceofError?.message || 'Uma garantia operacional obrigatória falhou no ciclo.',
      severity: 'CRITICAL',
      metadata: {
        cycleProofId,
        guaranteeReport,
        exhaustionReport,
        opportunityRefresh,
      },
    });
    return {
      queued: 0,
      reason: 'contract_violation',
      learning,
      guaranteeReport,
      exhaustionReport,
      cycleProofId,
      opportunityRefresh,
    };
  }

  await persistCiaCycleProof({
    workspaceId,
    cycleProofId,
    summary: batch.summary,
    guaranteeReport: guaranteeReport as never as Record<string, unknown>,
    exhaustionReport: exhaustionReport as never as Record<string, unknown>,
  });
  const workItemUniverse = await listCanonicalWorkItems(workspaceId);
  const tacticUniverse = batch.actions.map((action) => ({
    conversationId: action.conversationId,
    contactId: action.contactId,
    action: action.type,
    selectedTactic: action.conversationTactic,
    candidates: action.conversationTacticUniverse,
  }));
  const accountProof = await persistAccountProofSnapshot({
    workspaceId,
    cycleProofId,
    summary: batch.summary,
    guaranteeReport: guaranteeReport as never as Record<string, unknown>,
    exhaustionReport: exhaustionReport as never as Record<string, unknown>,
    actions: batch.actions as never as Array<Record<string, unknown>>,
    workItemUniverse: workItemUniverse as never as Array<Record<string, unknown>>,
    tacticUniverse: tacticUniverse as never as Array<Record<string, unknown>>,
  });
  const accountProofId = accountProof?.id || null;

  if (exhaustionReport.noLegalActions && exhaustionReport.details.candidateCount === 0) {
  } else {
    await publishAgentEvent({
      type: 'proof',
      workspaceId,
      phase: 'cia_cycle_proof',
      persistent: true,
      message: exhaustionReport.noLegalActions
        ? `Nenhuma ação elegível permaneceu neste ciclo após avaliar ${exhaustionReport.details.candidateCount} candidata(s); ${exhaustionReport.silentCount} ficaram silenciadas e ${exhaustionReport.dispatchableCount} seguiram bloqueadas pelas regras atuais.`
        : `Selecionei ${batch.actions.length} ação(ões) para despacho após avaliar ${state.candidates.length} candidata(s); ${exhaustionReport.dispatchableCount} estavam elegíveis para execução neste ciclo.`,
      meta: {
        cycleProofId,
        accountProofId,
        candidateCount: exhaustionReport.details.candidateCount,
        dispatchableCount: exhaustionReport.dispatchableCount,
        dispatchedCount: exhaustionReport.dispatchedCount,
        silentCount: exhaustionReport.silentCount,
        noLegalActions: exhaustionReport.noLegalActions,
        exhaustive: exhaustionReport.exhaustive,
        opportunityRefresh,
        actionOptimality: batch.actions.map((action) => ({
          conversationId: action.conversationId,
          type: action.type,
          selectedActionUtility: action.selectedActionUtility,
          selectedActionRank: action.selectedActionRank,
          betterActionCount: action.betterActionCount,
          betterExecutableActionCount: action.betterExecutableActionCount,
          nextBestActionType: action.nextBestActionType,
          nextBestActionUtility: action.nextBestActionUtility,
          selectedTactic: action.conversationTactic,
          selectedTacticUtility: action.selectedTacticUtility,
          selectedTacticRank: action.selectedTacticRank,
          betterTacticCount: action.betterTacticCount,
          nextBestTactic: action.nextBestTactic,
          nextBestTacticUtility: action.nextBestTacticUtility,
        })),
      },
    });
  }

  if (!batch.actions.length) {
    await publishAgentEvent({
      type: 'heartbeat',
      workspaceId,
      phase: 'cia_idle',
      message: exhaustionReport.noLegalActions
        ? 'Exauri todas as ações legais deste ciclo. Agora só volto a agir quando surgir trabalho novo ou alguma regra deixar de bloquear.'
        : 'Estou monitorando o WhatsApp e não encontrei uma ação segura para este ciclo.',
      meta: {
        backlog: state.snapshot.openBacklog,
        hotLeadCount: state.snapshot.hotLeadCount,
        pendingPaymentCount: state.snapshot.pendingPaymentCount,
        cycleProofId,
        accountProofId,
        exhaustionReport,
        opportunityRefresh,
      },
    });
    if (exhaustionReport.noLegalActions) {
      await persistSystemInsight(prisma, {
        workspaceId,
        type: 'CIA_NO_LEGAL_ACTIONS',
        title: 'Ciclo CIA sem ações legais disponíveis',
        description:
          'Todas as ações possíveis deste ciclo ficaram bloqueadas por regras explícitas ou timing operacional.',
        severity: 'INFO',
        metadata: {
          cycleProofId,
          accountProofId,
          guaranteeReport,
          exhaustionReport,
          opportunityRefresh,
        },
      });
    }
    return {
      queued: 0,
      reason: 'no_safe_actions',
      learning,
      guaranteeReport,
      exhaustionReport,
      cycleProofId,
      accountProofId,
      opportunityRefresh,
    };
  }

  await publishAgentEvent({
    type: 'thought',
    workspaceId,
    phase: 'cia_global_plan',
    message: batch.summary,
    meta: {
      guaranteeReport,
      exhaustionReport,
      cycleProofId,
      accountProofId,
      opportunityRefresh,
      globalStrategy,
      actions: batch.actions.map((action) => ({
        type: action.type,
        contactId: action.contactId,
        phone: action.phone,
        priority: action.priority,
        governor: action.governor,
        cognition: summarizeDecisionCognition(action),
        conversationTactic: action.conversationTactic,
      })),
      ignoredCount: batch.ignoredCount,
    },
  });

  await forEachSequential(Array.from(batch.actions.entries()), async ([index, action]) => {
    await autopilotQueue.add(
      'cia-action',
      {
        workspaceId,
        ...action,
        globalStrategy,
        cycleGeneratedAt: state.generatedAt,
        cycleProofId,
        accountProofId,
        conversationTactic: action.conversationTactic,
        conversationTacticUniverse: action.conversationTacticUniverse,
      },
      {
        jobId: buildQueueJobId(
          'cia-action',
          workspaceId,
          action.type,
          action.contactId || action.phone || action.conversationId,
          Date.now(),
          index,
        ),
        removeOnComplete: true,
      },
    );
  });

  return {
    queued: batch.actions.length,
    ignoredCount: batch.ignoredCount,
    learning,
    guaranteeReport,
    exhaustionReport,
    cycleProofId,
    accountProofId,
    opportunityRefresh,
  };
}
