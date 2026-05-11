import type { WahaChatMessage, WahaChatSummary } from './providers/whatsapp-api.provider';
import type { WhatsAppProviderRegistry } from './providers/provider-registry';

export async function canonicalizeMessages(
  ws: string,
  messages: WahaChatMessage[],
  getLidPnMap: (ws: string) => Promise<Map<string, string>>,
  resolveCanonicalChatId: (chatId: string, mappings: Map<string, string>) => string,
): Promise<WahaChatMessage[]> {
  const mappings = await getLidPnMap(ws);
  return (messages || []).map((m) => ({
    ...m,
    chatId: resolveCanonicalChatId(String(m.chatId || m.from || '').trim(), mappings) || m.chatId,
    from: resolveCanonicalChatId(String(m.from || m.chatId).trim(), mappings) || m.from,
    to: resolveCanonicalChatId(String(m.to || '').trim(), mappings) || m.to,
  })) as WahaChatMessage[];
}

export async function loadCatchupMessages(
  ws: string,
  chat: WahaChatSummary,
  since: Date,
  opts: {
    providerRegistry: WhatsAppProviderRegistry;
    maxPagesPerChat: number;
    fallbackPagesPerChat: number;
    maxMessagesPerChat: number;
    normalizeMessages: (raw: unknown, fallbackChatId: string) => WahaChatMessage[];
    resolveTimestamp: (value: unknown) => number;
    getLidPnMap: (ws: string) => Promise<Map<string, string>>;
    resolveCanonicalChatId: (chatId: string, mappings: Map<string, string>) => string;
    fallbackScan?: boolean;
    firstSync?: boolean;
  },
): Promise<{ messages: WahaChatMessage[]; hadOverflow: boolean }> {
  const collected: WahaChatMessage[] = [];
  const seen = new Set<string>();
  let ho = false;
  let off = 0;
  const ur = Math.max(0, Number(chat.unreadCount || 0) || 0);
  const fs = opts.fallbackScan === true;
  const fS = opts.firstSync === true;
  const mp = fs ? Math.min(opts.maxPagesPerChat, opts.fallbackPagesPerChat) : opts.maxPagesPerChat;
  const loadPage = async (page: number): Promise<void> => {
    if (page >= mp) return;
    const raw = await opts.providerRegistry.getChatMessages(ws, chat.id, {
      limit: opts.maxMessagesPerChat,
      offset: off,
    });
    const np = opts
      .normalizeMessages(raw, chat.id)
      .filter((m) => !!m.id)
      .sort((a, b) => opts.resolveTimestamp(a) - opts.resolveTimestamp(b));
    if (!np.length) return;
    if (np.length >= opts.maxMessagesPerChat) ho = true;
    for (const m of np) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      collected.push(m);
    }
    off += np.length;
    if (np.length < opts.maxMessagesPerChat) return;
    const ic = collected.filter((m) => !m.fromMe).length;
    if (ur > 0 && ic >= ur) return;
    if (ur === 0 && !fS && !fs && np.every((m) => opts.resolveTimestamp(m) < since.getTime()))
      return;
    return loadPage(page + 1);
  };
  await loadPage(0);
  if (ur > 0 && collected.length < ur) ho = true;
  const cm = await canonicalizeMessages(
    ws,
    collected,
    opts.getLidPnMap,
    opts.resolveCanonicalChatId,
  );
  return {
    messages:
      ur > 0 || fs || fS ? cm : cm.filter((m) => opts.resolveTimestamp(m) >= since.getTime()),
    hadOverflow: ho,
  };
}
