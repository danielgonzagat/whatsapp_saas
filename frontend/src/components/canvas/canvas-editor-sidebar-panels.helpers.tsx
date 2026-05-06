'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import { ELEMENT_CATEGORIES } from '@/lib/canvas-formats';
import type { KloelEditor } from '@/lib/fabric';
import { IC } from './CanvasIcons';
import {
  FONT_SORA as S,
  panelHeading,
  panelSubtext,
  cardBtn,
  accentBtn,
} from './canvas-editor.types';

interface ShapeConfig {
  id: 'rect' | 'circle' | 'triangle' | 'line' | 'star';
  label: string;
  render: () => React.JSX.Element;
}

const SHAPES: ShapeConfig[] = [
  {
    id: 'rect' as const,
    label: 'Retangulo',
    render: () => (
      <div style={{ width: 28, height: 28, background: UI.accent, borderRadius: UI.radiusSm }} />
    ),
  },
  {
    id: 'circle' as const,
    label: 'Circulo',
    render: () => (
      <div style={{ width: 28, height: 28, background: UI.info, borderRadius: UI.radiusFull }} />
    ),
  },
  {
    id: 'triangle' as const,
    label: 'Triangulo',
    render: () => (
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: '14px solid transparent',
          borderRight: '14px solid transparent',
          borderBottom: '28px solid UI.info',
        }}
      />
    ),
  },
  {
    id: 'line' as const,
    label: 'Linha',
    render: () => (
      <div style={{ width: 28, height: 3, background: UI.success, borderRadius: UI.radiusSm }} />
    ),
  },
  {
    id: 'star' as const,
    label: 'Estrela',
    render: () => (
      <div style={{ lineHeight: 1 }}>
        <svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="UI.warning"
          stroke="none"
          aria-hidden="true"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
        </svg>
      </div>
    ),
  },
] as const;

type ShapeId = (typeof SHAPES)[number]['id'];

type ElementsPanelProps = {
  handleAddShape: (shape: ShapeId) => void;
};

export function ElementsPanel({ handleAddShape }: ElementsPanelProps) {
  return (
    <div>
      <p style={panelHeading}>{kloelT(`Elementos`)}</p>
      <p style={{ ...panelSubtext, marginBottom: 8, fontWeight: 600, color: UI.muted }}>
        {kloelT(`Formas`)}
      </p>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}
      >
        {SHAPES.map((shape) => (
          <button
            type="button"
            key={shape.id}
            onClick={() => handleAddShape(shape.id)}
            style={{
              ...cardBtn,
              padding: 8,
              aspectRatio: '1',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={shape.label}
          >
            {shape.render()}
          </button>
        ))}
      </div>
      <p style={{ ...panelSubtext, marginBottom: 8, fontWeight: 600, color: UI.muted }}>
        {kloelT(`Categorias`)}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {ELEMENT_CATEGORIES.map((cat) => (
          <div
            key={cat.l}
            style={{
              ...cardBtn,
              flexDirection: 'row',
              padding: '8px 10px',
              gap: 8,
              justifyContent: 'flex-start',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: UI.radiusFull,
                background: cat.c,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 10, color: UI.text, fontFamily: S }}>{cat.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SOLID_COLORS = [
  'UI.bg',
  'UI.surface',
  'UI.border',
  'UI.tertiary',
  'UI.tertiary',
  'UI.muted',
  'UI.text',
  'UI.bg',
  'UI.accent',
  'UI.warning',
  'UI.success',
  'UI.info',
  'UI.info',
  'UI.info',
  'UI.info',
  'UI.error',
  'UI.info',
  'UI.info',
];

const GRADIENTS: [string, string][] = [
  ['UI.accent', 'UI.warning'],
  ['UI.info', 'UI.error'],
  ['UI.info', 'UI.success'],
  ['UI.info', 'UI.info'],
  ['UI.info', 'UI.info'],
  ['UI.bg', 'UI.tertiary'],
];

type BackgroundPanelProps = {
  editor: KloelEditor | null;
  handleSetBackground: (color: string) => void;
};

export function BackgroundPanel({ editor, handleSetBackground }: BackgroundPanelProps) {
  return (
    <div>
      <p style={panelHeading}>{kloelT(`Fundo`)}</p>
      <p style={{ ...panelSubtext, marginBottom: 12 }}>{kloelT(`Cor solida`)}</p>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 20 }}
      >
        {SOLID_COLORS.map((c) => (
          <button
            type="button"
            key={c}
            onClick={() => handleSetBackground(c)}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: UI.radiusSm,
              background: c,
              border: c === 'UI.bg' ? '1px solid UI.tertiary' : 'none',
              cursor: 'pointer',
              transition: 'transform 150ms',
            }}
            title={c}
          />
        ))}
      </div>
      <p style={{ ...panelSubtext, marginBottom: 8 }}>{kloelT(`Gradientes`)}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {GRADIENTS.map(([a, b]) => (
          <button
            type="button"
            key={`${a}-${b}`}
            onClick={() => handleSetBackground(a)}
            style={{
              width: '100%',
              aspectRatio: '1.6',
              borderRadius: UI.radiusSm,
              background: UI.card,
              border: 'none',
              cursor: 'pointer',
            }}
            title={`${a} -> ${b}`}
          />
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <p style={{ ...panelSubtext, marginBottom: 8, fontWeight: 600, color: UI.muted }}>
          {kloelT(`Imagem de fundo`)}
        </p>
        <button
          type="button"
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (ev) => {
              const file = (ev.target as HTMLInputElement).files?.[0];
              if (file) editor?.background.setImageFromFile(file);
            };
            input.click();
          }}
          style={{ ...cardBtn, width: '100%', flexDirection: 'row', padding: '10px 12px', gap: 6 }}
        >
          {IC.upload(14)}{' '}
          <span style={{ fontSize: 10, color: UI.text, fontFamily: S }}>
            {kloelT(`Fazer upload de imagem`)}
          </span>
        </button>
        <button
          type="button"
          onClick={() => editor?.background.removeBackground()}
          style={{
            ...cardBtn,
            width: '100%',
            flexDirection: 'row',
            padding: '8px 12px',
            gap: 6,
            marginTop: 6,
          }}
        >
          {IC.x(14)}{' '}
          <span style={{ fontSize: 10, color: UI.text, fontFamily: S }}>
            {kloelT(`Remover fundo`)}
          </span>
        </button>
      </div>
    </div>
  );
}
