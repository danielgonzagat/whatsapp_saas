import { kloelFormatNumber, kloelT } from '@/lib/i18n/t';

/** Commission shape returned by the backend for a product. */
export interface Commission {
  /** Commission id. */
  id: string;
  /** Commission role enum value (e.g. AFFILIATE, MANAGER, COPRODUCER). */
  role: string;
  /** Commission percentage as a number. */
  percentage: number;
  /** Optional agent name (nullable). */
  agentName: string | null;
  /** Optional agent email (nullable). */
  agentEmail: string | null;
}

/** Commission form shape used by ProductCommissionsTab. */
export interface CommissionForm {
  /** Role select value. */
  role: string;
  /** Percentage value (string from numeric input). */
  percentage: string;
  /** Agent name input value. */
  agentName: string;
  /** Agent email input value. */
  agentEmail: string;
}

/** Commission payload sent to POST/PUT /products/:id/commissions endpoints. */
export interface CommissionPayload {
  /** Role value. */
  role: string;
  /** Percentage as a number. */
  percentage: number;
  /** Agent name string. */
  agentName: string;
  /** Agent email string. */
  agentEmail: string;
}

/** Commission role option as rendered in the select. */
export interface CommissionRoleOption {
  /** Enum value sent to the backend. */
  value: string;
  /** Localized label rendered in the UI. */
  label: string;
}

/** Available commission roles for the role select. */
export const ROLES: readonly CommissionRoleOption[] = [
  { value: 'COPRODUCER', label: 'Coprodutor' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'AFFILIATE', label: 'Afiliado' },
] as const;

/** Empty commission form (default state when opening the create modal). */
export const EMPTY_COMMISSION_FORM: CommissionForm = {
  role: 'AFFILIATE',
  percentage: '',
  agentName: '',
  agentEmail: '',
} as const;

/** Localized copy used by the ProductCommissionsTab. */
export const PRODUCT_COMMISSIONS_COPY = {
  loadError: kloelT(`Falha ao carregar comissoes`),
  saveError: kloelT(`Falha ao salvar comissao`),
  deleteError: kloelT(`Falha ao excluir comissao`),
  deleteTitle: kloelT(`Excluir comissao`),
  deleteDescription: kloelT(`Tem certeza que deseja excluir esta comissao?`),
  cancel: kloelT(`Cancelar`),
  confirmDelete: kloelT(`Excluir`),
  deleting: kloelT(`Excluindo...`),
  editingTitle: kloelT(`Editar comissao`),
  newTitle: kloelT(`Nova comissao`),
  closeModalAria: kloelT(`Fechar modal`),
  closeErrorAria: kloelT(`Fechar erro`),
  saving: kloelT(`Salvando...`),
  save: kloelT(`Salvar`),
  add: kloelT(`Adicionar`),
} as const;

/** Convert a thrown error into a user-facing string, falling back to a default message. */
export function toCommissionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Build the payload sent to the commissions endpoints from form values. */
export function buildCommissionPayload(form: CommissionForm): CommissionPayload {
  return { ...form, percentage: Number.parseFloat(form.percentage) || 0 };
}

/** Normalize an API response into a strictly typed Commission array. */
export function normalizeCommissionList(response: unknown): Commission[] {
  const responseRecord = response && typeof response === 'object' && !Array.isArray(response)
    ? (response as { data?: unknown })
    : null;
  const list = Array.isArray(response) ? response : responseRecord?.data;
  if (!Array.isArray(list)) {
    throw new Error('Payload de comissoes invalido.');
  }
  return list as Commission[];
}

/** Resolve the role label for a given role value (falls back to the raw value). */
export function resolveCommissionRoleLabel(value: unknown): string {
  const match = ROLES.find((role) => role.value === value);
  if (match) {
    return match.label;
  }
  return String(value ?? '');
}

/** Format a commission percentage with a single fraction digit and trailing percent sign. */
export function formatCommissionPercentage(value: unknown): string {
  return `${kloelFormatNumber(Number(value), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** Build a CommissionForm pre-populated from an existing commission (for the edit modal). */
export function buildCommissionFormFromCommission(commission: Commission): CommissionForm {
  return {
    role: commission.role,
    percentage: String(commission.percentage),
    agentName: commission.agentName || '',
    agentEmail: commission.agentEmail || '',
  };
}

/** Resolve a human-readable label for a commission pending deletion. */
export function describeCommissionForDeletion(commission: Commission): string {
  return commission.agentEmail || commission.agentName || commission.role;
}

/** SWR cache predicate that matches any /products key (used by mutate after save). */
export function isProductsSwrKey(key: unknown): boolean {
  return typeof key === 'string' && key.startsWith('/products');
}
