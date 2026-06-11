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

describe('KloelToolDispatcherService — plans.* aliases', () => {
  let bed: DispatcherTestBed;

  beforeEach(async () => {
    bed = await buildDispatcherTestBed();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('plans.create forwards to create_plan and returns a material receipt', async () => {
    bed.productSubTools.executeTool.mockResolvedValue({
      success: true,
      plan: { id: 'plan-1', name: 'Basic' },
    });

    const dotted = await bed.service.executeTool(
      DEFAULT_WS_ID,
      'plans.create',
      { productId: 'prod-1', name: 'Basic', price: 99 },
      'user-42',
    );

    expect(bed.productSubTools.executeTool).toHaveBeenCalledWith('create_plan', DEFAULT_WS_ID, {
      productId: 'prod-1',
      name: 'Basic',
      price: 99,
    });
    expect(dotted.success).toBe(true);
    expect(dotted.capabilityId).toBe('plans.create');
    expect(dotted.outputs).toEqual(objectContaining({ planId: 'plan-1' }));
    expect(dotted.receipt).toEqual(
      objectContaining({
        capabilityId: 'plans.create',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { productId: 'prod-1', name: 'Basic', price: 99 },
        outputs: objectContaining({ planId: 'plan-1' }),
        // Registry runtime truth (capability-registry-v2/partitions/tier-2-plans.ts):
        // PlanService.create records mind.plan.observed on the spine — not plan.created.
        domainEvents: ['mind.plan.observed'],
        auditLogId: `audit_plans.create:${DEFAULT_WS_ID}:user-42`,
        evidenceUrl: '/produtos/prod-1/planos/plan-1',
        idempotencyKey: stringContaining('plans.create'),
        success: true,
      }),
    );
  });

  it('plans.update forwards to update_plan and returns a material receipt', async () => {
    bed.productSubTools.executeTool.mockResolvedValue({
      success: true,
      plan: { id: 'plan-1', name: 'Pro' },
    });

    const planArgs = { productId: 'prod-1', planId: 'plan-1', name: 'Pro', price: 199 };
    const dotted = await bed.service.executeTool(
      DEFAULT_WS_ID,
      'plans.update',
      planArgs,
      'user-42',
    );

    expect(bed.productSubTools.executeTool).toHaveBeenCalledWith(
      'update_plan',
      DEFAULT_WS_ID,
      planArgs,
    );
    expect(dotted.success).toBe(true);
    expect(dotted.capabilityId).toBe('plans.update');
    expect(dotted.outputs).toEqual(objectContaining({ planId: 'plan-1' }));
    expect(dotted.receipt).toEqual(
      objectContaining({
        capabilityId: 'plans.update',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: planArgs,
        outputs: objectContaining({ productId: 'prod-1', planId: 'plan-1' }),
        domainEvents: ['plan.updated'],
        auditLogId: stringMatching(/^audit_/),
        evidenceUrl: '/produtos/prod-1/planos/plan-1',
        idempotencyKey: stringContaining('plans.update'),
        success: true,
      }),
    );
  });
});
