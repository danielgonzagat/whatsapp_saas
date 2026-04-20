// Pure data helpers extracted from WhatsAppExperience.tsx to reduce
// cyclomatic complexity. No React, no JSX — these are payload-shape
// transforms only.

export const STEPS = ['Conectar', 'Produtos', 'Arsenal', 'Configurar'] as const;
export const WAHA_QR_POLL_INTERVAL_MS = 1200;
export const WAHA_QR_TRANSITION_DELAY_MS = 150;

const ICON_PHOTO = String.fromCodePoint(0x1f4f8);
const ICON_VIDEO = String.fromCodePoint(0x1f3ac);
const ICON_AUDIO = String.fromCodePoint(0x1f399, 0xfe0f);
const ICON_TESTIMONIAL = String.fromCodePoint(0x1f4ac);
const ICON_RESULT = String.fromCodePoint(0x1f4ca);
const ICON_DOCUMENT = String.fromCodePoint(0x1f4c4);
const ICON_BONUS = String.fromCodePoint(0x1f381);

export const MEDIA_TYPES = [
  { value: 'photo', label: 'Foto do produto', icon: ICON_PHOTO },
  { value: 'video', label: 'Vídeo de demonstração', icon: ICON_VIDEO },
  { value: 'audio', label: 'Áudio / Depoimento', icon: ICON_AUDIO },
  { value: 'testimonial', label: 'Print de depoimento', icon: ICON_TESTIMONIAL },
  { value: 'result', label: 'Prova de resultado', icon: ICON_RESULT },
  { value: 'document', label: 'Documento / Certificado', icon: ICON_DOCUMENT },
  { value: 'bonus', label: 'Bônus incluído', icon: ICON_BONUS },
] as const;

export const TONE_OPTIONS = [
  ['professional', 'Profissional', 'Direto, confiante, corporativo'],
  ['friendly', 'Amigável', 'Próximo, descontraído, caloroso'],
  ['urgent', 'Urgente', 'Escassez, exclusividade, ação'],
] as const;

export const SESSION_EXPIRED_MESSAGE =
  'Sua sessão expirou. Recarregue a página e faça login novamente para continuar acompanhando o WhatsApp.';

export type ProductKind = 'own' | 'affiliate';
export type ToneMode = (typeof TONE_OPTIONS)[number][0];
export type MediaTypeValue = (typeof MEDIA_TYPES)[number]['value'];

export function isToneMode(value: unknown): value is ToneMode {
  return typeof value === 'string' && TONE_OPTIONS.some(([option]) => option === value);
}

export interface SelectableProduct {
  id: string;
  name: string;
  price: number;
  type: ProductKind;
  imageUrl: string | null;
  affiliateComm: number | null;
  producer: string | null;
}

export interface ArsenalItem {
  id: string;
  fileName: string;
  url: string;
  type: MediaTypeValue | '';
  productId: string;
  description: string;
  mimeType?: string | null;
  size?: number | null;
}

export interface WhatsAppSetupConfig {
  tone: ToneMode;
  maxDiscount: number;
  followUp: boolean;
  followUpHours: number;
  workingHours: string;
  greeting: string;
}

export interface WhatsAppSetupState {
  version: number;
  sessionName: string;
  selectedProducts: SelectableProduct[];
  arsenal: ArsenalItem[];
  config: WhatsAppSetupConfig;
  configuredAt: string | null;
  activatedAt: string | null;
  lastCompletedStep: number;
  updatedAt: string | null;
}

export function getErrorMessage(error: unknown, fallback = 'Erro desconhecido') {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

export function getErrorStatus(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status;
  }

  return 0;
}

export function nowIso() {
  return new Date().toISOString();
}

export function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toStringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatCompact(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  if (safe >= 1000) {
    return `${(safe / 1000).toFixed(1)}k`;
  }
  return String(safe);
}

