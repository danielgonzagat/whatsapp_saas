import { prisma } from '../../db';
import { forEachSequential } from '../../utils/async-sequence';
import {
  log,
  isAutonomousEnabled,
  isCiaAutonomyMode,
  isExplicitProactiveOutreachAllowed,
  type UnknownRecord,
  notifyBillingSuspended,
} from './shared';
import { runCycleWorkspace } from './cycle-workspace';

export { sendAudioResponse } from './cycle-audio';
export { runCycleWorkspace };

export async function runCycleAll() {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, providerSettings: true },
    take: 500,
  });
  await forEachSequential(workspaces, async (ws) => {
    const settings = (ws.providerSettings ?? {}) as UnknownRecord;
    if (settings?.billingSuspended === true) {
      log.info('autopilot_cycle_skip_billing', { workspaceId: ws.id });
      await notifyBillingSuspended(ws.id);
      return;
    }
    if (isCiaAutonomyMode(settings)) {
      log.info('autopilot_cycle_skip_cia_primary', { workspaceId: ws.id });
      return;
    }
    if (!isAutonomousEnabled(settings)) {
      return;
    }
    if (!isExplicitProactiveOutreachAllowed(settings)) {
      log.info('autopilot_cycle_skip_proactive_disabled', {
        workspaceId: ws.id,
      });
      return;
    }
    await runCycleWorkspace(ws.id, settings);
  });
}
