import { kloelT } from '@/lib/i18n/t';

/** Ai_learn_badges. */
export const AI_LEARN_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'var(--app-bg-hover)', text: 'var(--app-text-secondary)', label: 'Aguardando' },
  learning: { bg: 'var(--app-accent-light)', text: 'var(--app-accent)', label: 'Aprendendo...' },
  learned: { bg: 'var(--app-success-bg)', text: 'var(--app-success)', label: 'Aprendido' },
  error: { bg: 'var(--app-error-bg)', text: 'var(--app-error)', label: 'Erro' },
};

/** Ai_learn_options. */
export const AI_LEARN_OPTIONS = [
  'Preços',
  'Benefícios',
  'Perguntas frequentes',
  'Depoimentos',
  'Especificações técnicas',
  'Políticas',
];

/** Update_freq. */
export const UPDATE_FREQ = [
  { v: 'manual', l: 'Manual' },
  { v: 'weekly', l: 'Semanal' },
  { v: 'biweekly', l: 'Quinzenal' },
  { v: 'monthly', l: 'Mensal' },
];

/** Widget_positions. */
export const WIDGET_POSITIONS = [
  { v: 'bottom-right', l: 'Canto inferior direito' },
  { v: 'bottom-left', l: 'Canto inferior esquerdo' },
];

/** Trigger_timings. */
export const TRIGGER_TIMINGS = [
  { v: '0', l: 'Imediato' },
  { v: '3000', l: '3 segundos' },
  { v: '5000', l: '5 segundos' },
  { v: '10000', l: '10 segundos' },
  { v: '30000', l: '30 segundos' },
  { v: 'exit', l: 'Exit intent' },
];

/** Product_urls_copy. */
export const PRODUCT_URLS_COPY = {
  loadError: kloelT(`Falha ao carregar URLs do produto`),
  createError: kloelT(`Falha ao adicionar URL`),
  deleteError: kloelT(`Falha ao excluir URL`),
  descriptionAria: kloelT(`Descricao da URL`),
  pageUrlAria: kloelT(`URL da pagina`),
  widgetColorPickerAria: kloelT(`Cor primaria do widget seletor`),
  widgetColorHexAria: kloelT(`Cor primaria do widget hex`),
  widgetMessageAria: kloelT(`Mensagem inicial do widget`),
  urlPlaceholder: kloelT(`https://...`),
  addUrl: kloelT(`Adicionar`),
  addingUrl: kloelT(`Adicionando...`),
  deleteUrlAria: kloelT(`Excluir URL`),
  closeErrorAria: kloelT(`Fechar erro`),
  deleteTitle: kloelT(`Excluir URL`),
  deleteDescription: kloelT(`Tem certeza que deseja excluir esta URL?`),
  cancel: kloelT(`Cancelar`),
  confirmDelete: kloelT(`Excluir`),
  deleting: kloelT(`Excluindo...`),
  yes: kloelT(`SIM`),
  no: kloelT(`NÃO`),
  active: kloelT(`ATIVO`),
  inactive: kloelT(`INATIVO`),
  aiOff: kloelT(`OFF`),
  chatOn: kloelT(`ON`),
  chatOff: kloelT(`OFF`),
} as const;

/** To product url error message. */
export function toProductUrlErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
