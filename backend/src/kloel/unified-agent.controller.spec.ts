jest.mock('./unified-agent.service', () => ({
  UnifiedAgentService: jest.fn().mockImplementation(() => ({})),
}));

import { ForbiddenException } from '@nestjs/common';
import { UnifiedAgentController } from './unified-agent.controller';
import type { UnifiedAgentService } from './unified-agent.service';

describe('UnifiedAgentController', () => {
  type ProcessMessageInput = Parameters<UnifiedAgentService['processMessage']>[0];
  type ProcessMessageResult = Awaited<ReturnType<UnifiedAgentService['processMessage']>>;

  const processMessageMock = jest.fn<Promise<ProcessMessageResult>, [ProcessMessageInput]>();

  let controller: UnifiedAgentController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UnifiedAgentController({
      processMessage: processMessageMock,
    } as never);
  });

  describe('processMessage (POST :workspaceId/process)', () => {
    const reqBody = {
      contactId: 'contact-1',
      phone: '+5511999999999',
      message: 'Ola, quero comprar',
    };

    it('calls service.processMessage with correct arguments', async () => {
      processMessageMock.mockResolvedValueOnce({
        actions: [{ tool: 'send_message', args: {}, result: { ok: true } }],
        intent: 'sales',
        confidence: 0.93,
        response: 'Ola! Vamos ver as opcoes.',
      });

      const result = await controller.processMessage('ws-1', reqBody);

      expect(processMessageMock).toHaveBeenCalledTimes(1);
      expect(processMessageMock).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        phone: '+5511999999999',
        message: 'Ola, quero comprar',
      });
      expect(result).toEqual({
        success: true,
        actions: [{ tool: 'send_message', args: {}, result: { ok: true } }],
        intent: 'sales',
        confidence: 0.93,
        response: 'Ola! Vamos ver as opcoes.',
      });
    });

    it('propagates error when service rejects', async () => {
      const error = new Error('Service failure');
      processMessageMock.mockRejectedValueOnce(error);

      await expect(
        controller.processMessage('ws-1', { phone: '+5511999999999', message: 'Hello' }),
      ).rejects.toThrow('Service failure');
    });

    it('passes workspaceId from param into service call', async () => {
      processMessageMock.mockResolvedValueOnce({
        actions: [],
        intent: 'greeting',
        confidence: 0.5,
      });

      await controller.processMessage('ws-42', {
        contactId: 'c-2',
        phone: '+5511999999998',
        message: 'Hi',
        context: { source: 'web' },
      });

      expect(processMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-42',
          contactId: 'c-2',
          phone: '+5511999999998',
          message: 'Hi',
          context: { source: 'web' },
        }),
      );
    });

    it('defaults contactId to empty string when body omits it', async () => {
      processMessageMock.mockResolvedValueOnce({
        actions: [],
        intent: 'greeting',
        confidence: 0.5,
      });

      await controller.processMessage('ws-1', { phone: '+5511999999999', message: 'Hello' });

      expect(processMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          contactId: '',
          phone: '+5511999999999',
          message: 'Hello',
        }),
      );
    });

    it('does not include context key when body has no context', async () => {
      processMessageMock.mockResolvedValueOnce({
        actions: [],
        intent: 'greeting',
        confidence: 0.5,
      });

      await controller.processMessage('ws-1', { phone: '+5511999999999', message: 'Hello' });

      const callArgs = processMessageMock.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs).not.toHaveProperty('context');
    });

    describe('internal key validation', () => {
      const originalInternalKey = process.env.INTERNAL_API_KEY;

      beforeEach(() => {
        delete process.env.INTERNAL_API_KEY;
      });

      afterEach(() => {
        if (originalInternalKey !== undefined) {
          process.env.INTERNAL_API_KEY = originalInternalKey;
        } else {
          delete process.env.INTERNAL_API_KEY;
        }
      });

      const body = { phone: '+5511999999999', message: 'Hello' };

      it('throws ForbiddenException when internal key does not match', async () => {
        process.env.INTERNAL_API_KEY = 'secret-key';

        await expect(controller.processMessage('ws-1', body, 'wrong-key')).rejects.toThrow(
          ForbiddenException,
        );
        await expect(controller.processMessage('ws-1', body, 'wrong-key')).rejects.toThrow(
          'Invalid internal key',
        );
      });

      it('allows request when internal key matches', async () => {
        process.env.INTERNAL_API_KEY = 'secret-key';
        processMessageMock.mockResolvedValueOnce({ actions: [], intent: 'test', confidence: 0.8 });

        const result = await controller.processMessage('ws-1', body, 'secret-key');

        expect(result.success).toBe(true);
        expect(processMessageMock).toHaveBeenCalledTimes(1);
      });

      it('allows request when no internal key is configured', async () => {
        processMessageMock.mockResolvedValueOnce({ actions: [], intent: 'test', confidence: 0.8 });

        const result = await controller.processMessage('ws-1', body, 'loose-key');

        expect(result.success).toBe(true);
        expect(processMessageMock).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('listTools (GET :workspaceId/tools)', () => {
    it('returns tools list with workspaceId', () => {
      const result = controller.listTools('ws-1');

      expect(result.workspaceId).toBe('ws-1');
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);
    });

    it('includes tool categories for all expected categories', () => {
      const result = controller.listTools('ws-1');

      const categories = new Set(result.tools.map((t: { category: string }) => t.category));
      expect(categories.has('sales')).toBe(true);
      expect(categories.has('leads')).toBe(true);
      expect(categories.has('scheduling')).toBe(true);
      expect(categories.has('communication')).toBe(true);
      expect(categories.has('support')).toBe(true);
      expect(categories.has('retention')).toBe(true);
      expect(categories.has('flows')).toBe(true);
      expect(categories.has('analytics')).toBe(true);
    });
  });
});
