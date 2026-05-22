import { FlowTemplateController } from './flow-template.controller';

describe('FlowTemplateController', () => {
  const listPublic = jest.fn();
  const listAll = jest.fn();
  const get = jest.fn();
  const create = jest.fn();
  const incrementDownload = jest.fn();
  const seedRecommended = jest.fn();

  let controller: FlowTemplateController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FlowTemplateController({
      listPublic,
      listAll,
      get,
      create,
      incrementDownload,
      seedRecommended,
    } as never);
  });

  describe('listAll', () => {
    it('calls service.listAll and returns its result', async () => {
      const mockTemplates = [{ id: 't-1', name: 'Admin Flow', category: 'sales' }];
      listAll.mockResolvedValue(mockTemplates);

      const result = await controller.listAll();

      expect(listAll).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockTemplates);
    });
  });

  describe('create', () => {
    it('calls service.create with the correct body fields (excluding idempotencyKey)', async () => {
      const mockCreated = { id: 'new-1', name: 'My Flow', category: 'onboarding' };
      create.mockResolvedValue(mockCreated);

      const body = {
        name: 'My Flow',
        category: 'onboarding',
        nodes: { nodes: [] },
        edges: { edges: [] },
        description: 'A test',
        isPublic: true,
        idempotencyKey: 'ik-abc',
      };

      const result = await controller.create(body);

      expect(create).toHaveBeenCalledWith({
        name: 'My Flow',
        category: 'onboarding',
        nodes: { nodes: [] },
        edges: { edges: [] },
        description: 'A test',
        isPublic: true,
      });
      expect(result).toBe(mockCreated);
    });
  });

  describe('get', () => {
    it('propagates param id to service.get and returns result', async () => {
      const mockTemplate = { id: 't-42', name: 'Welcome', category: 'greetings' };
      get.mockResolvedValue(mockTemplate);

      const result = await controller.get('t-42');

      expect(get).toHaveBeenCalledWith('t-42');
      expect(result).toBe(mockTemplate);
    });

    it('propagates service rejection as a thrown error', async () => {
      const error = new Error('Database connection lost');
      get.mockRejectedValue(error);

      await expect(controller.get('t-broken')).rejects.toThrow('Database connection lost');
    });
  });

  describe('download', () => {
    it('propagates param id to service.incrementDownload', async () => {
      const mockUpdated = { id: 't-99', downloads: 7 };
      incrementDownload.mockResolvedValue(mockUpdated);

      const result = await controller.download('t-99');

      expect(incrementDownload).toHaveBeenCalledWith('t-99');
      expect(result).toBe(mockUpdated);
    });
  });
});
