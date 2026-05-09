'use client';

import { kloelT } from '@/lib/i18n/t';
import type { Affiliate } from './partnershipTypes';
import { C, FONT, TempBar } from './ParceriasDesignTokens';

export default function AffiliateProfileCard({ affiliate }: { affiliate: Affiliate }) {
  const a = affiliate;
  const tempColor = (a.temperature || 0) > 70 ? '#10B981' : '#F59E0B';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: a.type === 'producer' ? 'rgba(139,92,246,0.12)' : C.emberBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONT.sans, fontSize: 22, fontWeight: 700,
            color: a.type === 'producer' ? '#8B5CF6' : C.ember,
          }}
        >
          {(a.name || '?')[0].toUpperCase()}
        </div>
        <div>
          <h2 style={{ fontFamily: FONT.sans, fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{a.name}</h2>
          <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.secondary, margin: '2px 0 6px' }}>{a.email}</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <span
              style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                fontFamily: FONT.sans, color: a.type === 'producer' ? '#8B5CF6' : C.ember,
                background: a.type === 'producer' ? 'rgba(139,92,246,0.15)' : C.emberStrong,
                letterSpacing: '0.02em', textTransform: 'uppercase' as const,
              }}
            >
              {a.type === 'producer' ? 'Produtor' : 'Afiliado'}
            </span>
            <span
              style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                fontFamily: FONT.sans, color: a.status === 'active' ? '#10B981' : '#F59E0B',
                background: a.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                letterSpacing: '0.02em', textTransform: 'uppercase' as const,
              }}
            >
              {a.status === 'active' ? 'Ativo' : 'Pendente'}
            </span>
          </div>
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary }}>{kloelT(`Temperatura`)}</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 11, color: tempColor, fontWeight: 600 }}>{a.temperature || 0}%</span>
        </div>
        <TempBar value={a.temperature || 0} max={100} color={tempColor} />
      </div>
    </>
  );
}
