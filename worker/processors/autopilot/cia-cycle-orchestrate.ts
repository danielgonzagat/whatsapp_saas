import { prisma } from '../../db';
import { forEachSequential } from '../../utils/async-sequence';
import { isCiaAutonomyMode, type UnknownRecord } from './shared';
import { runCiaCycleWorkspace } from './cia-cycle-workspace';

export { publishCiaProofEvent } from './cia-cycle-proof-event';

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

export type CiaProofEventPayload = Parameters<
  typeof import('./cia-cycle-proof-event').publishCiaProofEvent
>[0];
