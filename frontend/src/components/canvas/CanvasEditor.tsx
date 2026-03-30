'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { KloelEditor } from '@/lib/fabric';
import { apiFetch } from '@/lib/api';
import {
  PRODUCT_TEMPLATES,
  ELEMENT_CATEGORIES,
  TEMPLATE_TAGS,
  EDITOR_TOOLS,
} from '@/lib/canvas-formats';
import { EditorTopBar } from './EditorTopBar';
import { IC, getIcon } from './CanvasIcons';

/* ═══ Fonts ═══ */
const S = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";

/* ═══ Sidebar tab definitions ═══ */
const SIDEBAR_TABS = [
  { id: 'templates', label: 'Modelos', icon: 'grid' },
  { id: 'elements',  label: 'Elementos', icon: 'apps' },
  { id: 'text',      label: 'Texto', icon: 'type' },
  { id: 'uploads',   label: 'Uploads', icon: 'upload' },
  { id: 'background',label: 'Fundo', icon: 'bg' },
  { id: 'layers',    label: 'Camadas', icon: 'layers' },
  { id: 'tools',     label: 'Ferramentas', icon: 'tool' },
] as const;

type SidebarTabId = typeof SIDEBAR_TABS[number]['id'] | null;

/* ═══ Shared inline styles ═══ */
const panelHeading: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#E0DDD8', fontFamily: S,
  letterSpacing: '0.04em', marginBottom: 12, textTransform: 'uppercase',
};
const panelSubtext: React.CSSProperties = {
  fontSize: 11, color: '#6E6E73', fontFamily: S, lineHeight: 1.5,
};
const cardBtn: React.CSSProperties = {
  border: '1px solid #1C1C1F', borderRadius: 6, background: '#111113',
  cursor: 'pointer', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', padding: 10, gap: 6,
  transition: 'border-color 200ms, background 200ms',
};
const pillStyle: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 4, background: '#1C1C1F',
  color: '#E0DDD8', fontSize: 10, fontFamily: S, border: 'none',
  cursor: 'pointer', whiteSpace: 'nowrap',
};
const accentBtn: React.CSSProperties = {
  width: '100%', padding: '10px 0', borderRadius: 6,
  background: '#E85D30', color: '#0A0A0C', fontSize: 12,
  fontWeight: 700, fontFamily: S, border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
};

/* ═══════════════════════════════════════════
   CanvasEditor — Fabric.js-based KLOEL Editor
   ═══════════════════════════════════════════ */
