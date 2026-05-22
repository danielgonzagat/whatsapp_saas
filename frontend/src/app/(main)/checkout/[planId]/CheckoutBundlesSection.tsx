'use client';

import { kloelT } from '@/lib/i18n/t';
import type { CheckoutConfig } from '@/hooks/useCheckoutEditor';
import {
  Plus,
  Trash2,
} from 'lucide-react';
import type { RefObject } from 'react';
import {
  C,
  Field,
  FONT,
  removeBtnStyle,
  sectionStyle,
  sectionTitleStyle,
  smallBtnStyle,
} from './checkout-editor-shared';

export interface CheckoutBundlesSectionProps {
  config: CheckoutConfig;
  patch: (p: Partial<CheckoutConfig>) => Promise<void>;
  highlightedSection: string | null;
  highlightActive: boolean;
  orderBumpsRef: RefObject<HTMLDivElement | null>;
}

function sectionCardStyle(key: string, ha: boolean, hs: string | null) {
  return {
    ...sectionStyle,
    ...(ha && hs === key
      ? { border: `1px solid ${C.ember}`, boxShadow: `0 0 0 1px ${C.ember}22 inset` }
      : null),
  };
}

export function CheckoutBundlesSection({
  config,
  patch,
  highlightedSection,
  highlightActive,
  orderBumpsRef,
}: CheckoutBundlesSectionProps) {
  return (
    <>
      <div
        ref={orderBumpsRef}
        style={sectionCardStyle('order-bump', highlightActive, highlightedSection)}
      >
        <h3 style={sectionTitleStyle}>{kloelT('Order Bumps')}</h3>
        {config.orderBumps.map((ob, i) => (
          <div
            key={ob.id}
            style={{
              marginBottom: 12,
              padding: 12,
              backgroundColor: C.elevated,
              borderRadius: 6,
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: C.muted, fontFamily: FONT }}>
                {kloelT('Bump')} {i + 1}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = [...config.orderBumps];
                  next.splice(i, 1);
                  void patch({ orderBumps: next });
                }}
                style={removeBtnStyle}
              >
                <Trash2 style={{ width: 12, height: 12 }} aria-hidden="true" />
              </button>
            </div>
            <Field
              label={kloelT('Titulo')}
              value={ob.title}
              onChange={(v) => {
                const next = [...config.orderBumps];
                next[i] = { ...next[i], title: v };
                void patch({ orderBumps: next });
              }}
              placeholder={kloelT('Adicione tambem...')}
            />
            <Field
              label={kloelT('Descricao')}
              value={ob.description}
              onChange={(v) => {
                const next = [...config.orderBumps];
                next[i] = { ...next[i], description: v };
                void patch({ orderBumps: next });
              }}
              placeholder={kloelT('Complemento ideal')}
              multiline
            />
            <Field
              label={kloelT('Nome do produto')}
              value={ob.productName}
              onChange={(v) => {
                const next = [...config.orderBumps];
                next[i] = { ...next[i], productName: v };
                void patch({ orderBumps: next });
              }}
              placeholder={kloelT('Produto Bump')}
            />
            <Field
              label={kloelT('Preco (R$)')}
              value={ob.price}
              onChange={(v) => {
                const next = [...config.orderBumps];
                next[i] = { ...next[i], price: Number.parseFloat(v) || 0 };
                void patch({ orderBumps: next });
              }}
              type="number"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            void patch({
              orderBumps: [
                ...config.orderBumps,
                { title: '', description: '', productName: '', price: 0 },
              ],
            })
          }
          style={smallBtnStyle}
        >
          <Plus style={{ width: 14, height: 14 }} aria-hidden="true" />
          {kloelT('Adicionar order bump')}
        </button>
      </div>

      {/* ── Upsells ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{kloelT('Upsells')}</h3>
        {config.upsells.map((us, i) => (
          <div
            key={us.id}
            style={{
              marginBottom: 12,
              padding: 12,
              backgroundColor: C.elevated,
              borderRadius: 6,
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: C.muted, fontFamily: FONT }}>
                {kloelT('Upsell')} {i + 1}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = [...config.upsells];
                  next.splice(i, 1);
                  void patch({ upsells: next });
                }}
                style={removeBtnStyle}
              >
                <Trash2 style={{ width: 12, height: 12 }} aria-hidden="true" />
              </button>
            </div>
            <Field
              label={kloelT('Titulo')}
              value={us.title}
              onChange={(v) => {
                const next = [...config.upsells];
                next[i] = { ...next[i], title: v };
                void patch({ upsells: next });
              }}
              placeholder={kloelT('Oferta especial')}
            />
            <Field
              label={kloelT('Descricao')}
              value={us.description}
              onChange={(v) => {
                const next = [...config.upsells];
                next[i] = { ...next[i], description: v };
                void patch({ upsells: next });
              }}
              placeholder={kloelT('Upgrade seu plano')}
              multiline
            />
            <Field
              label={kloelT('Nome do produto')}
              value={us.productName}
              onChange={(v) => {
                const next = [...config.upsells];
                next[i] = { ...next[i], productName: v };
                void patch({ upsells: next });
              }}
              placeholder={kloelT('Produto Upsell')}
            />
            <Field
              label={kloelT('Preco (R$)')}
              value={us.price}
              onChange={(v) => {
                const next = [...config.upsells];
                next[i] = { ...next[i], price: Number.parseFloat(v) || 0 };
                void patch({ upsells: next });
              }}
              type="number"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            void patch({
              upsells: [
                ...config.upsells,
                { title: '', description: '', productName: '', price: 0 },
              ],
            })
          }
          style={smallBtnStyle}
        >
          <Plus style={{ width: 14, height: 14 }} aria-hidden="true" />
          {kloelT('Adicionar upsell')}
        </button>
      </div>
    </>
  );
}
