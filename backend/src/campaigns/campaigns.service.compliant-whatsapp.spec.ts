import { Test, TestingModule } from '@nestjs/testing';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SmartTimeService } from '../analytics/smart-time/smart-time.service';
import { CampaignEventEmitterService } from '../kloel/campaign-emitter/campaign-event-emitter.service';
import { MetaWhatsAppService } from '../meta/meta-whatsapp.service';
import { WhatsappMessageDispatcherService } from '../marketing/channels/whatsapp/whatsapp-message-dispatcher.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

const mockQueueAdd = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockQueueAdd })),
}));

jest.mock('../common/redis/redis.util', () => ({
  createBullMqConnectionOptions: jest.fn(() => ({ url: 'redis://localhost:6379' })),
  createRedisClient: jest.fn(() => ({})),
}));

// The bulk blast loads EmailService via dynamic import before iterating
// contacts. Stub it so the test stays isolated to the WhatsApp send path.
jest.mock('../auth/email.service', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue(true),
  })),
}));

// expect.objectContaining returns `any` in jest's typings; this typed wrapper keeps
// nested matcher property assignments lint-safe without suppressions.
const objectShape = (shape: Record<string, unknown>): Record<string, unknown> =>
  expect.objectContaining(shape) as Record<string, unknown>;

/**
 * P0-B — campaigns bulk-blast compliance/billing leak.
 *
 * Proves the KLOEL_COMPLIANT_WHATSAPP_SEND flag gate on the campaign mass send:
 *   - flag OFF (default) → raw metaWhatsApp.sendTextMessage, dispatcher NOT called
 *   - flag ON            → canonical WhatsappMessageDispatcherService.sendMessage,
 *                          metaWhatsApp.sendTextMessage NOT called.
 */
describe('CampaignsService — compliant WhatsApp bulk send flag', () => {
  const FLAG = 'KLOEL_COMPLIANT_WHATSAPP_SEND';
  let originalFlag: string | undefined;

  let service: CampaignsService;
  let mockPrisma: ReturnType<typeof createPartialPrismaMock>;
  let mockMetaWhatsApp: { sendTextMessage: jest.Mock };
  let mockDispatcher: { sendMessage: jest.Mock };

  const CAMPAIGN = {
    id: 'camp-1',
    name: 'Promo',
    status: 'SCHEDULED',
    workspaceId: 'ws-1',
    filters: {},
    messageTemplate: 'Oi {{name}}',
    stats: {},
  };

  beforeEach(async () => {
    originalFlag = process.env[FLAG];

    mockPrisma = createPartialPrismaMock({
      campaign: ['findFirst', 'updateMany'],
      contact: ['findMany'],
      workspace: ['findUnique'],
      metaConnection: ['findFirst'],
    });
    (mockPrisma.campaign.findFirst as jest.Mock).mockResolvedValue(CAMPAIGN);
    (mockPrisma.campaign.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
      { id: 'c-1', name: 'Ana', email: null, phone: '+5511988887777' },
    ]);
    // whatsappReady = legacy path: metaWhatsAppAvailable && providerSettings.whatsappApiSession.status === 'connected'
    (mockPrisma.workspace.findUnique as jest.Mock).mockResolvedValue({
      id: 'ws-1',
      providerSettings: { whatsappApiSession: { status: 'connected' } },
    });
    (mockPrisma.metaConnection.findFirst as jest.Mock).mockResolvedValue(null);

    mockMetaWhatsApp = {
      sendTextMessage: jest.fn().mockResolvedValue({ success: true, messageId: 'wamid-1' }),
    };
    mockDispatcher = {
      sendMessage: jest
        .fn()
        .mockResolvedValue({ ok: true, direct: true, delivery: 'sent', messageId: 'disp-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: SmartTimeService, useValue: { getBestTime: jest.fn() } },
        { provide: CampaignEventEmitterService, useValue: { emitAudienceReached: jest.fn() } },
        { provide: MetaWhatsAppService, useValue: mockMetaWhatsApp },
        { provide: WhatsappMessageDispatcherService, useValue: mockDispatcher },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = originalFlag;
    }
    jest.clearAllMocks();
  });

  it('flag OFF (default): sends via raw metaWhatsApp.sendTextMessage, dispatcher NOT called', async () => {
    delete process.env[FLAG];

    await service.processCampaignJob({ data: { campaignId: 'camp-1', workspaceId: 'ws-1' } });

    expect(mockMetaWhatsApp.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockMetaWhatsApp.sendTextMessage).toHaveBeenCalledWith(
      'ws-1',
      '+5511988887777',
      'Oi Ana',
    );
    expect(mockDispatcher.sendMessage).not.toHaveBeenCalled();

    // stats reflect a successful send
    expect(mockPrisma.campaign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: objectShape({
          status: 'COMPLETED',
          stats: objectShape({ sent: 1, failed: 0 }),
        }),
      }),
    );
  });

  it('flag ON: routes each send through the dispatcher, metaWhatsApp.sendTextMessage NOT called', async () => {
    process.env[FLAG] = 'true';

    await service.processCampaignJob({ data: { campaignId: 'camp-1', workspaceId: 'ws-1' } });

    expect(mockDispatcher.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockDispatcher.sendMessage).toHaveBeenCalledWith('ws-1', '+5511988887777', 'Oi Ana');
    expect(mockMetaWhatsApp.sendTextMessage).not.toHaveBeenCalled();

    expect(mockPrisma.campaign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: objectShape({
          status: 'COMPLETED',
          stats: objectShape({ sent: 1, failed: 0 }),
        }),
      }),
    );
  });

  it('flag ON: a dispatcher compliance block ({ error }) counts as a failed send', async () => {
    process.env[FLAG] = 'true';
    mockDispatcher.sendMessage.mockResolvedValue({
      error: true,
      message: 'Contato sem opt-in para WhatsApp',
    });

    await service.processCampaignJob({ data: { campaignId: 'camp-1', workspaceId: 'ws-1' } });

    expect(mockDispatcher.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockMetaWhatsApp.sendTextMessage).not.toHaveBeenCalled();
    expect(mockPrisma.campaign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: objectShape({
          status: 'COMPLETED',
          stats: objectShape({ sent: 0, failed: 1 }),
        }),
      }),
    );
  });
});
