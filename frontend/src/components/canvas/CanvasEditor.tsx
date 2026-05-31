'use client';

import { apiFetch } from '@/lib/api';
import { useProductTemplates } from '@/hooks/useProductTemplates';
import { KloelEditor } from '@/lib/fabric';
import type { ContextMenuItem } from '@/lib/fabric/ContextMenuManager';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { mutate } from 'swr';
import { getIcon } from './CanvasIcons';
import { EditorTopBar } from './EditorTopBar';
import { CanvasBottomBar } from './canvas-editor-bottom-bar';
import { CanvasContextMenu } from './canvas-editor-context-menu';
import { PropertyBar } from './canvas-editor-property-bar';
import { SidebarPanels } from './canvas-editor-sidebar-panels';
import { colors } from '@/lib/design-tokens';
import { useCanvasEditorHandlers } from './canvas-editor.handlers';
import {
  FONT_SORA as S,
  SIDEBAR_TABS,
  type SelectedCanvasObject,
  type SidebarTabId,
} from './canvas-editor.types';

/* ═══════════════════════════════════════════
   CanvasEditor — Fabric.js-based KLOEL Editor
   ═══════════════════════════════════════════ */
export default function CanvasEditor() {
  const fid = useId();
  const params = useSearchParams();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<KloelEditor | null>(null);
  const [editorUi, setEditorUi] = useState<KloelEditor | null>(null);
  const resizeWRef = useRef<HTMLInputElement>(null);
  const resizeHRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { templates: PRODUCT_TEMPLATES, isLoading: tplLoading } = useProductTemplates();
  const [zoom, setZoom] = useState(100);
  const [sidebarTab, setSidebarTab] = useState<SidebarTabId>('templates');
  const [selectedObj, setSelectedObj] = useState<
    SelectedCanvasObject | SelectedCanvasObject[] | null
  >(null);
  const [uploadDrag, setUploadDrag] = useState(false);
  const [_layerList, setLayerList] = useState<unknown[]>([]);
  const [canvasDragOver, setCanvasDragOver] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ items: ContextMenuItem[]; x: number; y: number } | null>(
    null,
  );

  const w = Number.parseInt(params.get('w') || '1080', 10);
  const h = Number.parseInt(params.get('h') || '1080', 10);
  const name = params.get('name') || 'Design sem nome';
  const designId = params.get('id');
  const tplId = params.get('tpl');
  const aiImage = params.get('aiImage');

  const [designName, setDesignName] = useState(name);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentId = useRef<string | null>(designId || null);
  const initialSizeRef = useRef({ width: w, height: h });
  const initialDesignIdRef = useRef(designId);
  const initialTemplateIdRef = useRef(tplId);
  const initialAiImageRef = useRef(aiImage);
  const designNameRef = useRef(designName);

  useEffect(() => {
    designNameRef.current = designName;
  }, [designName]);

  /* ═══ Initialize editor ═══ */
  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    const { width, height } = initialSizeRef.current;
    const editor = new KloelEditor(canvasRef.current, width, height);
    editorRef.current = editor;
    setEditorUi(editor);

    editor.selection.onSelectionChange((objs) => {
      setSelectedObj(objs.length === 1 ? objs[0] : objs.length > 1 ? objs : null);
    });

    editor.contextMenu.onContextMenu((items, x, y) => {
      setCtxMenu({ items, x, y });
    });

    editor.onChange(() => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      setSaved(false);
      setLayerList([...editor.layers.getObjects()]);

      saveTimer.current = setTimeout(async () => {
        setSaving(true);
        const json = editor.toJSON();
        let thumbnailUrl: string | undefined;
        try {
          thumbnailUrl = editor.exporter.toPNG(0.2);
        } catch {
          /* non-critical */
        }
        try {
          if (!currentId.current) {
            const res = await apiFetch<{ design?: { id?: string } }>('/canvas/designs', {
              method: 'POST',
              body: {
                name: designNameRef.current,
                format: `${width}x${height}`,
                width,
                height,
                elements: json,
                ...(thumbnailUrl ? { thumbnailUrl } : {}),
              },
            });
            currentId.current = res?.data?.design?.id || null;
          } else {
            await apiFetch(`/canvas/designs/${currentId.current}`, {
              method: 'PUT',
              body: {
                elements: json,
                name: designNameRef.current,
                ...(thumbnailUrl ? { thumbnailUrl } : {}),
              },
            });
          }
          setSaved(true);
          mutate((key: unknown) => typeof key === 'string' && key.startsWith('/canvas'));
        } catch (e) {
          console.error('Auto-save failed:', e);
        }
        setSaving(false);
      }, 3000);
    });

    if (initialDesignIdRef.current) {
      apiFetch<{ design?: { elements?: unknown } }>(`/canvas/designs/${initialDesignIdRef.current}`)
        .then((res) => {
          const design = res?.data?.design;
          if (design?.elements) {
            const el = design.elements;
            editor.loadJSON(typeof el === 'string' ? JSON.parse(el) : el);
          }
        })
        .catch(() => {});
    } else if (initialTemplateIdRef.current) {
      const tpl = PRODUCT_TEMPLATES.find((t) => t.id === initialTemplateIdRef.current);
      if (tpl?.json) {
        editor.loadJSON(tpl.json).catch(() => {});
      }
    }

    if (initialAiImageRef.current) {
      editor.image.addImage(decodeURIComponent(initialAiImageRef.current)).catch(() => {});
    }

    const updateZoom = () => setZoom(editor.zoom.getZoom());
    editor.canvas.on('mouse:wheel', updateZoom);

    setTimeout(() => {
      editor.zoom.zoomToFit();
      updateZoom();
    }, 150);

    return () => {
      editor.dispose();
      editorRef.current = null;
      setEditorUi(null);
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [PRODUCT_TEMPLATES]);

  /* ═══ Handlers (extracted into canvas-editor.handlers.ts) ═══ */
  const {
    handleUndo,
    handleRedo,
    handleExportFmt,
    handleSave,
    handleCopy,
    handlePaste,
    handleDuplicate,
    handleDelete,
    handleSelectAll,
    handleResize,
    handleZoomIn,
    handleZoomOut,
    handleZoomFit,
    handleAddText,
    handleAddShape,
    handleUpload,
    handleFileInput,
    handleDrop,
    handleApplyTemplate,
    handleSetBackground,
    handleToggleDrawMode,
    updateProp,
  } = useCanvasEditorHandlers({
    editorRef,
    designName,
    setDesignName,
    setZoom,
    setUploadDrag,
    setIsDrawing,
    setLayerList,
    setSelectedObj,
  });

  const toggleTab = useCallback((id: SidebarTabId) => {
    setSidebarTab((prev) => (prev === id ? null : id));
  }, []);

  useEffect(() => {
    if (!ctxMenu) {
      return;
    }
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

  const setLayerListFn = useCallback((fn: (prev: unknown[]) => unknown[]) => {
    setLayerList(fn);
  }, []);

  /* ═══ Render ═══ */
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'colors.background.void',
        fontFamily: S,
        color: 'colors.text.silver',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <EditorTopBar
        designName={designName}
        onNameChange={setDesignName}
        saving={saving}
        onBack={() => router.push('/canvas/inicio')}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExport={handleExportFmt}
        onSave={handleSave}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onSelectAll={handleSelectAll}
        onResize={handleResize}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── Sidebar ── */}
        <div
          style={{
            width: sidebarTab ? 336 : 56,
            display: 'flex',
            borderRight: `1px solid ${colors.canvas.border}`,
            transition: 'width 200ms ease',
            flexShrink: 0,
          }}
        >
          {/* Icon rail */}
          <div
            style={{
              width: 56,
              background: 'colors.background.void',
              borderRight: `1px solid ${colors.canvas.border}`,
              display: 'flex',
              flexDirection: 'column',
              padding: '8px 0',
              gap: 2,
              flexShrink: 0,
            }}
          >
            {SIDEBAR_TABS.map((tab) => {
              const active = sidebarTab === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => toggleTab(tab.id)}
                  title={tab.label}
                  style={{
                    width: 44,
                    height: 44,
                    margin: '0 auto',
                    borderRadius: 8,
                    border: 'none',
                    background: active ? colors.canvas.border : 'transparent',
                    color: active ? 'colors.ember.primary' : 'colors.text.muted',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    transition: 'all 150ms',
                  }}
                >
                  {getIcon(tab.icon)(16)}
                  <span
                    style={{
                      fontSize: 7,
                      fontFamily: S,
                      fontWeight: active ? 700 : 400,
                      letterSpacing: '0.02em',
                      lineHeight: 1,
                    }}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          {sidebarTab && (
            <div
              style={{
                width: 280,
                background: 'colors.background.void',
                overflowY: 'auto',
                padding: 16,
                borderRight: `1px solid ${colors.canvas.border}`,
              }}
            >
              <SidebarPanels
                sidebarTab={sidebarTab}
                editorUi={editorUi}
                isDrawing={isDrawing}
                uploadDrag={uploadDrag}
                setUploadDrag={setUploadDrag}
                setLayerList={setLayerListFn}
                handleApplyTemplate={handleApplyTemplate}
                handleAddText={handleAddText}
                handleAddShape={handleAddShape}
                handleDrop={handleDrop}
                handleFileInput={handleFileInput}
                handleSetBackground={handleSetBackground}
                handleResize={handleResize}
                handleExportFmt={handleExportFmt}
                onToggleDrawMode={handleToggleDrawMode}
                resizeWRef={resizeWRef}
                resizeHRef={resizeHRef}
                resizeFidPrefix={fid}
                initialW={w}
                initialH={h}
                templates={PRODUCT_TEMPLATES}
                tplLoading={tplLoading}
              />
            </div>
          )}
        </div>

        {/* ── Canvas viewport ── */}
        <section
          style={{
            flex: 1,
            background: 'colors.background.elevated',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            border: canvasDragOver ? '2px dashed colors.ember.primary' : '2px solid transparent',
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCanvasDragOver(true);
          }}
          onDragLeave={() => setCanvasDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCanvasDragOver(false);
            const file = e.dataTransfer?.files?.[0];
            if (file?.type.startsWith('image/')) {
              handleUpload(file);
            }
          }}
        >
          {selectedObj && !Array.isArray(selectedObj) && (
            <PropertyBar
              selectedObj={selectedObj}
              updateProp={updateProp}
              onBrightnessChange={(v) => editorRef.current?.filters.brightness(v)}
              onContrastChange={(v) => editorRef.current?.filters.contrast(v)}
              onSaturationChange={(v) => editorRef.current?.filters.saturation(v)}
              onGrayscale={() => editorRef.current?.filters.grayscale()}
              onRemoveFilters={() => editorRef.current?.filters.removeFilters()}
            />
          )}

          <div style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.3)', position: 'relative' }}>
            <canvas ref={canvasRef} />
          </div>
        </section>
      </div>

      <CanvasBottomBar
        saving={saving}
        saved={saved}
        zoom={zoom}
        canvasW={w}
        canvasH={h}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomFit={handleZoomFit}
      />

      {ctxMenu && (
        <CanvasContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
