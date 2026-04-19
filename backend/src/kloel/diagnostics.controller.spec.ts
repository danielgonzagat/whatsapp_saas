import { DiagnosticsController } from './diagnostics.controller';

describe('DiagnosticsController', () => {
  let prisma: any;
  let controller: DiagnosticsController;
  const originalGuestChatEnabled = process.env.GUEST_CHAT_ENABLED;
  const originalVisitorChatEnabled = process.env.VISITOR_CHAT_ENABLED;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      workspace: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      message: {
        count: jest.fn(),
      },
      autopilotEvent: {
        count: jest.fn(),
      },
      flow: {
        count: jest.fn(),
      },
    };
    controller = new DiagnosticsController(prisma);
  });

  afterAll(() => {
    if (originalGuestChatEnabled === undefined) {
      delete process.env.GUEST_CHAT_ENABLED;
    } else {
      process.env.GUEST_CHAT_ENABLED = originalGuestChatEnabled;
    }

    if (originalVisitorChatEnabled === undefined) {
      delete process.env.VISITOR_CHAT_ENABLED;
    } else {
      process.env.VISITOR_CHAT_ENABLED = originalVisitorChatEnabled;
    }
  });

  it('normalizes malformed workspace provider settings in diagnostics', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      name: 'Workspace Teste',
      providerSettings: {
        autopilot: { enabled: 'yes' },
        whatsappApiSession: { status: { broken: true } },
        billingSuspended: 'true',
        planLimits: { plan: 123 },
      },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      _count: {
        contacts: 12,
        flows: 3,
        agents: 2,
      },
    });
    prisma.message.count.mockResolvedValue(7);
    prisma.autopilotEvent.count.mockResolvedValue(2);
    prisma.flow.count.mockResolvedValue(3);

    const result = await controller.workspaceDiagnostics('ws-1');

    expect(result.settings).toEqual({
      autopilotEnabled: false,
      whatsappConnected: false,
      billingStatus: 'active',
      plan: 'free',
    });
  });

  it('exposes visitorChatEnabled while preserving the legacy guestChatEnabled alias', async () => {
    process.env.GUEST_CHAT_ENABLED = 'false';
    prisma.workspace.findMany.mockResolvedValue([
      { providerSettings: { autopilot: { enabled: true } } },
      { providerSettings: { autopilot: { enabled: false } } },
    ]);
    prisma.workspace.count.mockResolvedValue(4);
    prisma.autopilotEvent.count.mockResolvedValue(2);

    const result = await controller.fullDiagnostics();

    expect(result.deploy).toMatchObject({
      visitorChatEnabled: false,
      guestChatEnabled: false,
    });
  });

  it('uses VISITOR_CHAT_ENABLED as the canonical diagnostics flag and keeps guestChatEnabled as an alias', async () => {
    process.env.GUEST_CHAT_ENABLED = 'true';
    process.env.VISITOR_CHAT_ENABLED = 'false';
    prisma.workspace.findMany.mockResolvedValue([]);
    prisma.workspace.count.mockResolvedValue(0);
    prisma.autopilotEvent.count.mockResolvedValue(0);

    const result = await controller.fullDiagnostics();

    expect(result.deploy).toMatchObject({
      visitorChatEnabled: false,
      guestChatEnabled: false,
    });
  });
});
