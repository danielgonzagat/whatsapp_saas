import { AdminDestructiveController } from './admin-destructive.controller';

describe('AdminDestructiveController', () => {
  const mockCreate = jest.fn();
  const mockGet = jest.fn();
  const mockConfirm = jest.fn();
  const mockUndo = jest.fn();

  const service = {
    create: mockCreate,
    get: mockGet,
    confirm: mockConfirm,
    undo: mockUndo,
  };

  const admin = {
    id: 'a-1',
    name: 'Admin',
    email: 'admin@kloel.com',
    role: 'OWNER',
    sessionId: 's-1',
    scope: 'full',
  } as never;

  const req = {
    ip: '10.0.0.1',
    headers: { 'user-agent': 'test-ua' },
  } as never;

  let controller: AdminDestructiveController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminDestructiveController(service as never);
  });

  describe('create', () => {
    it('calls service.create with DTO fields, admin id, ip, and userAgent', async () => {
      mockCreate.mockResolvedValue({ id: 'int_1', status: 'PENDING' });

      const dto = {
        kind: 'PURGE_CACHE',
        targetType: 'Workspace',
        targetId: 'ws_1',
        reason: 'cleanup',
        ttlSeconds: 300,
      } as never;

      const result = await controller.create(dto, admin, req);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith({
        adminUserId: 'a-1',
        kind: 'PURGE_CACHE',
        targetType: 'Workspace',
        targetId: 'ws_1',
        reason: 'cleanup',
        ip: '10.0.0.1',
        userAgent: 'test-ua',
        ttlSeconds: 300,
      });
      expect(result).toEqual({ id: 'int_1', status: 'PENDING' });
    });

    it('propagates error when service.create rejects', async () => {
      mockCreate.mockRejectedValue(new Error('handler not found'));

      await expect(
        controller.create(
          { kind: 'UNKNOWN', targetType: 'X', targetId: 'x-1', reason: 'test' } as never,
          admin,
          req,
        ),
      ).rejects.toThrow('handler not found');
    });

    it('omits ttlSeconds from service call when undefined', async () => {
      mockCreate.mockResolvedValue({ id: 'int_2' });

      const dto = {
        kind: 'PURGE_CACHE',
        targetType: 'Workspace',
        targetId: 'ws_2',
        reason: 'cleanup',
      } as never;

      await controller.create(dto, admin, req);

      expect(mockCreate).toHaveBeenCalledWith({
        adminUserId: 'a-1',
        kind: 'PURGE_CACHE',
        targetType: 'Workspace',
        targetId: 'ws_2',
        reason: 'cleanup',
        ip: '10.0.0.1',
        userAgent: 'test-ua',
      });
    });
  });

  describe('get', () => {
    it('calls service.get with the route param id', async () => {
      mockGet.mockResolvedValue({ id: 'int_1', status: 'PENDING' });

      const result = await controller.get('int_1');

      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith('int_1');
      expect(result).toEqual({ id: 'int_1', status: 'PENDING' });
    });
  });

  describe('confirm', () => {
    it('calls service.confirm with intent id, admin id, challenge, ip, and userAgent', async () => {
      mockConfirm.mockResolvedValue({ id: 'int_1', status: 'EXECUTED' });

      const dto = { challenge: 'ABC123' } as never;

      const result = await controller.confirm('int_1', dto, admin, req);

      expect(mockConfirm).toHaveBeenCalledTimes(1);
      expect(mockConfirm).toHaveBeenCalledWith({
        intentId: 'int_1',
        adminUserId: 'a-1',
        challenge: 'ABC123',
        ip: '10.0.0.1',
        userAgent: 'test-ua',
      });
      expect(result).toEqual({ id: 'int_1', status: 'EXECUTED' });
    });
  });

  describe('undo', () => {
    it('calls service.undo with intent id, admin id, undoToken, ip, and userAgent', async () => {
      mockUndo.mockResolvedValue({ id: 'int_1', status: 'UNDONE' });

      const dto = { undoToken: 'tok_abcdefgh123456' } as never;

      const result = await controller.undo('int_1', dto, admin, req);

      expect(mockUndo).toHaveBeenCalledTimes(1);
      expect(mockUndo).toHaveBeenCalledWith({
        intentId: 'int_1',
        adminUserId: 'a-1',
        undoToken: 'tok_abcdefgh123456',
        ip: '10.0.0.1',
        userAgent: 'test-ua',
      });
      expect(result).toEqual({ id: 'int_1', status: 'UNDONE' });
    });
  });
});
