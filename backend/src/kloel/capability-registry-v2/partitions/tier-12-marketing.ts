import { type CapabilityDefinition } from '../capability-registry-v2.types';

/**
 * KLOEL CAPABILITY REGISTRY partition — Tier 12 (marketing).
 *
 * Extracted from capability-registry-v2.const.ts.
 * Consumers should import CAPABILITY_DEFINITIONS from the barrel
 * '../capability-registry-v2.const' rather than this partition directly.
 */
export const TIER_12_MARKETING_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'whatsapp.send',
    title: 'Enviar WhatsApp',
    description: 'Envia mensagem de WhatsApp para um contato',
    category: 'COMMUNICATION',
    tier: 12,
    requiresConfirmation: false,
    requiredPermissions: ['whatsapp:write'],
    inputSchema: [
      { key: 'phone', type: 'string', label: 'Telefone', required: true },
      { key: 'message', type: 'string', label: 'Mensagem', required: true },
    ],
    domainService: 'MessagingService.sendWhatsApp',
    emits: ['whatsapp.message_sent'],
    surface: ['dashboard-chat'],
  },
];
