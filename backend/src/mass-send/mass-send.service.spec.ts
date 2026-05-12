import { Test, TestingModule } from '@nestjs/testing';
import { MassSendService } from './mass-send.service';

const mockQueueAdd = jest.fn();
const mockQueueClose = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
  })),
}));

describe('MassSendService', () => {
  let service: MassSendService;
  let module: TestingModule;

  beforeEach(async () => {
    mockQueueAdd.mockReset().mockResolvedValue({ id: 'job_1' });
    mockQueueClose.mockReset().mockResolvedValue(undefined);

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

  it('sanitizes numbers and enqueues one dispatch job', async () => {
    await expect(
      service.enqueueCampaign(
        'ws_1',
        'owner@kloel.test',
        ['+55 (11) 99999-9999', '5511999999999'],
        'Oi',
      ),
    ).resolves.toEqual({ jobId: 'job_1' });

    expect(mockQueueAdd).toHaveBeenCalledWith('dispatch', {
      workspaceId: 'ws_1',
      user: 'owner@kloel.test',
      numbers: ['5511999999999'],
      message: 'Oi',
    });
  });
});
