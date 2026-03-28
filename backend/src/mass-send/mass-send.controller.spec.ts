import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { MassSendController } from './mass-send.controller';
import { MassSendService } from './mass-send.service';

describe('MassSendController', () => {
  let controller: MassSendController;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [MassSendController],
      providers: [
        {
          provide: MassSendService,
          useValue: { enqueueCampaign: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<MassSendController>(MassSendController);
  });

  afterAll(async () => {
    await module?.close();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
