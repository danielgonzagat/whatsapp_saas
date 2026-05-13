import type { MindBeliefService } from './mind-belief.service';
import type { MindBelief, MindJson } from './mind.types';

export async function getBeliefByChannel(
  beliefs: MindBeliefService,
  workspaceId: string,
  channel: string,
  subject: string,
  predicate: string,
  context: MindJson,
): Promise<MindBelief> {
  if (!channel) {
    throw new Error('channel is required for belief queries — no implicit fallback');
  }
  return beliefs.getOrInit(workspaceId, subject, predicate, { ...context, channel });
}

export function requireChannel(channel: string | undefined): string {
  if (!channel) {
    throw new Error('channel is required — no implicit fallback to any channel');
  }
  return channel;
}

export function extractChannel(context: MindJson): string | undefined {
  const candidate = context?.channel;
  return typeof candidate === 'string' ? candidate : undefined;
}
