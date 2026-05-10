import type { PrismaClient } from '@prisma/client';
import type { CustomerCognitiveState } from './cognitive-state-types';

export function buildStateKey(input: {
  conversationId?: string | null;
  contactId?: string | null;
  phone?: string | null;
}) {
  return `cognitive_state:${input.conversationId || input.contactId || input.phone || 'workspace'}`;
}

export async function loadCustomerCognitiveState(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    conversationId?: string | null | undefined;
    contactId?: string | null | undefined;
    phone?: string | null | undefined;
  },
): Promise<CustomerCognitiveState | null> {
  if (!prisma?.kloelMemory?.findUnique) {
    return null;
  }
  const key = buildStateKey(input);
  const record = await prisma.kloelMemory
    .findUnique({
      where: {
        workspaceId_key: {
          workspaceId: input.workspaceId,
          key,
        },
      },
    })
    .catch(() => null /* not found */);

  return ((record?.value || null) as CustomerCognitiveState | null) || null;
}
