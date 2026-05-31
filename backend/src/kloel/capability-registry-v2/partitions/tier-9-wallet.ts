import { type CapabilityDefinition } from '../capability-registry-v2.types';

/**
 * KLOEL CAPABILITY REGISTRY partition — Tier 9 (wallet).
 *
 * Extracted from capability-registry-v2.const.ts.
 * Consumers should import CAPABILITY_DEFINITIONS from the barrel
 * '../capability-registry-v2.const' rather than this partition directly.
 */
export const TIER_9_WALLET_CAPABILITIES: CapabilityDefinition[] = [
  // ── Canonical (dotted) IDs first, legacy (deprecated) at end ──
  {
    id: 'wallet.balance',
    title: 'Saldo da carteira',
    description: 'Mostra o saldo disponível, pendente e total',
    category: 'QUERY',
    tier: 9,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [],
    // K30 resolver target: bigint-cents shape (source of truth post Wave 2 P6-2).
    domainService: 'WalletService.getBalanceCents',
    emits: [],
    surface: ['dashboard-chat'],
  },
  {
    id: 'wallet.withdraw',
    title: 'Solicitar saque',
    description: 'Solicita saque do saldo disponível para conta bancária',
    category: 'MUTATION_SENSITIVE',
    tier: 9,
    requiresConfirmation: true,
    requiredPermissions: ['wallet:write'],
    inputSchema: [
      {
        key: 'amount',
        type: 'number',
        label: 'Valor (R$)',
        required: true,
        prompt: 'Qual valor do saque?',
      },
    ],
    // K30 resolver target: bigint amountCents + method/pixKey shape (Claude-K35-A).
    domainService: 'WalletService.requestWithdrawalCents',
    emits: ['wallet.withdrawal_requested'],
    surface: ['dashboard-chat'],
  },
  // ── Legacy IDs (deprecated) — superseded by canonical dotted equivalents ──
  {
    id: 'request_withdrawal',
    title: 'Solicitar saque (legado)',
    description: 'DEPRECATED — use wallet.withdraw',
    category: 'MUTATION_SENSITIVE',
    tier: 9,
    requiresConfirmation: true,
    requiredPermissions: ['wallet:write'],
    inputSchema: [{ key: 'amount', type: 'number', label: 'Valor (R$)', required: true }],
    domainService: 'WalletService.withdraw',
    emits: ['wallet.withdrawal_requested'],
    surface: ['dashboard-chat'],
    maturity: 'deprecated',
    dependsOn: ['wallet.withdraw'],
  },
  {
    id: 'request_anticipation',
    title: 'Solicitar antecipação (legado)',
    description: 'DEPRECATED — use wallet.anticipate',
    category: 'MUTATION_SENSITIVE',
    tier: 9,
    requiresConfirmation: true,
    requiredPermissions: ['wallet:write'],
    inputSchema: [],
    domainService: 'WalletService.anticipate',
    emits: ['wallet.anticipation_requested'],
    surface: ['dashboard-chat'],
    maturity: 'deprecated',
    dependsOn: ['wallet.anticipate'],
  },
];
