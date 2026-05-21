import { AdminTransactionsController } from './admin-transactions.controller';
import { AdminTransactionAction } from './dto/operate-transaction.dto';

describe('AdminTransactionsController', () => {
  const list = jest.fn();
  const operate = jest.fn();

  let controller: AdminTransactionsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminTransactionsController({
      list,
      operate,
    } as never);
  });

  describe('list', () => {
    it('calls service.list with query fields pass-through', async () => {
      list.mockResolvedValue({ rows: [], total: 0 });
      const from = new Date('2025-01-01');
      const to = new Date('2025-12-31');

      const result = await controller.list({
        search: 'joao',
        status: 'PAID' as never,
        method: 'PIX' as never,
        gateway: 'stripe',
        workspaceId: 'ws-1',
        from,
        to,
        skip: 10,
        take: 20,
      } as never);

      expect(list).toHaveBeenCalledTimes(1);
      expect(list).toHaveBeenCalledWith({
        search: 'joao',
        status: 'PAID',
        method: 'PIX',
        gateway: 'stripe',
        workspaceId: 'ws-1',
        from,
        to,
        skip: 10,
        take: 20,
      });
      expect(result).toEqual({ rows: [], total: 0 });
    });

    it('propagates errors from service.list', async () => {
      const error = new Error('query failed');
      list.mockRejectedValue(error);

      await expect(controller.list({} as never)).rejects.toThrow('query failed');
    });
  });

  describe('operate', () => {
    const admin = { id: 'a-1', role: 'OWNER' } as never;

    it('calls service.operate with identity propagated', async () => {
      operate.mockResolvedValue(undefined);

      await controller.operate(
        'order-1',
        { action: AdminTransactionAction.REFUND, note: 'admin note' },
        admin,
        'idem-key-1',
      );

      expect(operate).toHaveBeenCalledTimes(1);
      expect(operate).toHaveBeenCalledWith(
        'order-1',
        'a-1',
        AdminTransactionAction.REFUND,
        'admin note',
        'idem-key-1',
      );
    });

    it('propagates errors from service.operate', async () => {
      const error = new Error('operation failed');
      operate.mockRejectedValue(error);

      await expect(
        controller.operate(
          'order-1',
          { action: AdminTransactionAction.CHARGEBACK } as never,
          admin,
        ),
      ).rejects.toThrow('operation failed');
    });
  });
});
