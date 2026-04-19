import { createHash } from 'node:crypto';

export function hashAuthToken(token: string) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}
