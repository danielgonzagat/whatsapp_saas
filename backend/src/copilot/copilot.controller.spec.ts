import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';

jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(),
}));

import { resolveWorkspaceId } from '../auth/workspace-access';

describe('CopilotController', () => {
  let copilot: {
    suggest: jest.Mock;
    suggestMultiple: jest.Mock;
  };
  let controller: CopilotController;

  beforeEach(() => {
    jest.clearAllMocks();

    copilot = {
      suggest: jest.fn(),
      suggestMultiple: jest.fn(),
    };

    controller = new CopilotController(copilot as never as CopilotService);
  });

  describe('suggest', () => {
    it('delegates to copilot.suggest with resolved workspaceId', async () => {
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-1');
      copilot.suggest.mockResolvedValue({ suggestion: 'Olá! Como posso ajudar?' });

      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' } } as never;
      const body = { contactId: 'c-1', kbSnippet: 'Produto X' };

      const result = await controller.suggest(req, body);

      expect(result).toEqual({ suggestion: 'Olá! Como posso ajudar?' });
      expect(copilot.suggest).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        contactId: 'c-1',
        phone: undefined,
        kbSnippet: 'Produto X',
      });
    });

    it('passes phone parameter when provided', async () => {
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-1');
      copilot.suggest.mockResolvedValue({ suggestion: 'Resposta' });

      const req = { user: { sub: 'u-1' } } as never;
      const body = { phone: '5511999999999' };

      await controller.suggest(req, body);

      expect(copilot.suggest).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        contactId: undefined,
        phone: '5511999999999',
        kbSnippet: undefined,
      });
    });

    it('handles empty body gracefully', async () => {
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-1');
      copilot.suggest.mockResolvedValue({ suggestion: 'Fallback' });

      const req = { user: {} } as never;

      const result = await controller.suggest(req, {} as never);

      expect(result).toEqual({ suggestion: 'Fallback' });
      expect(copilot.suggest).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        contactId: undefined,
        phone: undefined,
        kbSnippet: undefined,
      });
    });

    it('propagates errors from copilot service', async () => {
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-1');
      copilot.suggest.mockRejectedValue(new Error('Rate limited'));

      const req = { user: { sub: 'u-1' } } as never;

      await expect(controller.suggest(req, {})).rejects.toThrow('Rate limited');
    });
  });

  describe('suggestMultiple', () => {
    it('delegates to copilot.suggestMultiple with resolved workspaceId', async () => {
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-1');
      copilot.suggestMultiple.mockResolvedValue({
        suggestions: ['A', 'B', 'C'],
        context: 'geral',
      });

      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' } } as never;
      const body = { contactId: 'c-1', count: 5 };

      const result = await controller.suggestMultiple(req, body);

      expect(result).toEqual({ suggestions: ['A', 'B', 'C'], context: 'geral' });
      expect(copilot.suggestMultiple).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        contactId: 'c-1',
        phone: undefined,
        kbSnippet: undefined,
        count: 5,
      });
    });

    it('defaults count to 3 when not provided', async () => {
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-1');
      copilot.suggestMultiple.mockResolvedValue({ suggestions: ['X', 'Y', 'Z'] });

      const req = { user: { sub: 'u-1' } } as never;
      const body = {};

      await controller.suggestMultiple(req, body);

      expect(copilot.suggestMultiple).toHaveBeenCalledWith(
        expect.objectContaining({ count: 3 }),
      );
    });

    it('defaults count to 3 when count is 0 (falsy override)', async () => {
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-1');
      copilot.suggestMultiple.mockResolvedValue({ suggestions: [] });

      const req = { user: { sub: 'u-1' } } as never;
      const body = { count: 0 };

      await controller.suggestMultiple(req, body);

      expect(copilot.suggestMultiple).toHaveBeenCalledWith(
        expect.objectContaining({ count: 3 }),
      );
    });

    it('propagates errors from copilot service', async () => {
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-1');
      copilot.suggestMultiple.mockRejectedValue(new Error('Token budget exceeded'));

      const req = { user: { sub: 'u-1' } } as never;

      await expect(controller.suggestMultiple(req, {})).rejects.toThrow('Token budget exceeded');
    });

    it('passes all optional parameters through', async () => {
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-2');
      copilot.suggestMultiple.mockResolvedValue({ suggestions: ['Ok'] });

      const req = { user: { sub: 'u-2' } } as never;
      const body = {
        contactId: 'c-99',
        phone: '5511888888888',
        kbSnippet: 'FAQ: Devolução em 7 dias',
        count: 4,
      };

      await controller.suggestMultiple(req, body);

      expect(copilot.suggestMultiple).toHaveBeenCalledWith({
        workspaceId: 'ws-2',
        contactId: 'c-99',
        phone: '5511888888888',
        kbSnippet: 'FAQ: Devolução em 7 dias',
        count: 4,
      });
    });
  });
});
