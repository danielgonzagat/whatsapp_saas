'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import { PRODUCT_TEMPLATES, TEMPLATE_TAGS } from '@/lib/canvas-formats';
import type { KloelEditor } from '@/lib/fabric';
import { IC } from './CanvasIcons';
import {
  FONT_SORA as S,
  panelHeading,
  panelSubtext,
  cardBtn,
  pillStyle,
  accentBtn,
  type SidebarTabId,
} from './canvas-editor.types';
import { LayersPanel } from './canvas-editor-layers-panel';
import { ToolsPanel } from './canvas-editor-tools-panel';
import { ElementsPanel, BackgroundPanel } from './canvas-editor-sidebar-panels.helpers';

type SidebarPanelsProps = {
  sidebarTab: SidebarTabId;
  editorUi: KloelEditor | null;
  isDrawing: boolean;
  uploadDrag: boolean;
  setUploadDrag: (v: boolean) => void;
  setLayerList: (fn: (prev: unknown[]) => unknown[]) => void;
  handleApplyTemplate: (tpl: (typeof PRODUCT_TEMPLATES)[number]) => void;
  handleAddText: (preset: 'heading' | 'subheading' | 'body') => void;
  handleAddShape: (shape: 'rect' | 'circle' | 'triangle' | 'line' | 'star') => void;
  handleDrop: (e: React.DragEvent) => void;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSetBackground: (color: string) => void;
  handleResize: (w: number, h: number) => void;
  handleExportFmt: (fmt: 'png' | 'jpg' | 'svg' | 'pdf') => void;
  onToggleDrawMode: () => void;
  resizeWRef: React.RefObject<HTMLInputElement | null>;
  resizeHRef: React.RefObject<HTMLInputElement | null>;
  resizeFidPrefix: string;
  initialW: number;
  initialH: number;
};

export function SidebarPanels({
  sidebarTab,
  editorUi: editor,
  isDrawing,
  uploadDrag,
  setUploadDrag,
  setLayerList,
  handleApplyTemplate,
  handleAddText,
  handleAddShape,
  handleDrop,
  handleFileInput,
  handleSetBackground,
  handleResize,
  handleExportFmt,
  onToggleDrawMode,
  resizeWRef,
  resizeHRef,
  resizeFidPrefix,
  initialW,
  initialH,
}: SidebarPanelsProps) {
  switch (sidebarTab) {
    case 'templates':
      return (
        <div>
          <p style={panelHeading}>{kloelT(`Modelos`)}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {TEMPLATE_TAGS.map((tag) => (
              <button type="button" key={tag} style={pillStyle}>
                {tag}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {PRODUCT_TEMPLATES.map((tpl) => (
              <button
                type="button"
                key={tpl.id}
                onClick={() => handleApplyTemplate(tpl)}
                style={{ ...cardBtn, background: UI.card, height: 100 }}
              >
                <span style={{ color: tpl.colors[0], fontSize: 18 }}>{IC.grid(18)}</span>
                <span style={{ fontSize: 9, color: UI.text, fontFamily: S, textAlign: 'center' }}>
                  {tpl.name}
                </span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <p style={{ ...panelSubtext, fontSize: 10 }}>
              {kloelT(
                `Use os modelos publicados acima como ponto de partida. Novos presets entram aqui quando virarem superficie oficial do editor.`,
              )}
            </p>
          </div>
        </div>
      );

    case 'elements':
      return <ElementsPanel handleAddShape={handleAddShape} />;

    case 'text':
      return (
        <div>
          <p style={panelHeading}>{kloelT(`Texto`)}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" onClick={() => handleAddText('heading')} style={accentBtn}>
              {IC.plus(14)} {kloelT(`Adicionar titulo`)}
            </button>
            <button
              type="button"
              onClick={() => handleAddText('subheading')}
              style={{
                ...accentBtn,
                background: 'transparent',
                border: '1px solid UI.border',
                color: UI.text,
              }}
            >
              {IC.plus(14)} {kloelT(`Adicionar subtitulo`)}
            </button>
            <button
              type="button"
              onClick={() => handleAddText('body')}
              style={{
                ...accentBtn,
                background: 'transparent',
                border: '1px solid UI.border',
                color: UI.text,
              }}
            >
              {IC.plus(14)} {kloelT(`Adicionar corpo de texto`)}
            </button>
          </div>
        </div>
      );

    case 'uploads':
      return (
        <div>
          <p style={panelHeading}>{kloelT(`Uploads`)}</p>
          <section
            onDragOver={(e) => {
              e.preventDefault();
              setUploadDrag(true);
            }}
            onDragLeave={() => setUploadDrag(false)}
            onDrop={handleDrop}
            aria-label="Área de upload. Solte arquivos aqui."
            style={{
              border: `2px dashed ${uploadDrag ? 'UI.accent' : 'UI.tertiary'}`,
              borderRadius: UI.radiusMd,
              padding: 32,
              textAlign: 'center',
              background: uploadDrag ? 'UI.accent10' : 'transparent',
              transition: 'all 200ms',
              marginBottom: 16,
            }}
          >
            <div style={{ color: uploadDrag ? 'UI.accent' : 'UI.muted', marginBottom: 8 }}>
              {IC.upload(32)}
            </div>
            <p style={{ ...panelSubtext, marginBottom: 12 }}>
              {kloelT(`Arraste uma imagem aqui ou`)}
            </p>
            <label
              style={{
                ...accentBtn,
                width: 'auto',
                display: 'inline-flex',
                padding: '8px 20px',
                cursor: 'pointer',
              }}
            >
              {IC.upload(14)} {kloelT(`Escolher arquivo`)}
              <input
                type="file"
                accept={kloelT(`image/*`)}
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
            </label>
          </section>
          <p style={{ ...panelSubtext, fontSize: 9 }}>
            {kloelT(`Formatos aceitos: JPG, PNG, SVG, WebP. Max 10 MB.`)}
          </p>
        </div>
      );

    case 'background':
      return <BackgroundPanel editor={editor} handleSetBackground={handleSetBackground} />;

    case 'layers':
      return <LayersPanel editor={editor} setLayerList={setLayerList} />;

    case 'tools':
      return (
        <ToolsPanel
          isDrawing={isDrawing}
          onToggleDrawMode={onToggleDrawMode}
          handleResize={handleResize}
          handleExportFmt={handleExportFmt}
          resizeWRef={resizeWRef}
          resizeHRef={resizeHRef}
          resizeFidPrefix={resizeFidPrefix}
          initialW={initialW}
          initialH={initialH}
        />
      );

    default:
      return null;
  }
}
