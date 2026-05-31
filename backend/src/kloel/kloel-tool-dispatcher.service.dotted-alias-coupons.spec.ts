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

describe('KloelToolDispatcherService — coupons.* aliases', () => {
  let bed: DispatcherTestBed;

  beforeEach(async () => {
    bed = await buildDispatcherTestBed();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('coupons.create forwards to create_coupon and returns a material receipt', async () => {
    bed.productSubTools.executeTool.mockResolvedValue({
      success: true,
      coupon: { id: 'coupon-1', code: 'PDRN10' },
    });

    const dotted = await bed.service.executeTool(
      DEFAULT_WS_ID,
      'coupons.create',
      { productId: 'prod-1', code: 'PDRN10', discountType: 'percentage', discountValue: 10 },
      'user-42',
    );

    expect(bed.productSubTools.executeTool).toHaveBeenCalledWith('create_coupon', DEFAULT_WS_ID, {
      productId: 'prod-1',
      code: 'PDRN10',
      discountType: 'percentage',
      discountValue: 10,
    });
    expect(dotted.success).toBe(true);
    expect(dotted.capabilityId).toBe('coupons.create');
    expect(dotted.outputs).toEqual(objectContaining({ couponId: 'coupon-1' }));
    expect(dotted.receipt).toEqual(
      objectContaining({
        capabilityId: 'coupons.create',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: {
          productId: 'prod-1',
          code: 'PDRN10',
          discountType: 'percentage',
          discountValue: 10,
        },
        outputs: objectContaining({ couponId: 'coupon-1' }),
        domainEvents: ['coupon.created'],
        auditLogId: stringMatching(/^audit_/),
        evidenceUrl: '/produtos/prod-1/cupons/coupon-1',
        idempotencyKey: stringContaining('coupons.create'),
        success: true,
      }),
    );
  });

  it('coupons.delete forwards to delete_coupon and returns a material receipt', async () => {
    bed.productSubTools.executeTool.mockResolvedValue({ success: true, couponId: 'coupon-1' });

    const deleteArgs = { couponId: 'coupon-1' };
    const dotted = await bed.service.executeTool(
      DEFAULT_WS_ID,
      'coupons.delete',
      deleteArgs,
      'user-42',
    );

    expect(bed.productSubTools.executeTool).toHaveBeenCalledWith(
      'delete_coupon',
      DEFAULT_WS_ID,
      deleteArgs,
    );
    expect(dotted.success).toBe(true);
    expect(dotted.capabilityId).toBe('coupons.delete');
    expect(dotted.outputs).toEqual(objectContaining({ couponId: 'coupon-1' }));
    expect(dotted.receipt).toEqual(
      objectContaining({
        capabilityId: 'coupons.delete',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: deleteArgs,
        outputs: objectContaining({ couponId: 'coupon-1' }),
        domainEvents: ['coupon.deleted'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('coupons.delete'),
        success: true,
      }),
    );
  });
});
