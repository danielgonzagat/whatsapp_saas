'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';

const SORA = "var(--font-sora), 'Sora', sans-serif";
const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";
const V = { s: '#111113', e: '#19191C', b: '#222226', em: '#E85D30', t: '#E0DDD8', t2: '#6E6E73', t3: '#3A3A3F', bl: '#3B82F6', r: '#EF4444' };

export function ProductCampaignsTab({ productId }: { productId: string }) {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [linkModal, setLinkModal] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  useEffect(() => {
    // Campaigns would come from a dedicated endpoint; for now use empty
    setCampaigns([]);
  }, [productId]);

  const cp = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: 0, fontFamily: SORA }}>Campanhas Registradas</h2>
        <button onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px', background: V.em, border: 'none', borderRadius: 6, color: '#0A0A0C', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SORA }}>+ Nova Campanha</button>
      </div>

      <div style={{ background: `${V.bl}08`, border: `1px solid ${V.bl}15`, borderRadius: 6, padding: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: V.bl, fontFamily: SORA }}>Alteracoes de pixel podem levar ate 15 minutos para surtir efeito.</span>
      </div>

      {campaigns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: V.s, border: `1px solid ${V.b}`, borderRadius: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: V.em, letterSpacing: '.25em', textTransform: 'uppercase' as const, marginBottom: 12 }}>SEM CAMPANHAS</div>
          <div style={{ fontSize: 14, color: V.t, fontFamily: SORA }}>Crie sua primeira campanha para rastrear conversoes</div>
        </div>
      ) : (
        <div style={{ background: V.s, border: `1px solid ${V.b}`, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr 1fr', padding: '10px 14px', borderBottom: `1px solid ${V.b}`, background: V.e }}>
            {['Cod.', 'Nome', 'Vendas', 'Pagas', 'Acoes'].map(h => (
              <span key={h} style={{ fontSize: 9, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const }}>{h}</span>
            ))}
          </div>
          {campaigns.map((c: any, i: number) => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr 1fr', padding: '10px 14px', borderBottom: i < campaigns.length - 1 ? `1px solid ${V.b}` : 'none', alignItems: 'center' }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: V.t3 }}>{c.code}</span>
              <span style={{ fontSize: 12, color: V.t }}>{c.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: V.t2, textAlign: 'center' }}>{c.vendas || 0}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: V.t2, textAlign: 'center' }}>{c.pagas || 0}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setLinkModal(c)} style={{ padding: '4px 6px', background: 'none', border: `1px solid ${V.b}`, borderRadius: 4, color: V.em, fontSize: 10, cursor: 'pointer' }}>Links</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: V.s, border: `1px solid ${V.b}`, borderRadius: 10, padding: '24px 28px', maxWidth: 480, width: '100%' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: V.t, margin: '0 0 16px', fontFamily: SORA }}>Nova Campanha</h3>
            <div style={{ marginBottom: 14 }}>
              <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Nome *</span>
              <input aria-label="Nome da campanha" value={newName} onChange={e => setNewName(e.target.value)} style={{ width: '100%', padding: '10px 14px', background: V.e, border: `1px solid ${V.b}`, borderRadius: 6, color: V.t, fontSize: 13, fontFamily: SORA, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowNew(false)} style={{ padding: '8px 16px', background: 'none', border: `1px solid ${V.b}`, borderRadius: 6, color: V.t2, fontSize: 12, cursor: 'pointer', fontFamily: SORA }}>Cancelar</button>
              <button onClick={() => setShowNew(false)} style={{ padding: '8px 16px', background: V.em, border: 'none', borderRadius: 6, color: '#0A0A0C', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SORA }}>Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