export default function CanvasEditor() {
  const params = useSearchParams();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<KloelEditor | null>(null);

  /* --- State --- */
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [sidebarTab, setSidebarTab] = useState<SidebarTabId>('templates');
  const [selectedObj, setSelectedObj] = useState<any>(null);
  const [uploadDrag, setUploadDrag] = useState(false);

  /* --- URL params --- */
  const w = parseInt(params.get('w') || '1080');
  const h = parseInt(params.get('h') || '1080');
  const name = params.get('name') || 'Design sem nome';
  const designId = params.get('id');
  const tplId = params.get('tpl');
  const aiImage = params.get('aiImage');

  const [designName, setDesignName] = useState(name);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentId = useRef<string | null>(designId || null);

  /* ═══ Initialize editor ═══ */
  useEffect(() => {
    if (!canvasRef.current) return;
    const editor = new KloelEditor(canvasRef.current, w, h);
    editorRef.current = editor;

    /* Selection tracking */
    editor.selection.onSelectionChange((objs: any[]) => {
      setSelectedObj(
        objs.length === 1 ? objs[0] : objs.length > 1 ? objs : null
      );
    });

    /* Auto-save with 3s debounce */
    editor.onChange(() => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaved(false);
      saveTimer.current = setTimeout(async () => {
        setSaving(true);
        const json = editor.toJSON();
        let thumbnailUrl: string | undefined;
        try {
          thumbnailUrl = await editor.exporter.toPNG(0.2);
        } catch {
          /* non-critical */
        }
        try {
          if (!currentId.current) {
            const res: any = await apiFetch('/canvas/designs', {
              method: 'POST',
              body: {
                name: designName,
                format: `${w}x${h}`,
                width: w,
                height: h,
                elements: json,
                ...(thumbnailUrl ? { thumbnailUrl } : {}),
              },
            });
            currentId.current = res?.design?.id || null;
          } else {
            await apiFetch(`/canvas/designs/${currentId.current}`, {
              method: 'PUT',
              body: {
                elements: json,
                name: designName,
                ...(thumbnailUrl ? { thumbnailUrl } : {}),
              },
            });
          }
          setSaved(true);
        } catch (e) {
          console.error('Auto-save failed:', e);
        }
        setSaving(false);
      }, 3000);
    });

    /* Load existing design or template */
    if (designId) {
      apiFetch(`/canvas/designs/${designId}`)
        .then((res: any) => {
          if (res?.design?.elements) {
            const el = res.design.elements;
            editor.loadJSON(typeof el === 'string' ? JSON.parse(el) : el);
          }
        })
        .catch(() => {});
    } else if (tplId) {
      const tpl = PRODUCT_TEMPLATES.find((t) => t.id === tplId);
      if (tpl) editor.loadJSON(tpl.json).catch(() => {});
    }

    /* AI image */
    if (aiImage) {
      editor.image.addImage(decodeURIComponent(aiImage)).catch(() => {});
    }

    /* Zoom tracking */
    const updateZoom = () => setZoom(editor.zoom.getZoom());
    editor.canvas.on('mouse:wheel', updateZoom);

    /* Fit to viewport */
    setTimeout(() => editor.zoom.zoomToFit(), 100);

    return () => {
      editor.dispose();
      editorRef.current = null;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ═══ Handlers ═══ */
  const handleUndo = useCallback(() => editorRef.current?.history.undo(), []);
  const handleRedo = useCallback(() => editorRef.current?.history.redo(), []);
  const handleExport = useCallback(async () => {
    if (!editorRef.current) return;
    try {
      const url = await editorRef.current.exporter.toPNG(2);
      const a = document.createElement('a');
      a.download = `${designName}.png`;
      a.href = url;
      a.click();
    } catch (e) {
      console.error('Export failed:', e);
    }
  }, [designName]);

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

  const handleAddText = useCallback(
    (preset: 'heading' | 'subheading' | 'body') => {
      if (!editorRef.current) return;
      const configs: Record<string, { text: string; fontSize: number; fontWeight: string }> = {
        heading:    { text: 'Titulo', fontSize: 48, fontWeight: 'bold' },
        subheading: { text: 'Subtitulo', fontSize: 28, fontWeight: '600' },
        body:       { text: 'Corpo de texto', fontSize: 16, fontWeight: 'normal' },
      };
      const cfg = configs[preset];
      if (preset === 'heading') editorRef.current.text.addHeading(cfg.text);
      else if (preset === 'subheading') editorRef.current.text.addSubheading(cfg.text);
      else editorRef.current.text.addBody(cfg.text);
    },
    []
  );

  const handleAddShape = useCallback(
    (shape: 'rect' | 'circle' | 'triangle' | 'line') => {
      if (!editorRef.current) return;
      const e = editorRef.current.shapes;
      if (shape === 'rect') e.addRect();
      else if (shape === 'circle') e.addCircle();
      else if (shape === 'triangle') e.addTriangle();
      else if (shape === 'line') e.addLine();
    },
    []
  );

  const handleUpload = useCallback(async (file: File) => {
    if (!editorRef.current) return;
    const url = URL.createObjectURL(file);
    try {
      await editorRef.current.image.addImage(url);
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
    [handleUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setUploadDrag(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) handleUpload(file);
    },
    [handleUpload]
  );

  const handleApplyTemplate = useCallback((tpl: typeof PRODUCT_TEMPLATES[number]) => {
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

  /* ═══ Sidebar panel renderers ═══ */
  const renderPanel = () => {
    switch (sidebarTab) {
      /* ── Templates ── */
      case 'templates':
        return (
          <div>
            <p style={panelHeading}>Modelos</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {TEMPLATE_TAGS.map((tag) => (
                <button key={tag} style={pillStyle}>{tag}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {PRODUCT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleApplyTemplate(tpl)}
                  style={{
                    ...cardBtn,
                    background: `linear-gradient(135deg, ${tpl.colors[0]}22, ${tpl.colors[1]}22)`,
                    height: 100,
                  }}
                >
                  <span style={{ color: tpl.colors[0], fontSize: 18 }}>
                    {IC.grid(18)}
                  </span>
                  <span style={{ fontSize: 9, color: '#E0DDD8', fontFamily: S, textAlign: 'center' }}>
                    {tpl.name}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <p style={{ ...panelSubtext, fontSize: 10 }}>
                Mais modelos em breve. Use os modelos acima como ponto de partida.
              </p>
            </div>
          </div>
        );

      /* ── Elements ── */
      case 'elements':
        return (
          <div>
            <p style={panelHeading}>Elementos</p>
            {/* Shapes */}
            <p style={{ ...panelSubtext, marginBottom: 8, fontWeight: 600, color: '#9A9A9E' }}>Formas</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
              {([
                { id: 'rect',     label: 'Retangulo', render: () => <div style={{ width: 28, height: 28, background: '#E85D30', borderRadius: 4 }} /> },
                { id: 'circle',   label: 'Circulo',   render: () => <div style={{ width: 28, height: 28, background: '#8B5CF6', borderRadius: '50%' }} /> },
                { id: 'triangle', label: 'Triangulo', render: () => <div style={{ width: 0, height: 0, borderLeft: '14px solid transparent', borderRight: '14px solid transparent', borderBottom: '28px solid #06B6D4' }} /> },
                { id: 'line',     label: 'Linha',     render: () => <div style={{ width: 28, height: 3, background: '#10B981', borderRadius: 2 }} /> },
              ] as const).map((shape) => (
                <button
                  key={shape.id}
                  onClick={() => handleAddShape(shape.id)}
                  style={{
                    ...cardBtn, padding: 8, aspectRatio: '1',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                  title={shape.label}
                >
                  {shape.render()}
                </button>
              ))}
            </div>
            {/* Element categories */}
            <p style={{ ...panelSubtext, marginBottom: 8, fontWeight: 600, color: '#9A9A9E' }}>Categorias</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {ELEMENT_CATEGORIES.map((cat) => (
                <div
                  key={cat.l}
                  style={{
                    ...cardBtn, flexDirection: 'row', padding: '8px 10px',
                    gap: 8, justifyContent: 'flex-start',
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.c, flexShrink: 0 }} />
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
            <p style={panelHeading}>Texto</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => handleAddText('heading')} style={accentBtn}>
                {IC.plus(14)} Adicionar titulo
              </button>
              <button
                onClick={() => handleAddText('subheading')}
                style={{
                  ...accentBtn, background: 'transparent',
                  border: '1px solid #1C1C1F', color: '#E0DDD8',
                }}
              >
                {IC.plus(14)} Adicionar subtitulo
              </button>
              <button
                onClick={() => handleAddText('body')}
                style={{
                  ...accentBtn, background: 'transparent',
                  border: '1px solid #1C1C1F', color: '#E0DDD8',
                }}
              >
                {IC.plus(14)} Adicionar corpo de texto
              </button>
            </div>
            {/* Text presets preview */}
            <div style={{ marginTop: 20 }}>
              <p style={{ ...panelSubtext, marginBottom: 10, fontWeight: 600, color: '#9A9A9E' }}>Estilos rapidos</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => handleAddText('heading')}
                  style={{ ...cardBtn, padding: '12px 14px', alignItems: 'flex-start' }}
                >
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#E0DDD8', fontFamily: S }}>Titulo</span>
                  <span style={{ fontSize: 9, color: '#6E6E73', fontFamily: M }}>Sora Bold 48px</span>
                </button>
                <button
                  onClick={() => handleAddText('subheading')}
                  style={{ ...cardBtn, padding: '12px 14px', alignItems: 'flex-start' }}
                >
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#E0DDD8', fontFamily: S }}>Subtitulo</span>
                  <span style={{ fontSize: 9, color: '#6E6E73', fontFamily: M }}>Sora Semibold 28px</span>
                </button>
                <button
                  onClick={() => handleAddText('body')}
                  style={{ ...cardBtn, padding: '12px 14px', alignItems: 'flex-start' }}
                >
                  <span style={{ fontSize: 12, color: '#E0DDD8', fontFamily: S }}>Corpo de texto</span>
                  <span style={{ fontSize: 9, color: '#6E6E73', fontFamily: M }}>Sora Regular 16px</span>
                </button>
              </div>
            </div>
          </div>
        );

      /* ── Uploads ── */
      case 'uploads':
        return (
          <div>
            <p style={panelHeading}>Uploads</p>
            <div
              onDragOver={(e) => { e.preventDefault(); setUploadDrag(true); }}
              onDragLeave={() => setUploadDrag(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${uploadDrag ? '#E85D30' : '#2A2A2E'}`,
                borderRadius: 8, padding: 32, textAlign: 'center',
                background: uploadDrag ? '#E85D3010' : 'transparent',
                transition: 'all 200ms', marginBottom: 16,
              }}
            >
              <div style={{ color: uploadDrag ? '#E85D30' : '#6E6E73', marginBottom: 8 }}>
                {IC.upload(32)}
              </div>
              <p style={{ ...panelSubtext, marginBottom: 12 }}>
                Arraste uma imagem aqui ou
              </p>
              <label style={{ ...accentBtn, width: 'auto', display: 'inline-flex', padding: '8px 20px', cursor: 'pointer' }}>
                {IC.upload(14)} Escolher arquivo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileInput}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            <p style={{ ...panelSubtext, fontSize: 9 }}>
              Formatos aceitos: JPG, PNG, SVG, WebP. Max 10 MB.
            </p>
          </div>
        );

      /* ── Background ── */
      case 'background':
        return (
          <div>
            <p style={panelHeading}>Fundo</p>
            <p style={{ ...panelSubtext, marginBottom: 12 }}>Cor solida</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 20 }}>
              {[
                '#0A0A0C', '#111113', '#1C1C1F', '#2A2A2E', '#3A3A3F', '#6E6E73',
                '#E0DDD8', '#FFFFFF', '#E85D30', '#F59E0B', '#10B981', '#3B82F6',
                '#8B5CF6', '#EC4899', '#06B6D4', '#FF0000', '#833AB4', '#1877F2',
              ].map((c) => (
                <button
                  key={c}
                  onClick={() => handleSetBackground(c)}
                  style={{
                    width: '100%', aspectRatio: '1', borderRadius: 4,
                    background: c, border: c === '#0A0A0C' ? '1px solid #2A2A2E' : 'none',
                    cursor: 'pointer', transition: 'transform 150ms',
                  }}
                  title={c}
                />
              ))}
            </div>
            <p style={{ ...panelSubtext, marginBottom: 8 }}>Gradientes</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {[
                ['#E85D30', '#F59E0B'], ['#833AB4', '#E1306C'], ['#06B6D4', '#10B981'],
                ['#8B5CF6', '#EC4899'], ['#3B82F6', '#06B6D4'], ['#0A0A0C', '#2A2A2E'],
              ].map(([a, b], i) => (
                <button
                  key={i}
                  onClick={() => handleSetBackground(a)}
                  style={{
                    width: '100%', aspectRatio: '1.6', borderRadius: 4,
                    background: `linear-gradient(135deg, ${a}, ${b})`,
                    border: 'none', cursor: 'pointer',
                  }}
                  title={`${a} -> ${b}`}
                />
              ))}
            </div>
          </div>
        );

      /* ── Layers ── */
      case 'layers':
        return (
          <div>
            <p style={panelHeading}>Camadas</p>
            {selectedObj ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ ...cardBtn, flexDirection: 'row', padding: '8px 10px', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: '#E0DDD8', fontFamily: S }}>
                    {selectedObj?.type || 'Objeto'}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => editorRef.current?.layers.bringToFront()}
                      style={{ background: 'none', border: 'none', color: '#6E6E73', cursor: 'pointer', fontSize: 9, fontFamily: M }}
                      title="Trazer para frente"
                    >
                      TOP
                    </button>
                    <button
                      onClick={() => editorRef.current?.layers.sendToBack()}
                      style={{ background: 'none', border: 'none', color: '#6E6E73', cursor: 'pointer', fontSize: 9, fontFamily: M }}
                      title="Enviar para tras"
                    >
                      BTM
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button
                    onClick={() => editorRef.current?.clipboard.duplicate()}
                    style={{ ...cardBtn, flex: 1, flexDirection: 'row', padding: '8px 10px', gap: 6 }}
                  >
                    {IC.dup(12)} <span style={{ fontSize: 10, color: '#E0DDD8', fontFamily: S }}>Duplicar</span>
                  </button>
                  <button
                    onClick={() => editorRef.current?.selection.deleteSelected()}
                    style={{ ...cardBtn, flex: 1, flexDirection: 'row', padding: '8px 10px', gap: 6, borderColor: '#3A1515' }}
                  >
                    {IC.trash(12)} <span style={{ fontSize: 10, color: '#FF6B6B', fontFamily: S }}>Excluir</span>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ color: '#2A2A2E', marginBottom: 12 }}>{IC.layers(40)}</div>
                <p style={panelSubtext}>Selecione um objeto no canvas para ver suas camadas.</p>
              </div>
            )}
          </div>
        );

      /* ── Tools ── */
      case 'tools':
        return (
          <div>
            <p style={panelHeading}>Ferramentas</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {EDITOR_TOOLS.map((t) => (
                <button
                  key={t.l}
                  style={{
                    ...cardBtn, flexDirection: 'row', padding: '12px 14px',
                    gap: 10, justifyContent: 'flex-start',
                    background: `linear-gradient(135deg, ${t.c[0]}08, ${t.c[1]}08)`,
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: `linear-gradient(135deg, ${t.c[0]}, ${t.c[1]})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {IC.tool(14)}
                  </div>
                  <span style={{ fontSize: 11, color: '#E0DDD8', fontFamily: S, fontWeight: 600 }}>
                    {t.l}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 20, padding: 12, borderRadius: 6, background: '#111113', border: '1px solid #1C1C1F' }}>
              <p style={{ ...panelSubtext, fontSize: 9, textAlign: 'center' }}>
                Ferramentas avancadas em breve. Fique atento as atualizacoes.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  /* ═══ Keyboard shortcuts ═══ */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ed = editorRef.current;
      if (!ed) return;
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); ed.history.undo(); }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') { e.preventDefault(); ed.history.redo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') { e.preventDefault(); ed.history.redo(); }
      if (e.key === 'Delete' || (e.key === 'Backspace' && !e.metaKey)) { ed.selection.deleteSelected(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); ed.clipboard.duplicate(); }
      if (e.key === '+' || (e.key === '=' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); handleZoomIn(); }
      if (e.key === '-' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleZoomOut(); }
      if (e.key === '0' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleZoomFit(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleZoomIn, handleZoomOut, handleZoomFit]);

  /* ═══ Render ═══ */
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#0A0A0C', fontFamily: S, color: '#E0DDD8',
      overflow: 'hidden', userSelect: 'none',
    }}>
      {/* ── Top bar ── */}
      <EditorTopBar
        designName={designName}
        onNameChange={setDesignName}
        saving={saving}
        onBack={() => router.push('/canvas/inicio')}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExport={handleExport}
      />

      {/* ── Main body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── Sidebar ── */}
        <div style={{
          width: sidebarTab ? 336 : 56, display: 'flex',
          borderRight: '1px solid #1C1C1F',
          transition: 'width 200ms ease',
          flexShrink: 0,
        }}>
          {/* Icon rail */}
          <div style={{
            width: 56, background: '#0A0A0C',
            borderRight: '1px solid #1C1C1F',
            display: 'flex', flexDirection: 'column',
            padding: '8px 0', gap: 2, flexShrink: 0,
          }}>
            {SIDEBAR_TABS.map((tab) => {
              const active = sidebarTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => toggleTab(tab.id)}
                  title={tab.label}
                  style={{
                    width: 44, height: 44, margin: '0 auto',
                    borderRadius: 8, border: 'none',
                    background: active ? '#1C1C1F' : 'transparent',
                    color: active ? '#E85D30' : '#6E6E73',
                    cursor: 'pointer', display: 'flex',
                    flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 2,
                    transition: 'all 150ms',
                  }}
                >
                  {getIcon(tab.icon)(16)}
                  <span style={{
                    fontSize: 7, fontFamily: S, fontWeight: active ? 700 : 400,
                    letterSpacing: '0.02em', lineHeight: 1,
                  }}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Panel content */}
          {sidebarTab && (
            <div style={{
              width: 280, background: '#0A0A0C',
              overflowY: 'auto', padding: 16,
              borderRight: '1px solid #1C1C1F',
            }}>
              {renderPanel()}
            </div>
          )}
        </div>

        {/* ── Canvas viewport ── */}
        <div style={{
          flex: 1, background: '#19191C',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            boxShadow: '0 2px 20px rgba(0,0,0,0.3)',
            position: 'relative',
          }}>
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div style={{
        height: 40, borderTop: '1px solid #1C1C1F',
        display: 'flex', alignItems: 'center',
        padding: '0 16px', background: '#0A0A0C', flexShrink: 0,
      }}>
        {/* Left: status */}
        <span style={{ fontSize: 10, color: '#6E6E73', fontFamily: S }}>
          {saving ? 'Salvando...' : saved ? 'Salvo' : 'Notas'}
        </span>
        {saving && (
          <span style={{
            width: 5, height: 5, borderRadius: '50%', background: '#E85D30',
            display: 'inline-block', marginLeft: 6,
            animation: 'pulse-dot 1.5s ease-in-out infinite',
          }} />
        )}
        {saved && !saving && (
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" style={{ marginLeft: 6 }}>
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
            onClick={handleZoomOut}
            style={{
              background: 'none', border: 'none', color: '#6E6E73',
              cursor: 'pointer', padding: 2, display: 'flex',
            }}
            title="Zoom out"
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            onClick={handleZoomFit}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 6px', borderRadius: 3,
            }}
            title="Ajustar ao viewport"
          >
            <span style={{ fontSize: 10, color: '#E0DDD8', fontFamily: M }}>
              {zoom}%
            </span>
          </button>
          <button
            onClick={handleZoomIn}
            style={{
              background: 'none', border: 'none', color: '#6E6E73',
              cursor: 'pointer', padding: 2, display: 'flex',
            }}
            title="Zoom in"
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

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
