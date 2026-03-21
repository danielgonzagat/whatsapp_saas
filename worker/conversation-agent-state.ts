type ConversationMessageLike = {
  direction?: string | null;
  createdAt?: Date | string | null;
};

type ConversationLike = {
  status?: string | null;
  mode?: string | null;
  assignedAgentId?: string | null;
  unreadCount?: number | null;
  lastMessageAt?: Date | string | null;
  messages?: ConversationMessageLike[] | null;
};

function normalizeDirection(direction?: string | null): "INBOUND" | "OUTBOUND" | null {
  const normalized = String(direction || "").trim().toUpperCase();
  if (normalized === "INBOUND") return "INBOUND";
  if (normalized === "OUTBOUND") return "OUTBOUND";
  return null;
}

export function resolveConversationOwner(
  conversation?: Pick<ConversationLike, "mode" | "assignedAgentId"> | null,
): "AGENT" | "HUMAN" {
  const mode = String(conversation?.mode || "").trim().toUpperCase();
  if (mode === "HUMAN" || mode === "PAUSED") {
    return "HUMAN";
  }
  if (conversation?.assignedAgentId) {
    return "HUMAN";
  }
  return "AGENT";
}

export function isConversationPendingForAgent(conversation: ConversationLike): boolean {
  const status = String(conversation.status || "").trim().toUpperCase();
  if (status === "CLOSED") return false;
  if (resolveConversationOwner(conversation) !== "AGENT") return false;
  const unreadCount = Math.max(0, Number(conversation.unreadCount || 0) || 0);
  if (unreadCount > 0) return true;
  const [lastMessage] = conversation.messages || [];
  return normalizeDirection(lastMessage?.direction) === "INBOUND";
}

export function deriveOperationalUnreadCount(conversation: ConversationLike): number {
  const unreadCount = Math.max(0, Number(conversation.unreadCount || 0) || 0);
  return isConversationPendingForAgent(conversation)
    ? Math.max(1, unreadCount)
    : unreadCount;
}
