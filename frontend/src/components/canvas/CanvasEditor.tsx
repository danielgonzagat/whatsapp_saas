'use client';

import { kloelT } from '@/lib/i18n/t';
import { apiFetch } from '@/lib/api';
import { ELEMENT_CATEGORIES, PRODUCT_TEMPLATES, TEMPLATE_TAGS } from '@/lib/canvas-formats';
import { AVAILABLE_FONTS, KloelEditor } from '@/lib/fabric';
import type { ContextMenuItem } from '@/lib/fabric/ContextMenuManager';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { mutate } from 'swr';
import { IC, getIcon } from './CanvasIcons';
import { EditorTopBar } from './EditorTopBar';

/* ═══ Fonts ═══ */
const S = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

/* ═══ Sidebar tab definitions ═══ */
const SIDEBAR_TABS = [
  { id: 'templates', label: 'Modelos', icon: 'grid' },
  { id: 'elements', label: 'Elementos', icon: 'apps' },
  { id: 'text', label: 'Texto', icon: 'type' },
  { id: 'uploads', label: 'Uploads', icon: 'upload' },
  { id: 'background', label: 'Fundo', icon: 'bg' },
  { id: 'layers', label: 'Camadas', icon: 'layers' },
  { id: 'tools', label: 'Ferramentas', icon: 'tool' },
] as const;

type SidebarTabId = (typeof SIDEBAR_TABS)[number]['id'] | null;

type SelectedCanvasObject = {
  type?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  underline?: boolean;
  textAlign?: string;
  fill?: string | null | object;
  stroke?: string | null | object;
  strokeWidth?: number;
  opacity?: number;
};

