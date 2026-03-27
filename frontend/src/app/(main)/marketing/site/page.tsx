'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

/* ═══════════════════════════════════════════
   KLOEL — CONSTRUTOR DE SITES COM IA
   "Voce descreve. A IA constroi. Ao vivo."
   ═══════════════════════════════════════════ */

const SORA = "var(--font-sora), 'Sora', sans-serif";
const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

/* ── Icons ── */
const IC = {
  send: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  spark: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  code: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  phone: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  monitor: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  tablet: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  download: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  rocket: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>,
  back: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  plus: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  globe: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  layers: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  palette: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>,
};

/* ── Templates ── */
const TEMPLATES = [
  { id: 'blank', name: 'Pagina em branco', desc: 'Comece do zero com a IA', icon: IC.plus },
  { id: 'landing', name: 'Landing Page', desc: 'Pagina de vendas completa', icon: IC.rocket },
  { id: 'capture', name: 'Captura de Leads', desc: 'Formulario + headline + CTA', icon: IC.spark },
  { id: 'link', name: 'Link na Bio', desc: 'Pagina de links para redes', icon: IC.layers },
  { id: 'portfolio', name: 'Portfolio', desc: 'Mostre seu trabalho', icon: IC.palette },
  { id: 'webinar', name: 'Webinario', desc: 'Pagina de evento ao vivo', icon: IC.globe },
];

