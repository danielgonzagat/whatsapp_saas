import { prisma } from '../../db';
import { publishAgentEvent } from '../../providers/agent-events';
import { forEachSequential } from '../../utils/async-sequence';
import {
  isCiaAutonomyMode,
  type UnknownRecord,
} from './shared';
import { runCiaCycleWorkspace } from './cia-cycle-workspace';

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

export async function publishCiaProofEvent(input: {
  candidateCount: number;
  candidateLength: number;
  exhaustionReport: { noLegalActions?: boolean; details: { candidateCount: number }; dispatchableCount: number; dispatchedCount: number; silentCount: number; exhaustive: boolean };
  cycleProofId: string;
  accountProofId: string | null;
  workspaceId: string;
  opportunityRefresh: unknown;
  actions: Array<{
    conversationId: string;
    type: string;
    selectedActionUtility: unknown;
    selectedActionRank: unknown;
    betterActionCount: number;
    betterExecutableActionCount: number;
    nextBestActionType: unknown;
    nextBestActionUtility: unknown;
    conversationTactic: unknown;
    selectedTacticUtility: unknown;
    selectedTacticRank: unknown;
    betterTacticCount: number;
    nextBestTactic: unknown;
    nextBestTacticUtility: unknown;
  }>;
  batchSize: number;
}) {
  const { exhaustionReport } = input;
  if (exhaustionReport.noLegalActions && exhaustionReport.details.candidateCount === 0) {
    return;
  }

  await publishAgentEvent({
    type: 'proof',
    workspaceId: input.workspaceId,
    phase: 'cia_cycle_proof',
    persistent: true,
    message: exhaustionReport.noLegalActions
      ? `Nenhuma ação elegível permaneceu neste ciclo após avaliar ${exhaustionReport.details.candidateCount} candidata(s); ${exhaustionReport.silentCount} ficaram silenciadas e ${exhaustionReport.dispatchableCount} seguiram bloqueadas pelas regras atuais.`
      : `Selecionei ${input.batchSize} ação(ões) para despacho após avaliar ${input.candidateLength} candidata(s); ${exhaustionReport.dispatchableCount} estavam elegíveis para execução neste ciclo.`,
    meta: {
      cycleProofId: input.cycleProofId,
      accountProofId: input.accountProofId,
      candidateCount: exhaustionReport.details.candidateCount,
      dispatchableCount: exhaustionReport.dispatchableCount,
      dispatchedCount: exhaustionReport.dispatchedCount,
      silentCount: exhaustionReport.silentCount,
      noLegalActions: exhaustionReport.noLegalActions,
      exhaustive: exhaustionReport.exhaustive,
      opportunityRefresh: input.opportunityRefresh,
      actionOptimality: input.actions.map((action) => ({
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

