'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import {
  RECENT_DIMENSIONS,
  type FormatItem,
} from '@/lib/canvas-formats';
import { useId } from 'react';

const S = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

interface CustomSizePanelProps {
  customW: string;
  customH: string;
  setCustomW: (v: string) => void;
  setCustomH: (v: string) => void;
  openEditor: (
    fmt: FormatItem | { l: string; w: number; h: number; c: [string, string]; m: string },
  ) => void;
}

export function CustomSizePanel({
  customW,
  customH,
  setCustomW,
  setCustomH,
  openEditor,
}: CustomSizePanelProps) {
  const fid = useId();
  return (
    <div>
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: colors.text.silver,
          fontFamily: S,
          marginBottom: 16,
        }}
      >
        {kloelT(`Tamanho personalizado`)}
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: colors.text.muted,
              fontFamily: S,
              display: 'block',
              marginBottom: 6,
            }}
            htmlFor={`${fid}-largura`}
          >
            {kloelT(`Largura`)}
          </label>
          <input
            aria-label="Largura em pixels"
            value={customW}
            onChange={(e) => setCustomW(e.target.value)}
            placeholder="1080"
            style={{
              width: '100%',
              background: colors.background.surface,
              border: `1px solid ${colors.canvas.border}`,
              borderRadius: 4,
              padding: '10px 12px',
              color: colors.text.silver,
              fontSize: 14,
              fontFamily: M,
              outline: 'none',
            }}
            id={`${fid}-largura`}
          />
        </div>
        <span style={{ color: colors.text.dim, marginTop: 20, fontFamily: M, fontSize: 12 }}>
          x
        </span>
        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: colors.text.muted,
              fontFamily: S,
              display: 'block',
              marginBottom: 6,
            }}
            htmlFor={`${fid}-altura`}
          >
            {kloelT(`Altura`)}
          </label>
          <input
            aria-label="Altura em pixels"
            value={customH}
            onChange={(e) => setCustomH(e.target.value)}
            placeholder="1080"
            style={{
              width: '100%',
              background: colors.background.surface,
              border: `1px solid ${colors.canvas.border}`,
              borderRadius: 4,
              padding: '10px 12px',
              color: colors.text.silver,
              fontSize: 14,
              fontFamily: M,
              outline: 'none',
            }}
            id={`${fid}-altura`}
          />
        </div>
        <div style={{ flex: 0.6 }}>
          <label
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: colors.text.muted,
              fontFamily: S,
              display: 'block',
              marginBottom: 6,
            }}
            htmlFor={`${fid}-unidades`}
          >
            {kloelT(`Unidades`)}
          </label>
          <select
            style={{
              width: '100%',
              background: colors.background.surface,
              border: `1px solid ${colors.canvas.border}`,
              borderRadius: 4,
              padding: '10px',
              color: colors.text.silver,
              fontSize: 12,
              fontFamily: S,
              outline: 'none',
            }}
            id={`${fid}-unidades`}
          >
            <option>px</option>
            <option>mm</option>
            <option>cm</option>
            <option>in</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() =>
            openEditor({
              l: 'Personalizado',
              w: Number.parseInt(customW, 10) || 1080,
              h: Number.parseInt(customH, 10) || 1080,
              c: [colors.ember.primary, colors.canvas.accent],
              m: 'square',
            })
          }
          style={{
            marginTop: 20,
            padding: '10px 18px',
            background: colors.ember.primary,
            border: 'none',
            borderRadius: 4,
            color: colors.background.void,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: S,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {kloelT(`Criar`)}
        </button>
      </div>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: colors.text.muted,
          fontFamily: S,
          marginBottom: 10,
        }}
      >
        {kloelT(`Dimensoes recentes`)}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {RECENT_DIMENSIONS.map((d) => (
          <button
            type="button"
            key={`${d.w}x${d.h}`}
            onClick={() =>
              openEditor({
                l: `${d.w}x${d.h}`,
                w: d.w,
                h: d.h,
                c: [colors.text.muted, colors.text.dim],
                m: 'square',
              })
            }
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'colors.ember.glow40';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor =
                colors.canvas.border;
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: colors.background.surface,
              border: `1px solid ${colors.canvas.border}`,
              borderRadius: 4,
              padding: '10px 14px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: S,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.text.dim}
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
            <span style={{ fontFamily: M, fontSize: 12, color: colors.text.silver }}>
              {d.w} x {d.h} px
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