const STARTER_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Sora', sans-serif; background: #0a0a0c; color: #e0ddd8; }
  .hero { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 24px; text-align: center; }
  .hero h1 { font-size: clamp(32px, 5vw, 56px); font-weight: 800; line-height: 1.15; margin-bottom: 20px; letter-spacing: -0.03em; }
  .hero h1 span { color: #E85D30; }
  .hero p { font-size: 17px; color: #6e6e73; max-width: 520px; line-height: 1.6; margin-bottom: 32px; }
  .btn { background: #E85D30; color: #0a0a0c; border: none; border-radius: 6px; padding: 14px 32px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: 'Sora', sans-serif; }
</style>
</head>
<body>
<section class="hero">
  <h1>Seu titulo <span>aqui</span></h1>
  <p>Descreva seu produto ou servico. A IA vai transformar isso numa pagina completa.</p>
  <button class="btn">Comecar agora</button>
</section>
</body>
</html>`;

/* ── Types ── */
interface ChatMsg {
  role: 'user' | 'ai';
  text: string;
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
export default function KloelSiteBuilder() {
  const router = useRouter();
  const [phase, setPhase] = useState<'templates' | 'building'>('templates');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [siteHtml, setSiteHtml] = useState(STARTER_HTML);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [showCode, setShowCode] = useState(false);
  const [streamText, setStreamText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  /* ── Generate site via backend (or fallback to demo) ── */
  const generateSite = useCallback(async (prompt: string) => {
    setGenerating(true);
    setStreamText('');
    setMessages(prev => [...prev, { role: 'user', text: prompt }]);

    const thinkingPhrases = [
      'Analisando o briefing...',
      'Estruturando o layout...',
      'Gerando o HTML e CSS...',
      'Aplicando identidade visual...',
      'Otimizando responsividade...',
      'Finalizando componentes...',
    ];

    for (const phrase of thinkingPhrases) {
      await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
      setStreamText(phrase);
    }

    try {
      const res = await apiFetch('/marketing/site/generate', {
        method: 'POST',
        body: { prompt, currentHtml: siteHtml },
      });
      if (res?.html) {
        setSiteHtml(res.html);
      } else {
        setSiteHtml(generateFallbackHtml(prompt));
      }
    } catch {
      setSiteHtml(generateFallbackHtml(prompt));
    }

    await new Promise(r => setTimeout(r, 300));
    setStreamText('');
    setGenerating(false);
    setMessages(prev => [...prev, {
      role: 'ai',
      text: 'Pronto! Criei sua pagina baseada no que voce descreveu. Voce pode ver o resultado no preview ao lado. Quer que eu mude algo? Cor, texto, layout — so pedir.',
    }]);
  }, [siteHtml]);

  function handleSend() {
    if (!input.trim() || generating) return;
    const prompt = input.trim();
    setInput('');
    if (phase === 'templates') setPhase('building');
    generateSite(prompt);
  }

  function selectTemplate(t: typeof TEMPLATES[0]) {
    setSelectedTemplate(t.id);
    setPhase('building');
    setMessages([{
      role: 'ai',
      text: `Template "${t.name}" selecionado. Agora me diga: sobre o que e seu site? Qual seu produto, servico ou objetivo? Descreva em poucas palavras e eu crio tudo.`,
    }]);
  }

  function handleExport() {
    const blob = new Blob([siteHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kloel-site.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  const vpWidths: Record<string, string | number> = { desktop: '100%', tablet: 768, mobile: 375 };

  /* ═══ TEMPLATE SELECTION ═══ */
  if (phase === 'templates') {
    return (
      <div style={{ background: '#0A0A0C', minHeight: '100vh', fontFamily: SORA, color: '#E0DDD8', display: 'flex', flexDirection: 'column' }}>
        {/* Breadcrumb */}
        <div style={{ padding: '16px 28px', borderBottom: '1px solid #19191C' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => router.push('/marketing')}
              style={{ background: 'none', border: 'none', color: '#6E6E73', fontSize: 13, fontFamily: SORA, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {IC.back(14)} Marketing
            </button>
            <span style={{ color: '#3A3A3F', fontSize: 13 }}>/</span>
            <span style={{ color: '#E0DDD8', fontSize: 13, fontWeight: 600, fontFamily: SORA }}>Construtor de Sites</span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <div style={{ maxWidth: 700, width: '100%', textAlign: 'center' }}>
            <p style={{ fontFamily: MONO, fontSize: 10, color: '#E85D30', letterSpacing: '.25em', textTransform: 'uppercase', marginBottom: 16 }}>CONSTRUTOR DE SITES</p>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: '#E0DDD8', marginBottom: 8, letterSpacing: '-0.02em', fontFamily: SORA }}>Descreva. A IA constroi.</h1>
            <p style={{ fontSize: 14, color: '#6E6E73', marginBottom: 40, fontFamily: SORA }}>Escolha um template ou comece descrevendo o que voce quer.</p>

            {/* Templates */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 32, textAlign: 'left' }}>
              {TEMPLATES.map(t => (
                <div
                  key={t.id}
                  onClick={() => selectTemplate(t)}
                  style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 18, cursor: 'pointer', transition: 'all .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#333338')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#222226')}
                >
                  <div style={{ color: '#6E6E73', marginBottom: 10 }}>{t.icon(20)}</div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', display: 'block', marginBottom: 4, fontFamily: SORA }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: '#3A3A3F', fontFamily: SORA }}>{t.desc}</span>
                </div>
              ))}
            </div>

            {/* Direct prompt */}
            <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#E85D30', display: 'flex' }}>{IC.spark(16)}</span>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Ou descreva o que voce quer: 'Pagina de vendas para curso de IA com depoimentos e FAQ'"
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#E0DDD8', fontSize: 14, fontFamily: SORA }}
              />
              <button
                onClick={handleSend}
                style={{
                  width: 32, height: 32, borderRadius: 6,
                  background: input.trim() ? '#E85D30' : '#19191C',
                  border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: input.trim() ? '#0A0A0C' : '#3A3A3F',
                  cursor: input.trim() ? 'pointer' : 'default', transition: 'all .15s',
                }}
              >
                {IC.send(14)}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ═══ BUILDING PHASE — Split view: Chat + Preview ═══ */
  return (
    <div style={{ background: '#0A0A0C', height: '100vh', fontFamily: SORA, color: '#E0DDD8', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ═══ TOP BAR ═══ */}
      <div style={{ height: 48, borderBottom: '1px solid #19191C', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => { setPhase('templates'); setMessages([]); }}
            style={{ background: 'none', border: 'none', color: '#6E6E73', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: SORA }}
          >
            {IC.back(14)} Sites
          </button>
          <div style={{ width: 1, height: 16, background: '#19191C' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#E0DDD8', fontFamily: SORA }}>Editor</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
            <div style={{ width: 5, height: 5, borderRadius: 5, background: '#25D366', animation: 'pulse 2s ease infinite' }} />
            <span style={{ fontFamily: MONO, fontSize: 9, color: '#6E6E73' }}>IA ATIVA</span>
          </div>
        </div>

        {/* Viewport toggle */}
        <div style={{ display: 'flex', gap: 2 }}>
          {([
            { key: 'desktop' as const, icon: IC.monitor },
            { key: 'tablet' as const, icon: IC.tablet },
            { key: 'mobile' as const, icon: IC.phone },
          ]).map(v => (
            <button
              key={v.key}
              onClick={() => setViewport(v.key)}
              style={{
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: viewport === v.key ? 'rgba(232,93,48,0.06)' : 'none',
                border: `1px solid ${viewport === v.key ? '#E85D30' : 'transparent'}`,
                borderRadius: 4, color: viewport === v.key ? '#E85D30' : '#3A3A3F',
                cursor: 'pointer', transition: 'all .15s',
              }}
            >
              {v.icon(14)}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setShowCode(!showCode)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              background: showCode ? 'rgba(232,93,48,0.06)' : 'none',
              border: `1px solid ${showCode ? '#E85D30' : '#222226'}`,
              borderRadius: 6, color: showCode ? '#E85D30' : '#6E6E73',
              fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: SORA,
            }}
          >
            {IC.code(12)} Codigo
          </button>
          <button
            onClick={handleExport}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              background: 'none', border: '1px solid #222226', borderRadius: 6,
              color: '#6E6E73', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: SORA,
            }}
          >
            {IC.download(12)} Exportar
          </button>
          <button
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
              background: '#E85D30', border: 'none', borderRadius: 6,
              color: '#0A0A0C', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: SORA,
            }}
          >
            {IC.rocket(12)} Publicar
          </button>
        </div>
      </div>

      {/* ═══ MAIN SPLIT ═══ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT — Chat */}
        <div style={{ width: 360, minWidth: 360, borderRight: '1px solid #19191C', display: 'flex', flexDirection: 'column' }}>
          {/* Chat messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                {m.role === 'ai' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#E85D30', letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: MONO }}>KLOEL IA</span>
                  </div>
                )}
                <div style={{
                  padding: '10px 14px', borderRadius: 6,
                  background: m.role === 'user' ? '#E85D30' : '#111113',
                  border: m.role === 'ai' ? '1px solid #222226' : 'none',
                  color: m.role === 'user' ? '#0A0A0C' : '#E0DDD8',
                  fontSize: 13, lineHeight: 1.6, fontFamily: SORA,
                  marginLeft: m.role === 'user' ? 40 : 0,
                  marginRight: m.role === 'ai' ? 20 : 0,
                }}>
                  {m.text}
                </div>
              </div>
            ))}

            {generating && streamText && (
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#E85D30', letterSpacing: '.06em', textTransform: 'uppercase', display: 'block', marginBottom: 4, fontFamily: MONO }}>KLOEL IA</span>
                <div style={{ padding: '10px 14px', borderRadius: 6, background: '#111113', border: '1px solid #222226', marginRight: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 14, height: 14, border: '2px solid transparent', borderTopColor: '#E85D30', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: 12, color: '#6E6E73', fontFamily: SORA }}>{streamText}</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div style={{ padding: 12, borderTop: '1px solid #19191C' }}>
            <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={messages.length === 0 ? 'Descreva seu site...' : 'Peca alteracoes...'}
                disabled={generating}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#E0DDD8', fontSize: 13, fontFamily: SORA, opacity: generating ? 0.5 : 1 }}
              />
              <button
                onClick={handleSend}
                disabled={generating}
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: input.trim() && !generating ? '#E85D30' : '#19191C',
                  border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: input.trim() && !generating ? '#0A0A0C' : '#3A3A3F',
                  cursor: input.trim() && !generating ? 'pointer' : 'default', transition: 'all .15s',
                }}
              >
                {IC.send(13)}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {['Muda a cor pra azul', 'Adiciona depoimentos', 'Troca o titulo', 'Adiciona FAQ'].map(s => (
                <button
                  key={s}
                  onClick={() => { if (!generating) { setInput(s); } }}
                  style={{
                    padding: '4px 10px', background: 'none', border: '1px solid #222226',
                    borderRadius: 4, color: '#3A3A3F', fontSize: 10, fontFamily: SORA,
                    cursor: generating ? 'default' : 'pointer', transition: 'all .15s',
                    opacity: generating ? 0.4 : 1,
                  }}
                  onMouseEnter={e => { if (!generating) { e.currentTarget.style.borderColor = '#333338'; e.currentTarget.style.color = '#6E6E73'; } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#222226'; e.currentTarget.style.color = '#3A3A3F'; }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — Preview / Code */}
        <div style={{ flex: 1, background: '#19191C', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {showCode ? (
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              <pre style={{ fontFamily: MONO, fontSize: 11, color: '#6E6E73', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {siteHtml}
              </pre>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: viewport === 'desktop' ? 0 : 24, overflow: 'auto' }}>
              <div style={{
                width: vpWidths[viewport],
                maxWidth: '100%',
                height: viewport === 'desktop' ? '100%' : undefined,
                minHeight: viewport !== 'desktop' ? '70vh' : undefined,
                background: '#fff',
                borderRadius: viewport !== 'desktop' ? 6 : 0,
                overflow: 'hidden',
                boxShadow: viewport !== 'desktop' ? '0 8px 40px rgba(0,0,0,0.4)' : 'none',
                transition: 'width .3s ease',
              }}>
                <iframe
                  ref={iframeRef}
                  srcDoc={siteHtml}
                  style={{ width: '100%', height: viewport === 'desktop' ? '100%' : '70vh', border: 'none' }}
                  sandbox="allow-scripts"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FALLBACK HTML GENERATOR
   (used when backend endpoint is not available)
   ═══════════════════════════════════════════ */
function generateFallbackHtml(prompt: string): string {
  const lower = prompt.toLowerCase();
  const title = lower.includes('curso') ? 'Transforme sua Carreira'
    : lower.includes('ebook') ? 'O Guia Definitivo'
    : lower.includes('loja') || lower.includes('produto') ? 'Descubra o Futuro'
    : lower.includes('portfolio') ? 'Meu Trabalho'
    : lower.includes('evento') || lower.includes('webinar') ? 'Evento Exclusivo'
    : 'Algo Incrivel';

  const subtitle = lower.includes('curso') ? 'O curso que vai mudar tudo que voce sabe sobre IA e marketing digital.'
    : lower.includes('ebook') ? 'Baixe gratis e descubra as estrategias que ninguem te conta.'
    : 'Descubra uma nova forma de fazer as coisas. Mais rapido. Mais inteligente. Mais poderoso.';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Sora', sans-serif; background: #0a0a0c; color: #e0ddd8; overflow-x: hidden; }
  nav { position: fixed; top: 0; width: 100%; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; background: rgba(10,10,12,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid #19191c; z-index: 50; }
  nav .logo { font-size: 16px; font-weight: 700; }
  nav .cta { background: #E85D30; color: #0a0a0c; border: none; border-radius: 6px; padding: 8px 18px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: 'Sora', sans-serif; }
  .hero { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 24px 60px; text-align: center; position: relative; }
  .hero::before { content: ''; position: absolute; top: 20%; left: 50%; transform: translateX(-50%); width: 600px; height: 600px; background: radial-gradient(circle, rgba(232,93,48,0.04) 0%, transparent 70%); pointer-events: none; }
  .hero .eyebrow { font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; color: #E85D30; margin-bottom: 24px; }
  .hero h1 { font-size: clamp(36px, 6vw, 64px); font-weight: 800; line-height: 1.1; margin-bottom: 20px; letter-spacing: -0.03em; max-width: 700px; }
  .hero h1 em { color: #E85D30; font-style: normal; }
  .hero p { font-size: 17px; color: #6e6e73; max-width: 520px; line-height: 1.6; margin-bottom: 36px; }
  .hero .btn { background: #E85D30; color: #0a0a0c; border: none; border-radius: 6px; padding: 16px 36px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: 'Sora', sans-serif; transition: opacity 0.15s; }
  .hero .btn:hover { opacity: 0.9; }
  .hero .sub { font-size: 12px; color: #3a3a3f; margin-top: 12px; }
  .features { padding: 100px 24px; max-width: 1000px; margin: 0 auto; }
  .features h2 { font-size: 28px; font-weight: 700; text-align: center; margin-bottom: 48px; letter-spacing: -0.02em; }
  .features .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .features .card { background: #111113; border: 1px solid #222226; border-radius: 6px; padding: 24px; }
  .features .card h3 { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
  .features .card p { font-size: 13px; color: #6e6e73; line-height: 1.6; }
  .features .card .num { font-size: 28px; font-weight: 700; color: #E85D30; margin-bottom: 8px; }
  .cta-section { padding: 100px 24px; text-align: center; border-top: 1px solid #19191c; }
  .cta-section h2 { font-size: 32px; font-weight: 700; margin-bottom: 16px; letter-spacing: -0.02em; }
  .cta-section p { font-size: 15px; color: #6e6e73; margin-bottom: 32px; max-width: 440px; margin-left: auto; margin-right: auto; }
  .cta-section .btn { background: #E85D30; color: #0a0a0c; border: none; border-radius: 6px; padding: 16px 36px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: 'Sora', sans-serif; }
  footer { padding: 32px; border-top: 1px solid #19191c; text-align: center; font-size: 12px; color: #3a3a3f; }
  @media (max-width: 768px) { .features .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
  <nav><span class="logo">Kloel</span><button class="cta">Comecar gratis</button></nav>
  <section class="hero">
    <div class="eyebrow">MARKETING ARTIFICIAL</div>
    <h1>${title} <em>Comeca Aqui</em></h1>
    <p>${subtitle}</p>
    <button class="btn">Comecar agora</button>
    <div class="sub">Sem cartao. Sem compromisso.</div>
  </section>
  <section class="features">
    <h2>Porque funciona</h2>
    <div class="grid">
      <div class="card"><div class="num">01</div><h3>Rapido</h3><p>Tudo pronto em minutos. A IA faz o trabalho pesado por voce.</p></div>
      <div class="card"><div class="num">02</div><h3>Inteligente</h3><p>Adaptado ao seu publico. Copy, design e conversao otimizados.</p></div>
      <div class="card"><div class="num">03</div><h3>Automatico</h3><p>Funciona 24/7. Sem manutencao. Sem dor de cabeca.</p></div>
    </div>
  </section>
  <section class="cta-section">
    <h2>Pronto para comecar?</h2>
    <p>Junte-se a milhares de empreendedores que ja transformaram seus negocios.</p>
    <button class="btn">Quero comecar agora</button>
  </section>
  <footer>Feito com Kloel — Marketing Artificial</footer>
</body>
</html>`;
}
