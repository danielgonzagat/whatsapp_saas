import type { StructuredLogger } from '../logging/structured-logger';
import type { AbiBuilderService } from './abi/abi-builder.service';
import type { AbiSnapshotCacheService } from './abi/abi-snapshot-cache.service';
import { validateAbiPayload } from './abi/abi-validator';
import type { MindCapabilityExecutor } from './mind/coordination';
interface BuildAgentCognitiveStateParams {
  workspaceId: string;
  currentInput: {
    raw: string;
    channel: string;
    arrivalTimestamp: string;
  };
  abiBuilder?: AbiBuilderService;
  abiSnapshotCache?: AbiSnapshotCacheService;
  brainCapability?: MindCapabilityExecutor;
  logger: Pick<StructuredLogger, 'warn' | 'log'>;
}
/**
 * Build the agent's cognitive state including ABI construction + cache fallback.
 * Extracted from UnifiedAgentService.processMessage() — Wave 18 decompose.
 */
export async function buildAgentCognitiveState(
  params: BuildAgentCognitiveStateParams,
): Promise<Record<string, unknown>> {
  const { workspaceId, currentInput, abiBuilder, abiSnapshotCache, brainCapability, logger } =
    params;

  let cognitiveState: Record<string, unknown> = {
    abiStatus: abiBuilder ? 'unavailable_or_invalid' : 'builder_not_injected',
    audience: 'public',
    perceptionSnapshot: { channel: currentInput.channel },
  };

  let cognitiveSubstrate:
    | Awaited<ReturnType<MindCapabilityExecutor['buildCognitiveSubstrate']>>
    | undefined;
  if (brainCapability) {
    try {
      cognitiveSubstrate = await brainCapability.buildCognitiveSubstrate(workspaceId);
    } catch (err: unknown) {
      logger.warn(
        `Cognitive substrate build failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (abiBuilder) {
    const abiResult = await abiBuilder.build({
      audience: 'public',
      currentInput,
      perceptionSnapshot: {
        channel: currentInput.channel,
      },
      ...(cognitiveSubstrate ? { cognitiveSubstrate } : {}),
    });

    if (abiResult.status !== 'ok') {
      logger.warn(`ABI build failed: ${abiResult.reason}, trying cached snapshot`);
      const cached = await abiSnapshotCache?.getCachedSnapshot(workspaceId);
      if (cached) {
        logger.log(`Using cached ABI snapshot for workspace ${workspaceId}`);
        cognitiveState = cached as object as Record<string, unknown>;
      } else {
        logger.warn(
          `No cached ABI snapshot available for workspace ${workspaceId}, using hardcoded zero-state fallback`,
        );
      }
    } else {
      const abi = abiResult.abi;
      const validation = validateAbiPayload(abi);

      if (validation.status === 'FAIL') {
        logger.warn(
          `ABI validation failed: ${JSON.stringify(validation.issues)}, trying cached snapshot`,
        );
        const cached = await abiSnapshotCache?.getCachedSnapshot(workspaceId);
        if (cached) {
          logger.log(
            `Using cached ABI snapshot for workspace ${workspaceId} (validation failed)`,
          );
          cognitiveState = cached as object as Record<string, unknown>;
        } else {
          logger.warn(
            `No cached ABI snapshot available for workspace ${workspaceId}, using hardcoded zero-state fallback`,
          );
        }
      } else {
        cognitiveState = abi as object as Record<string, unknown>;
        void abiSnapshotCache?.cacheSnapshot(workspaceId, abi);
      }
    }
  }

  return cognitiveState;
}
