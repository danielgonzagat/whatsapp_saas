import { MemoryController } from './memory.controller';

describe('MemoryController', () => {
  const saveMemory = jest.fn();
  const searchMemory = jest.fn();
  const saveProduct = jest.fn();
  const listMemories = jest.fn();
  const getMemoryStats = jest.fn();
  const deleteMemory = jest.fn();

  let controller: MemoryController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new MemoryController({
      saveMemory,
      searchMemory,
      saveProduct,
      listMemories,
      getMemoryStats,
      deleteMemory,
    } as never);
  });

  describe('saveMemory', () => {
    it('calls service with correct args and returns saved (happy path)', async () => {
      const item = { id: 'm1', key: 'k1', value: { x: 1 }, category: 'general' };
      saveMemory.mockResolvedValue(item);

      const result = await controller.saveMemory('ws-1', {
        key: 'k1',
        value: { x: 1 },
        category: 'custom',
        content: 'text',
      });

      expect(saveMemory).toHaveBeenCalledWith(
        'ws-1',
        'k1',
        { x: 1 },
        'custom',
        'text',
      );
      expect(result).toEqual({ status: 'saved', memory: item });
    });
  });

  describe('deleteMemory', () => {
    it('calls service and returns deleted (alternate route)', async () => {
      deleteMemory.mockResolvedValue(true);

      const result = await controller.deleteMemory('ws-1', 'key-1');

      expect(deleteMemory).toHaveBeenCalledWith('ws-1', 'key-1');
      expect(result).toEqual({ status: 'deleted', key: 'key-1' });
    });
  });

  describe('error propagation', () => {
    it('propagates service rejection to caller', async () => {
      saveMemory.mockRejectedValue(new Error('db error'));

      await expect(
        controller.saveMemory('ws-1', { key: 'k', value: 'v' }),
      ).rejects.toThrow('db error');
    });
  });

  describe('workspaceId identity', () => {
    it('passes workspaceId param to listMemories service', async () => {
      listMemories.mockResolvedValue({ memories: [], total: 0 });

      await controller.listMemories('workspace-42');

      expect(listMemories).toHaveBeenCalledWith('workspace-42', undefined, 1);
    });

    it('passes workspaceId param to getStats service', async () => {
      getMemoryStats.mockResolvedValue({ total: 5 });

      await controller.getStats('ws-x');

      expect(getMemoryStats).toHaveBeenCalledWith('ws-x');
    });
  });
});
