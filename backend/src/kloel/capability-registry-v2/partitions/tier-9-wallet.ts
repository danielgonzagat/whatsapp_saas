import { type CapabilityDefinition } from '../capability-registry-v2.types';

/**
 * KLOEL CAPABILITY REGISTRY partition — Tier 9 (wallet).
 *
 * Extracted from capability-registry-v2.const.ts.
 * Consumers should import CAPABILITY_DEFINITIONS from the barrel
 * '../capability-registry-v2.const' rather than this partition directly.
 */
export const TIER_9_WALLET_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'request_withdrawal',
    title: 'Solicitar saque',
    description: 'Solicita saque do saldo disponível',
    category: 'MUTATION_SENSITIVE',
    tier: 9,
    requiresConfirmation: true,
    requiredPermissions: ['wallet:write'],
    inputSchema: [{ key: 'amount', type: 'number', label: 'Valor (R$)', required: true }],
    domainService: 'WalletService.withdraw',
    emits: ['wallet.withdrawal_requested'],
    surface: ['dashboard-chat'],
  },
  {
    id: 'request_anticipation',
    title: 'Solicitar antecipação',
    description: 'Solicita antecipação de recebíveis',
    category: 'MUTATION_SENSITIVE',
    tier: 9,
    requiresConfirmation: true,
    requiredPermissions: ['wallet:write'],
    inputSchema: [],
    domainService: 'WalletService.anticipate',
    emits: ['wallet.anticipation_requested'],
    surface: ['dashboard-chat'],
  },
  {
    id: 'wallet.balance',
    title: 'Saldo da carteira',
    description: 'Mostra o saldo disponível, pendente e total',
    category: 'QUERY',
    tier: 9,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [],
    domainService: 'WalletService.getBalance',
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
    domainService: 'WalletService.requestWithdrawal',
    emits: ['wallet.withdrawal_requested'],
    surface: ['dashboard-chat'],
  },
];
