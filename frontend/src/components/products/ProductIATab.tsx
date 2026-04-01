'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';

const SORA = "var(--font-sora), 'Sora', sans-serif";
const V = { s: '#111113', e: '#19191C', b: '#222226', em: '#E85D30', t: '#E0DDD8', t2: '#6E6E73', t3: '#3A3A3F', g2: '#10B981', r: '#EF4444' };
const is: React.CSSProperties = { width: '100%', padding: '10px 14px', background: V.e, border: `1px solid ${V.b}`, borderRadius: 6, color: V.t, fontSize: 13, fontFamily: SORA, outline: 'none' };

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!checked)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${V.b}08`, cursor: 'pointer' }}>
      <span style={{ fontSize: 12, color: V.t2, fontFamily: SORA }}>{label}</span>
      <div style={{ width: 36, height: 20, borderRadius: 10, background: checked ? '#10B981' : V.b, position: 'relative', transition: 'background .2s' }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 2, left: checked ? 18 : 2, transition: 'left .2s' }} />
      </div>
    </div>
  );
}

interface AIConfig {
  idealCustomer?: string;
  painPoints?: string;
  promisedResult?: string;
  objections?: Array<{ q: string; a: string }>;
  tone?: string;
  persistence?: number;
  messageLimit?: number;
  followUp?: string;
  autoCheckoutLink?: boolean;
  offerDiscount?: boolean;
  useUrgency?: boolean;
}

export function ProductIATab({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);
  const [config, setConfig] = useState<AIConfig>({
    objections: [],
    tone: 'Consultivo',
    persistence: 3,
    messageLimit: 10,
    followUp: '2h, 24h, 72h',
    autoCheckoutLink: true,
    offerDiscount: true,
    useUrgency: true,
  });

  useEffect(() => {
    apiFetch(`/products/${productId}/ai-config`).then((res: any) => {
      const d = res?.data;
      if (d) {
        setConfig(prev => ({
          ...prev,
          idealCustomer: d.customerProfile?.idealCustomer || '',
          painPoints: d.customerProfile?.painPoints || '',
          promisedResult: d.customerProfile?.promisedResult || '',
          objections: d.objections || [],
          tone: d.tone || 'Consultivo',
          persistence: d.persistenceLevel ?? 3,
          messageLimit: d.messageLimit ?? 10,
          followUp: d.followUpConfig?.schedule || '2h, 24h, 72h',
          autoCheckoutLink: d.salesArguments?.autoCheckoutLink ?? true,
          offerDiscount: d.salesArguments?.offerDiscount ?? true,
          useUrgency: d.salesArguments?.useUrgency ?? true,
        }));
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [productId]);

  const update = (field: keyof AIConfig, value: AIConfig[keyof AIConfig]) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/products/${productId}/ai-config`, {
        method: 'PUT',
        body: {
          customerProfile: config.idealCustomer ? { idealCustomer: config.idealCustomer, painPoints: config.painPoints, promisedResult: config.promisedResult } : undefined,
          objections: config.objections,
          tone: config.tone,
          persistenceLevel: config.persistence,
          messageLimit: config.messageLimit,
          followUpConfig: config.followUp ? { schedule: config.followUp } : undefined,
          salesArguments: { autoCheckoutLink: config.autoCheckoutLink, offerDiscount: config.offerDiscount, useUrgency: config.useUrgency },
        },
      });
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Erro ao salvar config IA:', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: V.t2, fontFamily: SORA }}>Carregando...</div>;

  const objections = config.objections || [];

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
            <textarea value={config.idealCustomer || ''} onChange={e => update('idealCustomer', e.target.value)} style={{ ...is, height: 70, resize: 'vertical' as const }} placeholder="Mulheres 35-55 anos, preocupadas com envelhecimento..." />
          </div>
          <div style={{ marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Principais dores</span>
            <textarea value={config.painPoints || ''} onChange={e => update('painPoints', e.target.value)} style={{ ...is, height: 60, resize: 'vertical' as const }} placeholder="Rugas, manchas, flacidez..." />
          </div>
          <div>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Resultado prometido</span>
            <textarea value={config.promisedResult || ''} onChange={e => update('promisedResult', e.target.value)} style={{ ...is, height: 60, resize: 'vertical' as const }} placeholder="Pele rejuvenescida em 30 dias..." />
          </div>
        </div>

        <div style={{ background: V.s, border: `1px solid ${V.b}`, borderRadius: 6, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 16px', fontFamily: SORA }}>Objecoes e respostas</h3>
          {objections.length === 0 && (
            <p style={{ fontSize: 12, color: V.t3, fontFamily: SORA, padding: '16px 0' }}>Nenhuma objecao cadastrada. Adicione objecoes comuns e como a IA deve responder.</p>
          )}
          {objections.map((o, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: i < objections.length - 1 ? `1px solid ${V.b}` : 'none' }}>
              <input aria-label="Objecao do cliente" value={o.q} onChange={e => { const next = [...objections]; next[i] = { ...next[i], q: e.target.value }; update('objections', next); }} style={{ ...is, marginBottom: 4 }} placeholder="Objecao do cliente..." />
              <input aria-label="Resposta da IA" value={o.a} onChange={e => { const next = [...objections]; next[i] = { ...next[i], a: e.target.value }; update('objections', next); }} style={is} placeholder="Resposta da IA..." />
            </div>
          ))}
          <button onClick={() => update('objections', [...objections, { q: '', a: '' }])} style={{ width: '100%', marginTop: 10, padding: '8px 16px', background: 'none', border: `1px solid ${V.b}`, borderRadius: 6, color: V.t2, fontSize: 12, cursor: 'pointer', fontFamily: SORA }}>
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
            <select value={config.tone || 'Consultivo'} onChange={e => update('tone', e.target.value)} style={is}><option>Consultivo</option><option>Agressivo</option><option>Amigavel</option><option>Urgente</option></select>
          </div>
          <div style={{ flex: '1 1 45%', marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Persistencia (1-5)</span>
            <input aria-label="Persistencia de 1 a 5" value={config.persistence ?? 3} onChange={e => update('persistence', Number(e.target.value))} style={is} />
          </div>
          <div style={{ flex: '1 1 45%', marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Limite mensagens</span>
            <input aria-label="Limite de mensagens" value={config.messageLimit ?? 10} onChange={e => update('messageLimit', Number(e.target.value))} style={is} />
          </div>
          <div style={{ flex: '1 1 45%', marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Follow-up</span>
            <select value={config.followUp || '2h, 24h, 72h'} onChange={e => update('followUp', e.target.value)} style={is}><option>2h, 24h, 72h</option><option>1h, 12h, 48h</option><option>Desativado</option></select>
          </div>
        </div>
        <Toggle label="Enviar link checkout automaticamente" checked={config.autoCheckoutLink ?? true} onChange={v => update('autoCheckoutLink', v)} />
        <Toggle label="Oferecer desconto se detectar resistencia" checked={config.offerDiscount ?? true} onChange={v => update('offerDiscount', v)} />
        <Toggle label="Usar urgencia/escassez" checked={config.useUrgency ?? true} onChange={v => update('useUrgency', v)} />
      </div>

      <button onClick={save} disabled={saving} style={{ width: '100%', marginTop: 16, padding: '14px', background: saving ? V.b : V.em, border: 'none', borderRadius: 6, color: '#0A0A0C', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
        {saved ? 'IA atualizada!' : saving ? 'Salvando...' : 'Salvar config da IA'}
      </button>
    </div>
  );
}
