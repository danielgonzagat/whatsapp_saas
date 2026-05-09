import { CopilotGateway } from './copilot.gateway';
import type { Socket } from 'socket.io';

jest.mock('../common/redis/redis.util', () => ({
  createRedisClient: jest.fn(),
}));

import { createRedisClient } from '../common/redis/redis.util';

function mockSocket(overrides?: Partial<Socket>): Socket {
  return { id: 'test-socket-id', ...overrides } as Socket;
}

describe('CopilotGateway', () => {
  let gateway: CopilotGateway;
  let mockServer: {
    to: jest.Mock;
    emit: jest.Mock;
  };
  let mockSub: {
    psubscribe: jest.Mock;
    on: jest.Mock;
  };
  let mockOpsAlert: {
    alertOnCriticalError: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockServer = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      emit: jest.fn(),
    };

    mockSub = {
      psubscribe: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    mockOpsAlert = {
      alertOnCriticalError: jest.fn().mockResolvedValue(undefined),
    };

    (createRedisClient as jest.Mock).mockReturnValue(mockSub);

    gateway = new CopilotGateway(mockOpsAlert as never);
    (gateway as never as Record<string, unknown>).server = mockServer;
  });

  describe('onModuleInit', () => {
    it('subscribes to redis ws:copilot:* pattern and forwards messages to workspace rooms', async () => {
      await gateway.onModuleInit();

      expect(mockSub.psubscribe).toHaveBeenCalledWith('ws:copilot:*');
      expect(mockSub.on).toHaveBeenCalledWith('pmessage', expect.any(Function));

      const handler = mockSub.on.mock.calls[0][1];
      const roomEmit = jest.fn();
      mockServer.to.mockReturnValue({ emit: roomEmit });

      handler(
        'ws:copilot:*',
        'ws:copilot:ws-1',
        JSON.stringify({ text: 'suggestion', score: 0.9 }),
      );

      expect(mockServer.to).toHaveBeenCalledWith('workspace:ws-1');
      expect(roomEmit).toHaveBeenCalledWith('copilot:suggestion', {
        text: 'suggestion',
        score: 0.9,
      });
    });

    it('broadcasts to all clients when channel has no workspace suffix', async () => {
      await gateway.onModuleInit();

      const handler = mockSub.on.mock.calls[0][1];
      handler('ws:copilot:*', 'ws:copilot:', JSON.stringify({ text: 'broadcast' }));

      expect(mockServer.emit).toHaveBeenCalledWith('copilot:suggestion', { text: 'broadcast' });
    });

    it('calls opsAlert on JSON parse error without throwing', async () => {
      await gateway.onModuleInit();

      const handler = mockSub.on.mock.calls[0][1];

      expect(() => {
        handler('ws:copilot:*', 'ws:copilot:ws-1', 'broken-{{{json}}');
      }).not.toThrow();

      expect(mockOpsAlert.alertOnCriticalError).toHaveBeenCalledWith(
        expect.any(Error),
        'CopilotGateway.emit',
      );
    });

    it('does not crash when opsAlert is not injected and parse error occurs', async () => {
      const gatewayNoAlert = new CopilotGateway();
      const gwAny = gatewayNoAlert as never as Record<string, unknown>;
      gwAny.server = mockServer;

      await gatewayNoAlert.onModuleInit();

      // Trigger the pmessage handler with invalid JSON
      const handler = mockSub.on.mock.calls[mockSub.on.mock.calls.length - 1][1];
      expect(() => {
        handler('ws:copilot:*', 'ws:copilot:ws-1', 'broken-{{{json}}');
      }).not.toThrow();
    });

    it('handles empty payload gracefully', async () => {
      await gateway.onModuleInit();

      const handler = mockSub.on.mock.calls[0][1];

      expect(() => {
        handler('ws:copilot:*', 'ws:copilot:ws-1', JSON.stringify(null));
      }).not.toThrow();
    });
  });

  describe('handleConnection', () => {
    it('joins client to workspace room when workspaceId is provided', () => {
      const socket = mockSocket({
        id: 'socket-cp-1',
        handshake: { query: { workspaceId: 'ws-1' } },
        join: jest.fn(),
      });

      gateway.handleConnection(socket);

      expect(mockSocket.join).toHaveBeenCalledWith('workspace:ws-1');
    });

    it('handles connection without workspaceId gracefully', () => {
      const socket = mockSocket({
        id: 'socket-cp-2',
        handshake: { query: {} },
        join: jest.fn(),
      });

      expect(() => {
        gateway.handleConnection(socket);
      }).not.toThrow();

      expect(socket.join).not.toHaveBeenCalled();
    });

    it('handles missing workspaceId in query gracefully', () => {
      const socket = mockSocket({
        id: 'socket-cp-3',
        handshake: { query: {} },
        join: jest.fn(),
      });

      expect(() => {
        gateway.handleConnection(socket);
      }).not.toThrow();
    });
  });

  describe('handleDisconnect', () => {
    it('handles disconnection without errors', () => {
      const mockSocket = {
        id: 'socket-cp-4',
        handshake: { query: { workspaceId: 'ws-1' } },
      } as unknown as Socket;

      expect(() => {
        gateway.handleDisconnect(mockSocket);
      }).not.toThrow();
    });

    it('handles disconnection with missing handshake gracefully', () => {
      const mockSocket = {
        id: 'socket-cp-5',
        handshake: undefined,
      } as unknown as Socket;

      expect(() => {
        gateway.handleDisconnect(mockSocket);
      }).not.toThrow();
    });
  });
});
