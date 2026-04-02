'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import useSWR from 'swr';
import { useProducts } from '@/hooks/useProducts';
import { swrFetcher } from '@/lib/fetcher';
import { affiliateApi } from '@/lib/api/misc';
import { workspaceApi } from '@/lib/api/workspace';
import {
  getWhatsAppStatus,
  initiateWhatsAppConnection,
  type WhatsAppConnectionStatus,
} from '@/lib/api/whatsapp';
import { uploadGenericMedia } from '@/lib/media-upload';

const SORA = "'Sora',sans-serif";
const MONO = "'JetBrains Mono',monospace";
const VOID = '#0A0A0C';
const CARD = '#111113';
const ELEVATED = '#19191C';
const BORDER = '#222226';
const TEXT = '#E0DDD8';
const MUTED = '#6E6E73';
const MUTED_SOFT = '#3A3A3F';
const EMBER = '#E85D30';
const GREEN = '#10B981';
const PURPLE = '#7F66FF';
const META = '#1877F2';

const STEP_LABELS = ['Conectar', 'Produtos', 'Arsenal', 'Configurar'] as const;

const MEDIA_TYPE_OPTIONS = [
  { value: 'photo', label: 'Foto do produto', icon: '📸' },
  { value: 'video', label: 'Vídeo de demonstração', icon: '🎬' },
  { value: 'audio', label: 'Áudio / Depoimento', icon: '🎙️' },
  { value: 'testimonial', label: 'Print de depoimento', icon: '💬' },
  { value: 'result', label: 'Prova de resultado', icon: '📊' },
  { value: 'document', label: 'Documento / Certificado', icon: '📄' },
  { value: 'bonus', label: 'Bônus incluído', icon: '🎁' },
] as const;

const TONE_OPTIONS = [
  {
    value: 'professional',
    label: 'Profissional',
    description: 'Direto, confiante e corporativo.',
  },
  {
    value: 'friendly',
    label: 'Amigável',
    description: 'Próximo, caloroso e consultivo.',
  },
  {
    value: 'urgent',
    label: 'Urgente',
    description: 'Mais escassez, ritmo e chamada para ação.',
  },
] as const;

type ProductKind = 'own' | 'affiliate';
type ToneMode = (typeof TONE_OPTIONS)[number]['value'];
type MediaTypeValue = (typeof MEDIA_TYPE_OPTIONS)[number]['value'];

interface SelectableProduct {
  id: string;
  name: string;
  price: number;
  type: ProductKind;
  affiliateComm: number | null;
  imageUrl: string | null;
  producer: string | null;
}

type StoredProductSnapshot = SelectableProduct;

interface ArsenalItem {
  id: string;
  fileName: string;
  url: string;
  type: MediaTypeValue | '';
  productId: string;
  description: string;
  mimeType?: string | null;
  size?: number | null;
  createdAt?: string | null;
}

interface WhatsAppSetupConfig {
  tone: ToneMode;
  maxDiscount: number;
  followUpEnabled: boolean;
  followUpHours: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  instructions: string;
}

interface WhatsAppSetupState {
  version: number;
  sessionName: string;
  selectedProducts: StoredProductSnapshot[];
  arsenal: ArsenalItem[];
  config: WhatsAppSetupConfig;
  configuredAt: string | null;
  activatedAt: string | null;
  lastCompletedStep: number;
  updatedAt: string | null;
}

interface SummaryProductCard {
  id: string;
  name: string;
  price: number;
  type: ProductKind;
  affiliateComm: number | null;
  imageUrl: string | null;
  producer: string | null;
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
  jitterMin?: number;
  jitterMax?: number;
  customDomain?: string | null;
  branding?: Record<string, any> | null;
}

interface MarketingWhatsAppConnection {
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
      followUpEnabled: true,
      followUpHours: 24,
      workingHoursStart: '08:00',
      workingHoursEnd: '22:00',
      instructions: '',
    },
    configuredAt: null,
    activatedAt: null,
    lastCompletedStep: 0,
    updatedAt: null,
  };
}

function normalizeWorkingHours(raw: unknown) {
  if (typeof raw === 'string' && raw.includes('-')) {
    const [start, end] = raw.split('-');
    return {
      start: start?.trim() || '08:00',
      end: end?.trim() || '22:00',
    };
  }

  const record = (raw as Record<string, unknown>) || {};
  return {
    start: toStringValue(record.start, '08:00'),
    end: toStringValue(record.end, '22:00'),
  };
}

function normalizeSetup(raw: unknown, workspaceId: string): WhatsAppSetupState {
  const fallback = buildDefaultSetup(workspaceId);
  const value = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  const workingHours = normalizeWorkingHours(
    value.config?.workingHours || {
      start: value.config?.workingHoursStart,
      end: value.config?.workingHoursEnd,
    },
  );

  const selectedProducts = Array.isArray(value.selectedProducts)
    ? value.selectedProducts
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const product = item as Record<string, unknown>;
          return {
            id: String(product.id || product.productId || ''),
            name: toStringValue(product.name, 'Produto'),
            price: toNumber(product.price),
            type: product.type === 'affiliate' ? 'affiliate' : 'own',
            affiliateComm:
              product.affiliateComm == null ? null : toNumber(product.affiliateComm, 0),
            imageUrl:
              typeof product.imageUrl === 'string'
                ? product.imageUrl
                : typeof product.image === 'string'
                  ? product.image
                  : null,
            producer: typeof product.producer === 'string' ? product.producer : null,
          } satisfies StoredProductSnapshot;
        })
        .filter((product) => product.id)
    : [];

  const arsenal = Array.isArray(value.arsenal)
    ? value.arsenal
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const media = item as Record<string, unknown>;
          return {
            id: String(media.id || crypto.randomUUID()),
            fileName: toStringValue(media.fileName, 'arquivo'),
            url: toStringValue(media.url),
            type: (MEDIA_TYPE_OPTIONS.some((option) => option.value === media.type)
              ? media.type
              : '') as MediaTypeValue | '',
            productId: toStringValue(media.productId),
            description: toStringValue(media.description),
            mimeType: typeof media.mimeType === 'string' ? media.mimeType : null,
            size: media.size == null ? null : toNumber(media.size, 0),
            createdAt: typeof media.createdAt === 'string' ? media.createdAt : null,
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
      tone: TONE_OPTIONS.some((option) => option.value === config.tone)
        ? config.tone
        : fallback.config.tone,
      maxDiscount: Math.min(
        50,
        Math.max(0, toNumber(config.maxDiscount, fallback.config.maxDiscount)),
      ),
      followUpEnabled:
        typeof config.followUpEnabled === 'boolean'
          ? config.followUpEnabled
          : fallback.config.followUpEnabled,
      followUpHours: Math.min(
        72,
        Math.max(1, toNumber(config.followUpHours, fallback.config.followUpHours)),
      ),
      workingHoursStart: workingHours.start,
      workingHoursEnd: workingHours.end,
      instructions: toStringValue(config.instructions),
    },
    configuredAt: typeof value.configuredAt === 'string' ? value.configuredAt : null,
    activatedAt: typeof value.activatedAt === 'string' ? value.activatedAt : null,
    lastCompletedStep: Math.min(3, Math.max(0, toNumber(value.lastCompletedStep, 0))),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
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
    affiliateComm: null,
    imageUrl: resolveProductImage(product),
    producer: null,
  };
}

