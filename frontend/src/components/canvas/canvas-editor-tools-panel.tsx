'use client';

import { kloelT } from '@/lib/i18n/t';
import { IC } from './CanvasIcons';
import { FONT_SORA as S, FONT_JETBRAINS as M, panelHeading, cardBtn } from './canvas-editor.types';

type ToolsPanelProps = {
  isDrawing: boolean;
  onToggleDrawMode: () => void;
  handleResize: (w: number, h: number) => void;
  handleExportFmt: (fmt: 'png' | 'jpg' | 'svg' | 'pdf') => void;
  resizeWRef: React.RefObject<HTMLInputElement | null>;
  resizeHRef: React.RefObject<HTMLInputElement | null>;
  resizeFidPrefix: string;
  initialW: number;
  initialH: number;
};

export function ToolsPanel({
  isDrawing,
  onToggleDrawMode,
  handleResize,
  handleExportFmt,
  resizeWRef,
  resizeHRef,
  resizeFidPrefix,
  initialW,
  initialH,
}: ToolsPanelProps) {
  return (
    <div>
      <p style={panelHeading}>{kloelT(`Ferramentas`)}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          onClick={onToggleDrawMode}
          style={{
            ...cardBtn,
            flexDirection: 'row',
            padding: '12px 14px',
            gap: 10,
            justifyContent: 'flex-start',
            borderColor: isDrawing ? '#E85D30' : '#1C1C1F',
            background: isDrawing ? '#1A1210' : 'linear-gradient(135deg, #E85D3008, #F2784B08)',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: isDrawing ? '#E85D30' : 'linear-gradient(135deg, #E85D30, #F2784B)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {IC.edit(14)}
          </div>
          <span style={{ fontSize: 11, color: '#E0DDD8', fontFamily: S, fontWeight: 600 }}>
            {isDrawing ? 'Parar desenho' : 'Desenho livre'}
          </span>
        </button>

        <div style={{ ...cardBtn, padding: '12px 14px', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: 'linear-gradient(135deg, #E85D30, #F2784B)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {IC.resize(14)}
            </div>
            <span style={{ fontSize: 11, color: '#E0DDD8', fontFamily: S, fontWeight: 600 }}>
              {kloelT(`Redimensionar canvas`)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <input
              type="number"
              placeholder="L"
              defaultValue={initialW}
              ref={resizeWRef}
              id={`${resizeFidPrefix}-resize-w`}
              style={{
                width: 60,
                background: '#0A0A0C',
                border: '1px solid #1C1C1F',
                borderRadius: 4,
                color: '#E0DDD8',
                fontSize: 11,
                fontFamily: M,
                padding: '4px 6px',
                outline: 'none',
              }}
            />
            <span style={{ color: '#3A3A3F', fontSize: 11 }}>x</span>
            <input
              type="number"
              placeholder="A"
              defaultValue={initialH}
              ref={resizeHRef}
              id={`${resizeFidPrefix}-resize-h`}
              style={{
                width: 60,
                background: '#0A0A0C',
                border: '1px solid #1C1C1F',
                borderRadius: 4,
                color: '#E0DDD8',
                fontSize: 11,
                fontFamily: M,
                padding: '4px 6px',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => {
                const nw = Number.parseInt(resizeWRef.current?.value ?? '', 10);
                const nh = Number.parseInt(resizeHRef.current?.value ?? '', 10);
                if (nw > 0 && nh > 0) {
                  handleResize(nw, nh);
                }
              }}
              style={{
                background: '#E85D30',
                border: 'none',
                borderRadius: 4,
                color: '#0A0A0C',
                fontSize: 10,
                fontWeight: 700,
                fontFamily: S,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              {kloelT(`Aplicar`)}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleExportFmt('png')}
          style={{
            ...cardBtn,
            flexDirection: 'row',
            padding: '12px 14px',
            gap: 10,
            justifyContent: 'flex-start',
            background: 'linear-gradient(135deg, #10B98108, #34D39908)',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'linear-gradient(135deg, #10B981, #34D399)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {IC.share(14)}
          </div>
          <span style={{ fontSize: 11, color: '#E0DDD8', fontFamily: S, fontWeight: 600 }}>
            {kloelT(`Exportar PNG`)}
          </span>
        </button>
      </div>
    </div>
  );
}
