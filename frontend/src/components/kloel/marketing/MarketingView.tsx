'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMarketingStats, useMarketingChannels, useMarketingLiveFeed, useAIBrain } from '@/hooks/useMarketing';
import { useProducts } from '@/hooks/useProducts';
import { apiFetch } from '@/lib/api';

// ── Fonts ──
const SORA = "'Sora',sans-serif";
const MONO = "'JetBrains Mono',monospace";

// ── DNA Colors ──
const BG_CARD = '#111113';
const BG_ELEVATED = '#19191C';
const BORDER = '#222226';
const EMBER = '#E85D30';

// ── Icons (SVG arrow functions) ──
const IC: Record<string, (s: number) => React.ReactElement> = {
  wa:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785h-.01a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374A9.86 9.86 0 012.16 12.01C2.16 6.579 6.58 2.16 12.06 2.16a9.84 9.84 0 016.982 2.892 9.84 9.84 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884zM20.52 3.449A11.8 11.8 0 0012.05.002C5.463.002.104 5.36.1 11.95a11.82 11.82 0 001.588 5.945L0 24l6.304-1.654a11.88 11.88 0 005.683 1.448h.005c6.585 0 11.946-5.36 11.95-11.95a11.84 11.84 0 00-3.498-8.395z"/></svg>,
  ig:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>,
  tt:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48V13a8.28 8.28 0 005.58 2.15V11.7a4.83 4.83 0 01-3.58-1.43V6.69h3.58z"/></svg>,
  fb:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  em:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>,
  zap:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  globe: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,
  site:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="10" cy="6" r="1" fill="currentColor"/></svg>,
  send:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>,
  key:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  check: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="20 6 9 17 4 12"/></svg>,
  pause: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  play:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  box:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
};

// ── Channels ──
const CH: Record<string, { icon: (s: number) => React.ReactElement; label: string; color: string; msgs: number; leads: number; sales: number; revenue: number; convos: number; account: string }> = {
  whatsapp:  { icon: IC.wa, label: 'WhatsApp',  color: '#25D366', msgs: 0, leads: 0, sales: 0, revenue: 0, convos: 0, account: '+55 11 91234-5678' },
  instagram: { icon: IC.ig, label: 'Instagram', color: '#E1306C', msgs: 0, leads: 0, sales: 0, revenue: 0, convos: 0, account: '@kloel.store' },
  tiktok:    { icon: IC.tt, label: 'TikTok',    color: '#ff0050', msgs: 0, leads: 0, sales: 0, revenue: 0, convos: 0, account: '@kloel.store' },
  facebook:  { icon: IC.fb, label: 'Facebook',  color: '#1877F2', msgs: 0, leads: 0, sales: 0, revenue: 0, convos: 0, account: 'Kloel Store' },
  email:     { icon: IC.em, label: 'Email',     color: '#F59E0B', msgs: 0, leads: 0, sales: 0, revenue: 0, convos: 0, account: 'contato@kloel.com' },
};

// ── Helpers ──
const Fmt = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n.toString();
const FmtMoney = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

// ── NeuralPulse canvas with sin waves + spike ──
function NP({ w, h, color = EMBER }: { w: number; h: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    let raf: number;
    let visible = true;
    const obs = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
    obs.observe(c);
    const draw = () => {
      if (!visible) { raf = requestAnimationFrame(draw); return; }
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.15 + Math.sin(frame * 0.02 + i) * 0.1;
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 2) {
          const spike = Math.random() > 0.97 ? (Math.random() - 0.5) * h * 0.6 : 0;
          const y = h / 2 + Math.sin(x * 0.04 + frame * 0.03 + i * 1.5) * (h * 0.25 + i * 2) + spike;
          if (x === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      frame++;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); obs.disconnect(); };
  }, [w, h, color]);
  return <canvas ref={ref} width={w} height={h} style={{ display: 'block', opacity: 0.6, pointerEvents: 'none' }} />;
}

// ── Ticker ──
function Ticker({ items }: { items: string[] }) {
  const text = items.join('  ///  ');
  return (
    <div style={{ overflow: 'hidden', width: '100%', background: BG_CARD, borderRadius: 6, padding: '8px 0', border: `1px solid ${BORDER}` }}>
      <div style={{ display: 'inline-block', whiteSpace: 'nowrap', animation: 'mktTickerScroll 30s linear infinite', fontFamily: MONO, fontSize: 12, color: EMBER, opacity: 0.8 }}>
        {text}&nbsp;&nbsp;&nbsp;///&nbsp;&nbsp;&nbsp;{text}
      </div>
    </div>
  );
}