function normalizeAffiliateProducts(raw: unknown): SelectableProduct[] {
  const payload = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  const items = Array.isArray(payload.products) ? payload.products : [];

  return items
    .map((item) => {
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
        affiliateComm:
          affiliateProduct.commission == null ? null : toNumber(affiliateProduct.commission, 0),
        imageUrl:
          typeof affiliateProduct.imageUrl === 'string'
            ? affiliateProduct.imageUrl
            : typeof affiliateProduct.thumbnailUrl === 'string'
              ? affiliateProduct.thumbnailUrl
              : null,
        producer:
          typeof affiliateProduct.producer === 'string' ? affiliateProduct.producer : 'Marketplace',
      } satisfies SelectableProduct;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item)) as SelectableProduct[];
}

function productTone(type: ProductKind) {
  return type === 'affiliate'
    ? {
        label: 'AFILIADO',
        background: 'rgba(127,102,255,0.12)',
        border: 'rgba(127,102,255,0.24)',
        color: PURPLE,
      }
    : {
        label: 'PRODUTOR',
        background: 'rgba(16,185,129,0.12)',
        border: 'rgba(16,185,129,0.24)',
        color: GREEN,
      };
}

function badgeStyle(color: string, background: string, border: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    borderRadius: 999,
    border: `1px solid ${border}`,
    background,
    color,
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: '0.08em',
  };
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
      {STEP_LABELS.map((label, index) => {
        const active = index === current;
        const complete = index < current;

        return (
          <div
            key={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              flex: index < STEP_LABELS.length - 1 ? 1 : 'none',
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: active || complete ? EMBER : ELEVATED,
                color: active || complete ? VOID : MUTED_SOFT,
                border: active ? `2px solid ${EMBER}` : '2px solid transparent',
                boxShadow: active ? '0 0 18px rgba(232,93,48,0.28)' : 'none',
                fontFamily: MONO,
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
                transition: 'all .25s ease',
              }}
            >
              {index + 1}
            </div>
            <div style={{ minWidth: 0, marginLeft: 10, marginRight: 10, flex: 1 }}>
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 11,
                  color: active || complete ? TEXT : MUTED_SOFT,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </div>
            </div>
            {index < STEP_LABELS.length - 1 ? (
              <div
                style={{
                  height: 2,
                  flex: 1,
                  minWidth: 28,
                  borderRadius: 999,
                  background: complete ? EMBER : ELEVATED,
                  transition: 'background .25s ease',
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 10,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: MUTED_SOFT,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function Surface({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 18,
        padding: 22,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatusPill({
  color,
  label,
  background,
}: {
  color: string;
  label: string;
  background: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px',
        borderRadius: 999,
        border: `1px solid ${color}30`,
        background,
        color,
        fontFamily: MONO,
        fontSize: 11,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 12px ${color}80`,
        }}
      />
      {label}
    </span>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 0',
        borderBottom: `1px solid rgba(34,34,38,0.9)`,
      }}
    >
      <span style={{ fontFamily: SORA, fontSize: 12, color: MUTED }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        appearance: 'none',
        border: `1px solid ${BORDER}`,
        background: ELEVATED,
        color: TEXT,
        fontFamily: SORA,
        fontSize: 13,
        fontWeight: 600,
        padding: '11px 16px',
        borderRadius: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  color = EMBER,
  darkText = true,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  color?: string;
  darkText?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        appearance: 'none',
        border: 'none',
        background: disabled ? '#2A2A2E' : color,
        color: disabled ? MUTED_SOFT : darkText ? VOID : '#FFFFFF',
        fontFamily: SORA,
        fontSize: 13,
        fontWeight: 700,
        padding: '12px 18px',
        borderRadius: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : `0 14px 34px ${color}30`,
      }}
    >
      {children}
    </button>
  );
}

function MetricTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: '16px 18px 16px 22px',
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
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: MUTED_SOFT,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 24, color: TEXT }}>{value}</div>
    </div>
  );
}

function ProductSelectionCard({
  product,
  selected,
  onToggle,
}: {
  product: SelectableProduct;
  selected: boolean;
  onToggle: () => void;
}) {
  const tone = productTone(product.type);

  return (
    <button
      onClick={onToggle}
      style={{
        appearance: 'none',
        border: `1px solid ${selected ? `${EMBER}80` : BORDER}`,
        background: selected ? 'rgba(232,93,48,0.08)' : CARD,
        borderRadius: 18,
        padding: 16,
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all .2s ease',
        display: 'flex',
        gap: 14,
        width: '100%',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: ELEVATED,
          border: `1px solid ${BORDER}`,
          overflow: 'hidden',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: MUTED_SOFT,
          fontFamily: MONO,
          fontSize: 11,
        }}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          'WA'
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 8,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 14,
                color: TEXT,
                fontWeight: 600,
                marginBottom: 5,
              }}
            >
              {product.name}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: EMBER }}>
              {formatMoney(product.price)}
            </div>
          </div>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: `2px solid ${selected ? EMBER : MUTED_SOFT}`,
              background: selected ? EMBER : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {selected ? (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke={VOID}
                strokeWidth="3"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : null}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={badgeStyle(tone.color, tone.background, tone.border)}>
            {tone.label}
            {product.type === 'affiliate' && product.affiliateComm != null
              ? ` ${product.affiliateComm}%`
              : ''}
          </span>
          {product.producer ? (
            <span style={badgeStyle(MUTED, 'rgba(58,58,63,0.16)', 'rgba(58,58,63,0.36)')}>
              {product.producer}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function MediaAssetCard({
  item,
  products,
  onUpdate,
  onRemove,
}: {
  item: ArsenalItem;
  products: StoredProductSnapshot[];
  onUpdate: (next: ArsenalItem) => void;
  onRemove: () => void;
}) {
  const mediaMeta = MEDIA_TYPE_OPTIONS.find((option) => option.value === item.type);

  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 18,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: ELEVATED,
              border: `1px solid ${BORDER}`,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            {item.url && item.mimeType?.startsWith('image/') ? (
              <img
                src={item.url}
                alt={item.fileName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              mediaMeta?.icon || '📎'
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 13,
                color: TEXT,
                fontWeight: 600,
                marginBottom: 4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.fileName}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>
              {item.size ? `${(item.size / 1024 / 1024).toFixed(2)} MB` : 'Upload concluído'}
            </div>
          </div>
        </div>
        <button
          onClick={onRemove}
          style={{
            appearance: 'none',
            border: 'none',
            background: 'transparent',
            color: '#F87171',
            cursor: 'pointer',
            fontFamily: MONO,
            fontSize: 18,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
        <select
          value={item.type}
          onChange={(event) =>
            onUpdate({
              ...item,
              type: event.target.value as MediaTypeValue | '',
            })
          }
          style={inputStyle}
        >
          <option value="">Selecione o tipo de mídia</option>
          {MEDIA_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.icon} {option.label}
            </option>
          ))}
        </select>

        <select
          value={item.productId}
          onChange={(event) =>
            onUpdate({
              ...item,
              productId: event.target.value,
            })
          }
          style={inputStyle}
        >
          <option value="">De qual produto é essa mídia?</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>

        <textarea
          value={item.description}
          onChange={(event) =>
            onUpdate({
              ...item,
              description: event.target.value,
            })
          }
          placeholder="Explique o que essa mídia mostra e por que ela ajuda a IA a vender melhor."
          style={{
            ...inputStyle,
            minHeight: 88,
            resize: 'vertical',
            lineHeight: 1.55,
          }}
        />
      </div>
    </div>
  );
}

function ProductPerformanceCard({ product }: { product: SummaryProductCard }) {
  const tone = productTone(product.type);

  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 18,
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 16,
            background: ELEVATED,
            border: `1px solid ${BORDER}`,
            overflow: 'hidden',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: MUTED_SOFT,
            fontFamily: MONO,
            fontSize: 11,
          }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            'WA'
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: SORA,
              fontSize: 14,
              color: TEXT,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            {product.name}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={badgeStyle(tone.color, tone.background, tone.border)}>
              {tone.label}
              {product.type === 'affiliate' && product.affiliateComm != null
                ? ` ${product.affiliateComm}%`
                : ''}
            </span>
            <span style={badgeStyle(MUTED, 'rgba(58,58,63,0.16)', 'rgba(58,58,63,0.36)')}>
              {formatMoney(product.price)}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
          gap: 10,
        }}
      >
        <div style={performanceBoxStyle}>
          <div style={performanceLabelStyle}>Vendas</div>
          <div style={performanceValueStyle}>{product.salesCount}</div>
        </div>
        <div style={performanceBoxStyle}>
          <div style={performanceLabelStyle}>Receita</div>
          <div style={performanceValueStyle}>{formatMoney(product.revenue)}</div>
        </div>
      </div>
    </div>
  );
}

function LiveFeedPanel({ messages }: { messages: string[] }) {
  const items = messages.length > 0 ? messages : ['Aguardando mensagens do WhatsApp...'];

  return (
    <Surface style={{ minHeight: 420 }}>
      <SectionLabel>Feed ao vivo</SectionLabel>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {items.slice(0, 18).map((message, index) => (
          <div
            key={`${message}-${index}`}
            style={{
              borderRadius: 14,
              background: ELEVATED,
              border: `1px solid ${BORDER}`,
              padding: '12px 14px',
              fontFamily: MONO,
              fontSize: 11,
              color: TEXT,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {message}
          </div>
        ))}
      </div>
    </Surface>
  );
}

function CompactInfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: MUTED_SOFT,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 13,
          color: TEXT,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: '12px 14px',
  color: TEXT,
  fontFamily: SORA,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

const performanceBoxStyle: CSSProperties = {
  background: ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  padding: '12px 14px',
};

const performanceLabelStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: MUTED_SOFT,
  marginBottom: 8,
};

const performanceValueStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: 16,
  color: TEXT,
};

export function WhatsAppExperience({
  workspaceId,
  operator,
  mode,
  channelData,
  liveFeed,
  connection,
  onConnectionRefresh,
}: WhatsAppExperienceProps) {
  const { products: rawOwnedProducts } = useProducts();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WhatsAppSetupState>(() => buildDefaultSetup(workspaceId));
  const [isReconfiguring, setIsReconfiguring] = useState(mode === 'reconfigure');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sessionLaunch, setSessionLaunch] = useState<{
    authUrl?: string;
    qrCode?: string;
    message?: string;
  } | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const hydratedRef = useRef(false);
  const autoAdvancedRef = useRef(false);

  const { data: affiliateResponse } = useSWR(
    workspaceId ? `affiliate/my-products/${workspaceId}` : null,
    async () => {
      const res = await affiliateApi.myProducts();
      return res.data;
    },
    { revalidateOnFocus: false },
  );

  const {
    data: settingsData,
    mutate: mutateSettings,
    isLoading: settingsLoading,
  } = useSWR<WorkspaceSettingsResponse>(
    workspaceId ? `/workspace/${workspaceId}/settings` : null,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const { data: summaryData, mutate: mutateSummary } = useSWR<WhatsAppSummaryResponse>(
    workspaceId ? '/marketing/whatsapp/summary' : null,
    swrFetcher,
    { refreshInterval: 30000 },
  );

  const {
    data: liveStatus,
    mutate: mutateLiveStatus,
    isLoading: statusLoading,
  } = useSWR<WhatsAppConnectionStatus>(
    workspaceId ? `whatsapp/session-status/${workspaceId}` : null,
    () => getWhatsAppStatus(workspaceId),
    { revalidateOnFocus: false },
  );

  const savedSetup = useMemo(
    () => normalizeSetup(settingsData?.providerSettings?.whatsappSetup, workspaceId),
    [settingsData, workspaceId],
  );
  const sessionSnapshot =
    settingsData?.providerSettings &&
    typeof settingsData.providerSettings === 'object' &&
    settingsData.providerSettings.whatsappApiSession &&
    typeof settingsData.providerSettings.whatsappApiSession === 'object'
      ? (settingsData.providerSettings.whatsappApiSession as Record<string, any>)
      : {};

  useEffect(() => {
    setIsReconfiguring(mode === 'reconfigure');
  }, [mode]);

  useEffect(() => {
    if (hydratedRef.current && savedSetup.updatedAt === draft.updatedAt) {
      return;
    }
    hydratedRef.current = true;
    setDraft(savedSetup);
  }, [draft.updatedAt, savedSetup]);

  const effectiveConnection = useMemo(() => {
    const snapshotStatus = String(
      sessionSnapshot.status || sessionSnapshot.rawStatus || connection?.status || 'disconnected',
    ).toLowerCase();
    const snapshotConnected = ['connected', 'working'].includes(snapshotStatus);
    const transientLookupFailure =
      String(liveStatus?.status || '').toLowerCase() === 'degraded' || !liveStatus;
    const connected =
      liveStatus?.connected === true ||
      (!liveStatus?.connected && transientLookupFailure && snapshotConnected) ||
      connection?.connected === true;

    return {
      connected,
      status: String(
        liveStatus?.status || snapshotStatus || connection?.status || 'disconnected',
      ).toLowerCase(),
      authUrl:
        liveStatus?.authUrl ||
        sessionSnapshot.authUrl ||
        connection?.authUrl ||
        sessionLaunch?.authUrl ||
        '',
      qrCode: liveStatus?.qrCode || sessionLaunch?.qrCode || '',
      phoneNumber:
        liveStatus?.phone || sessionSnapshot.phoneNumber || connection?.phoneNumber || '',
      pushName: liveStatus?.pushName || sessionSnapshot.pushName || connection?.pushName || '',
      phoneNumberId:
        liveStatus?.phoneNumberId ||
        sessionSnapshot.phoneNumberId ||
        connection?.phoneNumberId ||
        '',
      whatsappBusinessId:
        liveStatus?.whatsappBusinessId ||
        sessionSnapshot.whatsappBusinessId ||
        connection?.whatsappBusinessId ||
        '',
      degradedReason: liveStatus?.degradedReason || connection?.degradedReason || '',
      message: liveStatus?.message || sessionLaunch?.message || '',
    };
  }, [connection, liveStatus, sessionLaunch, sessionSnapshot]);

  const hasConfiguredSetup =
    draft.selectedProducts.length > 0 || Boolean(draft.configuredAt || draft.activatedAt);
  const showWizard = isReconfiguring || !effectiveConnection.connected || !hasConfiguredSetup;

  useEffect(() => {
    if (!showWizard) {
      autoAdvancedRef.current = false;
      return;
    }

    if (!effectiveConnection.connected) {
      if (step !== 0) setStep(0);
      return;
    }

    if (step === 0) {
      setStep(1);
    }
  }, [effectiveConnection.connected, showWizard, step]);

  useEffect(() => {
    if (!showWizard || step !== 0 || effectiveConnection.connected) {
      autoAdvancedRef.current = false;
      return;
    }

    const intervalId = window.setInterval(() => {
      void mutateLiveStatus();
      void onConnectionRefresh?.();
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [effectiveConnection.connected, mutateLiveStatus, onConnectionRefresh, showWizard, step]);

  useEffect(() => {
    if (!showWizard || step !== 0 || !effectiveConnection.connected || autoAdvancedRef.current) {
      return;
    }

    autoAdvancedRef.current = true;
    setStatusMessage('WhatsApp conectado com sucesso. Avançando para a seleção de produtos.');
    const timeoutId = window.setTimeout(() => {
      setStep(1);
    }, 900);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [effectiveConnection.connected, showWizard, step]);

  const selectableProducts = useMemo(() => {
    const ownProducts = Array.isArray(rawOwnedProducts)
      ? rawOwnedProducts
          .map((item) => normalizeOwnedProduct(item))
          .filter((item): item is SelectableProduct => Boolean(item))
      : [];
    const affiliateProducts = normalizeAffiliateProducts(affiliateResponse);
    const deduped = new Map<string, SelectableProduct>();

    for (const product of [...ownProducts, ...affiliateProducts]) {
      if (!deduped.has(product.id)) {
        deduped.set(product.id, product);
      }
    }

    return Array.from(deduped.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [affiliateResponse, rawOwnedProducts]);

  const productMap = useMemo(
    () => new Map(selectableProducts.map((product) => [product.id, product])),
    [selectableProducts],
  );

  const selectedProductIds = useMemo(
    () => new Set(draft.selectedProducts.map((product) => product.id)),
    [draft.selectedProducts],
  );

  const selectedProductsDetailed = useMemo(
    () =>
      draft.selectedProducts.map((product) => {
        const freshest = productMap.get(product.id);
        return freshest ? { ...freshest } : product;
      }),
    [draft.selectedProducts, productMap],
  );

  const summaryProducts = useMemo(() => {
    if (summaryData?.selectedProducts?.length) {
      return summaryData.selectedProducts;
    }

    return selectedProductsDetailed.map((product) => ({
      ...product,
      salesCount: 0,
      revenue: 0,
    }));
  }, [selectedProductsDetailed, summaryData]);

  const persistSetup = async (
    nextDraft: WhatsAppSetupState,
    extraPatch?: Record<string, unknown>,
  ) => {
    const response = await workspaceApi.updateSettings({
      whatsappSetup: nextDraft,
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

  const handleConnectSession = async () => {
    setBusyKey('connect');
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await initiateWhatsAppConnection(workspaceId);
      setSessionLaunch({
        authUrl: response.authUrl,
        qrCode: response.qrCode || response.qrCodeImage,
        message: response.message,
      });

      await Promise.all([mutateLiveStatus(), Promise.resolve(onConnectionRefresh?.())]);

      if (response.status === 'already_connected') {
        setStatusMessage('Este WhatsApp já estava conectado.');
        setStep(1);
        return;
      }

      if (response.authUrl) {
        setStatusMessage(
          'Sessão criada. Conclua a autorização oficial para liberar a operação em tempo real.',
        );
        return;
      }

      if (response.qrCode || response.qrCodeImage) {
        setStatusMessage('QR Code atualizado. Escaneie no celular para continuar.');
        return;
      }

      setStatusMessage(response.message || 'Sessão iniciada. Aguardando autenticação.');
    } catch (error: any) {
      setErrorMessage(error?.message || 'Falha ao iniciar a sessão do WhatsApp.');
    } finally {
      setBusyKey(null);
    }
  };

  const toggleProduct = (product: SelectableProduct) => {
    setDraft((current) => {
      const exists = current.selectedProducts.some((item) => item.id === product.id);
      return {
        ...current,
        selectedProducts: exists
          ? current.selectedProducts.filter((item) => item.id !== product.id)
          : [
              ...current.selectedProducts,
              {
                ...product,
              },
            ],
        updatedAt: nowIso(),
      };
    });
  };

  const advanceProducts = async () => {
    if (draft.selectedProducts.length === 0) {
      setErrorMessage('Selecione pelo menos um produto para a IA vender neste WhatsApp.');
      return;
    }

    setBusyKey('products');
    setErrorMessage(null);

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
      setStatusMessage('Catálogo salvo. Agora vamos montar o arsenal de prova social e mídia.');
    } catch (error: any) {
      setErrorMessage(error?.message || 'Não foi possível salvar os produtos selecionados.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleMediaFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';

    if (files.length === 0) return;

    setUploadingCount((count) => count + files.length);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const uploads = await Promise.all(
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
            createdAt: nowIso(),
          } satisfies ArsenalItem;
        }),
      );

      setDraft((current) => ({
        ...current,
        arsenal: [...current.arsenal, ...uploads],
        updatedAt: nowIso(),
      }));

      setStatusMessage(`${uploads.length} mídia(s) adicionadas ao arsenal.`);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Falha ao enviar os arquivos do arsenal.');
    } finally {
      setUploadingCount((count) => Math.max(0, count - files.length));
    }
  };

  const advanceArsenal = async () => {
    const hasIncompleteMedia = draft.arsenal.some(
      (item) => !item.type || !item.productId || !item.description.trim() || !item.url.trim(),
    );

    if (hasIncompleteMedia) {
      setErrorMessage(
        'Complete tipo, produto e descrição em todas as mídias adicionadas antes de avançar.',
      );
      return;
    }

    setBusyKey('arsenal');
    setErrorMessage(null);

    const nextDraft = {
      ...draft,
      lastCompletedStep: Math.max(draft.lastCompletedStep, 2),
      updatedAt: nowIso(),
    };

    try {
      await persistSetup(nextDraft);
      setDraft(nextDraft);
      setStep(3);
      setStatusMessage('Arsenal salvo. Agora defina como a IA deve vender nesse número.');
    } catch (error: any) {
      setErrorMessage(error?.message || 'Não foi possível salvar o arsenal.');
    } finally {
      setBusyKey(null);
    }
  };

  const activateAi = async () => {
    if (!effectiveConnection.connected) {
      setErrorMessage('Conecte o WhatsApp antes de ativar a IA vendedora.');
      setStep(0);
      return;
    }

    if (draft.selectedProducts.length === 0) {
      setErrorMessage('Selecione pelo menos um produto antes de ativar a IA.');
      setStep(1);
      return;
    }

    if (uploadingCount > 0) {
      setErrorMessage('Aguarde o upload das mídias terminar antes de ativar a IA.');
      return;
    }

    setBusyKey('activate');
    setErrorMessage(null);

    const timestamp = nowIso();
    const nextDraft: WhatsAppSetupState = {
      ...draft,
      sessionName: workspaceId,
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
      setIsReconfiguring(false);
      setStatusMessage('IA ativada. O painel operacional do WhatsApp já está pronto.');
    } catch (error: any) {
      setErrorMessage(error?.message || 'Não foi possível ativar a IA agora.');
    } finally {
      setBusyKey(null);
    }
  };

  const connectionLabel = effectiveConnection.connected
    ? 'Ativo'
    : effectiveConnection.status === 'connection_incomplete'
      ? 'Configuração pendente'
      : 'Desconectado';

  const connectionPill = effectiveConnection.connected
    ? {
        color: GREEN,
        background: 'rgba(16,185,129,0.12)',
      }
    : {
        color: EMBER,
        background: 'rgba(232,93,48,0.12)',
      };
  const profileName = effectiveConnection.pushName || operator || 'Aguardando perfil';
  const connectedPhone =
    effectiveConnection.phoneNumber || effectiveConnection.phoneNumberId || 'Aguardando número';
  const operationalStatusValue = effectiveConnection.connected
    ? 'Ativo'
    : effectiveConnection.status === 'connection_incomplete'
      ? 'Configuração pendente'
      : 'Desconectado';

  if (!workspaceId) {
    return (
      <Surface>
        <SectionLabel>WhatsApp</SectionLabel>
        <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT }}>
          Workspace indisponível. Recarregue a sessão antes de abrir o módulo.
        </div>
      </Surface>
    );
  }

  if (!hydratedRef.current && (settingsLoading || statusLoading)) {
    return (
      <Surface>
        <SectionLabel>WhatsApp</SectionLabel>
        <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT }}>
          Sincronizando o estado do WhatsApp para este workspace...
        </div>
      </Surface>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{`
        @keyframes whatsappFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 980px) {
          .wa-setup-grid,
          .wa-panel-grid,
          .wa-panel-status,
          .wa-products-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {statusMessage ? (
        <div
          style={{
            borderRadius: 16,
            border: `1px solid ${GREEN}24`,
            background: 'rgba(16,185,129,0.08)',
            color: '#C7F9E6',
            padding: '14px 16px',
            fontFamily: SORA,
            fontSize: 13,
          }}
        >
          {statusMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div
          style={{
            borderRadius: 16,
            border: '1px solid rgba(248,113,113,0.24)',
            background: 'rgba(248,113,113,0.08)',
            color: '#FECACA',
            padding: '14px 16px',
            fontFamily: SORA,
            fontSize: 13,
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      {showWizard ? (
        <div
          className="wa-setup-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1.15fr) minmax(300px,0.85fr)',
            gap: 18,
            animation: 'whatsappFadeUp .35s ease both',
          }}
        >
          <Surface>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
                marginBottom: 22,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: EMBER,
                    marginBottom: 10,
                  }}
                >
                  WhatsApp Setup
                </div>
                <h1
                  style={{
                    fontFamily: SORA,
                    fontSize: 28,
                    lineHeight: 1.1,
                    color: TEXT,
                    margin: 0,
                    marginBottom: 10,
                  }}
                >
                  Configure a operação que a IA vai assumir nesse número.
                </h1>
                <p
                  style={{
                    margin: 0,
                    color: MUTED,
                    fontFamily: SORA,
                    fontSize: 14,
                    lineHeight: 1.7,
                    maxWidth: 620,
                  }}
                >
                  O wizard cuida da conexão, catálogo, arsenal de prova social e regras de venda.
                  Quando terminar, o módulo volta para monitoramento em tempo real.
                </p>
              </div>
              <StatusPill
                color={connectionPill.color}
                background={connectionPill.background}
                label={connectionLabel}
              />
            </div>

            <StepIndicator current={step} />

            {step === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h2
                    style={{
                      margin: 0,
                      marginBottom: 8,
                      fontFamily: SORA,
                      fontSize: 22,
                      color: TEXT,
                    }}
                  >
                    Conecte o WhatsApp do workspace
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      color: MUTED,
                      fontFamily: SORA,
                      fontSize: 14,
                      lineHeight: 1.7,
                    }}
                  >
                    A sessão operacional usa o identificador do workspace como nome técnico e fica
                    em observação contínua até a autenticação ser confirmada.
                  </p>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) minmax(240px,280px)',
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      borderRadius: 20,
                      background: '#FFFFFF',
                      minHeight: 320,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 24,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {effectiveConnection.qrCode ? (
                      <img
                        src={effectiveConnection.qrCode}
                        alt="QR Code do WhatsApp"
                        style={{ width: 'min(100%, 260px)', height: 'auto', borderRadius: 14 }}
                      />
                    ) : effectiveConnection.authUrl ? (
                      <div style={{ textAlign: 'center', maxWidth: 260 }}>
                        <div
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: 24,
                            background: 'rgba(24,119,242,0.10)',
                            margin: '0 auto 18px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <svg
                            width="30"
                            height="30"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={META}
                            strokeWidth="1.8"
                          >
                            <rect x="3" y="3" width="18" height="18" rx="4" />
                            <path d="M8 8h8v8H8z" />
                            <path d="M16 16l3 3" />
                          </svg>
                        </div>
                        <div
                          style={{
                            fontFamily: SORA,
                            fontSize: 18,
                            color: VOID,
                            fontWeight: 700,
                            marginBottom: 10,
                          }}
                        >
                          Conexão oficial disponível
                        </div>
                        <p
                          style={{
                            margin: 0,
                            fontFamily: SORA,
                            fontSize: 13,
                            color: '#4B5563',
                            lineHeight: 1.6,
                          }}
                        >
                          O runtime atual usa a autorização oficial da Meta. Assim que a conexão for
                          concluída, o wizard avança sozinho.
                        </p>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', maxWidth: 260 }}>
                        <div
                          style={{
                            width: 84,
                            height: 84,
                            borderRadius: 28,
                            background: 'rgba(232,93,48,0.10)',
                            margin: '0 auto 18px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <svg
                            width="34"
                            height="34"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={EMBER}
                            strokeWidth="1.8"
                          >
                            <path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
                            <path d="M12 18h.01" />
                          </svg>
                        </div>
                        <div
                          style={{
                            fontFamily: SORA,
                            fontSize: 18,
                            color: VOID,
                            fontWeight: 700,
                            marginBottom: 8,
                          }}
                        >
                          Pronto para iniciar a sessão
                        </div>
                        <p
                          style={{
                            margin: 0,
                            fontFamily: SORA,
                            fontSize: 13,
                            color: '#4B5563',
                            lineHeight: 1.6,
                          }}
                        >
                          Solicite a sessão e mantenha esta tela aberta. O módulo faz polling
                          contínuo até a autenticação confirmar.
                        </p>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <CompactInfoCard label="Status oficial" value={operationalStatusValue} />
                    <CompactInfoCard label="Perfil conectado" value={profileName} />
                    <CompactInfoCard label="Telefone conectado" value={connectedPhone} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <PrimaryButton onClick={handleConnectSession} disabled={busyKey === 'connect'}>
                    {busyKey === 'connect' ? 'Iniciando sessão...' : 'Solicitar conexão'}
                  </PrimaryButton>

                  {effectiveConnection.authUrl ? (
                    <PrimaryButton
                      onClick={() => window.location.assign(effectiveConnection.authUrl)}
                      color={META}
                      darkText={false}
                    >
                      Continuar na Meta
                    </PrimaryButton>
                  ) : null}

                  <GhostButton
                    onClick={() =>
                      void Promise.all([
                        mutateLiveStatus(),
                        Promise.resolve(onConnectionRefresh?.()),
                      ])
                    }
                  >
                    Atualizar status
                  </GhostButton>
                </div>

                {effectiveConnection.degradedReason ? (
                  <div
                    style={{
                      borderRadius: 16,
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.20)',
                      color: '#FCD34D',
                      padding: '14px 16px',
                      fontFamily: MONO,
                      fontSize: 11,
                    }}
                  >
                    {effectiveConnection.degradedReason}
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h2
                    style={{
                      margin: 0,
                      marginBottom: 8,
                      fontFamily: SORA,
                      fontSize: 22,
                      color: TEXT,
                    }}
                  >
                    Escolha o catálogo que a IA vai vender
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      color: MUTED,
                      fontFamily: SORA,
                      fontSize: 14,
                      lineHeight: 1.7,
                    }}
                  >
                    Produtos próprios aprovados e afiliações aprovadas aparecem no mesmo fluxo. A IA
                    só oferece o que você ativar aqui.
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <StatusPill
                    color={EMBER}
                    background="rgba(232,93,48,0.10)"
                    label={`${draft.selectedProducts.length} produto(s) selecionado(s)`}
                  />
                  <GhostButton
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
                  >
                    {draft.selectedProducts.length === selectableProducts.length
                      ? 'Desmarcar todos'
                      : 'Selecionar todos'}
                  </GhostButton>
                </div>

                <div
                  className="wa-products-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
                    gap: 12,
                  }}
                >
                  {selectableProducts.map((product) => (
                    <ProductSelectionCard
                      key={product.id}
                      product={product}
                      selected={selectedProductIds.has(product.id)}
                      onToggle={() => toggleProduct(product)}
                    />
                  ))}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <GhostButton onClick={() => setStep(0)}>Voltar</GhostButton>
                  <PrimaryButton
                    onClick={advanceProducts}
                    disabled={busyKey === 'products' || draft.selectedProducts.length === 0}
                  >
                    {busyKey === 'products' ? 'Salvando catálogo...' : 'Salvar e continuar'}
                  </PrimaryButton>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h2
                    style={{
                      margin: 0,
                      marginBottom: 8,
                      fontFamily: SORA,
                      fontSize: 22,
                      color: TEXT,
                    }}
                  >
                    Monte o arsenal de vendas
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      color: MUTED,
                      fontFamily: SORA,
                      fontSize: 14,
                      lineHeight: 1.7,
                    }}
                  >
                    Fotos, vídeos, provas sociais e documentos entram aqui. Essa etapa é opcional,
                    mas melhora muito o repertório da IA nas negociações.
                  </p>
                </div>

                <label
                  style={{
                    borderRadius: 18,
                    border: `1px dashed ${BORDER}`,
                    background: ELEVATED,
                    padding: 20,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: SORA,
                        fontSize: 15,
                        color: TEXT,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      Adicionar mídia ao arsenal
                    </div>
                    <div style={{ fontFamily: SORA, fontSize: 13, color: MUTED }}>
                      Faça upload de imagens, vídeos, áudios e documentos. O arquivo sobe agora; os
                      metadados você completa abaixo.
                    </div>
                  </div>
                  <PrimaryButton color={EMBER}>Escolher arquivos</PrimaryButton>
                  <input type="file" multiple hidden onChange={handleMediaFiles} />
                </label>

                {draft.arsenal.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {draft.arsenal.map((item) => (
                      <MediaAssetCard
                        key={item.id}
                        item={item}
                        products={selectedProductsDetailed}
                        onUpdate={(nextItem) =>
                          setDraft((current) => ({
                            ...current,
                            arsenal: current.arsenal.map((entry) =>
                              entry.id === nextItem.id ? nextItem : entry,
                            ),
                            updatedAt: nowIso(),
                          }))
                        }
                        onRemove={() =>
                          setDraft((current) => ({
                            ...current,
                            arsenal: current.arsenal.filter((entry) => entry.id !== item.id),
                            updatedAt: nowIso(),
                          }))
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      borderRadius: 18,
                      border: `1px solid ${BORDER}`,
                      background: CARD,
                      padding: 24,
                      color: MUTED,
                      fontFamily: SORA,
                      fontSize: 13,
                      lineHeight: 1.7,
                    }}
                  >
                    Nenhuma mídia adicionada ainda. Você pode pular agora e complementar depois pelo
                    botão de reconfiguração.
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <GhostButton onClick={() => setStep(1)}>Voltar</GhostButton>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <GhostButton
                      onClick={async () => {
                        const nextDraft = {
                          ...draft,
                          lastCompletedStep: Math.max(draft.lastCompletedStep, 2),
                          updatedAt: nowIso(),
                        };
                        try {
                          setBusyKey('arsenal-skip');
                          await persistSetup(nextDraft);
                          setDraft(nextDraft);
                          setStep(3);
                        } catch (error: any) {
                          setErrorMessage(error?.message || 'Não foi possível seguir agora.');
                        } finally {
                          setBusyKey(null);
                        }
                      }}
                      disabled={busyKey === 'arsenal-skip' || uploadingCount > 0}
                    >
                      Pular por agora
                    </GhostButton>
                    <PrimaryButton
                      onClick={advanceArsenal}
                      disabled={busyKey === 'arsenal' || uploadingCount > 0}
                    >
                      {busyKey === 'arsenal'
                        ? 'Salvando arsenal...'
                        : uploadingCount > 0
                          ? 'Concluindo uploads...'
                          : 'Salvar e continuar'}
                    </PrimaryButton>
                  </div>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h2
                    style={{
                      margin: 0,
                      marginBottom: 8,
                      fontFamily: SORA,
                      fontSize: 22,
                      color: TEXT,
                    }}
                  >
                    Configure o comportamento da IA vendedora
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      color: MUTED,
                      fontFamily: SORA,
                      fontSize: 14,
                      lineHeight: 1.7,
                    }}
                  >
                    Defina o tom, a autonomia comercial, o follow-up e as regras operacionais desse
                    WhatsApp.
                  </p>
                </div>

                <div>
                  <SectionLabel>Tom da conversa</SectionLabel>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
                      gap: 10,
                    }}
                  >
                    {TONE_OPTIONS.map((option) => {
                      const selected = draft.config.tone === option.value;
                      return (
                        <button
                          key={option.value}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              config: { ...current.config, tone: option.value },
                              updatedAt: nowIso(),
                            }))
                          }
                          style={{
                            appearance: 'none',
                            border: `1px solid ${selected ? `${EMBER}80` : BORDER}`,
                            background: selected ? 'rgba(232,93,48,0.08)' : CARD,
                            borderRadius: 18,
                            padding: 16,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <div
                            style={{
                              fontFamily: SORA,
                              fontSize: 14,
                              color: TEXT,
                              fontWeight: 600,
                              marginBottom: 6,
                            }}
                          >
                            {option.label}
                          </div>
                          <div
                            style={{
                              fontFamily: SORA,
                              fontSize: 12,
                              color: MUTED,
                              lineHeight: 1.55,
                            }}
                          >
                            {option.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <SectionLabel>Desconto máximo</SectionLabel>
                  <div
                    style={{
                      background: CARD,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 18,
                      padding: 18,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        marginBottom: 12,
                      }}
                    >
                      <span style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>
                        A IA pode oferecer até{' '}
                        <strong style={{ color: EMBER }}>{draft.config.maxDiscount}%</strong> sem
                        pedir autorização.
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>0% → 50%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={draft.config.maxDiscount}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          config: {
                            ...current.config,
                            maxDiscount: Number(event.target.value),
                          },
                          updatedAt: nowIso(),
                        }))
                      }
                      style={{ width: '100%', accentColor: EMBER }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      background: CARD,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 18,
                      padding: 18,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: SORA,
                            fontSize: 14,
                            color: TEXT,
                            fontWeight: 600,
                            marginBottom: 4,
                          }}
                        >
                          Follow-up automático
                        </div>
                        <div style={{ fontFamily: SORA, fontSize: 12, color: MUTED }}>
                          Retoma leads parados sem tirar sua operação do ar.
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            config: {
                              ...current.config,
                              followUpEnabled: !current.config.followUpEnabled,
                            },
                            updatedAt: nowIso(),
                          }))
                        }
                        style={{
                          appearance: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          background: draft.config.followUpEnabled ? EMBER : '#2A2A2E',
                          width: 50,
                          height: 28,
                          borderRadius: 999,
                          position: 'relative',
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            top: 4,
                            left: draft.config.followUpEnabled ? 26 : 4,
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            background: '#FFFFFF',
                            transition: 'left .2s ease',
                          }}
                        />
                      </button>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>
                      Intervalo atual: {draft.config.followUpHours}h
                    </div>
                  </div>

                  <div
                    style={{
                      background: CARD,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 18,
                      padding: 18,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: SORA,
                        fontSize: 14,
                        color: TEXT,
                        fontWeight: 600,
                        marginBottom: 10,
                      }}
                    >
                      Intervalo de follow-up
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="72"
                      value={draft.config.followUpHours}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          config: {
                            ...current.config,
                            followUpHours: Number(event.target.value),
                          },
                          updatedAt: nowIso(),
                        }))
                      }
                      style={{ width: '100%', accentColor: EMBER }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
                    gap: 14,
                  }}
                >
                  <div>
                    <SectionLabel>Início do atendimento</SectionLabel>
                    <input
                      type="time"
                      value={draft.config.workingHoursStart}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          config: {
                            ...current.config,
                            workingHoursStart: event.target.value,
                          },
                          updatedAt: nowIso(),
                        }))
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <SectionLabel>Fim do atendimento</SectionLabel>
                    <input
                      type="time"
                      value={draft.config.workingHoursEnd}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          config: {
                            ...current.config,
                            workingHoursEnd: event.target.value,
                          },
                          updatedAt: nowIso(),
                        }))
                      }
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <SectionLabel>Instruções livres para o Kloel</SectionLabel>
                  <textarea
                    value={draft.config.instructions}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        config: {
                          ...current.config,
                          instructions: event.target.value,
                        },
                        updatedAt: nowIso(),
                      }))
                    }
                    placeholder="Ex: nunca ofereça desconto antes do cliente pedir. Sempre mencione o bônus. Chame pelo primeiro nome."
                    style={{
                      ...inputStyle,
                      minHeight: 120,
                      resize: 'vertical',
                      lineHeight: 1.65,
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <GhostButton onClick={() => setStep(2)}>Voltar</GhostButton>
                  <PrimaryButton
                    onClick={activateAi}
                    disabled={busyKey === 'activate'}
                    color={GREEN}
                    darkText={false}
                  >
                    {busyKey === 'activate' ? 'Ativando IA...' : 'Salvar e ativar IA'}
                  </PrimaryButton>
                </div>
              </div>
            ) : null}
          </Surface>

          <Surface style={{ alignSelf: 'start' }}>
            <SectionLabel>Resumo do módulo</SectionLabel>
            <div style={{ marginBottom: 4 }}>
              <SummaryLine label="Sessão" value={draft.sessionName || workspaceId} />
              <SummaryLine label="Produtos ativos" value={String(draft.selectedProducts.length)} />
              <SummaryLine label="Mídias no arsenal" value={String(draft.arsenal.length)} />
              <SummaryLine
                label="Tom da IA"
                value={
                  TONE_OPTIONS.find((item) => item.value === draft.config.tone)?.label ||
                  'Profissional'
                }
              />
              <SummaryLine
                label="Follow-up"
                value={
                  draft.config.followUpEnabled ? `${draft.config.followUpHours}h` : 'Desativado'
                }
              />
              <SummaryLine
                label="Atendimento"
                value={`${draft.config.workingHoursStart} - ${draft.config.workingHoursEnd}`}
              />
            </div>

            <div
              style={{
                borderRadius: 16,
                background: ELEVATED,
                border: `1px solid ${BORDER}`,
                padding: 16,
                marginTop: 18,
              }}
            >
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 14,
                  color: TEXT,
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                Estado da operação
              </div>
              <div style={{ fontFamily: SORA, fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
                {effectiveConnection.connected
                  ? 'Conexão validada. Depois da ativação, a IA assume atendimento, consulta catálogo e usa o arsenal desta configuração.'
                  : 'Enquanto a autenticação não confirmar, o wizard permanece na etapa de conexão e continua checando o status automaticamente.'}
              </div>
            </div>
          </Surface>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            animation: 'whatsappFadeUp .35s ease both',
          }}
        >
          <Surface>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
                flexWrap: 'wrap',
                marginBottom: 18,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: EMBER,
                    marginBottom: 10,
                  }}
                >
                  WhatsApp Operations
                </div>
                <h1
                  style={{
                    margin: 0,
                    marginBottom: 10,
                    fontFamily: SORA,
                    fontSize: 28,
                    color: TEXT,
                    lineHeight: 1.1,
                  }}
                >
                  Monitoramento ao vivo do número conectado
                </h1>
                <p
                  style={{
                    margin: 0,
                    fontFamily: SORA,
                    fontSize: 14,
                    color: MUTED,
                    lineHeight: 1.7,
                    maxWidth: 760,
                  }}
                >
                  Este painel concentra status da conexão, métricas, feed operacional e os produtos
                  que a IA está autorizada a vender neste WhatsApp.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <StatusPill
                  color={connectionPill.color}
                  background={connectionPill.background}
                  label={connectionLabel}
                />
                <GhostButton
                  onClick={() => {
                    setIsReconfiguring(true);
                    setStep(effectiveConnection.connected ? 1 : 0);
                    setStatusMessage(null);
                    setErrorMessage(null);
                  }}
                >
                  Reconfigurar
                </GhostButton>
              </div>
            </div>

            <div
              className="wa-panel-status"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
                gap: 12,
              }}
            >
              <CompactInfoCard label="Status oficial" value={operationalStatusValue} />
              <CompactInfoCard label="Perfil conectado" value={profileName} />
              <CompactInfoCard label="Telefone conectado" value={connectedPhone} />
            </div>
          </Surface>

          <div
            className="wa-panel-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) minmax(320px,360px)',
              gap: 18,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
                  gap: 12,
                }}
              >
                <MetricTile
                  label="Mensagens"
                  value={formatCompact(channelData?.messages ?? 0)}
                  accent={EMBER}
                />
                <MetricTile
                  label="Leads"
                  value={formatCompact(channelData?.leads ?? 0)}
                  accent={GREEN}
                />
                <MetricTile
                  label="Vendas"
                  value={String(channelData?.sales ?? 0)}
                  accent={PURPLE}
                />
              </div>

              <Surface>
                <SectionLabel>Produtos selecionados</SectionLabel>
                {summaryProducts.length > 0 ? (
                  <div
                    className="wa-products-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
                      gap: 12,
                    }}
                  >
                    {summaryProducts.map((product) => (
                      <ProductPerformanceCard key={product.id} product={product} />
                    ))}
                  </div>
                ) : (
                  <div style={{ fontFamily: SORA, fontSize: 13, color: MUTED }}>
                    Nenhum produto ativo neste WhatsApp. Use “Reconfigurar” para montar o catálogo.
                  </div>
                )}
              </Surface>

              <LiveFeedPanel messages={liveFeed} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Surface>
                <SectionLabel>Configuração ativa</SectionLabel>
                <div style={{ marginBottom: 4 }}>
                  <SummaryLine
                    label="Sessão"
                    value={summaryData?.sessionName || draft.sessionName || workspaceId}
                  />
                  <SummaryLine
                    label="Tom"
                    value={
                      TONE_OPTIONS.find(
                        (item) => item.value === (summaryData?.tone || draft.config.tone),
                      )?.label || 'Profissional'
                    }
                  />
                  <SummaryLine
                    label="Desconto máximo"
                    value={`${summaryData?.maxDiscount ?? draft.config.maxDiscount}%`}
                  />
                  <SummaryLine
                    label="Follow-up"
                    value={
                      (summaryData?.followUpEnabled ?? draft.config.followUpEnabled)
                        ? `${draft.config.followUpHours}h`
                        : 'Desativado'
                    }
                  />
                  <SummaryLine
                    label="Arsenal"
                    value={`${summaryData?.arsenalCount ?? draft.arsenal.length} mídia(s)`}
                  />
                  <SummaryLine
                    label="Última ativação"
                    value={
                      draft.activatedAt
                        ? new Date(draft.activatedAt).toLocaleString('pt-BR')
                        : 'Agora'
                    }
                  />
                </div>
              </Surface>

              <Surface>
                <SectionLabel>Diretrizes livres</SectionLabel>
                <div
                  style={{
                    fontFamily: SORA,
                    fontSize: 13,
                    color: draft.config.instructions ? TEXT : MUTED,
                    lineHeight: 1.75,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {draft.config.instructions ||
                    'Nenhuma instrução extra cadastrada para este WhatsApp.'}
                </div>
              </Surface>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WhatsAppExperience;