export function buildDefaultSetup(workspaceId: string): WhatsAppSetupState {
  return {
    version: 1,
    sessionName: workspaceId,
    selectedProducts: [],
    arsenal: [],
    config: {
      tone: 'professional',
      maxDiscount: 10,
      followUp: true,
      followUpHours: 24,
      workingHours: '08:00-22:00',
      greeting: '',
    },
    configuredAt: null,
    activatedAt: null,
    lastCompletedStep: 0,
    updatedAt: null,
  };
}

export function resolveWorkingHours(raw: unknown) {
  if (typeof raw === 'string' && raw.includes('-')) {
    return raw;
  }

  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const start = toStringValue(record.start || record.workingHoursStart, '08:00');
  const end = toStringValue(record.end || record.workingHoursEnd, '22:00');
  return `${start}-${end}`;
}

export function resolveProductImageUrl(product: Record<string, unknown>): string | null {
  if (typeof product.imageUrl === 'string') {
    return product.imageUrl;
  }
  if (typeof product.image === 'string') {
    return product.image;
  }
  return null;
}

export function resolveProducerField(product: Record<string, unknown>): string | null {
  const producer = product.producer;
  if (typeof producer === 'string' && producer.trim()) {
    return producer;
  }
  return null;
}

export function normalizeSelectedProduct(raw: Record<string, unknown>): SelectableProduct {
  return {
    id: String(raw.id || raw.productId || ''),
    name: toStringValue(raw.name, 'Produto'),
    price: toNumber(raw.price),
    type: raw.type === 'affiliate' ? 'affiliate' : 'own',
    imageUrl: resolveProductImageUrl(raw),
    affiliateComm: raw.affiliateComm == null ? null : toNumber(raw.affiliateComm, 0),
    producer: resolveProducerField(raw),
  };
}

export function normalizeSelectedProducts(value: unknown): SelectableProduct[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(normalizeSelectedProduct)
    .filter((product) => product.id);
}

export function normalizeArsenalMediaType(value: unknown): MediaTypeValue | '' {
  return (MEDIA_TYPES.some((option) => option.value === value) ? value : '') as MediaTypeValue | '';
}

export function normalizeArsenalItem(raw: Record<string, unknown>): ArsenalItem {
  return {
    id: String(raw.id || crypto.randomUUID()),
    fileName: toStringValue(raw.fileName, 'arquivo'),
    url: toStringValue(raw.url),
    type: normalizeArsenalMediaType(raw.type),
    productId: toStringValue(raw.productId),
    description: toStringValue(raw.description),
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : null,
    size: raw.size == null ? null : toNumber(raw.size, 0),
  };
}

export function normalizeArsenal(value: unknown): ArsenalItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(normalizeArsenalItem);
}

export function resolveFollowUp(config: Record<string, unknown>, fallbackValue: boolean): boolean {
  if (typeof config.followUp === 'boolean') {
    return config.followUp;
  }
  if (typeof config.followUpEnabled === 'boolean') {
    return config.followUpEnabled;
  }
  return fallbackValue;
}

export function normalizeConfig(
  config: Record<string, unknown>,
  fallback: WhatsAppSetupConfig,
): WhatsAppSetupConfig {
  return {
    tone: isToneMode(config.tone) ? config.tone : fallback.tone,
    maxDiscount: Math.min(50, Math.max(0, toNumber(config.maxDiscount, 10))),
    followUp: resolveFollowUp(config, fallback.followUp),
    followUpHours: Math.min(72, Math.max(1, toNumber(config.followUpHours, 24))),
    workingHours: resolveWorkingHours(config.workingHours || config),
    greeting: toStringValue(config.greeting || config.instructions),
  };
}

