import { AdminSupportController } from './admin-support.controller';
import { adminErrors } from '../common/admin-api-errors';

describe('AdminSupportController', () => {
  const overview = jest.fn();
  const detail = jest.fn();
  const updateStatus = jest.fn();
  const reply = jest.fn();

  let controller: AdminSupportController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new AdminSupportController({
      overview,
      detail,
      updateStatus,
      reply,
    } as never);
  });

  describe('overview', () => {
    it('calls service with search query and returns result', async () => {
      const result = { items: [{ conversationId: 'c-1' }], total: 1 };
      overview.mockResolvedValue(result);

      const output = await controller.overview('busca');

      expect(overview).toHaveBeenCalledWith('busca');
      expect(output).toBe(result);
    });

    it('calls service without search when no query param', async () => {
      overview.mockResolvedValue({ items: [], total: 0 });

      await controller.overview();

      expect(overview).toHaveBeenCalledWith(undefined);
    });
  });

  describe('detail', () => {
    it('calls service with conversationId and returns detail', async () => {
      const result = { ticket: { conversationId: 'c-1' }, macros: [], messages: [] };
      detail.mockResolvedValue(result);

      const output = await controller.detail('c-1');

      expect(detail).toHaveBeenCalledWith('c-1');
      expect(output).toBe(result);
    });

    it('propagates error when service rejects', async () => {
      const err = adminErrors.userNotFound();
      detail.mockRejectedValue(err);

      await expect(controller.detail('c-nonexistent')).rejects.toThrow(err);
    });
  });

  describe('updateStatus', () => {
    it('calls service with conversationId, status, and admin.id', async () => {
      updateStatus.mockResolvedValue(undefined);
      const admin = { id: 'a-1', role: 'OWNER' } as never;
      const dto = { status: 'CLOSED' };

      const output = await controller.updateStatus('c-1', dto, admin);

      expect(updateStatus).toHaveBeenCalledWith('c-1', 'CLOSED', 'a-1');
      expect(output).toEqual({ ok: true });
    });

    it('propagates error when service rejects', async () => {
      const err = adminErrors.userNotFound();
      updateStatus.mockRejectedValue(err);
      const admin = { id: 'a-1', role: 'OWNER' } as never;

      await expect(
        controller.updateStatus('c-nonexistent', { status: 'CLOSED' }, admin),
      ).rejects.toThrow(err);
    });
  });

  describe('reply', () => {
    it('calls service with conversationId, admin.id, and dto.content', async () => {
      reply.mockResolvedValue(undefined);
      const admin = { id: 'a-1', role: 'OWNER' } as never;
      const dto = { content: 'mensagem de resposta' };

      const output = await controller.reply('c-1', dto, admin);

      expect(reply).toHaveBeenCalledWith('c-1', 'a-1', 'mensagem de resposta');
      expect(output).toEqual({ ok: true });
    });

    it('propagates error when service rejects', async () => {
      const err = adminErrors.userNotFound();
      reply.mockRejectedValue(err);
      const admin = { id: 'a-1', role: 'OWNER' } as never;

      await expect(
        controller.reply('c-nonexistent', { content: 'oi' }, admin),
      ).rejects.toThrow(err);
    });
  });
});
