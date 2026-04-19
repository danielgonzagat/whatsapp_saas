// Pure helpers extracted from chat-container.tsx to reduce cyclomatic
// complexity on the SSE reader path. Behaviour is byte-identical to the
// original inline implementation.

export interface GuestStreamLineUpdate {
  /** Delta to append to the assistant buffer, if any. */
  delta?: string;
  /** Full content from an error payload; caller must stop + replace buffer. */
  errorContent?: string;
}

export function parseGuestStreamLine(line: string): GuestStreamLineUpdate | null {
  if (!line.startsWith('data: ')) return null;
  const data = line.slice(6);
  if (data === '[DONE]') return null;
  try {
    const parsed = JSON.parse(data) as {
      error?: unknown;
      content?: unknown;
      chunk?: unknown;
      message?: unknown;
    };
    if (parsed.error) {
      const fallback =
        'Desculpe, tive uma instabilidade agora. Tenta de novo em alguns segundos.';
      const raw = parsed.content ?? parsed.chunk ?? parsed.message ?? fallback;
      return { errorContent: String(raw) };
    }
    const chunk = parsed.content ?? parsed.chunk;
    return chunk ? { delta: String(chunk) } : {};
  } catch {
    return {};
  }
}
