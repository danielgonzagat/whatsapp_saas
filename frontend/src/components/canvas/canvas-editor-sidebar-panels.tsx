'use client';

import { kloelT } from '@/lib/i18n/t';
import { ELEMENT_CATEGORIES, PRODUCT_TEMPLATES, TEMPLATE_TAGS } from '@/lib/canvas-formats';
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
                style={{
                  ...cardBtn,
                  background: `linear-gradient(135deg, ${tpl.colors[0]}22, ${tpl.colors[1]}22)`,
                  height: 100,
                }}
              >
                <span style={{ color: tpl.colors[0], fontSize: 18 }}>{IC.grid(18)}</span>
                <span style={{ fontSize: 9, color: '#E0DDD8', fontFamily: S, textAlign: 'center' }}>
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
      return (
        <div>
          <p style={panelHeading}>{kloelT(`Elementos`)}</p>
          <p style={{ ...panelSubtext, marginBottom: 8, fontWeight: 600, color: '#9A9A9E' }}>
            {kloelT(`Formas`)}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
              marginBottom: 20,
            }}
          >
            {(
              [
                {
                  id: 'rect',
                  label: 'Retangulo',
                  render: () => (
                    <div
                      style={{ width: 28, height: 28, background: '#E85D30', borderRadius: 4 }}
                    />
                  ),
                },
                {
                  id: 'circle',
                  label: 'Circulo',
                  render: () => (
                    <div
                      style={{ width: 28, height: 28, background: '#8B5CF6', borderRadius: '50%' }}
                    />
                  ),
                },
                {
                  id: 'triangle',
                  label: 'Triangulo',
                  render: () => (
                    <div
                      style={{
                        width: 0,
                        height: 0,
                        borderLeft: '14px solid transparent',
                        borderRight: '14px solid transparent',
                        borderBottom: '28px solid #06B6D4',
                      }}
                    />
                  ),
                },
                {
                  id: 'line',
                  label: 'Linha',
                  render: () => (
                    <div style={{ width: 28, height: 3, background: '#10B981', borderRadius: 2 }} />
                  ),
                },
                {
                  id: 'star',
                  label: 'Estrela',
                  render: () => (
                    <div style={{ lineHeight: 1 }}>
                      <svg
                        width={22}
                        height={22}
                        viewBox="0 0 24 24"
                        fill="#F59E0B"
                        stroke="none"
                        aria-hidden="true"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
                      </svg>
                    </div>
                  ),
                },
              ] as const
            ).map((shape) => (
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
          <p style={{ ...panelSubtext, marginBottom: 8, fontWeight: 600, color: '#9A9A9E' }}>
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
                    borderRadius: '50%',
                    background: cat.c,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 10, color: '#E0DDD8', fontFamily: S }}>{cat.l}</span>
              </div>
            ))}
          </div>
        </div>
      );

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
                border: '1px solid #1C1C1F',
                color: '#E0DDD8',
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
                border: '1px solid #1C1C1F',
                color: '#E0DDD8',
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
              border: `2px dashed ${uploadDrag ? '#E85D30' : '#2A2A2E'}`,
              borderRadius: 8,
              padding: 32,
              textAlign: 'center',
              background: uploadDrag ? '#E85D3010' : 'transparent',
              transition: 'all 200ms',
              marginBottom: 16,
            }}
          >
            <div style={{ color: uploadDrag ? '#E85D30' : '#6E6E73', marginBottom: 8 }}>
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
      return (
        <div>
          <p style={panelHeading}>{kloelT(`Fundo`)}</p>
          <p style={{ ...panelSubtext, marginBottom: 12 }}>{kloelT(`Cor solida`)}</p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 6,
              marginBottom: 20,
            }}
          >
            {[
              '#0A0A0C',
              '#111113',
              '#1C1C1F',
              '#2A2A2E',
              '#3A3A3F',
              '#6E6E73',
              '#E0DDD8',
              '#FFFFFF',
              '#E85D30',
              '#F59E0B',
              '#10B981',
              '#3B82F6',
              '#8B5CF6',
              '#EC4899',
              '#06B6D4',
              '#FF0000',
              '#833AB4',
              '#1877F2',
            ].map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => handleSetBackground(c)}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  borderRadius: 4,
                  background: c,
                  border: c === '#0A0A0C' ? '1px solid #2A2A2E' : 'none',
                  cursor: 'pointer',
                  transition: 'transform 150ms',
                }}
                title={c}
              />
            ))}
          </div>
          <p style={{ ...panelSubtext, marginBottom: 8 }}>{kloelT(`Gradientes`)}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[
              ['#E85D30', '#F59E0B'],
              ['#833AB4', '#E1306C'],
              ['#06B6D4', '#10B981'],
              ['#8B5CF6', '#EC4899'],
              ['#3B82F6', '#06B6D4'],
              ['#0A0A0C', '#2A2A2E'],
            ].map(([a, b]) => (
              <button
                type="button"
                key={`${a}-${b}`}
                onClick={() => handleSetBackground(a)}
                style={{
                  width: '100%',
                  aspectRatio: '1.6',
                  borderRadius: 4,
                  background: `linear-gradient(135deg, ${a}, ${b})`,
                  border: 'none',
                  cursor: 'pointer',
                }}
                title={`${a} -> ${b}`}
              />
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <p style={{ ...panelSubtext, marginBottom: 8, fontWeight: 600, color: '#9A9A9E' }}>
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
                  if (file) {
                    editor?.background.setImageFromFile(file);
                  }
                };
                input.click();
              }}
              style={{
                ...cardBtn,
                width: '100%',
                flexDirection: 'row',
                padding: '10px 12px',
                gap: 6,
              }}
            >
              {IC.upload(14)}{' '}
              <span style={{ fontSize: 10, color: '#E0DDD8', fontFamily: S }}>
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
              <span style={{ fontSize: 10, color: '#E0DDD8', fontFamily: S }}>
                {kloelT(`Remover fundo`)}
              </span>
            </button>
          </div>
        </div>
      );

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
