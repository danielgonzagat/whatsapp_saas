'use client';

import { useProducts } from '@/hooks/useProducts';
import { affiliateApi } from '@/lib/api/misc';
import {
  type WhatsAppConnectionStatus,
  getWhatsAppQrImageOnly,
  getWhatsAppStatus,
  initiateWhatsAppConnection,
} from '@/lib/api/whatsapp';
import { workspaceApi } from '@/lib/api/workspace';
import { swrFetcher } from '@/lib/fetcher';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { uploadGenericMedia } from '@/lib/media-upload';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';

const E = '#E85D30';
const V = KLOEL_THEME.bgPrimary;
const G = '#10B981';
const P = '#7F66FF';
const T = KLOEL_THEME.textPrimary;
const S = KLOEL_THEME.textSecondary;
const D = KLOEL_THEME.textPlaceholder;
const C = KLOEL_THEME.bgCard;
const U = KLOEL_THEME.bgSecondary;
const B = KLOEL_THEME.borderPrimary;
const F = "'Sora', system-ui, sans-serif";
const M = "'JetBrains Mono', monospace";

const STEPS = ['Conectar', 'Produtos', 'Arsenal', 'Configurar'] as const;
const WAHA_QR_POLL_INTERVAL_MS = 1200;
const WAHA_QR_TRANSITION_DELAY_MS = 150;

const MEDIA_TYPES = [
  { value: 'photo', label: 'Foto do produto', icon: '📸' },
  { value: 'video', label: 'Vídeo de demonstração', icon: '🎬' },
  { value: 'audio', label: 'Áudio / Depoimento', icon: '🎙️' },
  { value: 'testimonial', label: 'Print de depoimento', icon: '💬' },
  { value: 'result', label: 'Prova de resultado', icon: '📊' },
  { value: 'document', label: 'Documento / Certificado', icon: '📄' },
  { value: 'bonus', label: 'Bônus incluído', icon: '🎁' },
] as const;

const TONE_OPTIONS = [
  ['professional', 'Profissional', 'Direto, confiante, corporativo'],
  ['friendly', 'Amigável', 'Próximo, descontraído, caloroso'],
  ['urgent', 'Urgente', 'Escassez, exclusividade, ação'],
] as const;

type ProductKind = 'own' | 'affiliate';
type ToneMode = (typeof TONE_OPTIONS)[number][0];
type MediaTypeValue = (typeof MEDIA_TYPES)[number]['value'];

interface SelectableProduct {
  id: string;
  name: string;
  price: number;
  type: ProductKind;
  imageUrl: string | null;
  affiliateComm: number | null;
  producer: string | null;
}

interface ArsenalItem {
  id: string;
  fileName: string;
  url: string;
  type: MediaTypeValue | '';
  productId: string;
  description: string;
  mimeType?: string | null;
  size?: number | null;
}

interface WhatsAppSetupConfig {
  tone: ToneMode;
  maxDiscount: number;
  followUp: boolean;
  followUpHours: number;
  workingHours: string;
  greeting: string;
}

interface WhatsAppSetupState {
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

interface SummaryProductCard extends SelectableProduct {
  salesCount: number;
  revenue: number;
}

interface WhatsAppSummaryResponse {
  configured: boolean;
  sessionName: string;
  configuredAt: string | null;
  activatedAt: string | null;
  arsenalCount: number;
  tone: string | null;
  maxDiscount: number;
  followUpEnabled: boolean;
  selectedProducts: SummaryProductCard[];
}

interface WorkspaceSettingsResponse {
  providerSettings?: Record<string, any>;
}

interface MarketingWhatsAppConnection {
  provider?: string;
  connected?: boolean;
  status?: string;
  authUrl?: string;
  phoneNumberId?: string | null;
  whatsappBusinessId?: string | null;
  phoneNumber?: string | null;
  pushName?: string | null;
  degradedReason?: string | null;
}

interface ChannelRealData {
  messages: number;
  leads: number;
  sales: number;
  status: string;
}

interface WhatsAppExperienceProps {
  workspaceId: string;
  operator?: string | null;
  mode?: string;
  channelData: ChannelRealData | null;
  liveFeed: string[];
  connection?: MarketingWhatsAppConnection;
  onConnectionRefresh?: () => Promise<unknown> | unknown;
}

const SESSION_EXPIRED_MESSAGE =
  'Sua sessão expirou. Recarregue a página e faça login novamente para continuar acompanhando o WhatsApp.';

function getErrorStatus(error: unknown) {
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

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatCompact(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  if (safe >= 1000) {
    return `${(safe / 1000).toFixed(1)}k`;
  }
  return String(safe);
}

function buildDefaultSetup(workspaceId: string): WhatsAppSetupState {
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

function resolveWorkingHours(raw: unknown) {
  if (typeof raw === 'string' && raw.includes('-')) {
    return raw;
  }

  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const start = toStringValue(record.start || record.workingHoursStart, '08:00');
  const end = toStringValue(record.end || record.workingHoursEnd, '22:00');
  return `${start}-${end}`;
}

function normalizeSetup(raw: unknown, workspaceId: string): WhatsAppSetupState {
  const fallback = buildDefaultSetup(workspaceId);
  const value = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  const selectedProducts = Array.isArray(value.selectedProducts)
    ? value.selectedProducts
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const product = item as Record<string, any>;
          return {
            id: String(product.id || product.productId || ''),
            name: toStringValue(product.name, 'Produto'),
            price: toNumber(product.price),
            type: product.type === 'affiliate' ? 'affiliate' : 'own',
            imageUrl:
              typeof product.imageUrl === 'string'
                ? product.imageUrl
                : typeof product.image === 'string'
                  ? product.image
                  : null,
            affiliateComm:
              product.affiliateComm == null ? null : toNumber(product.affiliateComm, 0),
            producer:
              typeof product.producer === 'string' && product.producer.trim()
                ? product.producer
                : null,
          } satisfies SelectableProduct;
        })
        .filter((product) => product.id)
    : [];

  const arsenal = Array.isArray(value.arsenal)
    ? value.arsenal
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const media = item as Record<string, any>;
          return {
            id: String(media.id || crypto.randomUUID()),
            fileName: toStringValue(media.fileName, 'arquivo'),
            url: toStringValue(media.url),
            type: (MEDIA_TYPES.some((option) => option.value === media.type) ? media.type : '') as
              | MediaTypeValue
              | '',
            productId: toStringValue(media.productId),
            description: toStringValue(media.description),
            mimeType: typeof media.mimeType === 'string' ? media.mimeType : null,
            size: media.size == null ? null : toNumber(media.size, 0),
          } satisfies ArsenalItem;
        })
    : [];

  const config = value.config && typeof value.config === 'object' ? value.config : {};

  return {
    version: toNumber(value.version, 1),
    sessionName: toStringValue(value.sessionName, workspaceId) || workspaceId,
    selectedProducts,
    arsenal,
    config: {
      tone: TONE_OPTIONS.some(([option]) => option === config.tone)
        ? config.tone
        : fallback.config.tone,
      maxDiscount: Math.min(50, Math.max(0, toNumber(config.maxDiscount, 10))),
      followUp:
        typeof config.followUp === 'boolean'
          ? config.followUp
          : typeof config.followUpEnabled === 'boolean'
            ? config.followUpEnabled
            : fallback.config.followUp,
      followUpHours: Math.min(72, Math.max(1, toNumber(config.followUpHours, 24))),
      workingHours: resolveWorkingHours(config.workingHours || config),
      greeting: toStringValue(config.greeting || config.instructions),
    },
    configuredAt: typeof value.configuredAt === 'string' ? value.configuredAt : null,
    activatedAt: typeof value.activatedAt === 'string' ? value.activatedAt : null,
    lastCompletedStep: Math.min(3, Math.max(0, toNumber(value.lastCompletedStep, 0))),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
  };
}

