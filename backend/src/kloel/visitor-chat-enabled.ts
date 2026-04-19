export function isVisitorChatEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const canonical = String(env.VISITOR_CHAT_ENABLED || '')
    .trim()
    .toLowerCase();
  if (canonical) {
    return canonical !== 'false';
  }

  const legacy = String(env.GUEST_CHAT_ENABLED || '')
    .trim()
    .toLowerCase();
  if (legacy) {
    return legacy !== 'false';
  }

  return true;
}
