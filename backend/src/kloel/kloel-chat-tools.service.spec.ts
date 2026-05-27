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
    it('creates product scoped to workspaceId', async () => {
      const product: ProductRecord = {
        id: 'p-1',
        name: 'Curso',
        price: 199.9,
        description: '',
        active: true,
        status: 'active',
      };
      ctx.productService.create.mockResolvedValue({ success: true, product });

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
          format: 'DIGITAL',
        }),
        { id: 'kloel-chat-tools' },
      );
    });
  });

  describe('toolUpdateProduct', () => {
    it('updates through ProductService instead of writing product fields directly', async () => {
      ctx.productService.update.mockResolvedValue({
        success: true,
        product: { id: 'p-1', name: 'Novo nome', price: 199 },
      });

      const result = await service.toolUpdateProduct(ctx.wsId, {
        productId: 'p-1',
        name: 'Novo nome',
        actorId: 'user-42',
      });

      expect(result.success).toBe(true);
      expect(ctx.productService.update).toHaveBeenCalledWith(
        ctx.wsId,
        'p-1',
        { name: 'Novo nome' },
        { id: 'user-42' },
      );
    });
  });

  describe('toolUploadProductImage', () => {
    it('attaches an image by product id through ProductService.setImage with actor context', async () => {
      ctx.productService.setImage.mockResolvedValue({
        success: true,
        product: { id: 'p-1', name: 'PDRN', imageUrl: 'https://img.test/pdrn.png' },
      });

      const result = await service.toolUploadProductImage(ctx.wsId, {
        productId: 'p-1',
        imageUrl: 'https://img.test/pdrn.png',
        actorId: 'user-42',
      });

      expect(result.success).toBe(true);
      expect(ctx.productService.setImage).toHaveBeenCalledWith(
        ctx.wsId,
        'p-1',
        'https://img.test/pdrn.png',
        { id: 'user-42' },
      );
      expect(ctx.productService.update).not.toHaveBeenCalled();
    });

    it('resolves product name inside the workspace before calling ProductService.setImage', async () => {
      prisma.product.findFirst.mockResolvedValueOnce({ id: 'p-2' });
      ctx.productService.setImage.mockResolvedValue({
        success: true,
        product: { id: 'p-2', name: 'PDRN', imageUrl: 'https://img.test/pdrn.png' },
      });

      const result = await service.toolUploadProductImage(ctx.wsId, {
        productName: 'PDRN',
        imageUrl: 'https://img.test/pdrn.png',
        actorId: 'user-42',
      });

      expect(result.success).toBe(true);
      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: ctx.wsId, name: { contains: 'PDRN', mode: 'insensitive' } },
        select: { id: true },
      });
      expect(ctx.productService.setImage).toHaveBeenCalledWith(
        ctx.wsId,
        'p-2',
        'https://img.test/pdrn.png',
        { id: 'user-42' },
      );
      expect(ctx.productService.update).not.toHaveBeenCalled();
    });

    it('refuses missing image input without updating the product', async () => {
      const result = await service.toolUploadProductImage(ctx.wsId, {
        productId: 'p-1',
        actorId: 'user-42',
      });

      expect(result).toEqual({
        success: false,
        error: 'image_url_required',
        message: 'Envie a URL da imagem ou faça upload pelo chat.',
      });
      expect(ctx.productService.update).not.toHaveBeenCalled();
    });
  });

  describe('toolPublishProduct', () => {
    it('publishes through ProductService with actor context', async () => {
      prisma.product.findFirst.mockResolvedValueOnce({ id: 'p-1' });
      ctx.productService.publish.mockResolvedValue({
        success: true,
        product: { id: 'p-1', name: 'PDRN', status: 'APPROVED', active: true },
      });

      const result = await service.toolPublishProduct(ctx.wsId, {
        productId: 'p-1',
        actorId: 'user-42',
      });

      expect(result.success).toBe(true);
      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'p-1', workspaceId: ctx.wsId },
        select: { id: true },
      });
      expect(ctx.productService.publish).toHaveBeenCalledWith(ctx.wsId, 'p-1', {
        id: 'user-42',
      });
    });

    it('resolves a product name inside the workspace before publishing', async () => {
      prisma.product.findFirst.mockResolvedValueOnce({ id: 'p-2' });
      ctx.productService.publish.mockResolvedValue({
        success: true,
        product: { id: 'p-2', name: 'PDRN', status: 'APPROVED', active: true },
      });

      const result = await service.toolPublishProduct(ctx.wsId, {
        productName: 'PDRN',
        actorId: 'user-42',
      });

      expect(result.success).toBe(true);
      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: ctx.wsId, name: { contains: 'PDRN', mode: 'insensitive' } },
        select: { id: true },
      });
      expect(ctx.productService.publish).toHaveBeenCalledWith(ctx.wsId, 'p-2', {
        id: 'user-42',
      });
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
      expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_key: { workspaceId: ctx.wsId, key: 'brandVoice' } },
          create: expect.objectContaining({ workspaceId: ctx.wsId }),
        }),
      );
    });
  });
});
