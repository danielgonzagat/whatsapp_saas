import { secureRandomFloat } from '@/lib/secure-random';
// Pure helpers extracted from HomeScreen.tsx to reduce the host
// component's cyclomatic complexity. Behaviour is byte-identical to the
// original inline implementation so no visual/behavioural delta is
// introduced.

export interface KloelChatStreamLineUpdate {
  /** Text delta to append to the assistant buffer, if any. */
  contentDelta?: string;
  /** Updated thinking label if a tool_call was detected. */
  thinkingText?: string;
  /** Final error content — caller should replace buffer and stop. */
  errorContent?: string;
}

/**
 * Parse a single SSE line (without the trailing newline) from the Kloel chat
 * guest stream. Returns a delta/update object; returns `null` for lines that
 * should be ignored (non-`data:` lines or the terminal `[DONE]` marker).
 */
export function parseKloelChatStreamLine(line: string): KloelChatStreamLineUpdate | null {
  if (!line.startsWith('data: ')) {
    return null;
  }
  const data = line.slice(6);
  if (data === '[DONE]') {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as {
      error?: unknown;
      content?: unknown;
      message?: unknown;
      type?: unknown;
      tool_call?: { name?: unknown } | null;
      name?: unknown;
      tool?: unknown;
      chunk?: unknown;
    };

    if (parsed.error) {
      const raw =
        parsed.content ?? parsed.message ?? 'Desculpe, tive uma instabilidade. Tente novamente.';
      const errorContent = typeof raw === 'string' ? raw : String(raw);
      return { errorContent };
    }

    const update: KloelChatStreamLineUpdate = {};

    if (parsed.type === 'tool_call' || parsed.tool_call) {
      const toolName =
        (parsed.tool_call && typeof parsed.tool_call === 'object'
          ? (parsed.tool_call as { name?: unknown }).name
          : undefined) ??
        parsed.name ??
        parsed.tool ??
        '';
      if (typeof toolName === 'string' && toolName) {
        update.thinkingText = `Usando ${toolName}...`;
      }
    }

    const delta = parsed.content ?? parsed.chunk;
    if (delta) {
      update.contentDelta = String(delta);
    }
    return update;
  } catch {
    return { contentDelta: data };
  }
}

/**
 * Compute the per-character delay (in ms) for the HomeScreen typewriter
 * simulation. Preserves the original weighting table character-for-character.
 */
const TYPING_DELAYS: Record<string, () => number> = {
  '.': () => 150 + secureRandomFloat() * 100,
  '!': () => 150 + secureRandomFloat() * 100,
  '?': () => 150 + secureRandomFloat() * 100,
  ',': () => 80 + secureRandomFloat() * 40,
  '\n': () => 120 + secureRandomFloat() * 80,
  ' ': () => 10 + secureRandomFloat() * 15,
};

/** Typing simulation delay. */
export function typingSimulationDelay(char: string): number {
  if (secureRandomFloat() < 0.08) {
    return 2;
  }
  const specific = TYPING_DELAYS[char];
  return specific ? specific() : 15 + secureRandomFloat() * 25;
}
