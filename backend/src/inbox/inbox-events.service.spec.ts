import { Test, TestingModule } from '@nestjs/testing';
import { InboxEventsService } from './inbox-events.service';
import { InboxGateway } from './inbox.gateway';
import { OpsAlertService } from '../observability/ops-alert.service';

const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';

describe('InboxEventsService', () => {
  let service: InboxEventsService;
  let subscriber: {
    subscribe: jest.Mock<Promise<void>, [string]>;
    on: jest.Mock<void, [string, (channel: string, message: string) => void]>;
    quit: jest.Mock<Promise<void>>;
  };
  let redis: { duplicate: jest.Mock<typeof subscriber> };
  let gateway: { emitToWorkspace: jest.Mock<void, [string, string, unknown]> };
  let opsAlert: { alertOnCriticalError: jest.Mock<Promise<void>, [Error, string]> };

  beforeEach(async () => {
    subscriber = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    redis = { duplicate: jest.fn().mockReturnValue(subscriber) };
    gateway = { emitToWorkspace: jest.fn() };
    opsAlert = { alertOnCriticalError: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboxEventsService,
        { provide: REDIS_TOKEN, useValue: redis },
        { provide: InboxGateway, useValue: gateway },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();
    service = module.get(InboxEventsService);
  });

  it('subscribes to ws:inbox on init', async () => {
    await service.onModuleInit();
    expect(redis.duplicate).toHaveBeenCalled();
    expect(subscriber.subscribe).toHaveBeenCalledWith('ws:inbox');
    expect(subscriber.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('routes message:new to gateway with workspace scoping', async () => {
    await service.onModuleInit();
    const handler = subscriber.on.mock.calls.find((c) => c[0] === 'message')[1];
    handler(
      'ws:inbox',
      JSON.stringify({ type: 'message:new', workspaceId: 'ws-1', message: { id: 'm1' } }),
    );
    expect(gateway.emitToWorkspace).toHaveBeenCalledWith('ws-1', 'message:new', { id: 'm1' });
  });

  it('routes conversation:update to gateway', async () => {
    await service.onModuleInit();
    const handler = subscriber.on.mock.calls.find((c) => c[0] === 'message')[1];
    handler(
      'ws:inbox',
      JSON.stringify({
        type: 'conversation:update',
        workspaceId: 'ws-2',
        conversation: { id: 'c1' },
      }),
    );
    expect(gateway.emitToWorkspace).toHaveBeenCalledWith('ws-2', 'conversation:update', {
      id: 'c1',
    });
  });

  it('drops events without workspaceId or type silently', async () => {
    await service.onModuleInit();
    const handler = subscriber.on.mock.calls.find((c) => c[0] === 'message')[1];
    handler('ws:inbox', JSON.stringify({ type: 'message:new' }));
    expect(gateway.emitToWorkspace).not.toHaveBeenCalled();
  });

  it('reports parse errors via OpsAlertService', async () => {
    await service.onModuleInit();
    const handler = subscriber.on.mock.calls.find((c) => c[0] === 'message')[1];
    handler('ws:inbox', '{not-json');
    expect(opsAlert.alertOnCriticalError).toHaveBeenCalled();
    expect(gateway.emitToWorkspace).not.toHaveBeenCalled();
  });

  it('quits subscriber on module destroy', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();
    expect(subscriber.quit).toHaveBeenCalled();
  });
});