// ── LiveStream ──
function LiveStream({ msgs, color = EMBER }: { msgs: string[]; color?: string }) {
  const [feed, setFeed] = useState<string[]>([]);
  const idx = useRef(0);
  useEffect(() => {
    if (msgs.length === 0 || (msgs.length === 1 && msgs[0] === 'Aguardando mensagens...')) return;
    const iv = setInterval(() => {
      setFeed(p => [msgs[idx.current % msgs.length], ...p].slice(0, 8));
      idx.current++;
    }, 1200 + Math.random() * 800);
    return () => clearInterval(iv);
  }, [msgs]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {feed.map((m, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 12, color: '#E0DDD8', padding: '6px 10px', background: BG_CARD, borderRadius: 6, border: `1px solid ${BORDER}`, opacity: 1 - i * 0.1 }}>
          <NP w={24} h={12} color={color} />
          <span>{m}</span>
        </div>
      ))}
    </div>
  );
}

// ── LiveFeed ──
function LiveFeed({ events, color = EMBER }: { events: { text: string; time: string }[]; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {events.map((ev, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: BG_CARD, borderRadius: 6, border: `1px solid ${BORDER}`, opacity: 1 }}>
          <NP w={24} h={12} color={color} />
          <span style={{ fontFamily: SORA, fontSize: 12, color: '#E0DDD8', flex: 1 }}>{ev.text}</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: '#3A3A3F' }}>{ev.time}</span>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════

// ── ConnBadge ──
function ConnBadge({ connected }: { connected: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: MONO, color: connected ? '#10B981' : '#ef4444', background: connected ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 99 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#10B981' : '#ef4444', animation: connected ? 'mktPulse 2s infinite' : 'none' }} />
      {connected ? 'Conectado' : 'Desconectado'}
    </span>
  );
}

// ── ConnectFlow (3-step animation) ──
function ConnectFlow({ channel, setConns }: { channel: string; setConns: React.Dispatch<React.SetStateAction<Record<string, boolean>>> }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step === 1) {
      const t = setTimeout(() => setStep(2), 2000);
      return () => clearTimeout(t);
    }
    if (step === 2) {
      const t = setTimeout(() => {
        setConns(p => ({ ...p, [channel]: true }));
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [step, channel, setConns]);

  const ch = CH[channel];
  if (!ch) return null;

  if (step === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20, opacity: 1 }}>
      <div style={{ color: ch.color, opacity: 0.3 }}>{ch.icon(80)}</div>
      <div style={{ fontFamily: SORA, fontSize: 22, color: '#E0DDD8' }}>Conectar {ch.label}</div>
      <div style={{ fontFamily: SORA, fontSize: 14, color: '#6E6E73', maxWidth: 400, textAlign: 'center' }}>
        Conecte sua conta do {ch.label} para comecar a receber mensagens, automatizar respostas e acompanhar metricas em tempo real.
      </div>
      <button onClick={() => setStep(1)} style={{ fontFamily: SORA, fontSize: 14, padding: '12px 32px', borderRadius: 6, border: 'none', background: ch.color, color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
        {IC.key(16)} Conectar {ch.label}
      </button>
    </div>
  );

  if (step === 1) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20, opacity: 1 }}>
      <div style={{ color: ch.color, animation: 'mktSpin 2s linear infinite' }}>{ch.icon(60)}</div>
      <div style={{ fontFamily: SORA, fontSize: 18, color: '#E0DDD8' }}>Autenticando {ch.label}...</div>
      <div style={{ fontFamily: MONO, fontSize: 12, color: ch.color }}>Aguarde enquanto validamos sua conta</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20, opacity: 1 }}>
      <div style={{ color: '#10B981' }}>{IC.check(60)}</div>
      <div style={{ fontFamily: SORA, fontSize: 18, color: '#E0DDD8' }}>{ch.label} Conectado!</div>
      <div style={{ fontFamily: MONO, fontSize: 12, color: '#10B981' }}>Sincronizando dados...</div>
    </div>
  );
}

