const readIdFromObject = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'string' ? id : null;
};

const extractIdFromMessages = (messages: unknown): string | null => {
  if (!Array.isArray(messages)) {
    return null;
  }
  return readIdFromObject(messages[0]);
};

const extractFirstStringCandidate = (r: Record<string, unknown>): string | null => {
  for (const c of [r.id, r.messageId, r.sid]) {
    if (typeof c === 'string') {
      return c;
    }
  }
  return null;
};

export const extractExternalId = (res: unknown): string | null => {
  if (!res || typeof res !== 'object') {
    return null;
  }
  const r = res as Record<string, unknown>;
  return (
    extractIdFromMessages(r.messages) ||
    readIdFromObject(r.message) ||
    extractFirstStringCandidate(r)
  );
};
