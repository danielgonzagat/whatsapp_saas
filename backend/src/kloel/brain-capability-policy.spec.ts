import {
  getBrainCapabilityDelegationContract,
  getBrainCapabilityRisk,
  isBrainCapabilityAllowed,
} from './brain-capability-policy';

describe('brain capability policy', () => {
  it('marks billing/payment capabilities as critical', () => {
    expect(getBrainCapabilityRisk('create_payment_link')).toBe('critical');
    expect(getBrainCapabilityRisk('change_plan')).toBe('critical');
    expect(getBrainCapabilityRisk('update_billing_info')).toBe('critical');
  });

  it('blocks critical actions from passive surfaces', () => {
    expect(isBrainCapabilityAllowed('dashboard', 'create_payment_link')).toBe(false);
    expect(isBrainCapabilityAllowed('relatorios', 'change_plan')).toBe(false);
    expect(isBrainCapabilityAllowed('system', 'update_billing_info')).toBe(false);
  });

  it('blocks critical payment actions from raw chat autonomy', () => {
    expect(isBrainCapabilityAllowed('chat', 'create_payment_link')).toBe(false);
    expect(isBrainCapabilityAllowed('chat', 'change_plan')).toBe(false);
    expect(isBrainCapabilityAllowed('chat', 'update_billing_info')).toBe(false);
  });

  it('allows chat to use non-critical active capabilities', () => {
    expect(isBrainCapabilityAllowed('chat', 'send_message')).toBe(true);
  });

  it('publishes explicit delegation contracts by risk class', () => {
    expect(getBrainCapabilityDelegationContract('create_payment_link')).toEqual(
      expect.objectContaining({
        riskClass: 'R3',
        delegationMode: 'owner_review',
      }),
    );
    expect(getBrainCapabilityDelegationContract('send_message')).toEqual(
      expect.objectContaining({
        riskClass: 'R2',
        delegationMode: 'owner_review',
      }),
    );
    expect(getBrainCapabilityDelegationContract('list_products')).toEqual(
      expect.objectContaining({
        riskClass: 'R1',
        delegationMode: 'allowed_alone',
      }),
    );
  });
});
