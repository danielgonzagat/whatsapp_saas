import {
  setupChatToolsService,
  type ChatToolsPrismaMock,
  type ChatToolsSetup,
} from './kloel-chat-tools.service.spec-helpers';

type ProductRecord = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  active: boolean;
  status: string;
};

type KloelMemoryUpsertInput = {
  where?: { workspaceId_key?: { workspaceId?: string; key?: string } };
  create?: { workspaceId?: string };
};

describe('KloelChatToolsService — produto, autopilot e identidade', () => {
  let service: ChatToolsSetup['service'];
  let prisma: ChatToolsPrismaMock;
  let ctx: ChatToolsSetup;

  beforeEach(async () => {
    ctx = await setupChatToolsService();
    service = ctx.service;
    prisma = ctx.prisma;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('toolSaveProduct', () => {
    it('creates product through ProductService scoped to workspaceId', async () => {
      const result = await service.toolSaveProduct(ctx.wsId, {
        name: 'Curso',
        price: 199.9,
        description: 'Curso completo',
      });

      expect(result.success).toBe(true);
      expect(ctx.productService.create).toHaveBeenCalledWith(
        ctx.wsId,
        expect.objectContaining({
          name: 'Curso',
          price: 199.9,
          description: 'Curso completo',
        }),
        { id: 'kloel-chat' },
      );
      expect(prisma.product.create).not.toHaveBeenCalled();
    });
  });

  describe('toolListProducts', () => {
    it('returns message when no products exist', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      const result = await service.toolListProducts(ctx.wsId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Nenhum produto');
    });

    it('lists products filtered by workspaceId', async () => {
      const products: ProductRecord[] = [
        {
          id: 'p-1',
          name: 'Produto A',
          price: 99,
          description: null,
          active: true,
          status: 'active',
        },
      ];
      prisma.product.findMany.mockResolvedValue(products);

      const result = await service.toolListProducts(ctx.wsId);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: ctx.wsId, active: true } }),
      );
      expect(result.products).toHaveLength(1);
    });
  });

  describe('toolDeleteProduct', () => {
    it('soft-deletes product with audit log in transaction', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p-1',
        name: 'Curso Antigo',
      });

      const result = await service.toolDeleteProduct(ctx.wsId, { productName: 'Curso' });

      expect(result.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('returns error when product not found', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      const result = await service.toolDeleteProduct(ctx.wsId, { productId: 'no-exist' });

      expect(result.success).toBe(false);
    });
  });

  describe('toolToggleAutopilot', () => {
    it('blocks activation when billing is suspended', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { billingSuspended: true },
      });

      const result = await service.toolToggleAutopilot(ctx.wsId, { enabled: true });

      expect(result.success).toBe(false);
    });

    it('enables autopilot via transaction when billing is ok', async () => {
      prisma.workspace.findUnique
        .mockResolvedValueOnce({ providerSettings: {} })
        .mockResolvedValueOnce({ providerSettings: {} });

      const result = await service.toolToggleAutopilot(ctx.wsId, { enabled: true });

      expect(result.success).toBe(true);
      expect(result.enabled).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('toolSetBrandVoice', () => {
    it('upserts brandVoice in kloelMemory', async () => {
      const result = await service.toolSetBrandVoice(ctx.wsId, {
        tone: 'formal',
        personality: 'profissional',
      });

      expect(result.success).toBe(true);
      const [upsertInput] = prisma.kloelMemory.upsert.mock.calls[0] as [KloelMemoryUpsertInput];
      expect(upsertInput.where).toEqual({
        workspaceId_key: { workspaceId: ctx.wsId, key: 'brandVoice' },
      });
      expect(upsertInput.create?.workspaceId).toBe(ctx.wsId);
    });
  });
});