// ── SiteBuilder (connected to backend) ──
function SiteBuilder() {
  const [phase, setPhase] = useState<'ask' | 'building' | 'editor'>('ask');
  const [prompt, setPrompt] = useState('');
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [savedSiteId, setSavedSiteId] = useState<string | null>(null);
  const [siteName, setSiteName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [savedSites, setSavedSites] = useState<any[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load saved sites on mount
  useEffect(() => {
    setLoadingSites(true);
    apiFetch('/kloel/site/list').then(res => {
      if (res.data?.sites) setSavedSites(res.data.sites);
    }).finally(() => setLoadingSites(false));
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setError('');
    setPhase('building');
    const res = await apiFetch('/kloel/site/generate', {
      method: 'POST',
      body: { prompt: prompt.trim() },
    });
    if (res.error) {
      setError(res.error);
      setPhase('ask');
      return;
    }
    if (res.data?.html) {
      setGeneratedHtml(res.data.html);
      setSiteName(prompt.trim().slice(0, 60));
      setPhase('editor');
    } else {
      setError('Nenhum HTML foi gerado. Tente novamente.');
      setPhase('ask');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    if (savedSiteId) {
      const res = await apiFetch(`/kloel/site/${savedSiteId}`, {
        method: 'PUT',
        body: { name: siteName || 'Site sem titulo', htmlContent: generatedHtml },
      });
      if (res.error) setError(res.error);
    } else {
      const res = await apiFetch('/kloel/site/save', {
        method: 'POST',
        body: { name: siteName || 'Site sem titulo', htmlContent: generatedHtml },
      });
      if (res.error) { setError(res.error); }
      else if (res.data?.site?.id) { setSavedSiteId(res.data.site.id); }
    }
    setSaving(false);
  };

  const handlePublish = async () => {
    if (!savedSiteId) {
      setSaving(true);
      setError('');
      const saveRes = await apiFetch('/kloel/site/save', {
        method: 'POST',
        body: { name: siteName || 'Site sem titulo', htmlContent: generatedHtml },
      });
      setSaving(false);
      if (saveRes.error) { setError(saveRes.error); return; }
      if (!saveRes.data?.site?.id) { setError('Erro ao salvar site antes de publicar.'); return; }
      setSavedSiteId(saveRes.data.site.id);
      setPublishing(true);
      const pubRes = await apiFetch(`/kloel/site/${saveRes.data.site.id}/publish`, { method: 'POST' });
      setPublishing(false);
      if (pubRes.error) { setError(pubRes.error); return; }
      if (pubRes.data?.url) setPublishedUrl(pubRes.data.url);
    } else {
      setPublishing(true);
      setError('');
      const res = await apiFetch(`/kloel/site/${savedSiteId}/publish`, { method: 'POST' });
      setPublishing(false);
      if (res.error) { setError(res.error); return; }
      if (res.data?.url) setPublishedUrl(res.data.url);
    }
  };

  const handleEditWithAI = async () => {
    if (!editPrompt.trim()) return;
    setEditLoading(true);
    setError('');
    const res = await apiFetch('/kloel/site/generate', {
      method: 'POST',
      body: { prompt: editPrompt.trim(), currentHtml: generatedHtml },
    });
    setEditLoading(false);
    if (res.error) { setError(res.error); return; }
    if (res.data?.html) {
      setGeneratedHtml(res.data.html);
      setEditPrompt('');
    }
  };

  const loadSavedSite = (site: any) => {
    setGeneratedHtml(site.htmlContent || '');
    setSavedSiteId(site.id);
    setSiteName(site.name || '');
    setPublishedUrl(site.published && site.slug ? `/s/${site.slug}` : '');
    setPhase('editor');
  };

  const handleDelete = async (siteId: string) => {
    const res = await apiFetch(`/kloel/site/${siteId}`, { method: 'DELETE' });
    if (!res.error) {
      setSavedSites(prev => prev.filter(s => s.id !== siteId));
      if (savedSiteId === siteId) {
        setSavedSiteId(null);
        setGeneratedHtml('');
        setPhase('ask');
      }
    }
  };

  // ── ASK PHASE ──
  if (phase === 'ask') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20, opacity: 1 }}>
      <div style={{ color: '#8b5cf6', opacity: 0.3 }}>{IC.globe(80)}</div>
      <div style={{ fontFamily: SORA, fontSize: 22, color: '#E0DDD8' }}>Criar seu Site</div>
      <div style={{ fontFamily: SORA, fontSize: 14, color: '#6E6E73', maxWidth: 400, textAlign: 'center' }}>
        Descreva o site que voce quer e a IA vai gerar um site completo. Pronto em segundos.
      </div>
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Ex: Landing page para venda de curso de marketing digital, com secao de depoimentos e botao de compra..."
        style={{
          fontFamily: SORA, fontSize: 14, width: '100%', maxWidth: 500, minHeight: 100, padding: 14,
          borderRadius: 6, border: `1px solid ${BORDER}`, background: BG_CARD, color: '#E0DDD8',
          resize: 'vertical', outline: 'none',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = '#8b5cf6'; }}
        onBlur={e => { e.currentTarget.style.borderColor = BORDER; }}
      />
      <button
        onClick={handleGenerate}
        disabled={!prompt.trim()}
        style={{
          fontFamily: SORA, fontSize: 14, padding: '12px 32px', borderRadius: 6, border: 'none',
          background: prompt.trim() ? '#8b5cf6' : '#3A3A3F', color: '#fff', cursor: prompt.trim() ? 'pointer' : 'not-allowed',
          fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, opacity: prompt.trim() ? 1 : 0.5,
        }}
      >
        {IC.zap(16)} Gerar Site com IA
      </button>
      {error && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: '#ef4444', maxWidth: 500, textAlign: 'center', padding: '8px 16px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
          {error}
        </div>
      )}

      {/* Saved Sites List */}
      {(loadingSites || savedSites.length > 0) && (
        <div style={{ width: '100%', maxWidth: 500, marginTop: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 10, color: '#3A3A3F', marginBottom: 10, letterSpacing: '0.25em', textTransform: 'uppercase' }}>Sites Salvos</div>
          {loadingSites && <div style={{ fontFamily: MONO, fontSize: 12, color: '#6E6E73' }}>Carregando...</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {savedSites.map(site => (
              <div key={site.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                background: BG_CARD, borderRadius: 6, border: `1px solid ${BORDER}`, cursor: 'pointer',
              }} onClick={() => loadSavedSite(site)}>
                <span style={{ color: '#8b5cf6' }}>{IC.site(16)}</span>
                <span style={{ fontFamily: SORA, fontSize: 13, color: '#E0DDD8', flex: 1 }}>{site.name || 'Site sem titulo'}</span>
                {site.published && <span style={{ fontFamily: MONO, fontSize: 10, color: '#10B981', background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: 4 }}>Publicado</span>}
                <span style={{ fontFamily: MONO, fontSize: 10, color: '#6E6E73' }}>{site.updatedAt ? new Date(site.updatedAt).toLocaleDateString('pt-BR') : ''}</span>
                <button onClick={e => { e.stopPropagation(); handleDelete(site.id); }} style={{
                  fontFamily: MONO, fontSize: 10, padding: '2px 8px', borderRadius: 4, border: `1px solid ${BORDER}`,
                  background: 'transparent', color: '#ef4444', cursor: 'pointer',
                }}>X</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ── BUILDING PHASE (real loading, no fake progress) ──
  if (phase === 'building') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20, opacity: 1 }}>
      <div style={{ color: '#8b5cf6', animation: 'mktSpin 2s linear infinite' }}>{IC.globe(60)}</div>
      <div style={{ fontFamily: SORA, fontSize: 18, color: '#E0DDD8' }}>Gerando seu site com IA...</div>
      <div style={{ fontFamily: MONO, fontSize: 12, color: '#8b5cf6' }}>Isso pode levar alguns segundos</div>
      <div style={{ width: 300, height: 4, background: BORDER, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', background: '#8b5cf6', borderRadius: 99, width: '100%',
          animation: 'mktBuildPulse 1.5s ease-in-out infinite',
        }} />
      </div>
      <style>{`@keyframes mktBuildPulse { 0% { opacity: 0.3; transform: scaleX(0.3); } 50% { opacity: 1; transform: scaleX(1); } 100% { opacity: 0.3; transform: scaleX(0.3); } }`}</style>
    </div>
  );

  // ── EDITOR PHASE ──
  return (
    <div style={{ opacity: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => { setPhase('ask'); setError(''); setPublishedUrl(''); }} style={{
            fontFamily: MONO, fontSize: 12, padding: '4px 10px', borderRadius: 4, border: `1px solid ${BORDER}`,
            background: 'transparent', color: '#6E6E73', cursor: 'pointer',
          }}>Voltar</button>
          <div style={{ fontFamily: SORA, fontSize: 18, color: '#E0DDD8' }}>Editor do Site</div>
          {savedSiteId && <span style={{ fontFamily: MONO, fontSize: 10, color: '#3A3A3F' }}>ID: {savedSiteId.slice(0, 8)}...</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              fontFamily: SORA, fontSize: 12, padding: '6px 16px', borderRadius: 6,
              border: `1px solid ${BORDER}`, background: 'transparent',
              color: saving ? '#3A3A3F' : '#E0DDD8', cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || saving}
            style={{
              fontFamily: SORA, fontSize: 12, padding: '6px 16px', borderRadius: 6, border: 'none',
              background: publishing || saving ? '#3A3A3F' : '#8b5cf6', color: '#fff',
              cursor: publishing || saving ? 'not-allowed' : 'pointer',
            }}
          >
            {publishing ? 'Publicando...' : 'Publicar'}
          </button>
        </div>
      </div>

      {/* Published URL banner */}
      {publishedUrl && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', marginBottom: 12,
          background: 'rgba(16,185,129,0.08)', borderRadius: 6, border: '1px solid rgba(16,185,129,0.2)',
        }}>
          <span style={{ color: '#10B981' }}>{IC.check(16)}</span>
          <span style={{ fontFamily: SORA, fontSize: 13, color: '#10B981' }}>Publicado em:</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: '#E0DDD8' }}>{publishedUrl}</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{
          fontFamily: MONO, fontSize: 12, color: '#ef4444', padding: '8px 16px', marginBottom: 12,
          background: 'rgba(239,68,68,0.1)', borderRadius: 6,
        }}>
          {error}
        </div>
      )}

      {/* Site Name input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontFamily: SORA, fontSize: 12, color: '#6E6E73' }}>Nome:</span>
        <input
          value={siteName}
          onChange={e => setSiteName(e.target.value)}
          placeholder="Nome do site"
          style={{
            fontFamily: SORA, fontSize: 13, padding: '6px 12px', flex: 1, maxWidth: 300,
            borderRadius: 6, border: `1px solid ${BORDER}`, background: BG_CARD, color: '#E0DDD8', outline: 'none',
          }}
        />
      </div>

      {/* AI Edit bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={editPrompt}
          onChange={e => setEditPrompt(e.target.value)}
          placeholder="Pedir alteracao para a IA... Ex: Mude as cores para azul, adicione mais depoimentos"
          onKeyDown={e => { if (e.key === 'Enter' && !editLoading) handleEditWithAI(); }}
          style={{
            fontFamily: SORA, fontSize: 13, padding: '8px 14px', flex: 1,
            borderRadius: 6, border: `1px solid ${BORDER}`, background: BG_CARD, color: '#E0DDD8', outline: 'none',
          }}
        />
        <button
          onClick={handleEditWithAI}
          disabled={editLoading || !editPrompt.trim()}
          style={{
            fontFamily: SORA, fontSize: 12, padding: '8px 16px', borderRadius: 6, border: 'none',
            background: editLoading || !editPrompt.trim() ? '#3A3A3F' : EMBER, color: '#fff',
            cursor: editLoading || !editPrompt.trim() ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          }}
        >
          {editLoading ? 'Editando...' : <>{IC.zap(14)} Editar com IA</>}
        </button>
      </div>

      {/* Preview iframe */}
      <div style={{ background: BG_CARD, borderRadius: 6, border: `1px solid ${BORDER}`, overflow: 'hidden', minHeight: 500 }}>
        <div style={{ background: BG_ELEVATED, padding: '6px 12px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: '#3A3A3F', marginLeft: 8 }}>Preview</span>
        </div>
        <iframe
          ref={iframeRef}
          srcDoc={generatedHtml}
          sandbox="allow-scripts"
          style={{ width: '100%', height: 500, border: 'none', background: '#fff' }}
          title="Site Preview"
        />
      </div>
    </div>
  );
}