export function normalizeSetup(raw: unknown, workspaceId: string): WhatsAppSetupState {
  const fallback = buildDefaultSetup(workspaceId);
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const selectedProducts = normalizeSelectedProducts(value.selectedProducts);
  const arsenal = normalizeArsenal(value.arsenal);
  const config =
    value.config && typeof value.config === 'object'
      ? (value.config as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  return {
    version: toNumber(value.version, 1),
    sessionName: toStringValue(value.sessionName, workspaceId) || workspaceId,
    selectedProducts,
    arsenal,
    config: normalizeConfig(config, fallback.config),
    configuredAt: typeof value.configuredAt === 'string' ? value.configuredAt : null,
    activatedAt: typeof value.activatedAt === 'string' ? value.activatedAt : null,
    lastCompletedStep: Math.min(3, Math.max(0, toNumber(value.lastCompletedStep, 0))),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
  };
}

export function serializeSetup(setup: WhatsAppSetupState) {
  return {
    ...setup,
    config: {
      ...setup.config,
      followUpEnabled: setup.config.followUp,
      instructions: setup.config.greeting,
      workingHours: setup.config.workingHours,
    },
  };
}

export function resolveProductImage(product: Record<string, unknown>) {
  if (typeof product.imageUrl === 'string' && product.imageUrl.trim()) {
    return product.imageUrl;
  }
  if (Array.isArray(product.images)) {
    const first = product.images.find((item) => typeof item === 'string' && item.trim());
    if (typeof first === 'string') {
      return first;
    }
  }
  return null;
}

export function normalizeOwnedProduct(raw: unknown): SelectableProduct | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const product = raw as Record<string, unknown>;
  const status = String(product.status || '').toUpperCase();
  if (status && status !== 'APPROVED') {
    return null;
  }
  if (product.active === false) {
    return null;
  }
  const id = String(product.id || '').trim();
  if (!id) {
    return null;
  }

  return {
    id,
    name: toStringValue(product.name, 'Produto'),
    price: toNumber(product.price),
    type: 'own',
    imageUrl: resolveProductImage(product),
    affiliateComm: null,
    producer: null,
  };
}

export function normalizeAffiliateProducts(raw: unknown): SelectableProduct[] {
  const payload = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const items = Array.isArray(payload.products) ? payload.products : [];

  return items
    .map<SelectableProduct | null>((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const request = item as Record<string, unknown>;
      const affiliateProduct = (
        request.affiliateProduct && typeof request.affiliateProduct === 'object'
          ? request.affiliateProduct
          : {}
      ) as Record<string, unknown>;
      if (request.status !== 'APPROVED' && affiliateProduct.isApproved !== true) {
        return null;
      }

      const id = String(affiliateProduct.id || request.affiliateProductId || '').trim();
      if (!id) {
        return null;
      }

      return {
        id,
        name: toStringValue(affiliateProduct.name, 'Produto afiliado'),
        price: toNumber(affiliateProduct.price),
        type: 'affiliate',
        imageUrl:
          typeof affiliateProduct.imageUrl === 'string'
            ? affiliateProduct.imageUrl
            : typeof affiliateProduct.thumbnailUrl === 'string'
              ? affiliateProduct.thumbnailUrl
              : null,
        affiliateComm:
          affiliateProduct.commission == null ? null : toNumber(affiliateProduct.commission, 0),
        producer:
          typeof affiliateProduct.producer === 'string' && affiliateProduct.producer.trim()
            ? affiliateProduct.producer
            : 'Marketplace',
      };
    })
    .filter((item): item is SelectableProduct => Boolean(item));
}

const PRODUCT_ICON_AFFILIATE = String.fromCodePoint(0x1f517);
const PRODUCT_ICON_COURSE = String.fromCodePoint(0x1f393);
const PRODUCT_ICON_KIT = String.fromCodePoint(0x1f4cb);
const PRODUCT_ICON_DEFAULT = String.fromCodePoint(0x1f4e6);

export function getProductIcon(product: SelectableProduct) {
  if (product.imageUrl) {
    return null;
  }
  const name = product.name.toLowerCase();
  if (product.type === 'affiliate') {
    return PRODUCT_ICON_AFFILIATE;
  }
  if (name.includes('curso') || name.includes('class')) {
    return PRODUCT_ICON_COURSE;
  }
  if (name.includes('kit') || name.includes('template')) {
    return PRODUCT_ICON_KIT;
  }
  return PRODUCT_ICON_DEFAULT;
}
