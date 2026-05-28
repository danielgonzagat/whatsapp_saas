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

jest.mock('./kloel-product-sub-resource-tools.service', () => ({
  KloelProductSubResourceToolsService: class MockProductSubToolsService {},
}));

import { DEFAULT_WS_ID } from './kloel-tool-dispatcher.service.fixtures';
import {
  buildDispatcherTestBed,
  objectContaining,
  type DispatcherTestBed,
} from './kloel-tool-dispatcher.service.dotted-alias.test-bed';

describe('KloelToolDispatcherService — products.* aliases', () => {
  let bed: DispatcherTestBed;
  const args = { name: 'Test', price: 99 };

  beforeEach(async () => {
    bed = await buildDispatcherTestBed();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('products.create forwards to create_product and returns a material receipt', async () => {
    bed.chatToolsService.toolSaveProduct = jest.fn().mockResolvedValue({
      success: true,
      product: { id: 'prod-1', name: 'Test' },
    });

    const prodResult = await bed.service.executeTool(
      DEFAULT_WS_ID,
      'products.create',
      args,
      'user-42',
    );

    expect(bed.chatToolsService.toolSaveProduct).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      ...args,
      actorId: 'user-42',
    });
    expect(prodResult).toEqual(
      objectContaining({
        success: true,
        capabilityId: 'products.create',
        outputs: objectContaining({ productId: 'prod-1' }),
        receipt: objectContaining({
          capabilityId: 'products.create',
          actorId: 'user-42',
          inputs: args,
          outputs: objectContaining({ productId: 'prod-1' }),
          domainEvents: ['product.created'],
          evidenceUrl: '/produtos/prod-1',
          success: true,
        }),
      }),
    );
  });

  it('products.update forwards to update_product and returns a material receipt', async () => {
    bed.chatToolsService.toolUpdateProduct = jest.fn().mockResolvedValue({
      success: true,
      product: { id: 'prod-1', name: 'Test' },
    });

    const dotted = await bed.service.executeTool(
      DEFAULT_WS_ID,
      'products.update',
      args,
      'user-42',
    );

    expect(bed.chatToolsService.toolUpdateProduct).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      ...args,
      actorId: 'user-42',
    });
    expect(dotted).toEqual(
      objectContaining({
        success: true,
        capabilityId: 'products.update',
        outputs: objectContaining({ productId: 'prod-1' }),
        receipt: objectContaining({
          capabilityId: 'products.update',
          actorId: 'user-42',
          inputs: args,
          outputs: objectContaining({ productId: 'prod-1' }),
          domainEvents: ['product.updated'],
          evidenceUrl: '/produtos/prod-1',
          success: true,
        }),
      }),
    );
  });

  it('products.upload_image reaches upload_product_image', async () => {
    bed.chatToolsService.toolUploadProductImage = jest
      .fn()
      .mockResolvedValue({ success: true, url: 'https://img.test/x.png' });

    await bed.service.executeTool(DEFAULT_WS_ID, 'products.upload_image', args);

    expect(bed.chatToolsService.toolUploadProductImage).toHaveBeenCalledWith(DEFAULT_WS_ID, args);
  });
});
