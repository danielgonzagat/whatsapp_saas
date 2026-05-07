'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import { IC } from './CanvasIcons';
import { FONT_SORA as S, FONT_JETBRAINS as M, panelHeading, cardBtn } from './canvas-editor.types';
import { ToolCard } from './canvas-editor-panel-shell';

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
        <ToolCard
          icon={IC.edit(14)}
          iconBg={UI.accent}
          label={isDrawing ? 'Parar desenho' : 'Desenho livre'}
          cardBg={UI.accentLight}
          borderColor={isDrawing ? UI.accent : UI.border}
          onClick={onToggleDrawMode}
        />

        <div style={{ ...cardBtn, padding: '12px 14px', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: UI.radiusMd,
                background: UI.accentLight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {IC.resize(14)}
            </div>
            <span style={{ fontSize: 11, color: UI.text, fontFamily: S, fontWeight: 600 }}>
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
                background: UI.bg,
                border: `1px solid ${UI.border}`,
                borderRadius: UI.radiusSm,
                color: UI.text,
                fontSize: 11,
                fontFamily: M,
                padding: '4px 6px',
                outline: 'none',
              }}
            />
            <span style={{ color: UI.tertiary, fontSize: 11 }}>x</span>
            <input
              type="number"
              placeholder="A"
              defaultValue={initialH}
              ref={resizeHRef}
              id={`${resizeFidPrefix}-resize-h`}
              style={{
                width: 60,
                background: UI.bg,
                border: '1px solid UI.border',
                borderRadius: UI.radiusSm,
                color: UI.text,
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
                background: UI.accent,
                border: 'none',
                borderRadius: UI.radiusSm,
                color: UI.bg,
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

        <ToolCard
          icon={IC.share(14)}
          iconBg={UI.success}
          label={kloelT(`Exportar PNG`)}
          cardBg={UI.successBg}
          onClick={() => handleExportFmt('png')}
        />
      </div>
    </div>
  );
}
