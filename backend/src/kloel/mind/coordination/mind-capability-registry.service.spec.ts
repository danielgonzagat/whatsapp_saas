import { BrainCapabilityRegistryService } from './brain-capability-registry.service';
import type { BrainCapabilityDomain } from './brain-capability-registry.service';
import type {
  BrainCapabilityDelegationMode,
  BrainCapabilityRiskClass,
} from './brain-capability-policy';

describe('BrainCapabilityRegistryService', () => {
  const svc = new BrainCapabilityRegistryService();
  const domains: ReadonlySet<BrainCapabilityDomain> = new Set([
    'control',
    'messaging',
    'product',
    'sales',
  ]);
  const riskClasses: readonly BrainCapabilityRiskClass[] = ['R1', 'R2', 'R3'];
  const delegationModes: readonly BrainCapabilityDelegationMode[] = [
    'allowed_alone',
    'owner_review',
  ];

  it('list returns capabilities sorted alphabetically by name', () => {
    const items = svc.list();
    expect(items.length).toBeGreaterThan(0);
    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
    expect(items.map((i) => i.name)).toEqual(sorted.map((i) => i.name));
  });

  it('every capability has the expected shape', () => {
    for (const cap of svc.list()) {
      expect(typeof cap.name).toBe('string');
      expect(typeof cap.description).toBe('string');
      expect(domains.has(cap.domain)).toBe(true);
      expect(riskClasses).toContain(cap.delegationContract.riskClass);
      expect(delegationModes).toContain(cap.delegationContract.delegationMode);
      expect(typeof cap.delegationContract.safeNextStep).toBe('string');
      expect(typeof cap.delegationContract.rollback).toBe('string');
    }
  });

  it('grouped returns one bucket per domain and the union covers all capabilities', () => {
    const groups = svc.grouped();
    expect(Object.keys(groups).sort()).toEqual(['control', 'messaging', 'product', 'sales']);
    const total = Object.values(groups).reduce((acc, arr) => acc + arr.length, 0);
    expect(total).toBe(svc.list().length);
  });

  it('allowedFor returns a subset of all capability names', () => {
    const all = svc.list().map((c) => c.name);
    const allowed = svc.allowedFor('chat');
    for (const name of allowed) {
      expect(all).toContain(name);
    }
  });

  it('publishes explicit owner-review contracts for critical capabilities', () => {
    const paymentLink = svc.list().find((capability) => capability.name === 'create_payment_link');

    expect(paymentLink).toBeDefined();
    expect(paymentLink?.risk).toBe('critical');
    expect(paymentLink?.delegationContract.riskClass).toBe('R3');
    expect(paymentLink?.delegationContract.delegationMode).toBe('owner_review');
  });
});
