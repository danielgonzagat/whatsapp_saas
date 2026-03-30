'use client';

import { useState } from 'react';

const SORA = "var(--font-sora), 'Sora', sans-serif";
const V = { s: '#111113', e: '#19191C', b: '#222226', em: '#E85D30', t: '#E0DDD8', t2: '#6E6E73', t3: '#3A3A3F', g2: '#10B981', r: '#EF4444' };
const is: React.CSSProperties = { width: '100%', padding: '10px 14px', background: V.e, border: `1px solid ${V.b}`, borderRadius: 6, color: V.t, fontSize: 13, fontFamily: SORA, outline: 'none' };

function Toggle({ label, checked }: { label: string; checked: boolean }) {
  const [on, setOn] = useState(checked);
  return (
    <div onClick={() => setOn(!on)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${V.b}08`, cursor: 'pointer' }}>
      <span style={{ fontSize: 12, color: V.t2, fontFamily: SORA }}>{label}</span>
      <div style={{ width: 36, height: 20, borderRadius: 10, background: on ? '#10B981' : V.b, position: 'relative', transition: 'background .2s' }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 2, left: on ? 18 : 2, transition: 'left .2s' }} />
      </div>
    </div>
  );
}

export function ProductIATab({ productId }: { productId: string }) {
  const [saved, setSaved] = useState(false);
  const [objections, setObjections] = useState([
    { q: 'E caro', a: 'R$92/mes — menos que 1 cafe/dia' },
    { q: 'Nao confio', a: '294 vendas, 7 dias garantia, Reclame Aqui' },
    { q: 'Funciona?', a: 'Tecnologia avancada com resultados comprovados' },
  ]);
  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div>
      {/* Banner */}
      <div style={{ background: `${V.em}08`, border: `1px solid ${V.em}15`, borderRadius: 6, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill={V.em}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: V.em, fontFamily: SORA }}>Marketing Artificial</span>
        </div>
        <p style={{ fontSize: 11, color: V.t2, margin: '6px 0 0', fontFamily: SORA }}>Configure como a IA vende este produto via WhatsApp, Instagram, TikTok e Facebook.</p>
      </div>

      {/* Grid: Perfil + Objecoes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: V.s, border: `1px solid ${V.b}`, borderRadius: 6, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 16px', fontFamily: SORA }}>Perfil do cliente ideal</h3>
          <div style={{ marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Quem compra?</span>
            <textarea style={{ ...is, height: 70, resize: 'vertical' as const }} placeholder="Mulheres 35-55 anos, preocupadas com envelhecimento..." />
          </div>
          <div style={{ marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Principais dores</span>
            <textarea style={{ ...is, height: 60, resize: 'vertical' as const }} placeholder="Rugas, manchas, flacidez..." />
          </div>
          <div>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Resultado prometido</span>
            <textarea style={{ ...is, height: 60, resize: 'vertical' as const }} placeholder="Pele rejuvenescida em 30 dias..." />
          </div>
        </div>

        <div style={{ background: V.s, border: `1px solid ${V.b}`, borderRadius: 6, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 16px', fontFamily: SORA }}>Objecoes e respostas</h3>
          {objections.map((o, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: i < objections.length - 1 ? `1px solid ${V.b}` : 'none' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: V.r, fontFamily: SORA }}>&#10077; {o.q}</span>
              <br />
              <span style={{ fontSize: 11, color: V.g2, fontFamily: SORA }}>→ {o.a}</span>
            </div>
          ))}
          <button onClick={() => setObjections([...objections, { q: '', a: '' }])} style={{ width: '100%', marginTop: 10, padding: '8px 16px', background: 'none', border: `1px solid ${V.b}`, borderRadius: 6, color: V.t2, fontSize: 12, cursor: 'pointer', fontFamily: SORA }}>
            + Adicionar objecao
          </button>
        </div>
      </div>

      {/* Comportamento */}
      <div style={{ background: V.s, border: `1px solid ${V.b}`, borderRadius: 6, padding: 20, marginTop: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 16px', fontFamily: SORA }}>Comportamento</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0 16px' }}>
          <div style={{ flex: '1 1 45%', marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Tom</span>
            <select style={is}><option>Consultivo</option><option>Agressivo</option><option>Amigavel</option><option>Urgente</option></select>
          </div>
          <div style={{ flex: '1 1 45%', marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Persistencia (1-5)</span>
            <input defaultValue="3" style={is} />
          </div>
          <div style={{ flex: '1 1 45%', marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Limite mensagens</span>
            <input defaultValue="10" style={is} />
          </div>
          <div style={{ flex: '1 1 45%', marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Follow-up</span>
            <select style={is}><option>2h, 24h, 72h</option><option>1h, 12h, 48h</option><option>Desativado</option></select>
          </div>
        </div>
        <Toggle label="Enviar link checkout automaticamente" checked={true} />
        <Toggle label="Oferecer desconto se detectar resistencia" checked={true} />
        <Toggle label="Usar urgencia/escassez" checked={true} />
      </div>

      <button onClick={save} style={{ width: '100%', marginTop: 16, padding: '14px', background: V.em, border: 'none', borderRadius: 6, color: '#0A0A0C', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
        {saved ? 'IA atualizada!' : 'Salvar config da IA'}
      </button>
    </div>
  );
}
