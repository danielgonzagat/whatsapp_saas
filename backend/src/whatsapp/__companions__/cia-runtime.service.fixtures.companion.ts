import { CiaRuntimeStateService } from '../cia-runtime-state.service';
import { CiaBootstrapService } from '../cia-bootstrap.service';
import { CiaBacklogRunService } from '../cia-backlog-run.service';

export type PrismaMock = {
  workspace: { findUnique: jest.Mock; update: jest.Mock };
  conversation: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  contact: { findUnique: jest.Mock; findFirst: jest.Mock };
  message: { findFirst: jest.Mock; findMany: jest.Mock };
  kloelMemory: { findUnique: jest.Mock; findMany: jest.Mock };
  systemInsight: { findMany: jest.Mock };
};

export type ProviderRegistryMock = {
  getSessionStatus: jest.Mock;
  getChats: jest.Mock;
  getChatMessages: jest.Mock;
  setPresence: jest.Mock;
};

export type CatchupServiceMock = {
  triggerCatchup: jest.Mock;
  runCatchupNow: jest.Mock;
};

export type AgentEventsMock = { publish: jest.Mock };
export type WorkerRuntimeMock = { isAvailable: jest.Mock };

export type RedisMock = {
  set: jest.Mock;
  del: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
  decr: jest.Mock;
};

export type WhatsappServiceMock = { sendMessage: jest.Mock };
export type UnifiedAgentMock = { processIncomingMessage: jest.Mock };

export type CiaRuntimeStateMock = CiaRuntimeStateService;
export type CiaBootstrapMock = CiaBootstrapService;
export type CiaBacklogRunMock = CiaBacklogRunService;
