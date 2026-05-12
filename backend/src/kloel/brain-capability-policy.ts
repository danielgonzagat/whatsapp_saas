import type { BrainSource } from './brain-runtime.dto';

export type BrainCapabilityRisk = 'critical' | 'high' | 'normal';

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
  chat: new Set(),
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

export function isBrainCapabilityAllowed(source: BrainSource, name: string): boolean {
  return !SOURCE_BLOCKS[source].has(name);
}
