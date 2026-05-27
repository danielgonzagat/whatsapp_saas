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
        expect.objectContaining({ name: 'Curso', price: 199.9, description: 'Curso completo' }),
        { id: 'kloel-chat' },
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
    it('deletes by id through ProductService without direct product transaction', async () => {
      ctx.productService.delete.mockResolvedValue({ success: true, message: 'Product deleted' });

      const result = await service.toolDeleteProduct(ctx.wsId, {
        productId: 'p-1',
        actorId: 'user-42',
      });

      expect(result.success).toBe(true);
      expect(ctx.productService.delete).toHaveBeenCalledWith(ctx.wsId, 'p-1', {
        id: 'user-42',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('resolves product name read-only before deleting through ProductService', async () => {
      prisma.product.findFirst.mockResolvedValueOnce({ id: 'p-2' });
      ctx.productService.delete.mockResolvedValue({ success: true, message: 'Product deleted' });

      const result = await service.toolDeleteProduct(ctx.wsId, {
        productName: 'Curso',
        actorId: 'user-42',
      });

      expect(result.success).toBe(true);
      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: ctx.wsId, name: { contains: 'Curso', mode: 'insensitive' } },
        select: { id: true },
      });
      expect(ctx.productService.delete).toHaveBeenCalledWith(ctx.wsId, 'p-2', {
        id: 'user-42',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('returns error when product is missing', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      const result = await service.toolDeleteProduct(ctx.wsId, { productName: 'no-exist' });

      expect(result).toEqual({ success: false, error: 'Produto não encontrado.' });
      expect(ctx.productService.delete).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('toolValidateCoupon', () => {
    it('does not pass non-string product or coupon values into coupon lookup', async () => {
      const result = await service.toolValidateCoupon(ctx.wsId, {
        productId: 123,
        code: ['SAVE10'],
      });

      expect(result).toEqual({ success: false, error: 'productId_and_code_required' });
      expect(prisma.productCoupon.findFirst).not.toHaveBeenCalled();
    });

    it('validates coupon using normalized string inputs', async () => {
      prisma.productCoupon.findFirst.mockResolvedValueOnce({
        id: 'coupon-1',
        code: 'SAVE10',
        discountValue: 10,
        discountType: 'PERCENTAGE',
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
      });

      const result = await service.toolValidateCoupon(ctx.wsId, {
        productId: 'prod-1',
        code: 'SAVE10',
      });

      expect(result.success).toBe(true);
      expect(result.valid).toBe(true);
      expect(prisma.productCoupon.findFirst).toHaveBeenCalledWith({
        where: { productId: 'prod-1', code: 'SAVE10', active: true },
      });
    });
  });

  describe('toolGetAnalytics', () => {
    it('normalizes non-string analytics period to the helper default', async () => {
      const result = await service.toolGetAnalytics(ctx.wsId, {
        metric: 123,
        period: ['today'],
      });

      expect(result.success).toBe(true);
      expect(result.period).toBe('month');
      expect(prisma.checkoutOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: ctx.wsId }) }),
      );
    });

    it('keeps valid string analytics period values', async () => {
      const result = await service.toolGetAnalytics(ctx.wsId, {
        metric: 'revenue',
        period: 'today',
      });

      expect(result.success).toBe(true);
      expect(result.period).toBe('today');
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
    it('stores brandVoice through MemoryService without direct kloelMemory writes', async () => {
      const result = await service.toolSetBrandVoice(ctx.wsId, {
        tone: 'formal',
        personality: 'profissional',
      });

      expect(result.success).toBe(true);
      expect(ctx.memoryService.saveMemory).toHaveBeenCalledWith(
        ctx.wsId,
        'brandVoice',
        { style: 'formal', personality: 'profissional' },
        'preferences',
        'Tom: formal. profissional',
      );
      expect(prisma.kloelMemory.upsert).not.toHaveBeenCalled();
    });
  });
});
