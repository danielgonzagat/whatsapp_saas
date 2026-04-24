'use client';

import { apiFetch } from '@/lib/api';
import { PRODUCT_TEMPLATES } from '@/lib/canvas-formats';
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
    if (!canvasRef.current) return;
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
      if (saveTimer.current) clearTimeout(saveTimer.current);
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
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  /* ═══ Handlers ═══ */
  const handleUndo = useCallback(() => editorRef.current?.history.undo(), []);
  const handleRedo = useCallback(() => editorRef.current?.history.redo(), []);
  const handleExportFmt = useCallback(
    (fmt: 'png' | 'jpg' | 'svg' | 'pdf') => {
      if (!editorRef.current) return;
      try {
        editorRef.current.exporter.download(designName, fmt);
      } catch (e) {
        console.error('Export failed:', e);
      }
    },
    [designName],
  );
  const handleSave = useCallback(() => {
    editorRef.current?.canvas.fire('object:modified');
  }, []);
  const handleCopy = useCallback(() => editorRef.current?.clipboard.copy(), []);
  const handlePaste = useCallback(() => editorRef.current?.clipboard.paste(), []);
  const handleDuplicate = useCallback(() => editorRef.current?.clipboard.duplicate(), []);
  const handleDelete = useCallback(() => editorRef.current?.selection.deleteSelected(), []);
  const handleSelectAll = useCallback(() => editorRef.current?.selection.selectAll(), []);

  const handleResize = useCallback((nw: number, nh: number) => {
    editorRef.current?.setSize(nw, nh);
    setTimeout(() => {
      editorRef.current?.zoom.zoomToFit();
      setZoom(editorRef.current?.zoom.getZoom() ?? 100);
    }, 50);
  }, []);

  const handleZoomIn = useCallback(() => {
    editorRef.current?.zoom.zoomIn();
    setZoom(editorRef.current?.zoom.getZoom() ?? 100);
  }, []);
  const handleZoomOut = useCallback(() => {
    editorRef.current?.zoom.zoomOut();
    setZoom(editorRef.current?.zoom.getZoom() ?? 100);
  }, []);
  const handleZoomFit = useCallback(() => {
    editorRef.current?.zoom.zoomToFit();
    setZoom(editorRef.current?.zoom.getZoom() ?? 100);
  }, []);

  const handleAddText = useCallback((preset: 'heading' | 'subheading' | 'body') => {
    if (!editorRef.current) return;
    if (preset === 'heading') editorRef.current.text.addHeading('Titulo');
    else if (preset === 'subheading') editorRef.current.text.addSubheading('Subtitulo');
    else editorRef.current.text.addBody('Corpo de texto');
  }, []);

  const handleAddShape = useCallback((shape: 'rect' | 'circle' | 'triangle' | 'line' | 'star') => {
    if (!editorRef.current) return;
    const e = editorRef.current.shapes;
    if (shape === 'rect') e.addRect();
    else if (shape === 'circle') e.addCircle();
    else if (shape === 'triangle') e.addTriangle();
    else if (shape === 'line') e.addLine();
    else if (shape === 'star') e.addStar();
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    if (!editorRef.current) return;
    try {
      await editorRef.current.image.addImageFromFile(file);
    } catch (e) {
      console.error('Upload failed:', e);
    }
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      e.target.value = '';
    },
    [handleUpload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setUploadDrag(false);
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith('image/')) handleUpload(file);
    },
    [handleUpload],
  );

  const handleApplyTemplate = useCallback((tpl: (typeof PRODUCT_TEMPLATES)[number]) => {
    if (!editorRef.current) return;
    editorRef.current.loadJSON(tpl.json).catch(() => {});
    setDesignName(tpl.name);
  }, []);

  const handleSetBackground = useCallback((color: string) => {
    if (!editorRef.current) return;
    editorRef.current.background.setColor(color);
  }, []);

  const toggleTab = useCallback((id: SidebarTabId) => {
    setSidebarTab((prev) => (prev === id ? null : id));
  }, []);

  const updateProp = useCallback((prop: string, value: unknown) => {
    const ed = editorRef.current;
    if (!ed) return;
    const obj = ed.canvas.getActiveObject();
    if (!obj) return;
    obj.set(prop as keyof typeof obj, value as never);
    obj.setCoords();
    ed.canvas.requestRenderAll();
    ed.history.saveState();
    setSelectedObj({ ...(obj as object as Record<string, unknown>) });
  }, []);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

  const setLayerListFn = useCallback((fn: (prev: unknown[]) => unknown[]) => {
    setLayerList(fn);
  }, []);

  const handleToggleDrawMode = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const nextMode = !ed.canvas.isDrawingMode;
    (ed.canvas as { isDrawingMode: boolean }).isDrawingMode = nextMode;
    if (nextMode && ed.canvas.freeDrawingBrush) {
      (ed.canvas.freeDrawingBrush as { color: string; width: number }).color = '#E85D30';
      (ed.canvas.freeDrawingBrush as { color: string; width: number }).width = 3;
    }
    setIsDrawing(nextMode);
    setLayerList([...ed.layers.getObjects()]);
  }, []);

  /* ═══ Render ═══ */
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#0A0A0C',
        fontFamily: S,
        color: '#E0DDD8',
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
            borderRight: '1px solid #1C1C1F',
            transition: 'width 200ms ease',
            flexShrink: 0,
          }}
        >
          {/* Icon rail */}
          <div
            style={{
              width: 56,
              background: '#0A0A0C',
              borderRight: '1px solid #1C1C1F',
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
                    background: active ? '#1C1C1F' : 'transparent',
                    color: active ? '#E85D30' : '#6E6E73',
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
                background: '#0A0A0C',
                overflowY: 'auto',
                padding: 16,
                borderRight: '1px solid #1C1C1F',
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
              />
            </div>
          )}
        </div>

        {/* ── Canvas viewport ── */}
        <section
          style={{
            flex: 1,
            background: '#19191C',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            border: canvasDragOver ? '2px dashed #E85D30' : '2px solid transparent',
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
            if (file?.type.startsWith('image/')) handleUpload(file);
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
