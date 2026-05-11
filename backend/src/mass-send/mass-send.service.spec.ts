import { Test, TestingModule } from '@nestjs/testing';
import { MassSendService } from './mass-send.service';

const addMock = jest.fn();
const closeMock = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: addMock,
    close: closeMock,
  })),
}));

describe('MassSendService', () => {
  let service: MassSendService;
  let module: TestingModule;

  beforeEach(async () => {
    addMock.mockResolvedValue({ id: 'job-123' });
    closeMock.mockResolvedValue(undefined);

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
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('sanitizes phone numbers and enqueues a dispatch job', async () => {
    await expect(
      service.enqueueCampaign(
        'ws-1',
        'user-1',
        ['+55 (11) 99999-0000', '5511999990000', 'abc'],
        'Oi',
      ),
    ).resolves.toEqual({ jobId: 'job-123' });

    expect(addMock).toHaveBeenCalledWith('dispatch', {
      workspaceId: 'ws-1',
      user: 'user-1',
      numbers: ['5511999990000'],
      message: 'Oi',
    });
  });

  it('rejects invalid campaign input before enqueueing', async () => {
    await expect(service.enqueueCampaign('', 'user-1', ['5511999990000'], 'Oi')).rejects.toThrow(
      'workspaceId é obrigatório',
    );
    await expect(service.enqueueCampaign('ws-1', 'user-1', [], 'Oi')).rejects.toThrow(
      'Lista de números é obrigatória',
    );
    await expect(
      service.enqueueCampaign('ws-1', 'user-1', ['5511999990000'], '   '),
    ).rejects.toThrow('Mensagem não pode ser vazia');

    expect(addMock).not.toHaveBeenCalled();
  });

  it('closes the queue during module teardown', async () => {
    await service.onModuleDestroy();

    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
