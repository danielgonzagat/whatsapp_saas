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

describe('KloelToolDispatcherService — legacy payment link', () => {
  let bed: DispatcherTestBed;

  beforeEach(async () => {
    bed = await buildDispatcherTestBed();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('create_payment_link returns a canonical material receipt with payment proof', async () => {
    const toolCreatePaymentLink = bed.chatToolsService.toolCreatePaymentLink as jest.Mock;
    toolCreatePaymentLink.mockResolvedValueOnce({
      success: true,
      paymentId: 'pay-link-1',
      paymentUrl: 'https://pay.test/pay-link-1',
      pixQrCode: 'data:image/png;base64,qr',
      pixCopyPaste: '000201link',
      billingType: 'PIX',
    });
    const paymentArgs = {
      amount: 197,
      description: 'PDRN',
      customerName: 'Joao',
    };

    const result = await bed.service.executeTool(
      DEFAULT_WS_ID,
      'create_payment_link',
      paymentArgs,
      'user-42',
    );

    expect(toolCreatePaymentLink).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      ...paymentArgs,
      executionPath: 'dispatcher',
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('create_payment_link');
    expect(result.outputs).toEqual(
      objectContaining({
        paymentId: 'pay-link-1',
        paymentUrl: 'https://pay.test/pay-link-1',
        pixCopyPaste: '000201link',
        pixQrCode: 'data:image/png;base64,qr',
      }),
    );
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'create_payment_link',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: paymentArgs,
        outputs: objectContaining({
          paymentId: 'pay-link-1',
          paymentUrl: 'https://pay.test/pay-link-1',
          pixCopyPaste: '000201link',
        }),
        domainEvents: ['payment.link_created'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('create_payment_link'),
        success: true,
      }),
    );
  });
});
