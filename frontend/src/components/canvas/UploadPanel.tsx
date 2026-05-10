'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { IC } from './CanvasIcons';

const S = "var(--font-sora), 'Sora', sans-serif";

export function UploadPanel() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 500,
          height: 280,
          border: `2px dashed ${colors.canvas.border}`,
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <div style={{ color: colors.ember.primary, opacity: 0.5 }}>{IC.upload(40)}</div>
        <p
          style={{
            fontSize: 14,
            color: colors.text.muted,
            fontFamily: S,
          }}
        >
          {kloelT(`Arraste seu conteudo para ca ou`)}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            style={{
              padding: '8px 16px',
              background: colors.ember.primary,
              border: 'none',
              borderRadius: 4,
              color: colors.background.void,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: S,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {IC.plus(12)} {kloelT(`Fazer upload de arquivos`)}
          </button>
          <button
            type="button"
            style={{
              padding: '8px 16px',
              background: colors.background.surface,
              border: `1px solid ${colors.canvas.border}`,
              borderRadius: 4,
              color: colors.text.silver,
              fontSize: 12,
              fontFamily: S,
              cursor: 'pointer',
            }}
          >
            {kloelT(`Fazer upload de pasta`)}
          </button>
        </div>
      </div>
      <p
        style={{
          fontSize: 11,
          color: colors.text.dim,
          fontFamily: S,
        }}
      >
        {kloelT(`Aceita imagens, videos, outros arquivos e pastas`)}
      </p>
    </div>
  );
}
