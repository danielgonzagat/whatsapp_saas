import { ConfigService } from '@nestjs/config';
import { UnifiedAgentService } from './unified-agent.service';

describe('UnifiedAgentService', () => {
  let prisma: any;
  let whatsappService: any;
  let service: UnifiedAgentService;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';

    prisma = {
      kloelMemory: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      product: {
        findFirst: jest.fn(),
      },
    };

    whatsappService = {
      sendMessage: jest.fn().mockResolvedValue({ error: false }),
    };

    service = new UnifiedAgentService(
      prisma,
      {
        get: jest.fn((key: string) => {
          if (key === 'OPENAI_API_KEY') return undefined;
          if (key === 'FRONTEND_URL') return 'https://app.kloel.test';
          return undefined;
        }),
      } as unknown as ConfigService,
      {} as any,
      {} as any,
      whatsappService,
      {} as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('send_product_info always sends the generated product answer to WhatsApp', async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'PDRN',
      description: 'Bioestimulador regenerativo',
      price: 890,
      paymentLink: 'https://pay.kloel.test/pdrn',
      active: true,
    });

    const result = await service.executeTool(
      'send_product_info',
      {
        productName: 'PDRN',
        includePrice: true,
        includeLink: false,
      },
      {
        workspaceId: 'ws-1',
        phone: '5511999999999',
      },
    );

    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511999999999',
      expect.stringContaining('PDRN'),
      {
        complianceMode: 'proactive',
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        sent: true,
        message: expect.stringContaining('Preço: R$ 890.00'),
      }),
    );
  });
});
