import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CanvasController } from './canvas.controller';

jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    images: {
      generate: jest.fn().mockResolvedValue({
        data: [{ url: 'https://example.com/image.png' }],
      }),
    },
  })),
}));

jest.mock('../lib/ai-models', () => ({
  resolveKloelCapabilityModel: jest.fn().mockReturnValue('dall-e-3'),
}));

describe('CanvasController', () => {
  let controller: CanvasController;
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

  const kloelDesignFindMany = jest.fn();
  const kloelDesignFindFirst = jest.fn();
  const kloelDesignCreate = jest.fn();
  const kloelDesignUpdate = jest.fn();
  const kloelDesignDeleteMany = jest.fn();
  const productFindFirst = jest.fn();
  const auditLog = jest.fn();
  const ensureTokenBudget = jest.fn();
  const trackAiUsage = jest.fn();

  const mockReq = {
    user: { sub: 'u-1', workspaceId: 'ws-1' },
    headers: {},
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    trackAiUsage.mockResolvedValue(undefined);

    controller = new CanvasController(
      {
        kloelDesign: {
          findMany: kloelDesignFindMany,
          findFirst: kloelDesignFindFirst,
          create: kloelDesignCreate,
          update: kloelDesignUpdate,
          deleteMany: kloelDesignDeleteMany,
        },
        product: {
          findFirst: productFindFirst,
        },
      } as never,
      { log: auditLog } as never,
      { ensureTokenBudget, trackAiUsage } as never,
    );
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  });

  describe('listDesigns', () => {
    it('returns designs filtered by workspaceId from req', async () => {
      kloelDesignFindMany.mockResolvedValue([
        { id: 'd-1', name: 'Design 1' },
        { id: 'd-2', name: 'Design 2' },
      ]);

      const result = await controller.listDesigns(mockReq);

      expect(kloelDesignFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1' },
          orderBy: { updatedAt: 'desc' },
        }),
      );
      expect(result.designs).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it('returns empty when req has no workspaceId', async () => {
      const reqWithoutWorkspace = {
        user: { sub: 'u-2' },
        headers: {},
      } as never;

      const result = await controller.listDesigns(reqWithoutWorkspace);

      expect(result).toEqual({ designs: [], count: 0 });
      expect(kloelDesignFindMany).not.toHaveBeenCalled();
    });
  });

  describe('createDesign', () => {
    it('creates a design with correct dto body and workspaceId', async () => {
      kloelDesignCreate.mockResolvedValue({
        id: 'design-1',
        workspaceId: 'ws-1',
        name: 'My Design',
        format: 'instagram-post',
        width: 1080,
        height: 1080,
      });

      const dto = { name: 'My Design', format: 'instagram-post', width: 1080, height: 1080 };
      const result = await controller.createDesign(mockReq, dto as never);

      expect(kloelDesignCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-1',
            name: 'My Design',
            format: 'instagram-post',
            width: 1080,
            height: 1080,
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.design.id).toBe('design-1');
    });

    it('throws NotFoundException when workspaceId is not present', async () => {
      const reqWithoutWorkspace = {
        user: { sub: 'u-2' },
        headers: {},
      } as never;
      const dto = { format: 'instagram-post', width: 1080, height: 1080 };

      await expect(controller.createDesign(reqWithoutWorkspace, dto as never)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteDesign', () => {
    it('deletes a design with workspace-scoped query', async () => {
      kloelDesignFindFirst.mockResolvedValue({ id: 'design-1', workspaceId: 'ws-1' });
      kloelDesignDeleteMany.mockResolvedValue({ count: 1 });

      const result = await controller.deleteDesign(mockReq, 'design-1');

      expect(kloelDesignFindFirst).toHaveBeenCalledWith({
        where: { id: 'design-1', workspaceId: 'ws-1' },
      });
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          action: 'DELETE_RECORD',
          resource: 'KloelDesign',
          resourceId: 'design-1',
        }),
      );
      expect(kloelDesignDeleteMany).toHaveBeenCalledWith({
        where: { id: 'design-1', workspaceId: 'ws-1' },
      });
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when design is not found', async () => {
      kloelDesignFindFirst.mockResolvedValue(null);

      await expect(controller.deleteDesign(mockReq, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('generateImage', () => {
    it('throws ServiceUnavailableException when OPENAI_API_KEY is not set', async () => {
      process.env.OPENAI_API_KEY = '';

      await expect(controller.generateImage(mockReq, { prompt: 'test' } as never)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('generates an image when OPENAI_API_KEY is configured', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';

      const result = await controller.generateImage(mockReq, { prompt: 'test prompt' } as never);

      expect(ensureTokenBudget).toHaveBeenCalledWith('ws-1');
      expect(trackAiUsage).toHaveBeenCalledWith('ws-1', 1000);
      expect(result.success).toBe(true);
      expect(result.imageUrl).toBeDefined();
    });
  });

  describe('getDesign', () => {
    it('returns a single design scoped to workspace', async () => {
      kloelDesignFindFirst.mockResolvedValue({
        id: 'design-1',
        workspaceId: 'ws-1',
        name: 'My Design',
      });

      const result = await controller.getDesign(mockReq, 'design-1');

      expect(kloelDesignFindFirst).toHaveBeenCalledWith({
        where: { id: 'design-1', workspaceId: 'ws-1' },
      });
      expect(result.design).toMatchObject({ id: 'design-1', name: 'My Design' });
    });
  });

  describe('updateDesign', () => {
    it('updates a design, stripping id and workspaceId from body', async () => {
      kloelDesignFindFirst.mockResolvedValue({ id: 'design-1', workspaceId: 'ws-1' });
      kloelDesignUpdate.mockResolvedValue({
        id: 'design-1',
        workspaceId: 'ws-1',
        name: 'Updated',
        elements: [],
      });

      const dto = {
        id: 'hijacked-id',
        workspaceId: 'hijacked-ws',
        name: 'Updated',
        elements: [],
      };
      const result = await controller.updateDesign(mockReq, 'design-1', dto as never);

      expect(kloelDesignFindFirst).toHaveBeenCalledWith({
        where: { id: 'design-1', workspaceId: 'ws-1' },
      });
      expect(kloelDesignUpdate).toHaveBeenCalledWith({
        where: { id: 'design-1', workspaceId: 'ws-1' },
        data: { name: 'Updated', elements: [] },
      });
      expect(result.success).toBe(true);
    });

    it('throws NotFoundException when design does not exist', async () => {
      kloelDesignFindFirst.mockResolvedValue(null);

      await expect(
        controller.updateDesign(mockReq, 'nonexistent', { name: 'X' } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
