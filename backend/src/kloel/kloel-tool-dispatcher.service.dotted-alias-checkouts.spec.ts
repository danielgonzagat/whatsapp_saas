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
  stringContaining,
  stringMatching,
  type DispatcherTestBed,
} from './kloel-tool-dispatcher.service.dotted-alias.test-bed';

describe('KloelToolDispatcherService — checkouts.* aliases', () => {
  let bed: DispatcherTestBed;

  beforeEach(async () => {
    bed = await buildDispatcherTestBed();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('checkouts.create forwards to create_checkout and returns a material receipt', async () => {
    bed.productSubTools.executeTool.mockResolvedValue({
      success: true,
      checkout: { id: 'chk-1', name: 'Checkout Principal' },
    });

    const dotted = await bed.service.executeTool(
      DEFAULT_WS_ID,
      'checkouts.create',
      { productId: 'prod-1', name: 'Checkout Principal' },
      'user-42',
    );

    expect(bed.productSubTools.executeTool).toHaveBeenCalledWith('create_checkout', DEFAULT_WS_ID, {
      productId: 'prod-1',
      name: 'Checkout Principal',
    });
    expect(dotted.success).toBe(true);
    expect(dotted.capabilityId).toBe('checkouts.create');
    expect(dotted.outputs).toEqual(objectContaining({ checkoutId: 'chk-1' }));
    expect(dotted.receipt).toEqual(
      objectContaining({
        capabilityId: 'checkouts.create',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { productId: 'prod-1', name: 'Checkout Principal' },
        outputs: objectContaining({ checkoutId: 'chk-1' }),
        domainEvents: ['commerce.checkout.created'],
        auditLogId: stringMatching(/^audit_/),
        evidenceUrl: '/produtos/prod-1/checkouts/chk-1',
        idempotencyKey: stringContaining('checkouts.create'),
        success: true,
      }),
    );
  });

  it('checkouts.update forwards to update_checkout and returns a material receipt', async () => {
    bed.productSubTools.executeTool.mockResolvedValue({
      success: true,
      checkout: { id: 'chk-1', name: 'Checkout Pro' },
    });

    const checkoutArgs = {
      productId: 'prod-1',
      checkoutId: 'chk-1',
      name: 'Checkout Pro',
      buttonText: 'Comprar Agora',
    };
    const dotted = await bed.service.executeTool(
      DEFAULT_WS_ID,
      'checkouts.update',
      checkoutArgs,
      'user-42',
    );

    expect(bed.productSubTools.executeTool).toHaveBeenCalledWith(
      'update_checkout',
      DEFAULT_WS_ID,
      checkoutArgs,
    );
    expect(dotted.success).toBe(true);
    expect(dotted.capabilityId).toBe('checkouts.update');
    expect(dotted.outputs).toEqual(objectContaining({ checkoutId: 'chk-1' }));
    expect(dotted.receipt).toEqual(
      objectContaining({
        capabilityId: 'checkouts.update',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: checkoutArgs,
        outputs: objectContaining({ productId: 'prod-1', checkoutId: 'chk-1' }),
        domainEvents: ['checkout.updated'],
        auditLogId: stringMatching(/^audit_/),
        evidenceUrl: '/produtos/prod-1/checkouts/chk-1',
        idempotencyKey: stringContaining('checkouts.update'),
        success: true,
      }),
    );
  });
});
