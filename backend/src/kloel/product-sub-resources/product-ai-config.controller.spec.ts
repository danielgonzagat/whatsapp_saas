jest.mock('./helpers/ai-config.helpers', () => ({
  serializeProductAiConfig: jest.fn(),
  normalizeProductAiConfigInput: jest.fn(),
}));

jest.mock('./helpers/common.helpers', () => ({
  ensureWorkspaceProductAccess: jest.fn().mockResolvedValue(undefined),
  getWorkspaceId: jest.fn(),
}));

import { ProductAIConfigController } from './product-ai-config.controller';
import {
  serializeProductAiConfig,
  normalizeProductAiConfigInput,
} from './helpers/ai-config.helpers';
import { ensureWorkspaceProductAccess, getWorkspaceId } from './helpers/common.helpers';

const serializeProductAiConfigMock = serializeProductAiConfig as jest.Mock;
const normalizeProductAiConfigInputMock = normalizeProductAiConfigInput as jest.Mock;
const ensureWorkspaceProductAccessMock = ensureWorkspaceProductAccess as jest.Mock;
const getWorkspaceIdMock = getWorkspaceId as jest.Mock;

describe('ProductAIConfigController', () => {
  const mockFindUnique = jest.fn();
  const mockUpsert = jest.fn();

  const mockPrismaService = {
    productAIConfig: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
    },
  } as never;

  let controller: ProductAIConfigController;
  const req = {
    user: { sub: 'u-1', workspaceId: 'ws-1' },
    headers: {},
  } as never;

  beforeEach(() => {
    jest.resetAllMocks();
    ensureWorkspaceProductAccessMock.mockResolvedValue(undefined);
    controller = new ProductAIConfigController(mockPrismaService);
  });

  describe('GET /products/:productId/ai-config', () => {
    it('should retrieve AI config and return serialized result (happy path)', async () => {
      getWorkspaceIdMock.mockReturnValue('ws-1');
      const dbConfig = { productId: 'prod-1', tone: 'professional' };
      mockFindUnique.mockResolvedValue(dbConfig);
      serializeProductAiConfigMock.mockReturnValue({ tone: 'professional' });

      const result = await controller.get('prod-1', req);

      expect(getWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(ensureWorkspaceProductAccessMock).toHaveBeenCalledWith(
        mockPrismaService,
        'prod-1',
        'ws-1',
      );
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
      });
      expect(serializeProductAiConfigMock).toHaveBeenCalledWith(dbConfig);
      expect(result).toEqual({ tone: 'professional' });
    });

    it('should propagate error when access check fails (error path)', async () => {
      ensureWorkspaceProductAccessMock.mockRejectedValue(new Error('Forbidden'));

      await expect(controller.get('prod-1', req)).rejects.toThrow('Forbidden');
    });

    it('should pass user identity from request into workspace resolution', async () => {
      getWorkspaceIdMock.mockReturnValue('ws-1');
      mockFindUnique.mockResolvedValue({ productId: 'prod-1' });
      serializeProductAiConfigMock.mockReturnValue({});

      await controller.get('prod-1', req);

      expect(getWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(req.user.sub).toBe('u-1');
    });
  });

  describe('PUT /products/:productId/ai-config', () => {
    it('should upsert AI config with body data (alternate route happy path)', async () => {
      getWorkspaceIdMock.mockReturnValue('ws-1');
      const body = { tone: 'friendly', idempotencyKey: 'ik-1' };
      mockFindUnique.mockResolvedValue(null);
      normalizeProductAiConfigInputMock.mockReturnValue({
        tone: 'friendly',
      });
      const saved = { productId: 'prod-1', tone: 'friendly' };
      mockUpsert.mockResolvedValue(saved);
      serializeProductAiConfigMock.mockReturnValue({ tone: 'friendly' });

      const result = await controller.upsert('prod-1', body, req);

      expect(getWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(ensureWorkspaceProductAccessMock).toHaveBeenCalledWith(
        mockPrismaService,
        'prod-1',
        'ws-1',
      );
      expect(normalizeProductAiConfigInputMock).toHaveBeenCalledWith(body, null);
      expect(mockUpsert).toHaveBeenCalled();
      expect(serializeProductAiConfigMock).toHaveBeenCalledWith(saved);
      expect(result).toEqual({ tone: 'friendly' });
    });
  });
});
