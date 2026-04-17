import { Test, TestingModule } from '@nestjs/testing';
import { MassSendService } from './mass-send.service';

describe('MassSendService', () => {
  let service: MassSendService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        {
          provide: MassSendService,
          useFactory: () => new MassSendService(),
        },
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
