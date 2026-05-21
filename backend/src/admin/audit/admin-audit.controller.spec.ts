import { AdminAuditController } from './admin-audit.controller';

describe('AdminAuditController', () => {
  const list = jest.fn();

  let controller: AdminAuditController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new AdminAuditController({
      list,
    } as never);
  });

  describe('list', () => {
    const mockResponse = {
      items: [
        {
          id: 'audit-1',
          adminUserId: 'admin-1',
          action: 'CREATE',
          entityType: 'Workspace',
          entityId: 'ws-1',
          createdAt: new Date('2026-01-01'),
        },
      ],
      total: 1,
    };

    it('deve invocar o service com a query e retornar a resposta', async () => {
      list.mockResolvedValue(mockResponse);

      const query = {
        entityType: 'Workspace',
        skip: 0,
        take: 20,
      };

      const result = await controller.list(query);

      expect(list).toHaveBeenCalledTimes(1);
      expect(list).toHaveBeenCalledWith(query);
      expect(result).toBe(mockResponse);
    });

    it('deve propagar erro lancado pelo service', async () => {
      const error = new Error('DB connection refused');
      list.mockRejectedValue(error);

      await expect(controller.list({})).rejects.toThrow('DB connection refused');
    });

    it('deve encaminhar todos os campos de filtro para o service', async () => {
      list.mockResolvedValue(mockResponse);

      const from = new Date('2026-05-01');
      const to = new Date('2026-05-14');

      const query = {
        adminUserId: 'admin-1',
        action: 'CREATE',
        entityType: 'Workspace',
        entityId: 'ws-1',
        from,
        to,
      };

      await controller.list(query);

      const callArg = list.mock.calls[0][0];
      expect(callArg.adminUserId).toBe('admin-1');
      expect(callArg.action).toBe('CREATE');
      expect(callArg.entityType).toBe('Workspace');
      expect(callArg.entityId).toBe('ws-1');
      expect(callArg.from).toBe(from);
      expect(callArg.to).toBe(to);
    });

    it('deve encaminhar campos de paginacao para o service', async () => {
      list.mockResolvedValue(mockResponse);

      const query = { skip: 100, take: 50 };

      await controller.list(query);

      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 100, take: 50 }),
      );
    });

    it('deve retornar lista vazia quando o service retorna zero itens', async () => {
      const emptyResponse = { items: [], total: 0 };
      list.mockResolvedValue(emptyResponse);

      const result = await controller.list({});

      expect(result).toEqual({ items: [], total: 0 });
    });
  });
});