/* ═══ Shared inline styles ═══ */
const panelHeading: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#E0DDD8',
  fontFamily: S,
  letterSpacing: '0.04em',
  marginBottom: 12,
  textTransform: 'uppercase',
};
const panelSubtext: React.CSSProperties = {
  fontSize: 11,
  color: '#6E6E73',
  fontFamily: S,
  lineHeight: 1.5,
};
const cardBtn: React.CSSProperties = {
  border: '1px solid #1C1C1F',
  borderRadius: 6,
  background: '#111113',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 10,
  gap: 6,
  transition: 'border-color 200ms, background 200ms',
};
const pillStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 4,
  background: '#1C1C1F',
  color: '#E0DDD8',
  fontSize: 10,
  fontFamily: S,
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const accentBtn: React.CSSProperties = {
  width: '100%',
  padding: '10px 0',
  borderRadius: 6,
  background: '#E85D30',
  color: '#0A0A0C',
  fontSize: 12,
  fontWeight: 700,
  fontFamily: S,
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};

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

  /* --- State --- */
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

  /* Context menu state */
  const [ctxMenu, setCtxMenu] = useState<{ items: ContextMenuItem[]; x: number; y: number } | null>(
    null,
  );

  /* --- URL params --- */
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

    /* Selection tracking */
    editor.selection.onSelectionChange((objs) => {
      setSelectedObj(objs.length === 1 ? objs[0] : objs.length > 1 ? objs : null);
    });

    /* Context menu */
    editor.contextMenu.onContextMenu((items, x, y) => {
      setCtxMenu({ items, x, y });
    });

    /* Auto-save with 3s debounce */
    editor.onChange(() => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      setSaved(false);

      // Update layers list
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

    /* Load existing design or template */
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

    /* AI image */
    if (initialAiImageRef.current) {
      editor.image.addImage(decodeURIComponent(initialAiImageRef.current)).catch(() => {});
    }

    /* Zoom tracking */
    const updateZoom = () => setZoom(editor.zoom.getZoom());
    editor.canvas.on('mouse:wheel', updateZoom);

    /* Fit to viewport */
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
  }, []);

  /* ═══ Handlers ═══ */
  const handleUndo = useCallback(() => editorRef.current?.history.undo(), []);
  const handleRedo = useCallback(() => editorRef.current?.history.redo(), []);
  const handleExportFmt = useCallback(
    (fmt: 'png' | 'jpg' | 'svg' | 'pdf') => {
      if (!editorRef.current) {
        return;
      }
      try {
        editorRef.current.exporter.download(designName, fmt);
      } catch (e) {
        console.error('Export failed:', e);
      }
    },
    [designName],
  );
  const handleSave = useCallback(() => {
    // Trigger the onChange which triggers auto-save
    editorRef.current?.canvas.fire('object:modified');
  }, []);
  const handleCopy = useCallback(() => editorRef.current?.clipboard.copy(), []);
  const handlePaste = useCallback(() => editorRef.current?.clipboard.paste(), []);
  const handleDuplicate = useCallback(() => editorRef.current?.clipboard.duplicate(), []);
  const handleDelete = useCallback(() => editorRef.current?.selection.deleteSelected(), []);
  const handleSelectAll = useCallback(() => editorRef.current?.selection.selectAll(), []);
  const handleResize = useCallback((w: number, h: number) => {
    editorRef.current?.setSize(w, h);
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
    if (!editorRef.current) {
      return;
    }
    if (preset === 'heading') {
      editorRef.current.text.addHeading('Titulo');
    } else if (preset === 'subheading') {
      editorRef.current.text.addSubheading('Subtitulo');
    } else {
      editorRef.current.text.addBody('Corpo de texto');
    }
  }, []);

  const handleAddShape = useCallback((shape: 'rect' | 'circle' | 'triangle' | 'line' | 'star') => {
    if (!editorRef.current) {
      return;
    }
    const e = editorRef.current.shapes;
    if (shape === 'rect') {
      e.addRect();
    } else if (shape === 'circle') {
      e.addCircle();
    } else if (shape === 'triangle') {
      e.addTriangle();
    } else if (shape === 'line') {
      e.addLine();
    } else if (shape === 'star') {
      e.addStar();
    }
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    if (!editorRef.current) {
      return;
    }
    try {
      await editorRef.current.image.addImageFromFile(file);
    } catch (e) {
      console.error('Upload failed:', e);
    }
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleUpload(file);
      }
      e.target.value = '';
    },
    [handleUpload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setUploadDrag(false);
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith('image/')) {
        handleUpload(file);
      }
    },
    [handleUpload],
  );

  const handleApplyTemplate = useCallback((tpl: (typeof PRODUCT_TEMPLATES)[number]) => {
    if (!editorRef.current) {
      return;
    }
    editorRef.current.loadJSON(tpl.json).catch(() => {});
    setDesignName(tpl.name);
  }, []);

  const handleSetBackground = useCallback((color: string) => {
    if (!editorRef.current) {
      return;
    }
    editorRef.current.background.setColor(color);
  }, []);

  const toggleTab = useCallback((id: SidebarTabId) => {
    setSidebarTab((prev) => (prev === id ? null : id));
  }, []);

  /** Update a property on the selected canvas object */
  const updateProp = useCallback((prop: string, value: unknown) => {
    const ed = editorRef.current;
    if (!ed) {
      return;
    }
    const obj = ed.canvas.getActiveObject();
    if (!obj) {
      return;
    }
    obj.set(prop as keyof typeof obj, value as never);
    obj.setCoords();
    ed.canvas.requestRenderAll();
    ed.history.saveState();
    // Force re-render of property panel
    setSelectedObj({ ...(obj as unknown as Record<string, unknown>) });
  }, []);

  /* Close context menu on any click */
  useEffect(() => {
    if (!ctxMenu) {
      return;
    }
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

  /* ═══ Sidebar panel renderers ═══ */
  const renderPanel = () => {
    const editor = editorUi;
    switch (sidebarTab) {
      /* ── Templates ── */
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
                  <span
                    style={{ fontSize: 9, color: '#E0DDD8', fontFamily: S, textAlign: 'center' }}
                  >
                    {tpl.name}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <p style={{ ...panelSubtext, fontSize: 10 }}>
                {kloelT(`Use os modelos publicados acima como ponto de partida. Novos presets entram aqui
                quando virarem superficie oficial do editor.`)}
              </p>
            </div>
          </div>
        );

      /* ── Elements ── */
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
                        style={{
                          width: 28,
                          height: 28,
                          background: '#8B5CF6',
                          borderRadius: '50%',
                        }}
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
                      <div
                        style={{ width: 28, height: 3, background: '#10B981', borderRadius: 2 }}
                      />
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

      /* ── Text ── */
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
            <div style={{ marginTop: 20 }}>
              <p style={{ ...panelSubtext, marginBottom: 10, fontWeight: 600, color: '#9A9A9E' }}>
                {kloelT(`Estilos rapidos`)}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => handleAddText('heading')}
                  style={{ ...cardBtn, padding: '12px 14px', alignItems: 'flex-start' }}
                >
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#E0DDD8', fontFamily: S }}>
                    {kloelT(`Titulo`)}
                  </span>
                  <span style={{ fontSize: 9, color: '#6E6E73', fontFamily: M }}>
                    {kloelT(`Sora Bold 48px`)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddText('subheading')}
                  style={{ ...cardBtn, padding: '12px 14px', alignItems: 'flex-start' }}
                >
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#E0DDD8', fontFamily: S }}>
                    {kloelT(`Subtitulo`)}
                  </span>
                  <span style={{ fontSize: 9, color: '#6E6E73', fontFamily: M }}>
                    {kloelT(`Sora Semibold 28px`)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddText('body')}
                  style={{ ...cardBtn, padding: '12px 14px', alignItems: 'flex-start' }}
                >
                  <span style={{ fontSize: 12, color: '#E0DDD8', fontFamily: S }}>
                    {kloelT(`Corpo de texto`)}
                  </span>
                  <span style={{ fontSize: 9, color: '#6E6E73', fontFamily: M }}>
                    {kloelT(`Sora Regular 16px`)}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );

      /* ── Uploads ── */
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

      /* ── Background ── */
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
            {/* Background image */}
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

      /* ── Layers ── */
      case 'layers': {
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
                        if (!editor) {
                          return;
                        }
                        editor.canvas.setActiveObject(obj);
                        editor.canvas.requestRenderAll();
                      }}
                      style={{
                        ...cardBtn,
                        flexDirection: 'row',
                        padding: '8px 10px',
                        justifyContent: 'space-between',
                        borderColor: isActive ? '#E85D30' : '#1C1C1F',
                        background: isActive ? '#1A1210' : '#111113',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: '#6E6E73', fontFamily: M, width: 16 }}>
                          {objType === 'textbox' ? 'T' : objType === 'image' ? 'img' : '■'}
                        </span>
                        <span style={{ fontSize: 10, color: '#E0DDD8', fontFamily: S }}>
                          {objName}
                        </span>
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
                              setLayerList([...editor.layers.getObjects()]);
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: obj.visible === false ? '#3A3A3F' : '#6E6E73',
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
                              setLayerList([...editor.layers.getObjects()]);
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: obj.selectable === false ? '#E85D30' : '#6E6E73',
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
                    style={{
                      ...cardBtn,
                      flex: 1,
                      flexDirection: 'row',
                      padding: '8px 10px',
                      gap: 6,
                    }}
                  >
                    {IC.dup(12)}{' '}
                    <span style={{ fontSize: 10, color: '#E0DDD8', fontFamily: S }}>
                      {kloelT(`Duplicar`)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      editor?.selection.deleteSelected();
                      if (editor) {
                        setLayerList([...editor.layers.getObjects()]);
                      }
                    }}
                    style={{
                      ...cardBtn,
                      flex: 1,
                      flexDirection: 'row',
                      padding: '8px 10px',
                      gap: 6,
                      borderColor: '#3A1515',
                    }}
                  >
                    {IC.trash(12)}{' '}
                    <span style={{ fontSize: 10, color: '#FF6B6B', fontFamily: S }}>
                      {kloelT(`Excluir`)}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ color: '#2A2A2E', marginBottom: 12 }}>{IC.layers(40)}</div>
                <p style={panelSubtext}>
                  {kloelT(`Adicione elementos ao canvas para ver as camadas.`)}
                </p>
              </div>
            )}
          </div>
        );
      }

      /* ── Tools ── */
      case 'tools': {
        const isDrawing = editor?.canvas.isDrawingMode ?? false;
        return (
          <div>
            <p style={panelHeading}>{kloelT(`Ferramentas`)}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Drawing mode toggle */}
              <button
                type="button"
                onClick={() => {
                  const canvas = editor?.canvas;
                  if (!canvas) {
                    return;
                  }
                  canvas.isDrawingMode = !canvas.isDrawingMode;
                  if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
                    canvas.freeDrawingBrush.color = '#E85D30';
                    canvas.freeDrawingBrush.width = 3;
                  }
                  if (editor) {
                    setLayerList([...editor.layers.getObjects()]);
                  }
                }}
                style={{
                  ...cardBtn,
                  flexDirection: 'row',
                  padding: '12px 14px',
                  gap: 10,
                  justifyContent: 'flex-start',
                  borderColor: isDrawing ? '#E85D30' : '#1C1C1F',
                  background: isDrawing
                    ? '#1A1210'
                    : 'linear-gradient(135deg, #E85D3008, #F2784B08)',
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

              {/* Resize canvas */}
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
                    defaultValue={w}
                    ref={resizeWRef}
                    id={`${fid}-resize-w`}
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
                    defaultValue={h}
                    ref={resizeHRef}
                    id={`${fid}-resize-h`}
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

              {/* Export */}
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

      default:
        return null;
    }
  };

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
      {/* ── Top bar ── */}
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

      {/* ── Main body ── */}
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

          {/* Panel content */}
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
              {renderPanel()}
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
            if (file?.type.startsWith('image/')) {
              handleUpload(file);
            }
          }}
        >
          {/* ── Floating Property Bar ── */}
          {selectedObj && !Array.isArray(selectedObj) && (
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#111113',
                border: '1px solid #1C1C1F',
                borderRadius: 6,
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                zIndex: 50,
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                maxWidth: 'calc(100% - 40px)',
                overflowX: 'auto',
              }}
            >
              {/* Text-specific controls */}
              {(selectedObj.type === 'textbox' || selectedObj.type === 'i-text') && (
                <>
                  {/* Font family */}
                  <select
                    value={selectedObj.fontFamily || 'Sora'}
                    onChange={(e) => updateProp('fontFamily', e.target.value)}
                    style={{
                      background: '#0A0A0C',
                      border: '1px solid #1C1C1F',
                      borderRadius: 4,
                      color: '#E0DDD8',
                      fontSize: 10,
                      fontFamily: S,
                      padding: '3px 4px',
                      outline: 'none',
                      maxWidth: 110,
                      cursor: 'pointer',
                    }}
                  >
                    {AVAILABLE_FONTS.map((f) => (
                      <option key={f} value={f} style={{ fontFamily: f }}>
                        {f}
                      </option>
                    ))}
                  </select>
                  {/* Font size */}
                  <input
                    type="number"
                    min={8}
                    max={200}
                    aria-label="Tamanho da fonte"
                    value={Math.round(selectedObj.fontSize || 16)}
                    onChange={(e) =>
                      updateProp('fontSize', Number.parseInt(e.target.value, 10) || 16)
                    }
                    style={{
                      width: 40,
                      background: '#0A0A0C',
                      border: '1px solid #1C1C1F',
                      borderRadius: 4,
                      color: '#E0DDD8',
                      fontSize: 10,
                      fontFamily: M,
                      padding: '3px 4px',
                      outline: 'none',
                      textAlign: 'center',
                    }}
                  />
                  <span style={{ color: '#2A2A2E', fontSize: 10 }}>|</span>
                  {/* Bold */}
                  <button
                    type="button"
                    onClick={() =>
                      updateProp(
                        'fontWeight',
                        selectedObj.fontWeight === 'bold' ? 'normal' : 'bold',
                      )
                    }
                    style={{
                      background: selectedObj.fontWeight === 'bold' ? '#1C1C1F' : 'none',
                      border: 'none',
                      color: '#E0DDD8',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: 3,
                      fontWeight: 700,
                      fontSize: 12,
                      fontFamily: S,
                    }}
                  >
                    B
                  </button>
                  {/* Italic */}
                  <button
                    type="button"
                    onClick={() =>
                      updateProp(
                        'fontStyle',
                        selectedObj.fontStyle === 'italic' ? 'normal' : 'italic',
                      )
                    }
                    style={{
                      background: selectedObj.fontStyle === 'italic' ? '#1C1C1F' : 'none',
                      border: 'none',
                      color: '#E0DDD8',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: 3,
                      fontStyle: 'italic',
                      fontSize: 12,
                      fontFamily: S,
                    }}
                  >
                    I
                  </button>
                  {/* Underline */}
                  <button
                    type="button"
                    onClick={() => updateProp('underline', !selectedObj.underline)}
                    style={{
                      background: selectedObj.underline ? '#1C1C1F' : 'none',
                      border: 'none',
                      color: '#E0DDD8',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: 3,
                      textDecoration: 'underline',
                      fontSize: 12,
                      fontFamily: S,
                    }}
                  >
                    U
                  </button>
                  <span style={{ color: '#2A2A2E', fontSize: 10 }}>|</span>
                  {/* Text align */}
                  {(['left', 'center', 'right', 'justify'] as const).map((align) => (
                    <button
                      type="button"
                      key={align}
                      onClick={() => updateProp('textAlign', align)}
                      style={{
                        background: selectedObj.textAlign === align ? '#1C1C1F' : 'none',
                        border: 'none',
                        color: '#E0DDD8',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        borderRadius: 3,
                        fontSize: 9,
                        fontFamily: M,
                      }}
                      title={align}
                    >
                      {align === 'left'
                        ? '≡←'
                        : align === 'center'
                          ? '≡↔'
                          : align === 'right'
                            ? '≡→'
                            : '≡≡'}
                    </button>
                  ))}
                  <span style={{ color: '#2A2A2E', fontSize: 10 }}>|</span>
                  {/* Text color */}
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 9, color: '#6E6E73', fontFamily: S }}>
                      {kloelT(`Cor`)}
                    </span>
                    <input
                      type="color"
                      value={typeof selectedObj.fill === 'string' ? selectedObj.fill : '#000000'}
                      onChange={(e) => updateProp('fill', e.target.value)}
                      style={{
                        width: 20,
                        height: 20,
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                  </label>
                </>
              )}

              {/* Shape-specific controls */}
              {(selectedObj.type === 'rect' ||
                selectedObj.type === 'circle' ||
                selectedObj.type === 'triangle' ||
                selectedObj.type === 'polygon') && (
                <>
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 9, color: '#6E6E73', fontFamily: S }}>
                      {kloelT(`Preench.`)}
                    </span>
                    <input
                      type="color"
                      value={typeof selectedObj.fill === 'string' ? selectedObj.fill : '#E0DDD8'}
                      onChange={(e) => updateProp('fill', e.target.value)}
                      style={{
                        width: 20,
                        height: 20,
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                  </label>
                  <span style={{ color: '#2A2A2E', fontSize: 10 }}>|</span>
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 9, color: '#6E6E73', fontFamily: S }}>
                      {kloelT(`Borda`)}
                    </span>
                    <input
                      type="color"
                      value={
                        typeof selectedObj.stroke === 'string' ? selectedObj.stroke : '#000000'
                      }
                      onChange={(e) => {
                        updateProp('stroke', e.target.value);
                        if (!selectedObj.strokeWidth) {
                          updateProp('strokeWidth', 2);
                        }
                      }}
                      style={{
                        width: 20,
                        height: 20,
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, color: '#6E6E73', fontFamily: S }}>
                      {kloelT(`Esp.`)}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={selectedObj.strokeWidth || 0}
                      onChange={(e) =>
                        updateProp('strokeWidth', Number.parseInt(e.target.value, 10) || 0)
                      }
                      style={{
                        width: 32,
                        background: '#0A0A0C',
                        border: '1px solid #1C1C1F',
                        borderRadius: 4,
                        color: '#E0DDD8',
                        fontSize: 10,
                        fontFamily: M,
                        padding: '3px 4px',
                        outline: 'none',
                        textAlign: 'center',
                      }}
                    />
                  </label>
                </>
              )}

              {/* Image-specific controls */}
              {selectedObj.type === 'image' && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, color: '#6E6E73', fontFamily: S }}>
                      {kloelT(`Brilho`)}
                    </span>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      defaultValue={0}
                      onChange={(e) =>
                        editorRef.current?.filters.brightness(
                          Number.parseInt(e.target.value, 10) / 100,
                        )
                      }
                      style={{ width: 50, accentColor: '#E85D30', cursor: 'pointer' }}
                    />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, color: '#6E6E73', fontFamily: S }}>
                      {kloelT(`Contraste`)}
                    </span>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      defaultValue={0}
                      onChange={(e) =>
                        editorRef.current?.filters.contrast(
                          Number.parseInt(e.target.value, 10) / 100,
                        )
                      }
                      style={{ width: 50, accentColor: '#E85D30', cursor: 'pointer' }}
                    />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, color: '#6E6E73', fontFamily: S }}>
                      {kloelT(`Saturacao`)}
                    </span>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      defaultValue={0}
                      onChange={(e) =>
                        editorRef.current?.filters.saturation(
                          Number.parseInt(e.target.value, 10) / 100,
                        )
                      }
                      style={{ width: 50, accentColor: '#E85D30', cursor: 'pointer' }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => editorRef.current?.filters.grayscale()}
                    style={{
                      background: 'none',
                      border: '1px solid #1C1C1F',
                      borderRadius: 3,
                      color: '#6E6E73',
                      fontSize: 9,
                      fontFamily: S,
                      padding: '2px 6px',
                      cursor: 'pointer',
                    }}
                  >
                    {kloelT(`P&amp;B`)}
                  </button>
                  <button
                    type="button"
                    onClick={() => editorRef.current?.filters.removeFilters()}
                    style={{
                      background: 'none',
                      border: '1px solid #1C1C1F',
                      borderRadius: 3,
                      color: '#6E6E73',
                      fontSize: 9,
                      fontFamily: S,
                      padding: '2px 6px',
                      cursor: 'pointer',
                    }}
                  >
                    {kloelT(`Reset`)}
                  </button>
                </>
              )}

              {/* Common: opacity */}
              <span style={{ color: '#2A2A2E', fontSize: 10 }}>|</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 9, color: '#6E6E73', fontFamily: S }}>
                  {kloelT(`Opac.`)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round((selectedObj.opacity ?? 1) * 100)}
                  onChange={(e) => updateProp('opacity', Number.parseInt(e.target.value, 10) / 100)}
                  style={{ width: 50, accentColor: '#E85D30', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 9, color: '#3A3A3F', fontFamily: M, width: 24 }}>
                  {Math.round((selectedObj.opacity ?? 1) * 100)}%
                </span>
              </label>
            </div>
          )}

          <div
            style={{
              boxShadow: '0 2px 20px rgba(0,0,0,0.3)',
              position: 'relative',
            }}
          >
            <canvas ref={canvasRef} />
          </div>
        </section>
      </div>

      {/* ── Bottom bar ── */}
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
        {/* Left: status */}
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

        {/* Center: canvas size */}
        <span style={{ fontSize: 9, color: '#3A3A3F', fontFamily: M }}>
          {w} x {h}
        </span>

        <div style={{ flex: 1 }} />

        {/* Right: zoom controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={handleZoomOut}
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
            onClick={handleZoomFit}
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
            onClick={handleZoomIn}
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

      {/* ── Context Menu ── */}
      {ctxMenu && (
        <div
          style={{
            position: 'fixed',
            left: ctxMenu.x,
            top: ctxMenu.y,
            background: '#111113',
            border: '1px solid #1C1C1F',
            borderRadius: 6,
            padding: '4px 0',
            minWidth: 180,
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              (e.currentTarget as HTMLElement).click();
            }
          }}
        >
          {ctxMenu.items.map((item, i, arr) => {
            const priorLabels = arr
              .slice(0, i)
              .map((it) => it.label ?? '-')
              .join('|');
            const key = `${item.separator ? 'sep' : (item.label ?? 'item')}::${priorLabels}`;
            return item.separator ? (
              <div key={key} style={{ height: 1, background: '#1C1C1F', margin: '4px 0' }} />
            ) : (
              <button
                type="button"
                key={key}
                onClick={() => {
                  if (!item.disabled) {
                    item.action();
                    setCtxMenu(null);
                  }
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '7px 12px',
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  fontSize: 11,
                  fontFamily: S,
                  cursor: item.disabled ? 'default' : 'pointer',
                  color: item.disabled ? '#3A3A3F' : '#E0DDD8',
                  transition: 'background 100ms',
                }}
                onMouseEnter={(e) => {
                  if (!item.disabled) {
                    (e.target as HTMLElement).style.background = '#1C1C1F';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'none';
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Pulse animation for save indicator */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
