jest.mock('./kloel-chat-tools.service', () => ({
  KloelChatToolsService: class MockKloelChatToolsService {},
}));

jest.mock('./kloel-business-config-tools.service', () => ({
  KloelBusinessConfigToolsService: class MockKloelBusinessConfigToolsService {},
}));

jest.mock('./kloel-whatsapp-tools.service', () => ({
  KloelWhatsAppToolsService: class MockKloelWhatsAppToolsService {},
}));

jest.mock('./kloel-composer.service', () => ({
  KloelComposerService: class MockKloelComposerService {},
}));

jest.mock('../audit/audit.service', () => ({
  AuditService: class MockAuditService {},
}));

jest.mock('../observability/ops-alert.service', () => ({
  OpsAlertService: class MockOpsAlertService {},
}));

jest.mock('./kloel-code-tools.service', () => ({
  KloelCodeToolsService: class MockKloelCodeToolsService {},
}));

import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { DEFAULT_WS_ID } from './kloel-tool-dispatcher.service.fixtures';
import type { DispatcherChatToolsMock } from './kloel-tool-dispatcher.service.fixtures';
import {
  buildChatToolsHarness,
  objectContaining,
  stringMatching,
  stringContaining,
} from './kloel-tool-dispatcher.service.chat-tools.spec-setup';

describe('KloelToolDispatcherService — chat tools routing (products)', () => {
  let service: KloelToolDispatcherService;
  let chatToolsService: DispatcherChatToolsMock;

  beforeEach(async () => {
    const harness = await buildChatToolsHarness();
    service = harness.service;
    chatToolsService = harness.chatToolsService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('routes save_product to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'save_product', { name: 'P', price: 10 });
    expect(chatToolsService.toolSaveProduct).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'P',
      price: 10,
    });
  });

  it('routes canonical products.create with the requesting actor id', async () => {
    await service.executeTool(
      DEFAULT_WS_ID,
      'products.create',
      { name: 'P', price: 10 },
      'user-42',
    );
    expect(chatToolsService.toolSaveProduct).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'P',
      price: 10,
      actorId: 'user-42',
    });
  });

  it('returns a material receipt for canonical products.create executions', async () => {
    jest.mocked(chatToolsService.toolSaveProduct).mockResolvedValueOnce({
      success: true,
      message: 'Produto criado',
      product: { id: 'prod-123', slug: 'pdrn' },
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'products.create',
      { name: 'PDRN', price: 197 },
      'user-42',
    );

    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('products.create');
    expect(result.outputs).toEqual(objectContaining({ productId: 'prod-123' }));
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'products.create',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { name: 'PDRN', price: 197 },
        outputs: objectContaining({ productId: 'prod-123' }),
        // Registry runtime truth (capability-registry-v2/partitions/tier-1-products.ts):
        // ProductService.create records mind.product.observed on the spine — not product.created.
        domainEvents: ['mind.product.observed'],
        auditLogId: `audit_products.create:${DEFAULT_WS_ID}:user-42`,
        evidenceUrl: '/produtos/prod-123',
        idempotencyKey: stringContaining('products.create'),
        success: true,
      }),
    );
  });

  it('routes canonical products.update with actor id and a material receipt', async () => {
    jest.mocked(chatToolsService.toolUpdateProduct).mockResolvedValueOnce({
      success: true,
      product: { id: 'prod-123', name: 'PDRN Plus' },
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'products.update',
      { productId: 'prod-123', name: 'PDRN Plus' },
      'user-42',
    );

    expect(chatToolsService.toolUpdateProduct).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      productId: 'prod-123',
      name: 'PDRN Plus',
      actorId: 'user-42',
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('products.update');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'products.update',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { productId: 'prod-123', name: 'PDRN Plus' },
        outputs: objectContaining({ productId: 'prod-123' }),
        domainEvents: ['product.updated'],
        auditLogId: stringMatching(/^audit_/),
        evidenceUrl: '/produtos/prod-123',
        idempotencyKey: stringContaining('products.update'),
        success: true,
      }),
    );
  });

  it('routes canonical products.upload_image with actor id and a material receipt', async () => {
    jest.mocked(chatToolsService.toolUploadProductImage).mockResolvedValueOnce({
      success: true,
      product: { id: 'prod-123', imageUrl: 'https://img.test/pdrn.png' },
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'products.upload_image',
      { productId: 'prod-123', imageUrl: 'https://img.test/pdrn.png' },
      'user-42',
    );

    expect(chatToolsService.toolUploadProductImage).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      productId: 'prod-123',
      imageUrl: 'https://img.test/pdrn.png',
      actorId: 'user-42',
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('products.upload_image');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'products.upload_image',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { productId: 'prod-123', imageUrl: 'https://img.test/pdrn.png' },
        outputs: objectContaining({ productId: 'prod-123' }),
        domainEvents: ['product.updated'],
        auditLogId: stringMatching(/^audit_/),
        evidenceUrl: '/produtos/prod-123',
        idempotencyKey: stringContaining('products.upload_image'),
        success: true,
      }),
    );
  });

  it('does not produce a successful material receipt when products.upload_image is missing image input', async () => {
    jest.mocked(chatToolsService.toolUploadProductImage).mockResolvedValueOnce({
      success: false,
      error: 'image_url_required',
      message: 'Envie a URL da imagem ou faça upload pelo chat.',
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'products.upload_image',
      { productId: 'prod-123' },
      'user-42',
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('image_url_required');
    expect(result.domainEvents).toEqual([]);
    expect(result.evidenceUrl).toBeUndefined();
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'products.upload_image',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { productId: 'prod-123' },
        outputs: {},
        domainEvents: [],
        error: 'image_url_required',
        success: false,
      }),
    );
  });

  it('requires approval before canonical products.review_and_publish publishes', async () => {
    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'products.review_and_publish',
      { productId: 'prod-123' },
      'user-42',
    );

    expect(chatToolsService.toolPublishProduct).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.approvalRequired).toBe(true);
    expect(result.approvalRequestId).toBe('ap-1');
  });

  it('routes list_products to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'list_products', {});
    expect(chatToolsService.toolListProducts).toHaveBeenCalledWith(DEFAULT_WS_ID);
  });

  it('routes delete_product to chatToolsService with a material receipt', async () => {
    jest.mocked(chatToolsService.toolDeleteProduct).mockResolvedValueOnce({
      success: true,
      message: 'Produto removido',
      product: { id: 'p-1', name: 'PDRN' },
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'delete_product',
      { productId: 'p-1' },
      'user-42',
    );

    expect(chatToolsService.toolDeleteProduct).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      productId: 'p-1',
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('delete_product');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'delete_product',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { productId: 'p-1' },
        outputs: objectContaining({ productId: 'p-1' }),
        domainEvents: ['product.deleted'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('delete_product'),
        success: true,
      }),
    );
  });
});
