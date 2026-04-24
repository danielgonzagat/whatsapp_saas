'use client';

import { kloelT } from '@/lib/i18n/t';
import { FONT_SORA as S, FONT_JETBRAINS as M } from './canvas-editor.types';

type BottomBarProps = {
  saving: boolean;
  saved: boolean;
  zoom: number;
  canvasW: number;
  canvasH: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
};

export function CanvasBottomBar({
  saving,
  saved,
  zoom,
  canvasW,
  canvasH,
  onZoomIn,
  onZoomOut,
  onZoomFit,
}: BottomBarProps) {
  return (
    <div
      style={{
        height: 40,
        borderTop: '1px solid #1C1C1F',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        background: '#0A0A0C',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 10, color: '#6E6E73', fontFamily: S }}>
        {saving ? 'Salvando...' : saved ? 'Salvo' : 'Notas'}
      </span>
      {saving && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#E85D30',
            display: 'inline-block',
            marginLeft: 6,
            animation: 'pulse-dot 1.5s ease-in-out infinite',
          }}
        />
      )}
      {saved && !saving && (
        <svg
          width={10}
          height={10}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#10B981"
          strokeWidth="3"
          style={{ marginLeft: 6 }}
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}

      <div style={{ flex: 1 }} />

      <span style={{ fontSize: 9, color: '#3A3A3F', fontFamily: M }}>
        {canvasW} x {canvasH}
      </span>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={onZoomOut}
          style={{
            background: 'none',
            border: 'none',
            color: '#6E6E73',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
          }}
          title={kloelT(`Zoom out`)}
        >
          <svg
            aria-hidden="true"
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onZoomFit}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 3,
          }}
          title={kloelT(`Ajustar ao viewport`)}
        >
          <span style={{ fontSize: 10, color: '#E0DDD8', fontFamily: M }}>{zoom}%</span>
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          style={{
            background: 'none',
            border: 'none',
            color: '#6E6E73',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
          }}
          title={kloelT(`Zoom in`)}
        >
          <svg
            aria-hidden="true"
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
