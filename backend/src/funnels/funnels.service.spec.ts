import { Test, TestingModule } from '@nestjs/testing';
import { FunnelsService } from './funnels.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

describe('FunnelsService', () => {
  let service: FunnelsService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        {
          provide: FunnelsService,
          useFactory: (wa: WhatsappService) => new FunnelsService(wa as any),
          inject: [WhatsappService],
        },
        { provide: WhatsappService, useValue: {} },
      ],
    }).compile();

    service = module.get<FunnelsService>(FunnelsService);
  });

  afterAll(async () => {
    await module?.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
