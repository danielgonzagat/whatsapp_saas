'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import type { KloelEditor } from '@/lib/fabric';
import { IC } from './CanvasIcons';
import {
  FONT_SORA as S,
  FONT_JETBRAINS as M,
  panelHeading,
  panelSubtext,
  cardBtn,
} from './canvas-editor.types';

type LayersPanelProps = {
  editor: KloelEditor | null;
  setLayerList: (fn: (prev: unknown[]) => unknown[]) => void;
};

export function LayersPanel({ editor, setLayerList }: LayersPanelProps) {
  const objects = editor?.layers.getObjects() ?? [];

  return (
    <div>
      <p style={panelHeading}>{kloelT(`Camadas`)}</p>
      {objects.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[...objects].reverse().map((obj, i) => {
            const objType = obj.type || 'object';
            const layerNumber = objects.length - i;
            const objName =
              ('name' in obj && typeof obj.name === 'string' ? obj.name : '') ||
              `${objType} ${layerNumber}`;
            const isActive = editor?.canvas.getActiveObject() === obj;
            return (
              <button
                type="button"
                key={`layer-${objType}-${layerNumber}-${objName}`}
                onClick={() => {
                  if (!editor) return;
                  editor.canvas.setActiveObject(obj);
                  editor.canvas.requestRenderAll();
                }}
                style={{
                  ...cardBtn,
                  flexDirection: 'row',
                  padding: '8px 10px',
                  justifyContent: 'space-between',
                  borderColor: isActive ? UI.accent : UI.border,
                  background: isActive ? UI.accentLight : UI.surface,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: UI.muted, fontFamily: M, width: 16 }}>
                    {objType === 'textbox' ? 'T' : objType === 'image' ? 'img' : '■'}
                  </span>
                  <span style={{ fontSize: 10, color: UI.text, fontFamily: S }}>{objName}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (obj.visible === false) {
                        editor?.layers.showObject(obj);
                      } else {
                        editor?.layers.hideObject(obj);
                      }
                      if (editor) {
                        setLayerList(() => [...editor.layers.getObjects()]);
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: obj.visible === false ? UI.tertiary : UI.muted,
                      cursor: 'pointer',
                      fontSize: 9,
                      fontFamily: M,
                      padding: 2,
                    }}
                    title={obj.visible === false ? 'Mostrar' : 'Ocultar'}
                  >
                    {obj.visible === false ? '◇' : '◆'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (obj.selectable === false) {
                        editor?.layers.unlockObject(obj);
                      } else {
                        editor?.layers.lockObject(obj);
                      }
                      if (editor) {
                        setLayerList(() => [...editor.layers.getObjects()]);
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: obj.selectable === false ? UI.accent : UI.muted,
                      cursor: 'pointer',
                      fontSize: 9,
                      fontFamily: M,
                      padding: 2,
                    }}
                    title={obj.selectable === false ? 'Desbloquear' : 'Bloquear'}
                  >
                    {obj.selectable === false ? (
                      <svg
                        width={12}
                        height={12}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d={kloelT(`M7 11V7a5 5 0 0110 0v4`)} />
                      </svg>
                    ) : (
                      <svg
                        width={12}
                        height={12}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d={kloelT(`M7 11V7a5 5 0 019.9-1`)} />
                      </svg>
                    )}
                  </button>
                </div>
              </button>
            );
          })}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => editor?.clipboard.duplicate()}
              style={{ ...cardBtn, flex: 1, flexDirection: 'row', padding: '8px 10px', gap: 6 }}
            >
              {IC.dup(12)}{' '}
              <span style={{ fontSize: 10, color: UI.text, fontFamily: S }}>
                {kloelT(`Duplicar`)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                editor?.selection.deleteSelected();
                if (editor) {
                  setLayerList(() => [...editor.layers.getObjects()]);
                }
              }}
              style={{
                ...cardBtn,
                flex: 1,
                flexDirection: 'row',
                padding: '8px 10px',
                gap: 6,
                borderColor: UI.errorBg,
              }}
            >
              {IC.trash(12)}{' '}
              <span style={{ fontSize: 10, color: UI.error, fontFamily: S }}>
                {kloelT(`Excluir`)}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ color: UI.tertiary, marginBottom: 12 }}>{IC.layers(40)}</div>
          <p style={panelSubtext}>{kloelT(`Adicione elementos ao canvas para ver as camadas.`)}</p>
        </div>
      )}
    </div>
  );
}
