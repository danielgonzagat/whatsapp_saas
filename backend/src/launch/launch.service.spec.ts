import { LaunchService } from './launch.service';

describe('LaunchService', () => {
  let prisma: any;
  let service: LaunchService;

  beforeEach(() => {
    prisma = {
      workspace: {
        findUnique: jest.fn(),
      },
    };

    service = new LaunchService(prisma);
  });

  it('ignores malformed workspace phone settings when generating a start link', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        phone: { raw: '5511999999999' },
      },
    });

    await expect(service.generateStartLink('ws-1', 'flow-123')).resolves.toBe(
      'https://api.whatsapp.com/send?text=start_flow_flow-123',
    );
  });

  it('uses a normalized phone string when one is configured', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        phone: '5511999999999',
      },
    });

    await expect(service.generateStartLink('ws-1', 'flow-123', 'iniciar agora')).resolves.toBe(
      'https://wa.me/5511999999999?text=iniciar%20agora',
    );
  });
});
