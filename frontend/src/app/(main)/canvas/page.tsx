'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useProducts } from '@/hooks/useProducts';
import { apiFetch } from '@/lib/api';

/* ═══════════════════════════════════════════
   KLOEL CANVAS v2 — Product-Aware Design Editor
   "Vincula o produto. A IA sabe tudo. Cria perfeito."
   ═══════════════════════════════════════════ */

const SORA = "var(--font-sora), 'Sora', sans-serif";
const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

/* ── Icons ── */
const IC = {
  cursor: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M4 2l16 12H11.5l5 9-3 1.5L8.5 15.5 4 20V2z"/></svg>,
  text: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>,
  square: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  circle: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="9"/></svg>,
  image: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  spark: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  trash: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  copy: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  download: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  layers: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  up: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="18 15 12 9 6 15"/></svg>,
  bold: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>,
  alignL: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>,
  alignC: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/></svg>,
  line: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="5" y1="19" x2="19" y2="5"/></svg>,
  box: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>,
  link: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  unlink: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-3 3A5 5 0 0 0 11 12"/><path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l3-3A5 5 0 0 0 13 12"/><line x1="2" y1="2" x2="22" y2="22"/></svg>,
  search: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  check: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

/* ── Formats ── */
const FORMATS = [
  { id: 'post-ig', name: 'Post Instagram', w: 1080, h: 1080, cat: 'Social' },
  { id: 'story', name: 'Story', w: 1080, h: 1920, cat: 'Social' },
  { id: 'banner-fb', name: 'Banner Facebook', w: 1200, h: 628, cat: 'Ads' },
  { id: 'thumb-yt', name: 'Thumbnail YouTube', w: 1280, h: 720, cat: 'Video' },
  { id: 'banner-email', name: 'Header Email', w: 600, h: 200, cat: 'Email' },
  { id: 'ad-feed', name: 'Criativo Ads', w: 1080, h: 1080, cat: 'Ads' },
  { id: 'cover', name: 'Capa de Produto', w: 800, h: 800, cat: 'Produto' },
  { id: 'custom', name: 'Personalizado', w: 1080, h: 1080, cat: 'Custom' },
];

/* ── Types ── */
interface CanvasElement {
  id: string;
  type: 'text' | 'rect' | 'circle' | 'line' | 'image' | 'ai-placeholder';
  x: number; y: number; w: number; h: number;
  text?: string; fontSize?: number; fontWeight?: number; color?: string; align?: string; fontFamily?: string;
  fill?: string; stroke?: string; strokeWidth?: number; radius?: number;
  src?: string; prompt?: string; productContext?: string;
  locked?: boolean; visible?: boolean; bg?: string;
}

interface LinkedProduct {
  id: string; name: string; price: number | string; category?: string;
  description?: string; format?: string; currency?: string;
}

let nextId = 1;
const mkId = () => `el-${nextId++}`;

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
export default function KloelCanvas() {
  const router = useRouter();
  const { products: rawProducts } = useProducts();
  const products = (rawProducts || []) as Record<string, unknown>[];

  const [phase, setPhase] = useState<'start' | 'editor'>('start');
  const [format, setFormat] = useState<typeof FORMATS[0] | null>(null);
  const [linkedProduct, setLinkedProduct] = useState<LinkedProduct | null>(null);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState('cursor');
  const [dragging, setDragging] = useState<string | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.5);
  const [canvasBg, setCanvasBg] = useState('#0A0A0C');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showLayers, setShowLayers] = useState(true);
  const [editingText, setEditingText] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0, elX: 0, elY: 0, elW: 0, elH: 0 });

  const selEl = elements.find(e => e.id === selected);

  function updateEl(id: string, patch: Partial<CanvasElement>) { setElements(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e)); }
  function removeEl(id: string) { setElements(prev => prev.filter(e => e.id !== id)); if (selected === id) setSelected(null); }
  function dupEl(id: string) { const el = elements.find(e => e.id === id); if (!el) return; const d = { ...el, id: mkId(), x: el.x + 20, y: el.y + 20 }; setElements(prev => [...prev, d]); setSelected(d.id); }
  function moveLayer(id: string, dir: 'up' | 'down') { setElements(prev => { const i = prev.findIndex(e => e.id === id); if (i < 0) return prev; const n = dir === 'up' ? Math.min(i + 1, prev.length - 1) : Math.max(i - 1, 0); const a = [...prev]; [a[i], a[n]] = [a[n], a[i]]; return a; }); }

  function addElement(type: string) {
    const cx = (format?.w || 1080) / 2 - 100, cy = (format?.h || 1080) / 2 - 50;
    let el: CanvasElement | null = null;
    if (type === 'text') el = { id: mkId(), type: 'text', x: cx, y: cy, w: 300, h: 60, text: linkedProduct ? linkedProduct.name : 'Seu texto aqui', fontSize: 32, fontWeight: 700, color: '#E0DDD8', align: 'left', fontFamily: SORA, locked: false, visible: true };
    else if (type === 'rect') el = { id: mkId(), type: 'rect', x: cx, y: cy, w: 200, h: 150, fill: '#E85D30', radius: 6, locked: false, visible: true };
    else if (type === 'circle') el = { id: mkId(), type: 'circle', x: cx, y: cy, w: 150, h: 150, fill: '#222226', stroke: '#E85D30', strokeWidth: 2, locked: false, visible: true };
    else if (type === 'line') el = { id: mkId(), type: 'line', x: cx, y: cy, w: 200, h: 4, fill: '#E85D30', locked: false, visible: true };
    if (el) { setElements(prev => [...prev, el!]); setSelected(el.id); setTool('cursor'); }
  }

  function handleCanvasClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target === canvasRef.current || target.dataset?.canvas) {
      setSelected(null); setEditingText(null);
      if (tool !== 'cursor') addElement(tool);
    }
  }

  function startDrag(e: React.MouseEvent, el: CanvasElement) { if (el.locked || tool !== 'cursor') return; e.stopPropagation(); setSelected(el.id); setDragging(el.id); dragStart.current = { x: e.clientX, y: e.clientY, elX: el.x, elY: el.y, elW: 0, elH: 0 }; }
  function startResize(e: React.MouseEvent, el: CanvasElement) { e.stopPropagation(); setResizing(el.id); dragStart.current = { x: e.clientX, y: e.clientY, elX: 0, elY: 0, elW: el.w, elH: el.h }; }

  function onMouseMove(e: React.MouseEvent) {
    if (dragging) { const dx = (e.clientX - dragStart.current.x) / zoom, dy = (e.clientY - dragStart.current.y) / zoom; updateEl(dragging, { x: dragStart.current.elX + dx, y: dragStart.current.elY + dy }); }
    if (resizing) { const dx = (e.clientX - dragStart.current.x) / zoom, dy = (e.clientY - dragStart.current.y) / zoom; updateEl(resizing, { w: Math.max(20, dragStart.current.elW + dx), h: Math.max(20, dragStart.current.elH + dy) }); }
  }
  function onMouseUp() { setDragging(null); setResizing(null); }

  function handleImageUpload() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = (e: any) => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = (ev: any) => { const el: CanvasElement = { id: mkId(), type: 'image', x: 100, y: 100, w: 300, h: 300, src: ev.target?.result, locked: false, visible: true }; setElements(prev => [...prev, el]); setSelected(el.id); setTool('cursor'); }; r.readAsDataURL(file); };
    inp.click();
  }

  function generateAI() {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    apiFetch('/canvas/generate', { method: 'POST', body: { prompt: aiPrompt, productId: linkedProduct?.id, width: format?.w, height: format?.h } }).then(() => {
      const el: CanvasElement = { id: mkId(), type: 'ai-placeholder', x: 50, y: 50, w: (format?.w || 1080) - 100, h: (format?.h || 1080) - 100, prompt: aiPrompt, productContext: linkedProduct?.name || undefined, locked: false, visible: true };
      setElements(prev => [...prev, el]); setSelected(el.id); setAiLoading(false); setAiPrompt('');
    }).catch(() => { setAiLoading(false); });
  }

  const filteredProducts = products.filter((p: any) => !productSearch || (p.name || '').toLowerCase().includes(productSearch.toLowerCase()));

  const AI_SUGGESTIONS = linkedProduct ? [
    `Post de lancamento: ${linkedProduct.name}`,
    'Story com preco e CTA',
    'Banner de desconto 30% off',
    'Criativo de depoimento',
    'Thumbnail para video de vendas',
    'Anuncio Feed com urgencia',
  ] : [
    'Post de lancamento de produto',
    'Story com CTA forte',
    'Banner de desconto',
    'Criativo de anuncio',
  ];

  /* ═══ PRODUCT PICKER MODAL ═══ */
  function ProductPicker() {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
        onClick={() => setShowProductPicker(false)}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#0A0A0C', border: '1px solid #222226', borderRadius: 6, width: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #19191C', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', fontFamily: SORA }}>Vincular produto</span>
            <button onClick={() => setShowProductPicker(false)} style={{ background: 'none', border: 'none', color: '#3A3A3F', cursor: 'pointer' }}>{IC.x(16)}</button>
          </div>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #19191C' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '8px 12px' }}>
              <span style={{ color: '#3A3A3F' }}>{IC.search(14)}</span>
              <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Buscar produto..." autoFocus
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#E0DDD8', fontSize: 13, fontFamily: SORA }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            <button onClick={() => { setLinkedProduct(null); setShowProductPicker(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: !linkedProduct ? 'rgba(232,93,48,0.04)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #19191C', fontFamily: SORA }}>
              <div style={{ width: 36, height: 36, borderRadius: 6, background: '#19191C', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3A3A3F' }}>{IC.unlink(16)}</div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#6E6E73', display: 'block' }}>Sem produto vinculado</span>
                <span style={{ fontSize: 11, color: '#3A3A3F' }}>Design generico</span>
              </div>
              {!linkedProduct && <span style={{ color: '#E85D30' }}>{IC.check(16)}</span>}
            </button>
            {filteredProducts.map((p: any) => (
              <button key={p.id} onClick={() => { setLinkedProduct({ id: p.id, name: p.name, price: p.price, category: p.category, description: p.description, format: p.format, currency: p.currency }); setShowProductPicker(false); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: linkedProduct?.id === p.id ? 'rgba(232,93,48,0.04)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #19191C', fontFamily: SORA }}>
                <div style={{ width: 36, height: 36, borderRadius: 6, background: '#19191C', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3A3A3F' }}>{IC.box(16)}</div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#E0DDD8', display: 'block' }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: '#3A3A3F' }}>{p.category || 'Sem categoria'} — {p.currency || 'R$'} {p.price}</span>
                </div>
                {linkedProduct?.id === p.id && <span style={{ color: '#E85D30' }}>{IC.check(16)}</span>}
              </button>
            ))}
            {filteredProducts.length === 0 && (
              <div style={{ padding: '24px 20px', textAlign: 'center', color: '#3A3A3F', fontSize: 13, fontFamily: SORA }}>
                {products.length === 0 ? 'Nenhum produto criado ainda' : 'Nenhum produto encontrado'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ═══ START PHASE ═══ */
  if (phase === 'start') {
    return (
      <div style={{ background: '#0A0A0C', minHeight: '100vh', fontFamily: SORA, color: '#E0DDD8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        {showProductPicker && <ProductPicker />}

        <div style={{ maxWidth: 740, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <p style={{ fontFamily: MONO, fontSize: 10, color: '#E85D30', letterSpacing: '.25em', textTransform: 'uppercase', marginBottom: 16 }}>CANVAS</p>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#E0DDD8', marginBottom: 8, fontFamily: SORA }}>Crie criativos que vendem</h1>
            <p style={{ fontSize: 14, color: '#6E6E73', fontFamily: SORA }}>Vincule um produto e a IA ja sabe tudo sobre ele.</p>
          </div>

          {/* Product Linker */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ color: linkedProduct ? '#E85D30' : '#3A3A3F', display: 'flex' }}>{linkedProduct ? IC.link(14) : IC.unlink(14)}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: SORA }}>Produto vinculado</span>
            </div>
            {linkedProduct ? (
              <div style={{ background: '#111113', border: '1px solid rgba(232,93,48,0.15)', borderRadius: 6, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 6, background: 'rgba(232,93,48,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E85D30', flexShrink: 0 }}>{IC.box(18)}</div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>{linkedProduct.name}</span>
                  <span style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>{linkedProduct.category || 'Sem categoria'} — {linkedProduct.currency || 'R$'} {linkedProduct.price}</span>
                </div>
                <button onClick={() => setShowProductPicker(true)} style={{ background: 'none', border: '1px solid #222226', borderRadius: 6, padding: '6px 12px', color: '#6E6E73', fontSize: 11, cursor: 'pointer', fontFamily: SORA }}>Trocar</button>
                <button onClick={() => setLinkedProduct(null)} style={{ background: 'none', border: 'none', color: '#3A3A3F', cursor: 'pointer', padding: 4 }}>{IC.x(14)}</button>
              </div>
            ) : (
              <button onClick={() => setShowProductPicker(true)}
                style={{ width: '100%', background: '#111113', border: '1px dashed #222226', borderRadius: 6, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: SORA }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#333338')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#222226')}>
                <div style={{ width: 40, height: 40, borderRadius: 6, background: '#19191C', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3A3A3F' }}>{IC.box(18)}</div>
                <div style={{ textAlign: 'left' }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#6E6E73', display: 'block' }}>Vincular produto</span>
                  <span style={{ fontSize: 11, color: '#3A3A3F' }}>A IA cria artes baseadas no nome, preco, descricao e categoria</span>
                </div>
              </button>
            )}
          </div>

          {/* Format Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 28 }}>
            {FORMATS.map(f => (
              <div key={f.id} onClick={() => { setFormat(f); setPhase('editor'); }}
                style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 14, cursor: 'pointer', transition: 'all .15s', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#333338')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#222226')}>
                <div style={{ width: '100%', height: 50, background: '#19191C', borderRadius: 4, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: Math.min(f.w / f.h * 30, 40), height: Math.min(f.h / f.w * 30, 40), border: '1px solid #3A3A3F', borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#E0DDD8', display: 'block', marginBottom: 2, fontFamily: SORA }}>{f.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: '#3A3A3F' }}>{f.w}x{f.h}</span>
              </div>
            ))}
          </div>

          {/* AI Prompt */}
          <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#E85D30', display: 'flex' }}>{IC.spark(16)}</span>
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && aiPrompt.trim()) { setFormat(FORMATS[0]); setPhase('editor'); } }}
                placeholder={linkedProduct ? `Crie algo para "${linkedProduct.name}"...` : 'Descreva o criativo que voce quer...'}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#E0DDD8', fontSize: 13, fontFamily: SORA }} />
            </div>
            {linkedProduct && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {AI_SUGGESTIONS.slice(0, 4).map(s => (
                  <button key={s} onClick={() => { setAiPrompt(s); setFormat(FORMATS[0]); setPhase('editor'); }}
                    style={{ padding: '4px 10px', background: 'rgba(232,93,48,0.04)', border: '1px solid rgba(232,93,48,0.1)', borderRadius: 4, color: '#E85D30', fontSize: 10, cursor: 'pointer', fontFamily: SORA }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ═══ EDITOR ═══ */
  const canvasW = format?.w || 1080, canvasH = format?.h || 1080;
  const TOOLS = [
    { key: 'cursor', icon: IC.cursor, tip: 'Selecionar' },
    { key: 'text', icon: IC.text, tip: 'Texto' },
    { key: 'rect', icon: IC.square, tip: 'Retangulo' },
    { key: 'circle', icon: IC.circle, tip: 'Circulo' },
    { key: 'line', icon: IC.line, tip: 'Linha' },
  ];

  return (
    <div style={{ background: '#0A0A0C', height: '100vh', fontFamily: SORA, color: '#E0DDD8', display: 'flex', flexDirection: 'column', overflow: 'hidden', userSelect: 'none' }}
      onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      {showProductPicker && <ProductPicker />}

      {/* Top Bar */}
      <div style={{ height: 44, borderBottom: '1px solid #19191C', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setPhase('start')} style={{ background: 'none', border: 'none', color: '#6E6E73', cursor: 'pointer', fontSize: 12, fontFamily: SORA }}>← Canvas</button>
          <span style={{ color: '#222226' }}>|</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#E0DDD8', fontFamily: SORA }}>{format?.name}</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: '#3A3A3F' }}>{canvasW}x{canvasH}</span>
        </div>
        {linkedProduct ? (
          <button onClick={() => setShowProductPicker(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(232,93,48,0.04)', border: '1px solid rgba(232,93,48,0.12)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: SORA }}>
            <span style={{ color: '#E85D30', display: 'flex' }}>{IC.link(10)}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#E85D30' }}>{linkedProduct.name}</span>
          </button>
        ) : (
          <button onClick={() => setShowProductPicker(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid #222226', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: SORA }}>
            <span style={{ color: '#3A3A3F', display: 'flex' }}>{IC.unlink(10)}</span>
            <span style={{ fontSize: 10, color: '#3A3A3F' }}>Vincular produto</span>
          </button>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#111113', border: '1px solid #222226', borderRadius: 4, padding: '4px 10px' }}>
            <button onClick={() => setZoom(Math.max(0.1, zoom - 0.1))} style={{ background: 'none', border: 'none', color: '#6E6E73', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>-</button>
            <span style={{ fontFamily: MONO, fontSize: 10, color: '#E0DDD8', width: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(Math.min(3, zoom + 0.1))} style={{ background: 'none', border: 'none', color: '#6E6E73', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>+</button>
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#6E6E73', fontSize: 11, cursor: 'pointer', fontFamily: SORA }}>{IC.download(12)} Exportar</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left — Tools */}
        <div style={{ width: 52, borderRight: '1px solid #19191C', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 2, flexShrink: 0 }}>
          {TOOLS.map(t => (
            <button key={t.key} onClick={() => setTool(t.key)} title={t.tip}
              style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tool === t.key ? 'rgba(232,93,48,0.06)' : 'none', border: `1px solid ${tool === t.key ? '#E85D30' : 'transparent'}`, borderRadius: 6, color: tool === t.key ? '#E85D30' : '#6E6E73', cursor: 'pointer' }}>
              {t.icon(16)}
            </button>
          ))}
          <div style={{ height: 1, width: 24, background: '#19191C', margin: '4px 0' }} />
          <button onClick={handleImageUpload} title="Imagem" style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid transparent', borderRadius: 6, color: '#6E6E73', cursor: 'pointer' }}>{IC.image(16)}</button>
          <div style={{ height: 1, width: 24, background: '#19191C', margin: '4px 0' }} />
          <button onClick={() => setShowLayers(!showLayers)} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: showLayers ? 'rgba(232,93,48,0.06)' : 'none', border: `1px solid ${showLayers ? '#E85D30' : 'transparent'}`, borderRadius: 6, color: showLayers ? '#E85D30' : '#6E6E73', cursor: 'pointer' }}>{IC.layers(16)}</button>
        </div>

        {/* Layers + AI */}
        {showLayers && (
          <div style={{ width: 210, borderRight: '1px solid #19191C', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #19191C' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: SORA }}>Camadas</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {[...elements].reverse().map(el => (
                <div key={el.id} onClick={() => setSelected(el.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: selected === el.id ? 'rgba(232,93,48,0.06)' : 'none', cursor: 'pointer', borderLeft: selected === el.id ? '2px solid #E85D30' : '2px solid transparent' }}>
                  <span style={{ color: '#3A3A3F', display: 'flex' }}>{el.type === 'text' ? IC.text(11) : el.type === 'rect' ? IC.square(11) : el.type === 'circle' ? IC.circle(11) : el.type === 'image' ? IC.image(11) : IC.spark(11)}</span>
                  <span style={{ fontSize: 10, color: selected === el.id ? '#E0DDD8' : '#6E6E73', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.type === 'text' ? (el.text || '').slice(0, 18) : el.type === 'ai-placeholder' ? 'IA' : el.type}</span>
                  <button onClick={e => { e.stopPropagation(); moveLayer(el.id, 'up'); }} style={{ background: 'none', border: 'none', color: '#3A3A3F', cursor: 'pointer', padding: 0, display: 'flex' }}>{IC.up(9)}</button>
                </div>
              ))}
            </div>
            {/* AI Section */}
            <div style={{ borderTop: '1px solid #19191C', padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ color: '#E85D30', display: 'flex' }}>{IC.spark(12)}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#E85D30', textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: MONO }}>IA Criar</span>
              </div>
              {linkedProduct && (
                <div style={{ background: 'rgba(232,93,48,0.04)', borderRadius: 4, padding: '4px 8px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 9, color: '#E85D30', display: 'flex' }}>{IC.link(8)}</span>
                  <span style={{ fontSize: 9, color: '#6E6E73', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkedProduct.name}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && generateAI()}
                  placeholder={linkedProduct ? `Crie pra ${linkedProduct.name.slice(0, 15)}...` : 'Descreva a arte...'}
                  style={{ flex: 1, background: '#111113', border: '1px solid #222226', borderRadius: 4, padding: '6px 8px', color: '#E0DDD8', fontSize: 10, fontFamily: SORA, outline: 'none' }} />
                <button onClick={generateAI} disabled={aiLoading}
                  style={{ width: 26, height: 26, background: aiPrompt.trim() && !aiLoading ? '#E85D30' : '#19191C', border: 'none', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: aiPrompt.trim() ? '#0A0A0C' : '#3A3A3F', cursor: aiPrompt.trim() ? 'pointer' : 'default' }}>
                  {aiLoading ? <div style={{ width: 10, height: 10, border: '2px solid transparent', borderTopColor: '#E85D30', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> : IC.spark(10)}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {AI_SUGGESTIONS.slice(0, 3).map(s => (
                  <button key={s} onClick={() => setAiPrompt(s)}
                    style={{ padding: '2px 6px', background: 'none', border: '1px solid #222226', borderRadius: 3, color: '#3A3A3F', fontSize: 8, cursor: 'pointer', fontFamily: SORA }}>{s.slice(0, 22)}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Canvas */}
        <div style={{ flex: 1, background: '#19191C', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={handleCanvasClick}>
          <div style={{ position: 'relative', width: canvasW * zoom, height: canvasH * zoom, flexShrink: 0 }}>
            <div ref={canvasRef} data-canvas="true"
              style={{ width: canvasW, height: canvasH, background: canvasBg, transform: `scale(${zoom})`, transformOrigin: 'top left', position: 'relative', boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}>
              {elements.filter(e => e.visible !== false).map(el => {
                const isSel = selected === el.id;
                const resizeHandle = isSel ? <div onMouseDown={e => startResize(e, el)} style={{ position: 'absolute', right: -4, bottom: -4, width: 8, height: 8, background: '#E85D30', borderRadius: 1, cursor: 'nwse-resize' }} /> : null;

                if (el.type === 'text') return (
                  <div key={el.id} onMouseDown={e => startDrag(e, el)} onDoubleClick={() => { setEditingText(el.id); setSelected(el.id); }}
                    style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, minHeight: el.h, cursor: 'grab', outline: isSel ? '1px solid #E85D30' : 'none', padding: 4 }}>
                    {editingText === el.id ? (
                      <textarea value={el.text || ''} onChange={e => updateEl(el.id, { text: e.target.value })} onBlur={() => setEditingText(null)} autoFocus
                        style={{ width: '100%', minHeight: (el.h || 60) - 8, background: 'none', border: 'none', outline: 'none', resize: 'none', color: el.color, fontSize: el.fontSize, fontWeight: el.fontWeight, fontFamily: el.fontFamily || SORA, textAlign: (el.align || 'left') as React.CSSProperties['textAlign'], lineHeight: 1.2 }} />
                    ) : (
                      <div style={{ color: el.color, fontSize: el.fontSize, fontWeight: el.fontWeight, fontFamily: el.fontFamily || SORA, textAlign: (el.align || 'left') as React.CSSProperties['textAlign'], lineHeight: 1.2, whiteSpace: 'pre-wrap' }}>{el.text}</div>
                    )}
                    {resizeHandle}
                  </div>
                );
                if (el.type === 'rect') return (
                  <div key={el.id} onMouseDown={e => startDrag(e, el)}
                    style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, background: el.fill, borderRadius: el.radius || 0, cursor: 'grab', outline: isSel ? '1px solid #E85D30' : 'none' }}>
                    {resizeHandle}
                  </div>
                );
                if (el.type === 'circle') return (
                  <div key={el.id} onMouseDown={e => startDrag(e, el)}
                    style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, background: el.fill, borderRadius: '50%', border: el.stroke ? `${el.strokeWidth || 2}px solid ${el.stroke}` : 'none', cursor: 'grab', outline: isSel ? '1px solid #E85D30' : 'none' }}>
                    {resizeHandle}
                  </div>
                );
                if (el.type === 'line') return (
                  <div key={el.id} onMouseDown={e => startDrag(e, el)}
                    style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, background: el.fill, cursor: 'grab', outline: isSel ? '1px solid #E85D30' : 'none' }}>
                    {resizeHandle}
                  </div>
                );
                if (el.type === 'image') return (
                  <div key={el.id} onMouseDown={e => startDrag(e, el)}
                    style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, cursor: 'grab', outline: isSel ? '1px solid #E85D30' : 'none', overflow: 'hidden', borderRadius: 4 }}>
                    {el.src ? <img src={el.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#222226', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3A3A3F' }}>{IC.image(32)}</div>}
                    {resizeHandle}
                  </div>
                );
                if (el.type === 'ai-placeholder') return (
                  <div key={el.id} onMouseDown={e => startDrag(e, el)}
                    style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, background: 'rgba(232,93,48,0.03)', border: '1px dashed rgba(232,93,48,0.2)', borderRadius: 6, cursor: 'grab', outline: isSel ? '1px solid #E85D30' : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <div style={{ color: '#E85D30', opacity: 0.5 }}>{IC.spark(32)}</div>
                    <span style={{ fontSize: 12, color: '#6E6E73', textAlign: 'center', padding: '0 20px', fontFamily: SORA }}>IA: &quot;{el.prompt}&quot;</span>
                    {el.productContext && <span style={{ fontSize: 10, color: '#E85D30', opacity: 0.6, fontFamily: SORA }}>Produto: {el.productContext}</span>}
                    {resizeHandle}
                  </div>
                );
                return null;
              })}
            </div>
          </div>
        </div>

        {/* Right — Properties */}
        <div style={{ width: 240, borderLeft: '1px solid #19191C', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #19191C' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: SORA }}>{selEl ? 'Propriedades' : 'Design'}</span>
          </div>
          <div style={{ padding: 14 }}>
            {!selEl ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: '#3A3A3F', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6, fontFamily: SORA }}>Fundo</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['#0A0A0C', '#111113', '#FFFFFF', '#1a1a2e', '#0f3460', '#E85D30'].map(c => (
                      <div key={c} onClick={() => setCanvasBg(c)} style={{ width: 24, height: 24, borderRadius: 4, background: c, cursor: 'pointer', border: canvasBg === c ? '2px solid #E85D30' : '1px solid #222226' }} />
                    ))}
                  </div>
                </div>
                {linkedProduct && (
                  <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ color: '#E85D30', display: 'flex' }}>{IC.link(12)}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#E85D30', textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: MONO }}>Produto</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#E0DDD8', display: 'block', marginBottom: 4, fontFamily: SORA }}>{linkedProduct.name}</span>
                    <span style={{ fontSize: 10, color: '#3A3A3F', display: 'block', marginBottom: 2 }}>{linkedProduct.currency || 'R$'} {linkedProduct.price} — {linkedProduct.category || ''}</span>
                    <span style={{ fontSize: 10, color: '#3A3A3F', lineHeight: 1.4, display: 'block' }}>{(linkedProduct.description || '').slice(0, 80)}{(linkedProduct.description || '').length > 80 ? '...' : ''}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Position */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: '#3A3A3F', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6, fontFamily: SORA }}>Posicao</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {(['x', 'y'] as const).map(k => (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#111113', border: '1px solid #222226', borderRadius: 4, padding: '4px 8px' }}>
                        <span style={{ fontSize: 9, color: '#3A3A3F', fontFamily: MONO }}>{k.toUpperCase()}</span>
                        <input type="number" value={Math.round(selEl[k])} onChange={e => updateEl(selEl.id, { [k]: parseInt(e.target.value) || 0 })}
                          style={{ width: '100%', background: 'none', border: 'none', outline: 'none', color: '#E0DDD8', fontSize: 11, fontFamily: MONO }} />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Size */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: '#3A3A3F', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6, fontFamily: SORA }}>Tamanho</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {(['w', 'h'] as const).map(k => (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#111113', border: '1px solid #222226', borderRadius: 4, padding: '4px 8px' }}>
                        <span style={{ fontSize: 9, color: '#3A3A3F', fontFamily: MONO }}>{k.toUpperCase()}</span>
                        <input type="number" value={Math.round(selEl[k])} onChange={e => updateEl(selEl.id, { [k]: Math.max(20, parseInt(e.target.value) || 20) })}
                          style={{ width: '100%', background: 'none', border: 'none', outline: 'none', color: '#E0DDD8', fontSize: 11, fontFamily: MONO }} />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Color for shapes */}
                {(selEl.type === 'rect' || selEl.type === 'circle' || selEl.type === 'line') && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: '#3A3A3F', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6, fontFamily: SORA }}>Cor</label>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {['#E85D30', '#E0DDD8', '#0A0A0C', '#111113', '#222226', '#3A3A3F', '#6E6E73', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899'].map(c => (
                        <div key={c} onClick={() => updateEl(selEl.id, { fill: c })} style={{ width: 20, height: 20, borderRadius: 4, background: c, cursor: 'pointer', border: selEl.fill === c ? '2px solid #E85D30' : '1px solid #222226' }} />
                      ))}
                    </div>
                  </div>
                )}
                {/* Text properties */}
                {selEl.type === 'text' && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: '#3A3A3F', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6, fontFamily: SORA }}>Texto</label>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                      <input type="number" value={selEl.fontSize || 16} onChange={e => updateEl(selEl.id, { fontSize: parseInt(e.target.value) || 16 })}
                        style={{ width: 44, background: '#111113', border: '1px solid #222226', borderRadius: 4, padding: '4px 6px', color: '#E0DDD8', fontSize: 10, fontFamily: MONO, outline: 'none' }} />
                      <button onClick={() => updateEl(selEl.id, { fontWeight: selEl.fontWeight === 700 ? 400 : 700 })}
                        style={{ width: 26, height: 26, background: selEl.fontWeight === 700 ? 'rgba(232,93,48,0.06)' : '#111113', border: `1px solid ${selEl.fontWeight === 700 ? '#E85D30' : '#222226'}`, borderRadius: 4, color: selEl.fontWeight === 700 ? '#E85D30' : '#6E6E73', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{IC.bold(10)}</button>
                      <button onClick={() => updateEl(selEl.id, { align: selEl.align === 'left' ? 'center' : selEl.align === 'center' ? 'right' : 'left' })}
                        style={{ width: 26, height: 26, background: '#111113', border: '1px solid #222226', borderRadius: 4, color: '#6E6E73', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{selEl.align === 'center' ? IC.alignC(10) : IC.alignL(10)}</button>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {['#E0DDD8', '#E85D30', '#0A0A0C', '#FFFFFF', '#6E6E73', '#3B82F6'].map(c => (
                        <div key={c} onClick={() => updateEl(selEl.id, { color: c })} style={{ width: 20, height: 20, borderRadius: 4, background: c, cursor: 'pointer', border: selEl.color === c ? '2px solid #E85D30' : '1px solid #222226' }} />
                      ))}
                    </div>
                  </div>
                )}
                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 14, borderTop: '1px solid #19191C', paddingTop: 12 }}>
                  <button onClick={() => dupEl(selEl.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '6px 8px', background: 'none', border: '1px solid #222226', borderRadius: 4, color: '#6E6E73', fontSize: 10, cursor: 'pointer', fontFamily: SORA }}>{IC.copy(9)} Duplicar</button>
                  <button onClick={() => removeEl(selEl.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '6px 8px', background: 'none', border: '1px solid #222226', borderRadius: 4, color: '#E85D30', fontSize: 10, cursor: 'pointer', fontFamily: SORA }}>{IC.trash(9)} Excluir</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
