import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { FunnelsController } from './funnels.controller';
import { FunnelsService } from './funnels.service';

describe('FunnelsController', () => {
  let controller: FunnelsController;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [FunnelsController],
      providers: [
        { provide: FunnelsService, useValue: {} },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<FunnelsController>(FunnelsController);
  });

  afterAll(async () => {
    await module?.close();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
