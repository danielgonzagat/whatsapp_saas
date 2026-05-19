import type { BrainSource } from './brain-runtime.dto';

export type BrainCapabilityRisk = 'critical' | 'high' | 'normal';
export type BrainCapabilityRiskClass = 'R1' | 'R2' | 'R3';
export type BrainCapabilityDelegationMode = 'allowed_alone' | 'owner_review';

export interface BrainCapabilityDelegationContract {
  riskClass: BrainCapabilityRiskClass;
  delegationMode: BrainCapabilityDelegationMode;
  safeNextStep: string;
  rollback: string;
}

const CRITICAL_CAPABILITIES = new Set([
  'change_plan',
  'create_payment_link',
  'update_billing_info',
]);

const HIGH_RISK_CAPABILITIES = new Set([
  'apply_discount',
  'create_broadcast',
  'import_contacts',
  'schedule_campaign',
  'send_audio',
  'send_document',
  'send_media',
  'send_message',
  'send_voice_note',
  'set_whatsapp_presence',
  'sync_whatsapp_history',
  'update_workspace_settings',
]);

const SOURCE_BLOCKS: Record<BrainSource, Set<string>> = {
  chat: new Set([...CRITICAL_CAPABILITIES]),
  dashboard: new Set([...CRITICAL_CAPABILITIES, ...HIGH_RISK_CAPABILITIES]),
  vendas: new Set(['change_plan', 'update_billing_info']),
  relatorios: new Set([...CRITICAL_CAPABILITIES, ...HIGH_RISK_CAPABILITIES]),
  settings: new Set(['change_plan', 'create_payment_link']),
  crm: new Set(['change_plan', 'create_payment_link', 'update_billing_info']),
  checkout: new Set([...CRITICAL_CAPABILITIES, 'create_broadcast', 'import_contacts']),
  system: new Set([...CRITICAL_CAPABILITIES, ...HIGH_RISK_CAPABILITIES]),
};

export function getBrainCapabilityRisk(name: string): BrainCapabilityRisk {
  if (CRITICAL_CAPABILITIES.has(name)) {
    return 'critical';
  }
  if (HIGH_RISK_CAPABILITIES.has(name)) {
    return 'high';
  }
  return 'normal';
}

export function getBrainCapabilityDelegationContract(
  name: string,
): BrainCapabilityDelegationContract {
  const risk = getBrainCapabilityRisk(name);
  if (risk === 'critical') {
    return {
      riskClass: 'R3',
      delegationMode: 'owner_review',
      safeNextStep:
        'Prepare the action for explicit owner approval before every billing, plan, or payment execution.',
      rollback:
        'If approval, amount, recipient, or commercial context is unclear, do not execute and keep the action in owner review.',
    };
  }

  if (risk === 'high') {
    return {
      riskClass: 'R2',
      delegationMode: 'owner_review',
      safeNextStep:
        'Draft the action with evidence and require owner review before customer-facing or workspace-changing execution.',
      rollback:
        'If the owner rejects the draft or the customer signals pressure, cancel the action and return to monitoring.',
    };
  }

  return {
    riskClass: 'R1',
    delegationMode: 'allowed_alone',
    safeNextStep:
      'Execute only when the action is reversible, low risk, and directly removes work from the current user flow.',
    rollback:
      'If evidence weakens or the user corrects the criterion, stop automation and re-evaluate the capability.',
  };
}

export function isBrainCapabilityAllowed(source: BrainSource, name: string): boolean {
  return !SOURCE_BLOCKS[source].has(name);
}
