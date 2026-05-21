import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';

/** Sora. */
export const SORA = "var(--font-sora), 'Sora', sans-serif";
/** Mono. */
export const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";
/** V. */
export const V = {
  s: colors.background.space,
  e: colors.background.nebula,
  b: colors.border.space,
  em: colors.ember.primary,
  t: colors.text.starlight,
  t2: colors.text.moonlight,
  t3: colors.text.dim,
  ta: colors.text.inverted,
  bl: 'var(--app-info)',
  r: 'var(--app-error)',
  g: 'var(--app-success)',
};

/** Product_campaigns_copy. */
export const PRODUCT_CAMPAIGNS_COPY = {
  loadError: kloelT(`Falha ao carregar campanhas`),
  createError: kloelT(`Falha ao criar campanha`),
  deleteError: kloelT(`Falha ao excluir campanha`),
  launchError: kloelT(`Falha ao lancar campanha`),
  pauseError: kloelT(`Falha ao pausar campanha`),
  closeModalAria: kloelT(`Fechar modal`),
  campaignNameAria: kloelT(`Nome da campanha`),
  pixelIdAria: kloelT(`Pixel ID`),
  pixelIdPlaceholder: kloelT(`Ex: 123456789`),
  dismissSymbol: '\u00D7',
  deleteTitle: kloelT(`Excluir campanha`),
  deleteDescription: kloelT(`Tem certeza que deseja excluir esta campanha?`),
  cancel: kloelT(`Cancelar`),
  confirmDelete: kloelT(`Excluir`),
  deleting: kloelT(`Excluindo...`),
  creating: kloelT(`Criando...`),
  create: kloelT(`Criar`),
} as const;

/** Campaign shape. */
export interface Campaign {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Pixel id property. */
  pixelId?: string | null;
  /** Status property. */
  status: string;
  /** Linked campaign id property. */
  linkedCampaignId?: string | null;
  /** Sent count property. */
  sentCount: number;
  /** Delivered count property. */
  deliveredCount: number;
  /** Read count property. */
  readCount: number;
  /** Failed count property. */
  failedCount: number;
  /** Replied count property. */
  repliedCount: number;
  /** Created at property. */
  createdAt?: string;
}

/** To campaign error message. */
export function toCampaignErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Build campaign create body. */
export function buildCampaignCreateBody(name: string, pixelId: string) {
  return {
    name: name.trim(),
    pixelId: pixelId.trim() || undefined,
  };
}

/** Get campaign status label. */
export function getCampaignStatusLabel(status: string) {
  switch (status) {
    case 'ACTIVE':
      return { text: 'Ativa', color: V.g };
    case 'PAUSED':
      return { text: 'Pausada', color: V.t2 };
    case 'COMPLETED':
      return { text: 'Concluida', color: V.bl };
    default:
      return { text: 'Rascunho', color: V.t3 };
  }
}
