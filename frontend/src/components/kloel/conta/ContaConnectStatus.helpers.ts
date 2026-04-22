import type { WorkspaceConnectAccount } from '@/hooks/useConnectAccounts';

export type SellerConnectState =
  | 'not_started'
  | 'action_required'
  | 'in_review'
  | 'restricted'
  | 'active';

export interface SellerConnectSummary {
  state: SellerConnectState;
  label: string;
  description: string;
  requirements: string[];
  disabledReason: string | null;
}

function startCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

export function humanizeConnectRequirement(code: string): string {
  const normalized = String(code || '').trim();
  if (!normalized) {
    return 'Dados adicionais do cadastro';
  }

  const exactMap: Record<string, string> = {
    business_profile: 'Dados públicos do negócio',
    'business_profile.mcc': 'Categoria do negócio',
    'business_profile.name': 'Nome público do negócio',
    'business_profile.product_description': 'Descrição do produto ou serviço',
    'business_profile.support_email': 'Email de suporte',
    'business_profile.support_phone': 'Telefone de suporte',
    'business_profile.support_url': 'Site de suporte',
    'business_profile.url': 'Site do negócio',
    company: 'Dados da empresa',
    'company.address': 'Endereço da empresa',
    'company.address.city': 'Cidade da empresa',
    'company.address.line1': 'Rua e número da empresa',
    'company.address.postal_code': 'CEP da empresa',
    'company.address.state': 'Estado da empresa',
    'company.name': 'Razão social',
    'company.phone': 'Telefone da empresa',
    'company.tax_id': 'CNPJ da empresa',
    external_account: 'Dados bancários',
    individual: 'Dados da pessoa responsável',
    'individual.address': 'Endereço da pessoa responsável',
    'individual.address.city': 'Cidade da pessoa responsável',
    'individual.address.line1': 'Rua e número da pessoa responsável',
    'individual.address.postal_code': 'CEP da pessoa responsável',
    'individual.address.state': 'Estado da pessoa responsável',
    'individual.dob.day': 'Dia de nascimento da pessoa responsável',
    'individual.dob.month': 'Mês de nascimento da pessoa responsável',
    'individual.dob.year': 'Ano de nascimento da pessoa responsável',
    'individual.email': 'Email da pessoa responsável',
    'individual.first_name': 'Nome da pessoa responsável',
    'individual.id_number': 'CPF da pessoa responsável',
    'individual.last_name': 'Sobrenome da pessoa responsável',
    'individual.phone': 'Telefone da pessoa responsável',
    'individual.verification.document': 'Documento da pessoa responsável',
    'individual.verification.additional_document': 'Documento adicional da pessoa responsável',
    'individual.verification.proof_of_liveness': 'Prova de identidade da pessoa responsável',
    'tos_acceptance.date': 'Aceite dos termos de uso',
    'tos_acceptance.ip': 'Confirmação de aceite dos termos',
  };

  const exact = exactMap[normalized];
  if (exact) {
    return exact;
  }

  if (normalized.startsWith('external_account')) {
    return 'Dados bancários';
  }
  if (normalized.startsWith('company.tax_id')) {
    return 'CNPJ da empresa';
  }
  if (normalized.startsWith('company.address')) {
    return 'Endereço da empresa';
  }
  if (normalized.startsWith('individual.verification')) {
    return 'Documentação da pessoa responsável';
  }
  if (normalized.startsWith('individual.address')) {
    return 'Endereço da pessoa responsável';
  }
  if (normalized.startsWith('individual.dob')) {
    return 'Data de nascimento da pessoa responsável';
  }
  if (normalized.startsWith('individual')) {
    return 'Dados da pessoa responsável';
  }
  if (normalized.startsWith('company')) {
    return 'Dados da empresa';
  }
  if (normalized.startsWith('business_profile')) {
    return 'Dados públicos do negócio';
  }
  if (normalized.startsWith('tos_acceptance')) {
    return 'Aceite dos termos de uso';
  }

  return startCase(normalized.replaceAll('.', ' ').replaceAll('_', ' '));
}

export function humanizeConnectDisabledReason(reason: string | null | undefined): string | null {
  const normalized = String(reason || '').trim();
  if (!normalized) {
    return null;
  }

  const reasonMap: Record<string, string> = {
    listed: 'A conta de recebimento está temporariamente indisponível para revisão manual.',
    'rejected.fraud': 'A conta de recebimento foi bloqueada por análise de risco.',
    'rejected.listed': 'A conta de recebimento foi bloqueada para revisão manual.',
    'requirements.past_due': 'Existem pendências vencidas no cadastro da conta de recebimento.',
    under_review: 'O cadastro está em revisão adicional antes da ativação completa.',
  };

  return reasonMap[normalized] || 'Existe uma restrição temporária na conta de recebimento.';
}

export function summarizeSellerConnectAccount(
  account: WorkspaceConnectAccount | null | undefined,
): SellerConnectSummary {
  if (!account) {
    return {
      state: 'not_started',
      label: 'Ainda não iniciado',
      description:
        'Sua conta de recebimento será criada quando o cadastro completo for enviado para análise.',
      requirements: [],
      disabledReason: null,
    };
  }

  const onboarding = account.onboarding;
  if (!onboarding) {
    return {
      state: 'in_review',
      label: 'Sincronizando',
      description:
        'A conta de recebimento já existe e os dados estão sendo sincronizados para exibir o status atualizado.',
      requirements: [],
      disabledReason: null,
    };
  }

  const requirements = dedupe(
    [...onboarding.requirementsPastDue, ...onboarding.requirementsCurrentlyDue].map(
      humanizeConnectRequirement,
    ),
  );
  const disabledReason = humanizeConnectDisabledReason(onboarding.requirementsDisabledReason);

  if (onboarding.chargesEnabled && onboarding.payoutsEnabled) {
    return {
      state: 'active',
      label: 'Ativa',
      description:
        'A conta de recebimento está pronta para processar vendas e liberar saques conforme as regras do seu saldo.',
      requirements,
      disabledReason,
    };
  }

  if (onboarding.requirementsPastDue.length > 0 || disabledReason) {
    return {
      state: 'restricted',
      label: 'Restrita',
      description:
        'Existem pendências vencidas ou uma restrição operacional que precisa ser regularizada para manter os recebimentos ativos.',
      requirements,
      disabledReason,
    };
  }

  if (onboarding.requirementsCurrentlyDue.length > 0 || !onboarding.detailsSubmitted) {
    return {
      state: 'action_required',
      label: 'Ação necessária',
      description:
        'Ainda faltam dados ou documentos para concluir a ativação da conta de recebimento.',
      requirements,
      disabledReason,
    };
  }

  return {
    state: 'in_review',
    label: 'Em verificação',
    description:
      'O cadastro foi enviado e está em verificação. Novas pendências aparecerão aqui caso sejam solicitadas.',
    requirements,
    disabledReason,
  };
}
