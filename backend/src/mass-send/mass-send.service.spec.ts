import { Test, TestingModule } from '@nestjs/testing';
import { MassSendService } from './mass-send.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

describe('MassSendService', () => {
  let service: MassSendService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        {
          provide: MassSendService,
          useFactory: (whatsapp: WhatsappService) =>
            new MassSendService(whatsapp),
          inject: [WhatsappService],
        },
        { provide: WhatsappService, useValue: { sendMessage: jest.fn() } },
      ],
    }).compile();

    service = module.get<MassSendService>(MassSendService);
  });

  afterAll(async () => {
    await module?.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
