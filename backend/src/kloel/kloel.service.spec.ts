jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
  chatCompletionStreamWithRetry: jest.fn(),
}));

import { KloelService } from './kloel.service';
import { KloelThinkerService } from './kloel-thinker.service';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { chatCompletionStreamWithRetry, chatCompletionWithFallback } from './openai-wrapper';

type KloelPrismaMock = {
  chatThread: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    count?: jest.Mock;
  };
  chatMessage: {
    findMany: jest.Mock;
    create: jest.Mock;
    update?: jest.Mock;
    deleteMany?: jest.Mock;
    count?: jest.Mock;
  };
  kloelMessage: { findMany: jest.Mock; create: jest.Mock };
  product: {
    create: jest.Mock;
    count: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  workspace: { findUnique: jest.Mock; update: jest.Mock };
  agent: { findFirst: jest.Mock };
  flow: { create: jest.Mock; findMany: jest.Mock };
  contact: { findFirst: jest.Mock; create: jest.Mock };
  message: { create: jest.Mock; update: jest.Mock };
  auditLog: { create: jest.Mock };
  $transaction: jest.Mock;
};
