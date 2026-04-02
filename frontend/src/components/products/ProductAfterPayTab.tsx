'use client';

import { useState } from 'react';

const SORA = "var(--font-sora), 'Sora', sans-serif";
const V = { s: '#111113', e: '#19191C', b: '#222226', em: '#E85D30', t: '#E0DDD8', t2: '#6E6E73', t3: '#3A3A3F', g: '#10B981' };

function Toggle({ label, checked, desc }: { label: string; checked: boolean; desc?: string }) {
  const [on, setOn] = useState(checked);
  return (
    <div onClick={() => setOn(!on)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${V.b}08`, cursor: 'pointer' }}>
      <div>
        <span style={{ fontSize: 12, color: V.t2, fontFamily: SORA }}>{label}</span>
        {desc && <span style={{ display: 'block', fontSize: 10, color: V.t3, marginTop: 2 }}>{desc}</span>}
      </div>
      <div style={{ width: 36, height: 20, borderRadius: 10, background: on ? V.g : V.b, position: 'relative', transition: 'background .2s' }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 2, left: on ? 18 : 2, transition: 'left .2s' }} />
      </div>
    </div>
  );
}

export function ProductAfterPayTab({ productId }: { productId: string }) {
  const [saved, setSaved] = useState(false);
  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: '0 0 20px', fontFamily: SORA }}>Configuracoes After Pay</h2>

      <div style={{ background: V.s, border: `1px solid ${V.b}`, borderRadius: 6, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px', fontFamily: SORA }}>Configuracoes de Venda</h3>
        <Toggle label="Permitir endereco duplicado na venda pos-paga?" checked={false} />
      </div>

      <div style={{ background: V.s, border: `1px solid ${V.b}`, borderRadius: 6, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px', fontFamily: SORA }}>Configuracoes de Afiliados</h3>
        <Toggle label="Cobranca do afiliado por pedido frustrado?" checked={false} />
        <div style={{ marginTop: 12 }}>
          <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Valor cobranca (R$)</span>
          <input defaultValue="R$ 0,00" style={{ width: '100%', padding: '10px 14px', background: V.e, border: `1px solid ${V.b}`, borderRadius: 6, color: V.t, fontSize: 13, fontFamily: SORA, outline: 'none' }} />
        </div>
      </div>

      <div style={{ background: V.s, border: `1px solid ${V.b}`, borderRadius: 6, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px', fontFamily: SORA }}>Configuracoes de Envio</h3>
        <div style={{ marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: SORA }}>Provedor logistico</span>
          <select style={{ width: '100%', padding: '10px 14px', background: V.e, border: `1px solid ${V.b}`, borderRadius: 6, color: V.t, fontSize: 13, fontFamily: SORA, outline: 'none' }}>
            <option>Selecione um provedor</option>
          </select>
        </div>
        <span style={{ fontSize: 10, color: V.t3, fontFamily: SORA }}>Busque por e-mail ou documento</span>
      </div>

      <button onClick={save} style={{ width: '100%', marginTop: 16, padding: '12px', background: V.em, border: 'none', borderRadius: 6, color: '#0A0A0C', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SORA }}>
        {saved ? 'Salvo!' : 'Salvar'}
      </button>
    </div>
  );
}
