import { Test, TestingModule } from '@nestjs/testing';
import { MassSendService } from './mass-send.service';

const mockQueueClose = jest.fn().mockResolvedValue(undefined);
const mockQueueAdd = jest.fn().mockResolvedValue({ id: 'job-1' });

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
  })),
}));

jest.mock('../common/redis/redis.util', () => ({
  createRedisClient: jest.fn(() => ({})),
}));

describe('MassSendService', () => {
  let service: MassSendService;
  let module: TestingModule;

  beforeEach(async () => {
    mockQueueAdd.mockClear();
    mockQueueClose.mockClear();

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

  afterEach(async () => {
    await module?.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('closes the queue when the module shuts down', async () => {
    await module.close();

    expect(mockQueueClose).toHaveBeenCalledTimes(1);
  });
});