// ── ChannelTab (generic for WhatsApp/Instagram/TikTok/Facebook/Email) ──
function ChannelTab({ channelKey, conns, setConns, liveFeed }: { channelKey: string; conns: Record<string, boolean>; setConns: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; liveFeed: string[] }) {
  if (!conns[channelKey]) return <ConnectFlow channel={channelKey} setConns={setConns} />;
  const ch = CH[channelKey];
  if (!ch) return null;
  const msgs = liveFeed.length > 0 ? liveFeed : ['Aguardando mensagens...'];

  return (
    <div style={{ opacity: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: ch.color }}>{ch.icon(24)}</span>
          <span style={{ fontFamily: SORA, fontSize: 18, color: '#E0DDD8' }}>{ch.label}</span>
          <ConnBadge connected />
        </div>
        <span style={{ fontFamily: MONO, fontSize: 12, color: '#6E6E73' }}>{ch.account}</span>
      </div>

      {/* Channel nerve fibers (stats as horizontal bars) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        {[
          { label: 'Mensagens', value: Fmt(ch.msgs) },
          { label: 'Leads', value: Fmt(ch.leads) },
          { label: 'Vendas', value: ch.sales.toString() },
          { label: 'Receita', value: FmtMoney(ch.revenue) },
        ].map((s, i) => (
          <div key={i} style={{
            position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px 12px 20px',
            background: BG_CARD, borderRadius: 6, border: `1px solid ${BORDER}`, overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: ch.color }} />
            <span style={{ fontFamily: SORA, fontSize: 11, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '0.25em', minWidth: 80 }}>{s.label}</span>
            <span style={{ fontFamily: MONO, fontSize: 16, color: '#E0DDD8', flex: 1 }}>{s.value}</span>
            <NP w={160} h={28} color={ch.color} />
          </div>
        ))}
      </div>

      {/* Live Feed */}
      <div style={{ background: BG_CARD, borderRadius: 6, padding: 16, border: `1px solid ${BORDER}` }}>
        <div style={{ fontFamily: SORA, fontSize: 10, color: '#3A3A3F', marginBottom: 12, letterSpacing: '0.25em', textTransform: 'uppercase' }}>Feed ao Vivo</div>
        <LiveStream msgs={msgs} color={ch.color} />
      </div>
    </div>
  );
}

