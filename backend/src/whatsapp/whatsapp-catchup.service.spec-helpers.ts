import { WhatsAppCatchupService } from './whatsapp-catchup.service';

/** Catchup prisma mock type. */
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

/** Catchup provider registry mock type. */
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

/** Catchup inbound processor mock type. */
export type CatchupInboundProcessorMock = {
  process: jest.Mock;
};

/** Catchup inbox mock type. */
export type CatchupInboxMock = {
  saveMessageByPhone: jest.Mock;
};

/** Catchup redis mock type. */
export type CatchupRedisMock = {
  set: jest.Mock;
  get: jest.Mock;
  del: jest.Mock;
};

/** Catchup agent events mock type. */
export type CatchupAgentEventsMock = {
  publish: jest.Mock;
};

/** Catchup cia runtime mock type. */
export type CatchupCiaRuntimeMock = {
  startBacklogRun: jest.Mock;
};

/** Catchup worker runtime mock type. */
export type CatchupWorkerRuntimeMock = {
  isAvailable: jest.Mock;
};

type CatchupServiceInternals = {
  runCatchup: (workspaceId: string, reason: string, lockToken: string) => Promise<unknown>;
};

/** Run catchup. */
export function runCatchup(
  service: WhatsAppCatchupService,
  workspaceId: string,
  reason: string,
  lockToken: string,
) {
  return (service as never as CatchupServiceInternals).runCatchup(workspaceId, reason, lockToken);
}
