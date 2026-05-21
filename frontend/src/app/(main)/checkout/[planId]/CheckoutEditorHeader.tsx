'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { type CheckoutConfig } from '@/hooks/useCheckoutEditor';
import { buildDashboardHref } from '@/lib/kloel-dashboard-context';
import {
  ArrowLeft,
  Check,
  Copy,
  Star,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  C,
  DEVICES,
  FONT,
  MONO,
  R,
  smallBtnStyle,
  type DeviceId,
} from './checkout-editor-shared';

export interface CheckoutEditorHeaderProps {
  config: CheckoutConfig;
  isLoading: boolean;
  device: DeviceId;
  setDevice: (d: DeviceId) => void;
  saveFeedback: 'saving' | 'saved' | null;
  copied: boolean;
  embedCopied: boolean;
  copyLink: () => void;
  copyEmbedCode: () => void;
  productReturnHref: string | null;
  source: string;
  productId: string;
  productName: string;
  requestedFocus: string;
  planId: string;
}

export function CheckoutEditorHeader({
  config,
  isLoading,
  device,
  setDevice,
  saveFeedback,
  copied,
  embedCopied,
  copyLink,
  copyEmbedCode,
  productReturnHref,
  source,
  productId,
  productName,
  requestedFocus,
  planId,
}: CheckoutEditorHeaderProps) {
  const router = useRouter();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        height: 52,
        borderBottom: `1px solid ${C.border}`,
        backgroundColor: C.surface,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => {
            if (productReturnHref) {
              router.push(productReturnHref);
              return;
            }
            router.back();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
            color: C.muted,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: FONT,
          }}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} aria-hidden="true" />
          {productReturnHref ? 'Voltar para produto' : 'Voltar'}
        </button>
        <div style={{ width: 1, height: 20, backgroundColor: C.border }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: FONT }}>
          {kloelT('Editor de Checkout')}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            fontSize: 12,
            fontFamily: MONO,
            color: isLoading
              ? C.ember
              : saveFeedback === 'saving'
                ? C.ember
                : saveFeedback === 'saved'
                  ? colors.semantic.successText
                  : C.dim,
          }}
        >
          {isLoading
            ? 'Sincronizando...'
            : saveFeedback === 'saving'
              ? 'Salvando...'
              : saveFeedback === 'saved'
                ? 'Salvo \u2713'
                : ''}
        </span>

        <div
          style={{
            display: 'flex',
            gap: 2,
            backgroundColor: C.elevated,
            borderRadius: R,
            padding: 2,
          }}
        >
          {DEVICES.map((d) => {
            const Icon = d.icon;
            const active = device === d.id;
            return (
              <button
                type="button"
                key={d.id}
                onClick={() => setDevice(d.id)}
                title={d.id}
                disabled={isLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 28,
                  borderRadius: R,
                  border: 'none',
                  backgroundColor: active ? C.border : 'transparent',
                  color: active ? C.text : C.muted,
                  cursor: isLoading ? 'default' : 'pointer',
                  opacity: isLoading ? 0.5 : 1,
                  transition: 'all 150ms ease',
                }}
              >
                <Icon style={{ width: 16, height: 16 }} />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() =>
            router.push(
              buildDashboardHref({
                source: source || 'checkout',
                planId,
                planName: config.productDisplayName || '',
                productId: productId || '',
                productName: productName || config.productDisplayName || '',
                purpose: requestedFocus || 'checkout',
              }),
            )
          }
          disabled={isLoading}
          style={{
            ...smallBtnStyle,
            opacity: isLoading ? 0.5 : 1,
            cursor: isLoading ? 'default' : 'pointer',
          }}
        >
          <Star style={{ width: 14, height: 14 }} aria-hidden="true" />
          {kloelT('Abrir com IA')}
        </button>

        <button
          type="button"
          onClick={copyLink}
          disabled={isLoading}
          style={{
            ...smallBtnStyle,
            opacity: isLoading ? 0.5 : 1,
            cursor: isLoading ? 'default' : 'pointer',
          }}
        >
          {copied ? (
            <Check style={{ width: 14, height: 14, color: colors.semantic.successText }} aria-hidden="true" />
          ) : (
            <Copy style={{ width: 14, height: 14 }} aria-hidden="true" />
          )}
          {copied ? 'Copiado!' : 'Copiar link'}
        </button>
        <button
          type="button"
          onClick={copyEmbedCode}
          disabled={isLoading}
          style={{
            ...smallBtnStyle,
            opacity: isLoading ? 0.5 : 1,
            cursor: isLoading ? 'default' : 'pointer',
          }}
        >
          {embedCopied ? (
            <Check style={{ width: 14, height: 14, color: colors.semantic.successText }} aria-hidden="true" />
          ) : (
            <Copy style={{ width: 14, height: 14 }} aria-hidden="true" />
          )}
          {embedCopied ? 'Widget copiado!' : 'Copiar widget'}
        </button>
      </div>
    </div>
  );
}
