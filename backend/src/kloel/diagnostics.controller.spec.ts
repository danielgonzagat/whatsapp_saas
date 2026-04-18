import { DiagnosticsController } from './diagnostics.controller';

describe('DiagnosticsController', () => {
  let prisma: any;
  let controller: DiagnosticsController;

  beforeEach(() => {
    prisma = {
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
});