// ── VisaoGeral ──
function VisaoGeral({ revRef, revElRef, flashElRef, switchTab, conns, feedRef, realBrain, products }: {
  revRef: React.RefObject<number>;
  revElRef: React.RefObject<HTMLSpanElement | null>;
  flashElRef: React.RefObject<HTMLDivElement | null>;
  switchTab: (id: string) => void;
  conns: Record<string, boolean>;
  feedRef: React.RefObject<string[]>;
  realBrain: any;
  products: { name: string; price: number; sold: number; img: string }[];
}) {
  const totalRevenue = Object.values(CH).reduce((a, c) => a + c.revenue, 0) + (revRef as any).current - 100398;
  return (
    <div style={{ opacity: 1 }}>
      {/* Revenue Hero */}
      <div style={{ position: 'relative', textAlign: 'center', padding: '40px 0 30px', marginBottom: 24, overflow: 'hidden', borderRadius: 6 }}>
        <NP w={800} h={160} color={EMBER} />
        <div style={{ position: 'relative', zIndex: 1, marginTop: -140 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: '#3A3A3F', textTransform: 'uppercase', letterSpacing: '0.25em' }}>RECEITA TOTAL GERADA PELA IA</div>
          <div style={{
            fontFamily: MONO, fontSize: 80, fontWeight: 700, color: EMBER, marginTop: 8,
            textShadow: '0 0 20px rgba(232,93,48,0.3)',
            transition: 'text-shadow .3s',
          }}>
            <span ref={revElRef}>R$ {totalRevenue.toLocaleString('pt-BR')}</span>
          </div>
          <div ref={flashElRef} style={{ fontFamily: MONO, fontSize: 12, color: '#10B981', marginTop: 4 }}>+R$ {((revRef as any).current - 100398).toLocaleString('pt-BR')} hoje</div>
        </div>
      </div>

      {/* Ticker */}
      <Ticker items={(feedRef as any).current.length > 0 ? (feedRef as any).current : ['Aguardando mensagens...']} />

      {/* Channel nerve fibers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 20 }}>
        {Object.entries(CH).map(([key, ch]) => (
          <div key={key} onClick={() => switchTab(key)} style={{
            position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px 14px 20px',
            background: BG_CARD, borderRadius: 6, border: `1px solid ${BORDER}`,
            cursor: 'pointer', transition: 'all .2s', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: ch.color }} />
            <span style={{ color: ch.color }}>{ch.icon(18)}</span>
            <span style={{ fontFamily: SORA, fontSize: 14, color: '#E0DDD8', minWidth: 90 }}>{ch.label}</span>
            <ConnBadge connected={conns[key] ?? false} />
            <div style={{ flex: 1, display: 'flex', gap: 16, justifyContent: 'flex-end', fontFamily: MONO, fontSize: 12 }}>
              <span style={{ color: '#6E6E73' }}>{Fmt(ch.msgs)} msgs</span>
              <span style={{ color: '#6E6E73' }}>{Fmt(ch.leads)} leads</span>
              <span style={{ color: ch.color }}>{FmtMoney(ch.revenue)}</span>
            </div>
            <NP w={160} h={28} color={ch.color} />
          </div>
        ))}
      </div>

      {/* Products */}
      <div style={{ marginTop: 24, background: BG_CARD, borderRadius: 6, padding: 16, border: `1px solid ${BORDER}` }}>
        <div style={{ fontFamily: SORA, fontSize: 10, color: '#3A3A3F', marginBottom: 12, letterSpacing: '0.25em', textTransform: 'uppercase' }}>Produtos Mais Vendidos</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {products.length === 0 ? (
            <div style={{ fontFamily: MONO, fontSize: 12, color: '#6E6E73', padding: 14 }}>Nenhum produto cadastrado</div>
          ) : products.map((p, i) => (
            <div key={i} style={{ flex: 1, background: BG_ELEVATED, borderRadius: 6, padding: 14, display: 'flex', gap: 12, alignItems: 'center', border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 28 }}>{p.img}</div>
              <div>
                <div style={{ fontFamily: SORA, fontSize: 12, color: '#E0DDD8' }}>{p.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 13, color: EMBER }}>{FmtMoney(p.price)}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: '#6E6E73' }}>{p.sold} vendidos</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Brain + Feed */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
        <div style={{ background: BG_CARD, borderRadius: 6, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, border: `1px solid ${BORDER}` }}>
          <div style={{ color: EMBER, animation: 'mktPulse 3s infinite', marginBottom: 12 }}>{IC.zap(40)}</div>
          <div style={{ fontFamily: SORA, fontSize: 16, color: '#E0DDD8', marginBottom: 4 }}>IA Kloel {realBrain?.status === 'active' ? 'Ativa' : 'Ativa'}</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: EMBER }}>{realBrain?.activeConversations || 34} respostas automaticas / ultima hora</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: '#6E6E73', marginTop: 4 }}>Produtos: {realBrain?.productsLoaded || 12} &middot; Objecoes: {realBrain?.objectionsMapped || 48}</div>
          {realBrain?.avgResponseTime && <div style={{ fontFamily: MONO, fontSize: 11, color: '#6E6E73', marginTop: 2 }}>Tempo medio: {realBrain.avgResponseTime}</div>}
        </div>
        <div style={{ background: BG_CARD, borderRadius: 6, padding: 16, border: `1px solid ${BORDER}` }}>
          <div style={{ fontFamily: SORA, fontSize: 10, color: '#3A3A3F', marginBottom: 12, letterSpacing: '0.25em', textTransform: 'uppercase' }}>Feed em Tempo Real</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(feedRef as any).current.slice(0, 8).map((m: string, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 12, color: '#E0DDD8', padding: '6px 10px', background: BG_ELEVATED, borderRadius: 6, opacity: 1 - i * 0.1 }}>
                <span>{m}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketingView({ defaultTab = 'visao-geral' }: { defaultTab?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState(defaultTab);
  const revRef = useRef(100398);
  const revElRef = useRef<HTMLSpanElement>(null);
  const flashElRef = useRef<HTMLDivElement>(null);
  const [feed, setFeed] = useState<string[]>([]);
  const [conns, setConns] = useState<Record<string, boolean>>({ whatsapp: true, instagram: true, tiktok: false, facebook: false, email: true });
  // ── Real data hooks ──
  const { stats: realStats } = useMarketingStats();
  const { channels: realChannels } = useMarketingChannels();
  const { messages: realFeed } = useMarketingLiveFeed();
  const { brain: realBrain } = useAIBrain();
  const { products: rawProducts } = useProducts();

  // Map raw products to display format (top 3 by sales/quantity)
  const mappedProducts = React.useMemo(() => {
    if (!rawProducts || !Array.isArray(rawProducts) || rawProducts.length === 0) return [];
    return (rawProducts as any[])
      .slice(0, 3)
      .map((p: any) => ({
        name: p.name || p.title || 'Produto',
        price: p.price ?? p.amount ?? 0,
        sold: p.sold ?? p.quantitySold ?? p.sales ?? 0,
        img: p.img || p.emoji || p.image || '\uD83D\uDCE6',
      }));
  }, [rawProducts]);

  // Sync revenue from real stats
  useEffect(() => {
    if (realStats?.totalRevenue) revRef.current = realStats.totalRevenue;
  }, [realStats]);

  // Merge real feed messages
  useEffect(() => {
    if (realFeed?.length > 0) {
      const mapped = realFeed.map((m: any) => {
        const text = m.text || m.content || '';
        const from = m.from || m.contactName || 'Lead';
        const ch = m.channel || 'whatsapp';
        const isAI = m.isAI || m.direction === 'OUTBOUND';
        const time = m.time || (m.createdAt ? new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
        return `${isAI ? '🤖' : '📱'} [${ch}] ${from}: ${text} (${time})`;
      });
      setFeed(prev => [...mapped, ...prev].slice(0, 30));
    }
  }, [realFeed]);

  // Merge real channel data into CH when available
  useEffect(() => {
    if (realChannels && Array.isArray(realChannels)) {
      for (const rc of realChannels as any[]) {
        const key = (rc.channel || '').toLowerCase();
        if (CH[key]) {
          CH[key].msgs = rc.messages ?? CH[key].msgs;
          CH[key].leads = rc.leads ?? CH[key].leads;
          CH[key].sales = rc.sales ?? CH[key].sales;
          CH[key].revenue = rc.revenue ?? CH[key].revenue;
        }
      }
    }
  }, [realChannels]);

  // Sync revenue display with real stats (no fake ticker)
  useEffect(() => {
    if (realStats?.totalRevenue && revElRef.current) {
      revElRef.current.textContent = 'R$ ' + (realStats.totalRevenue as number).toLocaleString('pt-BR');
    }
  }, [realStats]);

  // Feed ticker — uses ref, kept in sync with real feed
  const feedRef = useRef<string[]>([]);

  // Sync feedRef with the real feed state
  useEffect(() => {
    if (feed.length > 0) {
      feedRef.current = feed.slice(0, 8);
    }
  }, [feed]);

  const TABS = [
    { id: 'visao-geral', label: 'Visao Geral', icon: IC.zap },
    { id: 'site', label: 'Site', icon: IC.site },
    { id: 'whatsapp', label: 'WhatsApp', icon: IC.wa },
    { id: 'instagram', label: 'Instagram', icon: IC.ig },
    { id: 'tiktok', label: 'TikTok', icon: IC.tt },
    { id: 'facebook', label: 'Facebook', icon: IC.fb },
    { id: 'email', label: 'Email', icon: IC.em },
  ];

  const switchTab = (id: string) => {
    setTab(id);
    if (id === 'visao-geral') router.push('/marketing');
    else router.push(`/marketing/${id}`);
  };



  return (
    <div style={{ fontFamily: SORA, color: '#E0DDD8', minHeight: '100vh', padding: 24 }}>
      {/* CSS Keyframes */}
      <style>{`
        @keyframes mktFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes mktPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes mktSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes mktGlowText { 0%, 100% { text-shadow: 0 0 20px rgba(232,93,48,0.3); } 50% { text-shadow: 0 0 40px rgba(232,93,48,0.8), 0 0 80px rgba(232,93,48,0.4); } }
        @keyframes mktTickerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      `}</style>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, overflowX: 'auto', paddingBottom: 8 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            style={{
              fontFamily: SORA, fontSize: 12, padding: '8px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 6,
              background: tab === t.id ? `${EMBER}20` : 'transparent',
              color: tab === t.id ? EMBER : '#6E6E73',
              transition: 'all .2s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{t.icon(14)}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'visao-geral' && <VisaoGeral revRef={revRef} revElRef={revElRef} flashElRef={flashElRef} switchTab={switchTab} conns={conns} feedRef={feedRef} realBrain={realBrain} products={mappedProducts} />}
      {tab === 'site' && <SiteBuilder />}
      {tab === 'whatsapp' && <ChannelTab channelKey="whatsapp" conns={conns} setConns={setConns} liveFeed={feed.filter(m => m.includes('[whatsapp]'))} />}
      {tab === 'instagram' && <ChannelTab channelKey="instagram" conns={conns} setConns={setConns} liveFeed={feed.filter(m => m.includes('[instagram]'))} />}
      {tab === 'tiktok' && <ChannelTab channelKey="tiktok" conns={conns} setConns={setConns} liveFeed={feed.filter(m => m.includes('[tiktok]'))} />}
      {tab === 'facebook' && <ChannelTab channelKey="facebook" conns={conns} setConns={setConns} liveFeed={feed.filter(m => m.includes('[facebook]'))} />}
      {tab === 'email' && <ChannelTab channelKey="email" conns={conns} setConns={setConns} liveFeed={feed.filter(m => m.includes('[email]'))} />}
    </div>
  );
}
