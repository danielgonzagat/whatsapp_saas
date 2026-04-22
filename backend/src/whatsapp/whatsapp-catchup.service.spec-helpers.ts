import { WhatsAppCatchupService } from './whatsapp-catchup.service';

export type CatchupPrismaMock = {
  workspace: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  contact: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };
  conversation: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

export type CatchupProviderRegistryMock = {
  getProviderType: jest.Mock;
  extractPhoneFromChatId: jest.Mock;
  listLidMappings: jest.Mock;
  getChats: jest.Mock;
  getChatMessages: jest.Mock;
  sendSeen: jest.Mock;
  readChatMessages: jest.Mock;
  upsertContactProfile: jest.Mock;
};

export type CatchupInboundProcessorMock = {
  process: jest.Mock;
};

export type CatchupInboxMock = {
  saveMessageByPhone: jest.Mock;
};

export type CatchupRedisMock = {
  set: jest.Mock;
  get: jest.Mock;
  del: jest.Mock;
};

export type CatchupAgentEventsMock = {
  publish: jest.Mock;
};

export type CatchupCiaRuntimeMock = {
  startBacklogRun: jest.Mock;
};

export type CatchupWorkerRuntimeMock = {
  isAvailable: jest.Mock;
};

type CatchupServiceInternals = {
  runCatchup: (workspaceId: string, reason: string, lockToken: string) => Promise<unknown>;
};

export function runCatchup(
  service: WhatsAppCatchupService,
  workspaceId: string,
  reason: string,
  lockToken: string,
) {
  return (service as unknown as CatchupServiceInternals).runCatchup(workspaceId, reason, lockToken);
}
