import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let prisma: {
    $queryRaw: jest.Mock;
    workspace: { count: jest.Mock };
    agent: { count: jest.Mock };
    contact: { count: jest.Mock };
    conversation: { count: jest.Mock };
  };

  let originalDiagToken: string | undefined;

  beforeEach(async () => {
    originalDiagToken = process.env.DIAG_TOKEN;
    delete process.env.DIAG_TOKEN;
    prisma = {
      $queryRaw: jest.fn(),
      workspace: { count: jest.fn().mockResolvedValue(0) },
      agent: { count: jest.fn().mockResolvedValue(0) },
      contact: { count: jest.fn().mockResolvedValue(0) },
      conversation: { count: jest.fn().mockResolvedValue(0) },
    };
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  afterEach(() => {
    if (originalDiagToken === undefined) {
      delete process.env.DIAG_TOKEN;
    } else {
      process.env.DIAG_TOKEN = originalDiagToken;
    }
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toEqual({
        service: 'Kloel API',
        status: 'operational',
        version: expect.any(String),
      });
    });
  });

  describe('diag-db', () => {
    it('returns typed table counts when the database check succeeds', async () => {
      prisma.workspace.count.mockResolvedValue(3);
      prisma.agent.count.mockResolvedValue(5);
      prisma.contact.count.mockResolvedValue(8);
      prisma.conversation.count.mockResolvedValue(13);

      await expect(
        appController.diagnostic({
          headers: {},
          query: {},
        } as any),
      ).resolves.toEqual(
        expect.objectContaining({
          database: 'connected',
          tables: {
            workspaces: 3,
            agents: 5,
            contacts: 8,
            conversations: 13,
          },
        }),
      );
    });

    it('captures database errors without throwing the endpoint response away', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('db offline'));

      // The diagnostic endpoint must NOT leak the underlying error message
      // or the call stack — it returns a generic 'database query failed'
      // string. The internal Error is logged by the controller, not echoed.
      await expect(
        appController.diagnostic({
          headers: {},
          query: {},
        } as any),
      ).resolves.toEqual(
        expect.objectContaining({
          database: 'error',
          error: 'database query failed',
          tables: {},
        }),
      );
    });
  });
});
