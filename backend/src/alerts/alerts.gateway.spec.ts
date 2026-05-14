import { AlertsGateway } from './alerts.gateway';
import type { Socket } from 'socket.io';

jest.mock('../common/redis/redis.util', () => ({
  createRedisClient: jest.fn(),
}));

import { createRedisClient } from '../common/redis/redis.util';

type SocketOverrides = Partial<Pick<Socket, 'id' | 'handshake' | 'join'>>;

function mockSocket(overrides: SocketOverrides = {}): Socket {
  return { id: 'test-socket-id', ...overrides } as unknown as Socket;
}

describe('AlertsGateway', () => {
  let gateway: AlertsGateway;
  let mockServer: {
    to: jest.Mock<{ emit: jest.Mock<void, [string, unknown]> }, [string]>;
    emit: jest.Mock<void, [string, unknown]>;
  };
  let mockSub: {
    subscribe: jest.Mock<Promise<void>, [string]>;
    on: jest.Mock<void, [string, (channel: string, message: string) => void]>;
  };

  beforeEach(() => {
    mockServer = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      emit: jest.fn(),
    };

    mockSub = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    (createRedisClient as jest.Mock).mockReturnValue(mockSub);

    gateway = new AlertsGateway();
    (gateway as unknown as { server: typeof mockServer }).server = mockServer;
  });

  describe('onModuleInit', () => {
    it('subscribes to redis alerts channel and forwards messages to workspace rooms', async () => {
      await gateway.onModuleInit();

      expect(mockSub.subscribe).toHaveBeenCalledWith('alerts');
      const handler = mockSub.on.mock.calls[0][1];
      expect(mockSub.on.mock.calls[0][0]).toBe('message');
      expect(typeof handler).toBe('function');
      handler('alerts', JSON.stringify({ workspaceId: 'ws-1', type: 'rate-limit' }));

      expect(mockServer.to).toHaveBeenCalledWith('workspace:ws-1');
    });

    it('broadcasts to all clients when workspaceId is absent from payload', async () => {
      await gateway.onModuleInit();

      const handler = mockSub.on.mock.calls[0][1];
      handler('alerts', JSON.stringify({ type: 'global-alert' }));

      expect(mockServer.emit).toHaveBeenCalledWith('alert:event', { type: 'global-alert' });
    });

    it('logs error and does not crash on malformed JSON message', async () => {
      await gateway.onModuleInit();

      const handler = mockSub.on.mock.calls[0][1];

      expect(() => {
        handler('alerts', 'not-valid-json}}}}');
      }).not.toThrow();
    });

    it('emits alert:event via room target for workspace-scoped messages', async () => {
      const roomEmit = jest.fn();
      mockServer.to.mockReturnValue({ emit: roomEmit });

      await gateway.onModuleInit();

      const handler = mockSub.on.mock.calls[0][1];
      handler('alerts', JSON.stringify({ workspaceId: 'ws-42', severity: 'critical' }));

      expect(roomEmit).toHaveBeenCalledWith('alert:event', {
        workspaceId: 'ws-42',
        severity: 'critical',
      });
    });

    it('emits alert:event via broadcast for messages without workspaceId', async () => {
      await gateway.onModuleInit();

      const handler = mockSub.on.mock.calls[0][1];
      handler('alerts', JSON.stringify({ severity: 'info' }));

      expect(mockServer.emit).toHaveBeenCalledWith('alert:event', { severity: 'info' });
    });
  });

  describe('handleConnection', () => {
    it('joins client to workspace room when workspaceId is provided', () => {
      const joinMock = jest.fn();
      const socket = mockSocket({
        id: 'socket-1',
        handshake: { query: { workspaceId: 'ws-1' } },
        join: joinMock,
      });

      gateway.handleConnection(socket);

      expect(joinMock).toHaveBeenCalledWith('workspace:ws-1');
    });

    it('handles connection without workspaceId gracefully', () => {
      const joinMock = jest.fn();
      const socket = mockSocket({
        id: 'socket-2',
        handshake: { query: {} },
        join: joinMock,
      });

      expect(() => {
        gateway.handleConnection(socket);
      }).not.toThrow();
    });

    it('does not join room when workspaceId is empty string', () => {
      const joinMock = jest.fn();
      const socket = mockSocket({
        id: 'socket-3',
        handshake: { query: { workspaceId: '' } },
        join: joinMock,
      });

      gateway.handleConnection(socket);

      expect(joinMock).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('handles disconnection without errors', () => {
      const socket = mockSocket({
        id: 'socket-4',
        handshake: { query: { workspaceId: 'ws-1' } },
      });

      expect(() => {
        gateway.handleDisconnect(socket);
      }).not.toThrow();
    });

    it('handles disconnection with missing handshake gracefully', () => {
      const socket = mockSocket({
        id: 'socket-5',
        handshake: undefined,
      });

      expect(() => {
        gateway.handleDisconnect(socket);
      }).not.toThrow();
    });
  });
});
