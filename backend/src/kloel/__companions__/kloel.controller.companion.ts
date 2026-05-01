import type { Prisma } from '@prisma/client';

type ThreadWithMessages = {
  messages: Array<{ content: unknown; role: string }>;
};

export function filterEmptyThreads<T extends ThreadWithMessages>(threads: T[]): T[] {
  return threads.filter((thread) =>
    thread.messages.some((message) => {
      const content = message?.content;
      return typeof content === 'string' ? content.trim().length > 0 : false;
    }),
  );
}

export function normalizeMessageMetadata(
  metadata: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return { ...(metadata as Record<string, unknown>) };
  }
  return {};
}