function serializeSetup(setup: WhatsAppSetupState) {
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

function resolveProductImage(product: Record<string, any>) {
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

function normalizeOwnedProduct(raw: unknown): SelectableProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const product = raw as Record<string, any>;
  const status = String(product.status || '').toUpperCase();
  if (status && status !== 'APPROVED') return null;
  if (product.active === false) return null;
  const id = String(product.id || '').trim();
  if (!id) return null;

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

function normalizeAffiliateProducts(raw: unknown): SelectableProduct[] {
  const payload = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  const items = Array.isArray(payload.products) ? payload.products : [];

  return items
    .map<SelectableProduct | null>((item) => {
      if (!item || typeof item !== 'object') return null;
      const request = item as Record<string, any>;
      const affiliateProduct = request.affiliateProduct || {};
      if (request.status !== 'APPROVED' && affiliateProduct.isApproved !== true) {
        return null;
      }

      const id = String(affiliateProduct.id || request.affiliateProductId || '').trim();
      if (!id) return null;

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

function getProductIcon(product: SelectableProduct) {
  if (product.imageUrl) {
    return null;
  }
  const name = product.name.toLowerCase();
  if (product.type === 'affiliate') return '🔗';
  if (name.includes('curso') || name.includes('class')) return '🎓';
  if (name.includes('kit') || name.includes('template')) return '📋';
  return '📦';
}

function Steps({ current, steps }: { current: number; steps: readonly string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {steps.map((step, index) => (
        <div
          key={step}
          style={{
            display: 'flex',
            alignItems: 'center',
            flex: index < steps.length - 1 ? 1 : 'none',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: M,
              flexShrink: 0,
              transition: 'all .3s',
              background: index <= current ? E : U,
              color: index <= current ? V : D,
              border: index === current ? `2px solid ${E}` : '2px solid transparent',
              boxShadow: index === current ? `0 0 12px ${E}40` : 'none',
            }}
          >
            {index + 1}
          </div>
          {index < steps.length - 1 ? (
            <div
              style={{
                flex: 1,
                height: 2,
                background: index < current ? E : U,
                margin: '0 8px',
                transition: 'background .3s',
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function QRCodePane({
  qrCode,
  progress,
  connected,
  loading,
  onRefresh,
}: {
  qrCode: string;
  progress: number;
  connected: boolean;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [dots, setDots] = useState<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    const generated: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < 25; y += 1) {
      for (let x = 0; x < 25; x += 1) {
        if (Math.random() > 0.45 || (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17)) {
          generated.push({ x, y });
        }
      }
    }
    setDots(generated);
  }, []);

  const showGeneratingOverlay = !qrCode && (loading || progress > 0) && !connected;
  const showConnectedOverlay = connected;
  const showOverlay = showGeneratingOverlay || showConnectedOverlay;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      <div
        style={{
          position: 'relative',
          background: '#fff',
          borderRadius: 8,
          padding: 12,
          width: 220,
          height: 220,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {qrCode ? (
          <img
            src={qrCode}
            alt="QR Code do WhatsApp"
            style={{ width: 196, height: 196, objectFit: 'contain' }}
          />
        ) : (
          <svg viewBox="0 0 250 250" width="196" height="196">
            {dots.map((dot, index) => (
              <rect
                key={`${dot.x}-${dot.y}-${index}`}
                x={dot.x * 10}
                y={dot.y * 10}
                width="8"
                height="8"
                rx="1"
                fill={KLOEL_THEME.bgPrimary}
                opacity={loading ? 0.3 : 1}
                style={{ transition: `opacity ${0.2 + Math.random() * 0.3}s` }}
              />
            ))}
          </svg>
        )}

        {showOverlay ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.85)',
              borderRadius: 8,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{progress >= 100 ? '✓' : '📱'}</div>
              <div
                style={{
                  fontFamily: M,
                  fontSize: 14,
                  fontWeight: 700,
                  color: showConnectedOverlay ? G : E,
                }}
              >
                {showConnectedOverlay ? '100%' : `${Math.min(100, Math.round(progress))}%`}
              </div>
              <div style={{ fontSize: 11, color: S, marginTop: 4 }}>
                {showConnectedOverlay ? 'Conectado!' : 'Gerando QR Code...'}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {!connected ? (
        <>
          <p
            style={{
              fontSize: 13,
              color: S,
              textAlign: 'center',
              maxWidth: 300,
              lineHeight: 1.6,
            }}
          >
            Abra o <span style={{ color: '#25D366', fontWeight: 600 }}>WhatsApp</span> no celular →
            Menu (⋮) → Dispositivos conectados → Conectar dispositivo → Escaneie o QR Code
          </p>
          {qrCode ? (
            <p
              style={{
                marginTop: -10,
                fontSize: 12,
                color: G,
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              QR Code pronto para leitura.
            </p>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            style={{
              background: '#25D366',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '12px 32px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: F,
            }}
          >
            {loading ? 'Atualizando...' : qrCode ? 'Gerar novo QR Code' : 'Atualizar QR Code'}
          </button>
        </>
      ) : progress < 100 ? (
        <p style={{ fontSize: 12, color: S }}>Aguardando confirmação do dispositivo...</p>
      ) : null}
    </div>
  );
}

function ProductCard({
  product,
  selected,
  onToggle,
}: {
  product: SelectableProduct;
  selected: boolean;
  onToggle: () => void;
}) {
  const badge =
    product.type === 'affiliate'
      ? {
          background: '#7F66FF20',
          color: P,
          label: `AFILIADO ${product.affiliateComm ?? 0}%`,
        }
      : {
          background: `${G}15`,
          color: G,
          label: 'PRODUTOR',
        };

  return (
    <div
      onClick={onToggle}
      style={{
        background: selected ? `${E}10` : C,
        border: `1.5px solid ${selected ? E : B}`,
        borderRadius: 6,
        padding: 16,
        cursor: 'pointer',
        transition: 'all .2s',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          fontSize: 24,
          width: 40,
          height: 40,
          borderRadius: 6,
          background: U,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          getProductIcon(product)
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T, marginBottom: 2 }}>
          {product.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: M, fontSize: 12, color: E, fontWeight: 700 }}>
            {formatMoney(product.price)}
          </span>
          <span
            style={{
              fontSize: 9,
              fontFamily: M,
              background: badge.background,
              color: badge.color,
              padding: '2px 6px',
              borderRadius: 3,
              fontWeight: 600,
            }}
          >
            {badge.label}
          </span>
        </div>
      </div>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: `2px solid ${selected ? E : D}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all .2s',
          background: selected ? E : 'transparent',
        }}
      >
        {selected ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={V} strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : null}
      </div>
    </div>
  );
}

function MediaItem({
  item,
  products,
  onUpdate,
  onRemove,
}: {
  item: ArsenalItem;
  products: SelectableProduct[];
  onUpdate: (next: ArsenalItem) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ background: C, border: `1px solid ${B}`, borderRadius: 6, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 6,
            background: U,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            overflow: 'hidden',
          }}
        >
          {item.url && item.mimeType?.startsWith('image/') ? (
            <img
              src={item.url}
              alt={item.fileName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            MEDIA_TYPES.find((type) => type.value === item.type)?.icon || '📎'
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T }}>
            {item.fileName || 'Arquivo selecionado'}
          </div>
          <div style={{ fontSize: 10, color: D, fontFamily: M }}>
            {item.type
              ? MEDIA_TYPES.find((type) => type.value === item.type)?.label
              : 'Tipo não definido'}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: 'none',
            border: 'none',
            color: '#EF4444',
            cursor: 'pointer',
            fontSize: 16,
            padding: 4,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <select
          value={item.type || ''}
          onChange={(event) => onUpdate({ ...item, type: event.target.value as MediaTypeValue })}
          style={selectInputStyle}
        >
          <option value="">Selecione o tipo de mídia</option>
          {MEDIA_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.icon} {type.label}
            </option>
          ))}
        </select>
        <select
          value={item.productId || ''}
          onChange={(event) => onUpdate({ ...item, productId: event.target.value })}
          style={selectInputStyle}
        >
          <option value="">De qual produto é essa mídia?</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <textarea
          value={item.description || ''}
          onChange={(event) => onUpdate({ ...item, description: event.target.value })}
          placeholder="Descreva essa mídia — o que ela mostra, por que é importante para a venda, contexto que a IA precisa saber..."
          style={{
            ...selectInputStyle,
            resize: 'vertical',
            minHeight: 60,
            lineHeight: 1.5,
          }}
        />
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        background: C,
        border: `1px solid ${B}`,
        borderRadius: 6,
        padding: 16,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: accent,
        }}
      />
      <div
        style={{
          fontFamily: F,
          fontSize: 10,
          color: D,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: M, fontSize: 22, color: T }}>{value}</div>
    </div>
  );
}

function ProductPerformanceCard({ product }: { product: SummaryProductCard }) {
  const badge =
    product.type === 'affiliate'
      ? {
          background: '#7F66FF20',
          color: P,
          label: `AFILIADO ${product.affiliateComm ?? 0}%`,
        }
      : {
          background: `${G}15`,
          color: G,
          label: 'PRODUTOR',
        };

  return (
    <div style={{ background: C, border: `1px solid ${B}`, borderRadius: 6, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 6,
            background: U,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            fontSize: 24,
          }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            getProductIcon(product)
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T, marginBottom: 4 }}>
            {product.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: M, fontSize: 11, color: E, fontWeight: 700 }}>
              {formatMoney(product.price)}
            </span>
            <span
              style={{
                fontSize: 9,
                fontFamily: M,
                background: badge.background,
                color: badge.color,
                padding: '2px 6px',
                borderRadius: 3,
                fontWeight: 600,
              }}
            >
              {badge.label}
            </span>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
        <div style={panelMiniStatStyle}>
          <div style={panelMiniLabelStyle}>Vendas</div>
          <div style={panelMiniValueStyle}>{product.salesCount}</div>
        </div>
        <div style={panelMiniStatStyle}>
          <div style={panelMiniLabelStyle}>Receita</div>
          <div style={panelMiniValueStyle}>{formatMoney(product.revenue)}</div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: C, border: `1px solid ${B}`, borderRadius: 6, padding: 16 }}>
      <div
        style={{
          fontFamily: F,
          fontSize: 10,
          color: D,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: M, fontSize: 13, color: T, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function FeedCard({ liveFeed }: { liveFeed: string[] }) {
  const items = liveFeed.length > 0 ? liveFeed : ['Aguardando mensagens do WhatsApp...'];

  return (
    <div style={{ background: C, border: `1px solid ${B}`, borderRadius: 6, padding: 16 }}>
      <div
        style={{
          fontFamily: F,
          fontSize: 11,
          color: D,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        Feed de mensagens ao vivo
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.slice(0, 18).map((message, index) => (
          <div
            key={`${message}-${index}`}
            style={{
              background: U,
              border: `1px solid ${B}`,
              borderRadius: 6,
              padding: 12,
              fontFamily: M,
              fontSize: 11,
              color: T,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {message}
          </div>
        ))}
      </div>
    </div>
  );
}

const selectInputStyle: React.CSSProperties = {
  width: '100%',
  background: U,
  border: `1px solid ${B}`,
  borderRadius: 4,
  padding: '8px 10px',
  color: T,
  fontSize: 12,
  fontFamily: F,
  outline: 'none',
};

const panelMiniStatStyle: React.CSSProperties = {
  background: U,
  border: `1px solid ${B}`,
  borderRadius: 6,
  padding: 12,
};

const panelMiniLabelStyle: React.CSSProperties = {
  fontFamily: F,
  fontSize: 10,
  color: D,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  marginBottom: 6,
};

const panelMiniValueStyle: React.CSSProperties = {
  fontFamily: M,
  fontSize: 14,
  color: T,
};

export default function WhatsAppExperience({
  workspaceId,
  operator,
  mode,
  channelData,
  liveFeed,
  connection,
  onConnectionRefresh,
}: WhatsAppExperienceProps) {
  const { products } = useProducts();
  const ownedProducts = Array.isArray(products) ? products : [];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedRef = useRef(false);
  const hydratedSetupKeyRef = useRef<string | null>(null);
  const autoStartRef = useRef(false);
  const advancedRef = useRef(false);
  const pollCountRef = useRef(0);
  const qrRequestInFlightRef = useRef(false);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WhatsAppSetupState>(() => buildDefaultSetup(workspaceId));
  const [reconfiguring, setReconfiguring] = useState(mode === 'reconfigure');
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [sessionExpired, setSessionExpired] = useState(false);

  const { data: affiliateResponse } = useSWR(
    workspaceId ? `affiliate/my-products/${workspaceId}` : null,
    async () => {
      const response = await affiliateApi.myProducts();
      return response.data;
    },
    { revalidateOnFocus: false },
  );

  const { data: settingsData, mutate: mutateSettings } = useSWR<WorkspaceSettingsResponse>(
    workspaceId ? `/workspace/${workspaceId}/settings` : null,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const { data: summaryData, mutate: mutateSummary } = useSWR<WhatsAppSummaryResponse>(
    workspaceId ? '/marketing/whatsapp/summary' : null,
    swrFetcher,
    { refreshInterval: 30000, revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const { data: liveStatus, mutate: mutateLiveStatus } = useSWR<WhatsAppConnectionStatus>(
    workspaceId ? `whatsapp/session-status/${workspaceId}` : null,
    () => getWhatsAppStatus(workspaceId),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const savedSetup = useMemo(
    () => normalizeSetup(settingsData?.providerSettings?.whatsappSetup, workspaceId),
    [settingsData, workspaceId],
  );
  const savedSetupKey = useMemo(() => JSON.stringify(serializeSetup(savedSetup)), [savedSetup]);

  const sessionSnapshot =
    settingsData?.providerSettings &&
    typeof settingsData.providerSettings === 'object' &&
    settingsData.providerSettings.whatsappApiSession &&
    typeof settingsData.providerSettings.whatsappApiSession === 'object'
      ? (settingsData.providerSettings.whatsappApiSession as Record<string, any>)
      : {};
  const providerToken = String(
    liveStatus?.provider ||
      connection?.provider ||
      settingsData?.providerSettings?.whatsappProvider ||
      sessionSnapshot.provider ||
      '',
  )
    .trim()
    .toLowerCase();
  const isWahaProvider =
    providerToken === 'whatsapp-api' ||
    providerToken === 'waha' ||
    providerToken === 'whatsapp-web-agent' ||
    (!providerToken && !sessionSnapshot.phoneNumberId);
  const effectiveProvider = isWahaProvider ? 'whatsapp-api' : 'meta-cloud';

  useEffect(() => {
    setReconfiguring(mode === 'reconfigure');
  }, [mode]);

  useEffect(() => {
    if (hydratedRef.current && hydratedSetupKeyRef.current === savedSetupKey) {
      return;
    }
    hydratedRef.current = true;
    hydratedSetupKeyRef.current = savedSetupKey;
    setDraft(savedSetup);
  }, [savedSetup, savedSetupKey]);

  const effectiveConnection = useMemo(() => {
    const snapshotStatus = String(
      sessionSnapshot.status || sessionSnapshot.rawStatus || connection?.status || 'disconnected',
    ).toLowerCase();
    const snapshotConnected = snapshotStatus === 'connected' || snapshotStatus === 'working';

    return {
      provider: effectiveProvider,
      connected:
        liveStatus?.connected === true ||
        (isWahaProvider ? snapshotConnected : connection?.connected === true || snapshotConnected),
      status: String(
        liveStatus?.status ||
          (isWahaProvider ? snapshotStatus : connection?.status) ||
          snapshotStatus ||
          'disconnected',
      ).toLowerCase(),
      phoneNumber:
        liveStatus?.phone || sessionSnapshot.phoneNumber || connection?.phoneNumber || '',
      pushName: liveStatus?.pushName || sessionSnapshot.pushName || connection?.pushName || '',
      phoneNumberId:
        liveStatus?.phoneNumberId ||
        sessionSnapshot.phoneNumberId ||
        connection?.phoneNumberId ||
        '',
      degradedReason: liveStatus?.degradedReason || connection?.degradedReason || '',
    };
  }, [connection, effectiveProvider, isWahaProvider, liveStatus, sessionSnapshot]);

  useEffect(() => {
    if (effectiveConnection.connected) {
      qrRequestInFlightRef.current = false;
      setQrCode('');
      setSessionExpired(false);
    }
  }, [effectiveConnection.connected]);

  const requestQrCode = async ({
    silent = false,
  }: {
    silent?: boolean;
  } = {}) => {
    if (qrRequestInFlightRef.current) {
      return null;
    }

    qrRequestInFlightRef.current = true;

    try {
      const qr = await getWhatsAppQrImageOnly(workspaceId);

      if (qr.qrCode) {
        setQrCode(qr.qrCode);
        setScanProgress((current) => Math.max(current, 28));
      } else if (qr.connected) {
        setQrCode('');
      }

      return qr;
    } catch (err: any) {
      if (getErrorStatus(err) === 401) {
        setSessionExpired(true);
        setError(SESSION_EXPIRED_MESSAGE);
      } else if (!silent) {
        setError(err?.message || 'Não foi possível carregar o QR Code.');
      }

      return null;
    } finally {
      qrRequestInFlightRef.current = false;
    }
  };

  const selectableProducts = useMemo(() => {
    const own = ownedProducts
      .map((product) => normalizeOwnedProduct(product))
      .filter((product): product is SelectableProduct => Boolean(product));
    const affiliates = normalizeAffiliateProducts(affiliateResponse);
    const deduped = new Map<string, SelectableProduct>();

    for (const product of [...own, ...affiliates]) {
      if (!deduped.has(product.id)) {
        deduped.set(product.id, product);
      }
    }

    return Array.from(deduped.values());
  }, [affiliateResponse, ownedProducts]);

  const productMap = useMemo(
    () => new Map(selectableProducts.map((product) => [product.id, product])),
    [selectableProducts],
  );

  const selectedIds = useMemo(
    () => new Set(draft.selectedProducts.map((product) => product.id)),
    [draft.selectedProducts],
  );

  const selectedProductsList = useMemo(
    () => draft.selectedProducts.map((product) => productMap.get(product.id) || product),
    [draft.selectedProducts, productMap],
  );

  const summaryProducts = useMemo(() => {
    if (summaryData?.selectedProducts?.length) {
      return summaryData.selectedProducts;
    }

    return selectedProductsList.map((product) => ({
      ...product,
      salesCount: 0,
      revenue: 0,
    }));
  }, [selectedProductsList, summaryData]);

  const isActivated = Boolean(summaryData?.activatedAt || draft.activatedAt);
  const hasConfiguredSetup =
    isActivated && (summaryData?.selectedProducts?.length || draft.selectedProducts.length) > 0;
  const showWizard = reconfiguring || !effectiveConnection.connected || !hasConfiguredSetup;

  useEffect(() => {
    if (!showWizard) {
      advancedRef.current = false;
      return;
    }

    if (!effectiveConnection.connected) {
      setStep(0);
      return;
    }

    if (!draft.selectedProducts.length) {
      setStep(1);
      return;
    }

    if (!isActivated) {
      setStep(Math.min(3, Math.max(1, draft.lastCompletedStep + 1)));
    }
  }, [
    draft.lastCompletedStep,
    draft.selectedProducts.length,
    effectiveConnection.connected,
    isActivated,
    showWizard,
  ]);

  useEffect(() => {
    if (
      !showWizard ||
      step !== 0 ||
      effectiveConnection.connected ||
      autoStartRef.current ||
      !isWahaProvider ||
      sessionExpired
    ) {
      return;
    }

    autoStartRef.current = true;
    void (async () => {
      setBusyKey('connect');
      setError(null);
      setSessionExpired(false);
      setScanProgress((current) => Math.max(current, 12));

      try {
        await initiateWhatsAppConnection(workspaceId);
        void requestQrCode({ silent: true });
        try {
          await Promise.all([mutateLiveStatus(), Promise.resolve(onConnectionRefresh?.())]);
        } catch (err) {
          if (getErrorStatus(err) === 401) {
            setSessionExpired(true);
            setError(SESSION_EXPIRED_MESSAGE);
            return;
          }
          throw err;
        }
      } catch (err: any) {
        if (getErrorStatus(err) === 401) {
          setSessionExpired(true);
          setError(SESSION_EXPIRED_MESSAGE);
          return;
        }
        setError(err?.message || 'Não foi possível iniciar a sessão do WhatsApp.');
      } finally {
        setBusyKey(null);
      }
    })();
  }, [
    effectiveConnection.connected,
    isWahaProvider,
    mutateLiveStatus,
    onConnectionRefresh,
    sessionExpired,
    showWizard,
    step,
    workspaceId,
  ]);

  useEffect(() => {
    if (
      !showWizard ||
      step !== 0 ||
      effectiveConnection.connected ||
      !isWahaProvider ||
      sessionExpired
    ) {
      autoStartRef.current = false;
      pollCountRef.current = 0;
      qrRequestInFlightRef.current = false;
      return;
    }

    const intervalId = window.setInterval(() => {
      pollCountRef.current += 1;
      setScanProgress((current) => Math.min(92, Math.max(18, current + Math.random() * 5)));

      void (async () => {
        try {
          await Promise.all([mutateLiveStatus(), Promise.resolve(onConnectionRefresh?.())]);
        } catch (err) {
          if (getErrorStatus(err) === 401) {
            setSessionExpired(true);
            setError(SESSION_EXPIRED_MESSAGE);
            window.clearInterval(intervalId);
          }
        }
      })();

      if (!qrRequestInFlightRef.current) {
        void (async () => {
          const qr = await requestQrCode({ silent: true });
          if (!qr?.qrCode && !qr?.connected && pollCountRef.current % 6 === 0) {
            autoStartRef.current = false;
          }
        })();
      }
    }, WAHA_QR_POLL_INTERVAL_MS);

    return () => {
      qrRequestInFlightRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [
    effectiveConnection.connected,
    isWahaProvider,
    mutateLiveStatus,
    onConnectionRefresh,
    sessionExpired,
    showWizard,
    step,
    workspaceId,
  ]);

  useEffect(() => {
    if (!showWizard || step !== 0 || !effectiveConnection.connected || advancedRef.current) {
      return;
    }

    advancedRef.current = true;
    setScanProgress(100);
    const timeoutId = window.setTimeout(() => {
      setStep(
        draft.selectedProducts.length ? Math.min(3, Math.max(1, draft.lastCompletedStep + 1)) : 1,
      );
    }, WAHA_QR_TRANSITION_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    draft.lastCompletedStep,
    draft.selectedProducts.length,
    effectiveConnection.connected,
    showWizard,
    step,
  ]);

  useEffect(() => {
    if (!activated) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setActivated(false);
      setReconfiguring(false);
    }, 1500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activated]);

  const persistSetup = async (
    nextDraft: WhatsAppSetupState,
    extraPatch?: Record<string, unknown>,
  ) => {
    const response = await workspaceApi.updateSettings({
      whatsappSetup: serializeSetup(nextDraft),
      ...(extraPatch || {}),
    });

    if ((response as any)?.error) {
      throw new Error((response as any).error);
    }

    await Promise.all([
      mutateSettings(),
      mutateSummary(),
      mutateLiveStatus(),
      Promise.resolve(onConnectionRefresh?.()),
    ]);
  };

  const refreshQrCode = async () => {
    setBusyKey('connect');
    setError(null);
    setSessionExpired(false);
    setScanProgress((current) => Math.max(current, 12));

    try {
      await initiateWhatsAppConnection(workspaceId);
      const qrPromise = requestQrCode();

      try {
        await Promise.all([
          qrPromise,
          Promise.all([mutateLiveStatus(), Promise.resolve(onConnectionRefresh?.())]),
        ]);
      } catch (err) {
        if (getErrorStatus(err) === 401) {
          setSessionExpired(true);
          setError(SESSION_EXPIRED_MESSAGE);
          return;
        }
        throw err;
      }
    } catch (err: any) {
      if (getErrorStatus(err) === 401) {
        setSessionExpired(true);
        setError(SESSION_EXPIRED_MESSAGE);
        return;
      }
      setError(err?.message || 'Não foi possível atualizar o QR Code.');
    } finally {
      setBusyKey(null);
    }
  };

  const toggleProduct = (id: string) => {
    const product = productMap.get(id);
    if (!product) return;

    setDraft((current) => ({
      ...current,
      selectedProducts: current.selectedProducts.some((item) => item.id === id)
        ? current.selectedProducts.filter((item) => item.id !== id)
        : [...current.selectedProducts, { ...product }],
      updatedAt: nowIso(),
    }));
  };

  const saveProductsStep = async () => {
    if (draft.selectedProducts.length === 0) {
      setError('Selecione pelo menos um produto para avançar.');
      return;
    }

    setBusyKey('products');
    setError(null);

    const nextDraft = {
      ...draft,
      sessionName: workspaceId,
      lastCompletedStep: Math.max(draft.lastCompletedStep, 1),
      updatedAt: nowIso(),
    };

    try {
      await persistSetup(nextDraft);
      setDraft(nextDraft);
      setStep(2);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar os produtos selecionados.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleMediaUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';

    if (files.length === 0) {
      return;
    }

    setUploadingCount((count) => count + files.length);
    setError(null);

    try {
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const url = await uploadGenericMedia(file, {
            folder: `whatsapp/${workspaceId}/arsenal`,
          });

          return {
            id: crypto.randomUUID(),
            fileName: file.name,
            url,
            type: '' as MediaTypeValue | '',
            productId: '',
            description: '',
            mimeType: file.type || null,
            size: file.size,
          } satisfies ArsenalItem;
        }),
      );

      setDraft((current) => ({
        ...current,
        arsenal: [...current.arsenal, ...uploaded],
        updatedAt: nowIso(),
      }));
    } catch (err: any) {
      setError(err?.message || 'Falha ao enviar as mídias do arsenal.');
    } finally {
      setUploadingCount((count) => Math.max(0, count - files.length));
    }
  };

  const goToConfigStep = async () => {
    const invalidMedia = draft.arsenal.some(
      (item) => item.type === '' || item.productId === '' || item.description.trim() === '',
    );

    if (invalidMedia) {
      setError('Preencha tipo, produto e descrição em todas as mídias antes de continuar.');
      return;
    }

    setBusyKey('arsenal');
    setError(null);

    const nextDraft = {
      ...draft,
      lastCompletedStep: Math.max(draft.lastCompletedStep, 2),
      updatedAt: nowIso(),
    };

    try {
      await persistSetup(nextDraft);
      setDraft(nextDraft);
      setStep(3);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o arsenal.');
    } finally {
      setBusyKey(null);
    }
  };

  const activateAi = async () => {
    if (!effectiveConnection.connected) {
      setError('Conecte o WhatsApp antes de ativar a IA.');
      setStep(0);
      return;
    }

    if (draft.selectedProducts.length === 0) {
      setError('Selecione pelo menos um produto antes de ativar a IA.');
      setStep(1);
      return;
    }

    setBusyKey('activate');
    setError(null);

    const timestamp = nowIso();
    const nextDraft = {
      ...draft,
      configuredAt: draft.configuredAt || timestamp,
      activatedAt: timestamp,
      lastCompletedStep: 3,
      updatedAt: timestamp,
    };

    try {
      await persistSetup(nextDraft, {
        autopilot: { enabled: true },
        autonomy: { mode: 'LIVE' },
      });
      setDraft(nextDraft);
      setActivated(true);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar e ativar a IA.');
    } finally {
      setBusyKey(null);
    }
  };

  const profileName = effectiveConnection.pushName || operator || 'Aguardando perfil';
  const connectedPhone =
    effectiveConnection.phoneNumber || effectiveConnection.phoneNumberId || 'Aguardando número';
  const statusLabel = effectiveConnection.connected
    ? 'Ativo'
    : effectiveConnection.status === 'connection_incomplete'
      ? 'Configuração pendente'
      : 'Desconectado';

  if (!workspaceId) {
    return null;
  }

  if (activated) {
    return (
      <div style={{ background: V, minHeight: '100%', color: T, fontFamily: F, borderRadius: 12 }}>
        <style>{`
          @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes loading { from { transform: translateX(-100%); } to { transform: translateX(0); } }
          .fade-in { animation: fadeUp .5s ease both; }
        `}</style>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
          <div className="fade-in" style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🍄</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: G, marginBottom: 8, fontFamily: F }}>
              IA Ativada!
            </h2>
            <p style={{ fontSize: 13, color: S, marginBottom: 24, fontFamily: F }}>
              Redirecionando para o painel do WhatsApp...
            </p>
            <div
              style={{
                width: 200,
                height: 3,
                background: U,
                borderRadius: 2,
                margin: '0 auto',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: G,
                  borderRadius: 2,
                  animation: 'loading 1.5s ease forwards',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showWizard) {
    return (
      <div style={{ background: V, minHeight: '100%', color: T, fontFamily: F, borderRadius: 12 }}>
        <style>{`
          ::selection { background: rgba(232,93,48,.3); }
          input::placeholder, textarea::placeholder { color: ${KLOEL_THEME.textPlaceholder} !important; }
          select option { background: ${KLOEL_THEME.bgSecondary}; color: ${KLOEL_THEME.textPrimary}; }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes celebrate { 0% { transform: scale(.8); opacity: 0; } 50% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
          .fade-in { animation: fadeUp .5s ease both; }
          @media (max-width: 760px) {
            .wa-tone-grid { grid-template-columns: 1fr !important; }
            .wa-operational-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
          <Steps current={step} steps={STEPS} />

          {error ? (
            <div
              style={{
                marginBottom: 20,
                border: `1px solid color-mix(in srgb, ${KLOEL_THEME.error} 24%, transparent)`,
                background: KLOEL_THEME.errorBg,
                color: KLOEL_THEME.error,
                padding: '12px 14px',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              {error}
            </div>
          ) : null}

          {step === 0 ? (
            <div className="fade-in" style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, fontFamily: F }}>
                Conectar WhatsApp
              </h2>
              <p style={{ fontSize: 13, color: S, marginBottom: 32, fontFamily: F }}>
                Escaneie o QR Code para a IA começar a vender pelo seu número
              </p>

              {!effectiveConnection.connected ? (
                isWahaProvider ? (
                  <QRCodePane
                    qrCode={qrCode}
                    progress={scanProgress}
                    connected={effectiveConnection.connected}
                    loading={busyKey === 'connect'}
                    onRefresh={() => void refreshQrCode()}
                  />
                ) : (
                  <div
                    style={{
                      maxWidth: 420,
                      margin: '0 auto',
                      border: `1px solid ${B}`,
                      borderRadius: 6,
                      padding: '18px 20px',
                      background: C,
                      color: S,
                      fontSize: 13,
                      lineHeight: 1.7,
                    }}
                  >
                    O provider ativo deste workspace nao esta em WAHA. O QR Code so aparece quando o
                    runtime do WhatsApp opera em{' '}
                    <span style={{ color: E, fontWeight: 600 }}>WAHA</span>. Atualize o provider do
                    backend e recarregue esta tela para iniciar a conexao por QR.
                  </div>
                )
              ) : (
                <div style={{ animation: 'celebrate .5s ease both' }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: `${G}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                      fontSize: 28,
                    }}
                  >
                    ✓
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: G, fontFamily: F }}>
                    WhatsApp conectado com sucesso!
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="fade-in">
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, fontFamily: F }}>
                Selecione os produtos
              </h2>
              <p style={{ fontSize: 13, color: S, marginBottom: 8, fontFamily: F }}>
                Escolha quais produtos a IA vai vender neste WhatsApp. Seus produtos e afiliações
                aprovadas aparecem aqui.
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 20,
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontFamily: M, fontSize: 11, color: D }}>
                  {draft.selectedProducts.length} de {selectableProducts.length} selecionados
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      selectedProducts:
                        current.selectedProducts.length === selectableProducts.length
                          ? []
                          : selectableProducts.map((product) => ({ ...product })),
                      updatedAt: nowIso(),
                    }))
                  }
                  style={{
                    background: 'none',
                    border: `1px solid ${B}`,
                    borderRadius: 4,
                    padding: '6px 12px',
                    color: S,
                    fontSize: 11,
                    cursor: 'pointer',
                    fontFamily: F,
                  }}
                >
                  {draft.selectedProducts.length === selectableProducts.length
                    ? 'Desmarcar todos'
                    : 'Selecionar todos'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectableProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    selected={selectedIds.has(product.id)}
                    onToggle={() => toggleProduct(product.id)}
                  />
                ))}
              </div>
              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  disabled={draft.selectedProducts.length === 0 || busyKey === 'products'}
                  onClick={() => void saveProductsStep()}
                  style={{
                    background: draft.selectedProducts.length > 0 ? E : B,
                    color: draft.selectedProducts.length > 0 ? V : D,
                    border: 'none',
                    borderRadius: 6,
                    padding: '12px 28px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: draft.selectedProducts.length > 0 ? 'pointer' : 'default',
                    fontFamily: F,
                  }}
                >
                  {busyKey === 'products' ? 'Salvando...' : 'Próximo →'}
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="fade-in">
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, fontFamily: F }}>
                Arsenal de vendas
              </h2>
              <p style={{ fontSize: 13, color: S, marginBottom: 4, fontFamily: F }}>
                Suba fotos, vídeos, áudios, depoimentos e provas sociais. Quanto mais material,
                melhor a IA vende.
              </p>
              <p
                style={{ fontSize: 11, color: E, marginBottom: 24, fontWeight: 500, fontFamily: F }}
              >
                Cada mídia precisa ser descrita e vinculada a um produto — a IA usa essas
                informações para decidir quando e como enviar cada prova.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {draft.arsenal.map((item) => (
                  <MediaItem
                    key={item.id}
                    item={item}
                    products={selectedProductsList}
                    onUpdate={(updated) =>
                      setDraft((current) => ({
                        ...current,
                        arsenal: current.arsenal.map((media) =>
                          media.id === updated.id ? updated : media,
                        ),
                        updatedAt: nowIso(),
                      }))
                    }
                    onRemove={() =>
                      setDraft((current) => ({
                        ...current,
                        arsenal: current.arsenal.filter((media) => media.id !== item.id),
                        updatedAt: nowIso(),
                      }))
                    }
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%',
                  marginTop: 12,
                  padding: '14px',
                  background: C,
                  border: `2px dashed ${B}`,
                  borderRadius: 6,
                  color: S,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: F,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>+</span> Adicionar mídia
              </button>
              <input ref={fileInputRef} type="file" multiple hidden onChange={handleMediaUpload} />

              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{
                    background: 'none',
                    border: `1px solid ${B}`,
                    borderRadius: 6,
                    padding: '12px 24px',
                    color: S,
                    fontSize: 13,
                    cursor: 'pointer',
                    fontFamily: F,
                  }}
                >
                  ← Voltar
                </button>
                <button
                  type="button"
                  onClick={() => void goToConfigStep()}
                  disabled={uploadingCount > 0 || busyKey === 'arsenal'}
                  style={{
                    background: E,
                    color: V,
                    border: 'none',
                    borderRadius: 6,
                    padding: '12px 28px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: uploadingCount > 0 ? 'default' : 'pointer',
                    fontFamily: F,
                    opacity: uploadingCount > 0 ? 0.7 : 1,
                  }}
                >
                  {uploadingCount > 0
                    ? 'Enviando...'
                    : draft.arsenal.length > 0
                      ? 'Próximo →'
                      : 'Pular por agora →'}
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="fade-in">
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, fontFamily: F }}>
                Configurar a IA
              </h2>
              <p style={{ fontSize: 13, color: S, marginBottom: 24, fontFamily: F }}>
                Defina como a IA se comporta nas conversas. Tudo pode ser alterado depois.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#9A9A9F',
                      marginBottom: 6,
                      display: 'block',
                      fontFamily: F,
                    }}
                  >
                    Tom da conversa
                  </label>
                  <div
                    className="wa-tone-grid"
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}
                  >
                    {TONE_OPTIONS.map(([value, label, description]) => (
                      <div
                        key={value}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            config: { ...current.config, tone: value },
                            updatedAt: nowIso(),
                          }))
                        }
                        style={{
                          background: draft.config.tone === value ? `${E}10` : C,
                          border: `1.5px solid ${draft.config.tone === value ? E : B}`,
                          borderRadius: 6,
                          padding: 12,
                          cursor: 'pointer',
                          transition: 'all .2s',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: T,
                            marginBottom: 2,
                            fontFamily: F,
                          }}
                        >
                          {label}
                        </div>
                        <div style={{ fontSize: 10, color: D, lineHeight: 1.4, fontFamily: F }}>
                          {description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#9A9A9F',
                      marginBottom: 6,
                      display: 'block',
                      fontFamily: F,
                    }}
                  >
                    Desconto máximo que a IA pode oferecer:{' '}
                    <span style={{ color: E, fontFamily: M }}>{draft.config.maxDiscount}%</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={draft.config.maxDiscount}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        config: { ...current.config, maxDiscount: Number(event.target.value) },
                        updatedAt: nowIso(),
                      }))
                    }
                    style={{ width: '100%', accentColor: E }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 10,
                      color: D,
                      fontFamily: M,
                    }}
                  >
                    <span>0% (sem desconto)</span>
                    <span>50%</span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: C,
                    border: `1px solid ${B}`,
                    borderRadius: 6,
                    padding: 14,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T, fontFamily: F }}>
                      Follow-up automático
                    </div>
                    <div style={{ fontSize: 11, color: D, fontFamily: F }}>
                      A IA retoma leads que não responderam
                    </div>
                  </div>
                  <div
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        config: { ...current.config, followUp: !current.config.followUp },
                        updatedAt: nowIso(),
                      }))
                    }
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      background: draft.config.followUp ? E : B,
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'background .2s',
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        background: '#fff',
                        position: 'absolute',
                        top: 3,
                        left: draft.config.followUp ? 23 : 3,
                        transition: 'left .2s',
                      }}
                    />
                  </div>
                </div>

                {draft.config.followUp ? (
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#9A9A9F',
                        marginBottom: 6,
                        display: 'block',
                        fontFamily: F,
                      }}
                    >
                      Tempo para follow-up:{' '}
                      <span style={{ color: E, fontFamily: M }}>{draft.config.followUpHours}h</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="72"
                      value={draft.config.followUpHours}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          config: { ...current.config, followUpHours: Number(event.target.value) },
                          updatedAt: nowIso(),
                        }))
                      }
                      style={{ width: '100%', accentColor: E }}
                    />
                  </div>
                ) : null}

                <div>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#9A9A9F',
                      marginBottom: 6,
                      display: 'block',
                      fontFamily: F,
                    }}
                  >
                    Horário de atendimento
                  </label>
                  <input
                    type="text"
                    value={draft.config.workingHours}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        config: { ...current.config, workingHours: event.target.value },
                        updatedAt: nowIso(),
                      }))
                    }
                    placeholder="08:00-22:00"
                    style={{
                      ...selectInputStyle,
                      fontFamily: M,
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#9A9A9F',
                      marginBottom: 6,
                      display: 'block',
                      fontFamily: F,
                    }}
                  >
                    Suas instruções para o Kloel
                  </label>
                  <textarea
                    value={draft.config.greeting}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        config: { ...current.config, greeting: event.target.value },
                        updatedAt: nowIso(),
                      }))
                    }
                    placeholder="Ex: Nunca ofereça desconto antes do cliente pedir. Sempre mencione o bônus. Chame pelo primeiro nome..."
                    style={{
                      ...selectInputStyle,
                      resize: 'vertical',
                      minHeight: 70,
                      lineHeight: 1.5,
                    }}
                  />
                </div>
              </div>

              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  style={{
                    background: 'none',
                    border: `1px solid ${B}`,
                    borderRadius: 6,
                    padding: '12px 24px',
                    color: S,
                    fontSize: 13,
                    cursor: 'pointer',
                    fontFamily: F,
                  }}
                >
                  ← Voltar
                </button>
                <button
                  type="button"
                  onClick={() => void activateAi()}
                  disabled={busyKey === 'activate'}
                  style={{
                    background: G,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '14px 36px',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: F,
                    boxShadow: `0 0 20px ${G}40`,
                    opacity: busyKey === 'activate' ? 0.7 : 1,
                  }}
                >
                  {busyKey === 'activate' ? 'Salvando...' : 'Salvar e ativar IA'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        @media (max-width: 760px) {
          .wa-operational-grid {
            grid-template-columns: 1fr !important;
          }
          .wa-products-performance-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: M,
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: E,
              marginBottom: 8,
            }}
          >
            WhatsApp
          </div>
          <h2 style={{ margin: 0, fontSize: 24, color: T, fontFamily: F }}>Painel operacional</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setReconfiguring(true);
            setStep(effectiveConnection.connected ? 1 : 0);
            setError(null);
          }}
          style={{
            background: 'none',
            border: `1px solid ${B}`,
            borderRadius: 6,
            padding: '10px 18px',
            color: T,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: F,
          }}
        >
          Reconfigurar
        </button>
      </div>

      <div
        className="wa-operational-grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}
      >
        <InfoCard label="Status" value={statusLabel} />
        <InfoCard label="Perfil conectado" value={profileName} />
        <InfoCard label="Telefone conectado" value={connectedPhone} />
      </div>

      <div
        className="wa-operational-grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}
      >
        <MetricCard
          label="Mensagens"
          value={formatCompact(channelData?.messages ?? 0)}
          accent={E}
        />
        <MetricCard label="Leads" value={formatCompact(channelData?.leads ?? 0)} accent={G} />
        <MetricCard label="Vendas" value={String(channelData?.sales ?? 0)} accent={P} />
      </div>

      <div
        className="wa-products-performance-grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
      >
        {summaryProducts.length > 0 ? (
          summaryProducts.map((product) => (
            <ProductPerformanceCard key={product.id} product={product} />
          ))
        ) : (
          <div
            style={{
              gridColumn: '1 / -1',
              background: C,
              border: `1px solid ${B}`,
              borderRadius: 6,
              padding: 16,
              color: S,
              fontFamily: F,
              fontSize: 13,
            }}
          >
            Nenhum produto foi vinculado a este WhatsApp ainda.
          </div>
        )}
      </div>

      <div
        className="wa-operational-grid"
        style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr', gap: 12 }}
      >
        <FeedCard liveFeed={liveFeed} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <InfoCard
            label="Sessão"
            value={summaryData?.sessionName || draft.sessionName || workspaceId}
          />
          <InfoCard
            label="Tom"
            value={
              TONE_OPTIONS.find(
                ([value]) => value === (summaryData?.tone || draft.config.tone),
              )?.[1] || 'Profissional'
            }
          />
          <InfoCard
            label="Desconto máximo"
            value={`${summaryData?.maxDiscount ?? draft.config.maxDiscount}%`}
          />
          <InfoCard
            label="Follow-up"
            value={
              (summaryData?.followUpEnabled ?? draft.config.followUp)
                ? `${draft.config.followUpHours}h`
                : 'Desativado'
            }
          />
          <InfoCard label="Atendimento" value={draft.config.workingHours} />
          <InfoCard
            label="Arsenal"
            value={`${summaryData?.arsenalCount ?? draft.arsenal.length} mídia(s)`}
          />
        </div>
      </div>
    </div>
  );
}
