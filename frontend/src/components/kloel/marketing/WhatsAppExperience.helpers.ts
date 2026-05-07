// Pure data helpers extracted from WhatsAppExperience.tsx to reduce
// cyclomatic complexity. No React, no JSX — these are payload-shape
// transforms only.

export const STEPS = ['Conectar', 'Produtos', 'Arsenal', 'Configurar'] as const;
/** Waha_qr_poll_interval_ms. */
export const WAHA_QR_POLL_INTERVAL_MS = 1200;
/** Waha_qr_transition_delay_ms. */
export const WAHA_QR_TRANSITION_DELAY_MS = 150;

const ICON_PHOTO = String.fromCodePoint(0x1f4f8);
const ICON_VIDEO = String.fromCodePoint(0x1f3ac);
const ICON_AUDIO = String.fromCodePoint(0x1f399, 0xfe0f);
const ICON_TESTIMONIAL = String.fromCodePoint(0x1f4ac);
const ICON_RESULT = String.fromCodePoint(0x1f4ca);
const ICON_DOCUMENT = String.fromCodePoint(0x1f4c4);
const ICON_BONUS = String.fromCodePoint(0x1f381);

/** Media_types. */
export const MEDIA_TYPES = [
  { value: 'photo', label: 'Foto do produto', icon: ICON_PHOTO },
  { value: 'video', label: 'Vídeo de demonstração', icon: ICON_VIDEO },
  { value: 'audio', label: 'Áudio / Depoimento', icon: ICON_AUDIO },
  { value: 'testimonial', label: 'Print de depoimento', icon: ICON_TESTIMONIAL },
  { value: 'result', label: 'Prova de resultado', icon: ICON_RESULT },
  { value: 'document', label: 'Documento / Certificado', icon: ICON_DOCUMENT },
  { value: 'bonus', label: 'Bônus incluído', icon: ICON_BONUS },
] as const;

/** Tone_options. */
export const TONE_OPTIONS = [
  ['professional', 'Profissional', 'Direto, confiante, corporativo'],
  ['friendly', 'Amigável', 'Próximo, descontraído, caloroso'],
  ['urgent', 'Urgente', 'Escassez, exclusividade, ação'],
] as const;

/** Session_expired_message. */
export const SESSION_EXPIRED_MESSAGE =
  'Sua sessão expirou. Recarregue a página e faça login novamente para continuar acompanhando o WhatsApp.';

/** Product kind type. */
export type ProductKind = 'own' | 'affiliate';
/** Tone mode type. */
export type ToneMode = (typeof TONE_OPTIONS)[number][0];
/** Media type value type. */
export type MediaTypeValue = (typeof MEDIA_TYPES)[number]['value'];

/** Is tone mode. */
export function isToneMode(value: unknown): value is ToneMode {
  return typeof value === 'string' && TONE_OPTIONS.some(([option]) => option === value);
}

/** Selectable product shape. */
export interface SelectableProduct {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Price property. */
  price: number;
  /** Type property. */
  type: ProductKind;
  /** Image url property. */
  imageUrl: string | null;
  /** Affiliate comm property. */
  affiliateComm: number | null;
  /** Producer property. */
  producer: string | null;
}

/** Summary product card extends SelectableProduct with sales metrics. */
export interface SummaryProductCard extends SelectableProduct {
  /** Sales count. */
  salesCount: number;
  /** Revenue. */
  revenue: number;
}

/** Arsenal item shape. */
export interface ArsenalItem {
  /** Id property. */
  id: string;
  /** File name property. */
  fileName: string;
  /** Url property. */
  url: string;
  /** Type property. */
  type: MediaTypeValue | '';
  /** Product id property. */
  productId: string;
  /** Description property. */
  description: string;
  /** Mime type property. */
  mimeType?: string | null;
  /** Size property. */
  size?: number | null;
}

/** Whats app setup config shape. */
export interface WhatsAppSetupConfig {
  /** Tone property. */
  tone: ToneMode;
  /** Max discount property. */
  maxDiscount: number;
  /** Follow up property. */
  followUp: boolean;
  /** Follow up hours property. */
  followUpHours: number;
  /** Working hours property. */
  workingHours: string;
  /** Greeting property. */
  greeting: string;
}

/** Whats app setup state shape. */
export interface WhatsAppSetupState {
  /** Version property. */
  version: number;
  /** Session name property. */
  sessionName: string;
  /** Selected products property. */
  selectedProducts: SelectableProduct[];
  /** Arsenal property. */
  arsenal: ArsenalItem[];
  /** Config property. */
  config: WhatsAppSetupConfig;
  /** Configured at property. */
  configuredAt: string | null;
  /** Activated at property. */
  activatedAt: string | null;
  /** Last completed step property. */
  lastCompletedStep: number;
  /** Updated at property. */
  updatedAt: string | null;
}

/** Get error message. */
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

/** Get error status. */
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

/** Now iso. */
export function nowIso() {
  return new Date().toISOString();
}

/** To number. */
export function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** To string value. */
export function toStringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

/** Format money. */
export function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

/** Format compact. */
export function formatCompact(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  if (safe >= 1000) {
    return `${(safe / 1000).toFixed(1)}k`;
  }
  return String(safe);
}

/** Build default setup. */
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

/** Resolve working hours. */
export function resolveWorkingHours(raw: unknown) {
  if (typeof raw === 'string' && raw.includes('-')) {
    return raw;
  }

  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const start = toStringValue(record.start || record.workingHoursStart, '08:00');
  const end = toStringValue(record.end || record.workingHoursEnd, '22:00');
  return `${start}-${end}`;
}

/** Resolve product image url. */
export function resolveProductImageUrl(product: Record<string, unknown>): string | null {
  if (typeof product.imageUrl === 'string') {
    return product.imageUrl;
  }
  if (typeof product.image === 'string') {
    return product.image;
  }
  return null;
}

/** Resolve producer field. */
export function resolveProducerField(product: Record<string, unknown>): string | null {
  const producer = product.producer;
  if (typeof producer === 'string' && producer.trim()) {
    return producer;
  }
  return null;
}

/** Normalize selected product. */
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

/** Normalize selected products. */
export function normalizeSelectedProducts(value: unknown): SelectableProduct[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(normalizeSelectedProduct)
    .filter((product) => product.id);
}

/** Normalize arsenal media type. */
export function normalizeArsenalMediaType(value: unknown): MediaTypeValue | '' {
  return (MEDIA_TYPES.some((option) => option.value === value) ? value : '') as MediaTypeValue | '';
}

/** Normalize arsenal item. */
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

/** Normalize arsenal. */
export function normalizeArsenal(value: unknown): ArsenalItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(normalizeArsenalItem);
}

/** Resolve follow up. */
export function resolveFollowUp(config: Record<string, unknown>, fallbackValue: boolean): boolean {
  if (typeof config.followUp === 'boolean') {
    return config.followUp;
  }
  if (typeof config.followUpEnabled === 'boolean') {
    return config.followUpEnabled;
  }
  return fallbackValue;
}

/** Normalize config. */
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

/** Normalize setup. */
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

/** Serialize setup. */
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

/** Resolve product image. */
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

/** Normalize owned product. */
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

/** Normalize affiliate products. */
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

/** Get product icon. */
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
