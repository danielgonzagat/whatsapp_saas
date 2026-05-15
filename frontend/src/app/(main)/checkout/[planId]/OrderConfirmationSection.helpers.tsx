'use client';
import { kloelT } from '@/lib/i18n/t';
import { Plus, Trash2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import {
  C,
  Field,
  FONT,
  removeBtnStyle,
  sectionStyle,
  smallBtnStyle,
} from './checkout-editor-shared';

export function sectionCardStyle(
  key: string,
  highlightActive: boolean,
  highlightedSection: string | null,
): CSSProperties {
  return {
    ...sectionStyle,
    ...(highlightActive && highlightedSection === key
      ? { border: `1px solid ${C.ember}`, boxShadow: `0 0 0 1px ${C.ember}22 inset` }
      : null),
  };
}

interface BumpUpsellItem {
  id?: string;
  title: string;
  description: string;
  productName: string;
  price: number;
}

export function BumpUpsellListEditor({
  items,
  onChange,
  itemLabel,
  titlePlaceholder,
  descPlaceholder,
  productNamePlaceholder,
  addButtonLabel,
}: {
  items: BumpUpsellItem[];
  onChange: (next: BumpUpsellItem[]) => void;
  itemLabel: string;
  titlePlaceholder: string;
  descPlaceholder: string;
  productNamePlaceholder: string;
  addButtonLabel: string;
}) {
  return (
    <>
      {items.map((item, i) => (
        <div
          key={item.id}
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
              {itemLabel} {i + 1}
            </span>
            <button
              type="button"
              onClick={() => {
                const next = [...items];
                next.splice(i, 1);
                onChange(next);
              }}
              style={removeBtnStyle}
            >
              <Trash2 style={{ width: 12, height: 12 }} aria-hidden="true" />
            </button>
          </div>
          <Field
            label={kloelT('Titulo')}
            value={item.title}
            onChange={(v) => {
              const next = [...items];
              next[i] = { ...next[i], title: v };
              onChange(next);
            }}
            placeholder={titlePlaceholder}
          />
          <Field
            label={kloelT('Descricao')}
            value={item.description}
            onChange={(v) => {
              const next = [...items];
              next[i] = { ...next[i], description: v };
              onChange(next);
            }}
            placeholder={descPlaceholder}
            multiline
          />
          <Field
            label={kloelT('Nome do produto')}
            value={item.productName}
            onChange={(v) => {
              const next = [...items];
              next[i] = { ...next[i], productName: v };
              onChange(next);
            }}
            placeholder={productNamePlaceholder}
          />
          <Field
            label={kloelT('Preco (R$)')}
            value={item.price}
            onChange={(v) => {
              const next = [...items];
              next[i] = { ...next[i], price: Number.parseFloat(v) || 0 };
              onChange(next);
            }}
            type="number"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([...items, { title: '', description: '', productName: '', price: 0 }])
        }
        style={smallBtnStyle}
      >
        <Plus style={{ width: 14, height: 14 }} aria-hidden="true" />
        {addButtonLabel}
      </button>
    </>
  );
}
