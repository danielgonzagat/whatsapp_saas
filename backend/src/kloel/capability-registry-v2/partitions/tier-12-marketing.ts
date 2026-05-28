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
  {
    id: 'instagram.send_dm',
    title: 'Enviar DM Instagram',
    description: 'Envia mensagem direct via Instagram para um contato',
    category: 'COMMUNICATION',
    tier: 12,
    requiresConfirmation: false,
    requiredPermissions: ['instagram:write'],
    inputSchema: [
      { key: 'recipient', type: 'string', label: 'Destinatário', required: true },
      { key: 'message', type: 'string', label: 'Mensagem', required: true },
    ],
    domainService: 'MessagingService.sendInstagramDM',
    emits: ['instagram.dm_sent'],
    surface: ['dashboard-chat'],
  },
  {
    id: 'email.send',
    title: 'Enviar email',
    description: 'Envia um email para um destinatário',
    category: 'COMMUNICATION',
    tier: 12,
    requiresConfirmation: false,
    requiredPermissions: ['email:write'],
    inputSchema: [
      { key: 'to', type: 'string', label: 'Destinatário', required: true },
      { key: 'subject', type: 'string', label: 'Assunto', required: true },
      { key: 'body', type: 'string', label: 'Corpo', required: true },
    ],
    domainService: 'MessagingService.sendEmail',
    emits: ['email.sent'],
    surface: ['dashboard-chat'],
  },
];
