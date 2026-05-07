import { getBrainCapabilityRisk, isBrainCapabilityAllowed } from './brain-capability-policy';

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

  it('allows chat to use the full active capability set', () => {
    expect(isBrainCapabilityAllowed('chat', 'create_payment_link')).toBe(true);
    expect(isBrainCapabilityAllowed('chat', 'send_message')).toBe(true);
  });
});
