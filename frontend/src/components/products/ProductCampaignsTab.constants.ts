import { kloelT } from '@/lib/i18n/t';

export const SORA = "var(--font-sora), 'Sora', sans-serif";
export const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";
export const V = {
  s: 'var(--bg-space, #111113)',
  e: 'var(--bg-nebula, #19191C)',
  b: 'var(--border-space, #222226)',
  em: '#E85D30',
  t: 'var(--text-starlight, #E0DDD8)',
  t2: 'var(--text-moonlight, #6E6E73)',
  t3: 'var(--text-dust, #3A3A3F)',
  ta: 'var(--app-text-on-accent, #0A0A0C)',
  bl: 'var(--app-info)',
  r: 'var(--app-error)',
  g: 'var(--app-success)',
};

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

export interface Campaign {
  id: string;
  name: string;
  pixelId?: string | null;
  status: string;
  linkedCampaignId?: string | null;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  repliedCount: number;
  createdAt?: string;
}

export function toCampaignErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function buildCampaignCreateBody(name: string, pixelId: string) {
  return {
    name: name.trim(),
    pixelId: pixelId.trim() || undefined,
  };
}

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
