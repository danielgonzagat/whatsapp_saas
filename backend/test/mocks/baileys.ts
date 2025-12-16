import { EventEmitter } from 'events';

// Jest E2E mock for @whiskeysockets/baileys
// The backend e2e suite loads AppModule which imports Baileys for WhatsApp connection.
// In tests we don't need to execute real WhatsApp logic, only avoid ESM parsing errors.

export const DisconnectReason = {
  loggedOut: 401,
} as const;

export const proto = {} as any;

export async function useMultiFileAuthState(_authPath: string): Promise<any> {
  return {
    state: { creds: {}, keys: {} },
    saveCreds: async () => undefined,
  };
}

export async function fetchLatestBaileysVersion(): Promise<any> {
  return { version: [2, 0, 0] };
}

export function makeCacheableSignalKeyStore(keys: any): any {
  return keys;
}

export default function makeWASocket(_opts: any): any {
  const ev = new EventEmitter();

  return {
    ev,
    user: undefined,
    sendMessage: async () => ({ key: { id: 'mock' } }),
    end: async () => undefined,
  };
}
