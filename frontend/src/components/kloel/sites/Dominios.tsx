'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import React, { useState } from 'react';
import { IC, SORA, MONO, EMBER, TEXT, TEXT_DIM, TEXT_MUTED, BORDER, BG_ELEVATED } from './SitesViewIcons';
import { Card, Badge, SectionLabel, Btn } from './SitesViewAtoms';
import { Input } from './SitesViewControls';

type DomainItem = {
  name: string;
  ssl: boolean;
  expires: string;
  status: string;
  dns: string;
  primary: boolean;
};

export function Dominios() {
  const { isMobile } = useResponsiveViewport();
  const [domains] = useState<DomainItem[]>([]);
  const [newDomain, setNewDomain] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: EMBER }}>{IC.globe(24)}</span>
          <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Dominios`)}</span>
          <Badge>{domains.length} dominios</Badge>
        </div>
      </div>

      <Card>
        <SectionLabel>{kloelT(`Adicionar Dominio`)}</SectionLabel>
        <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
          <Input value={newDomain} onChange={setNewDomain} placeholder={kloelT(`meunovodominio.com.br`)} style={{ flex: 1 }} />
          <Btn variant="primary" disabled={!newDomain.trim()} onClick={() => setNewDomain('')}>{IC.plus(14)} {kloelT(`Adicionar`)}</Btn>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {!isMobile && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 80px', gap: 0, padding: '10px 16px', borderBottom: `1px solid ${BORDER}` }}>
            {['Dominio', 'SSL', 'DNS', 'Status', 'Expira', ''].map((h) => (
              <div key={h || 'actions'} style={{ fontFamily: SORA, fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.15em' }}>{h}</div>
            ))}
          </div>
        )}
        {domains.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT_DIM }}>{kloelT(`Nenhum dominio adicionado`)}</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT_MUTED, marginTop: 4 }}>{kloelT(`Adicione um dominio acima para comecar`)}</div>
          </div>
        ) : (
          domains.map((d, i) =>
            isMobile ? (
              <div key={d.name} style={{ padding: '14px 16px', borderBottom: i < domains.length - 1 ? `1px solid ${BORDER}` : 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: TEXT }}>{d.name}</span>
                  {d.primary && <Badge color="#10B981">{kloelT(`Principal`)}</Badge>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  <Badge color={d.dns === 'Configurado' ? colors.semantic.success : colors.semantic.warning}>{d.dns}</Badge>
                  <Badge color={d.status === 'ativo' ? colors.semantic.success : colors.semantic.warning}>{d.status}</Badge>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>{kloelT(`SSL:`)} {d.ssl ? 'Ativo' : 'Pendente'}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>{d.expires}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_DIM, padding: 4 }}>{IC.edit(14)}</button>
                  <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>{IC.trash(14)}</button>
                </div>
              </div>
            ) : (
              <div key={d.name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 80px', gap: 0, padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: TEXT, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {d.name}
                    {d.primary && <Badge color="#10B981">{kloelT(`Principal`)}</Badge>}
                  </div>
                </div>
                <div>
                  {d.ssl ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: colors.semantic.success }}>{IC.lock(12)} <span style={{ fontFamily: MONO, fontSize: 11 }}>{kloelT(`Ativo`)}</span></span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: colors.semantic.warning }}>{IC.alert(12)} <span style={{ fontFamily: MONO, fontSize: 11 }}>{kloelT(`Pendente`)}</span></span>
                  )}
                </div>
                <div><Badge color={d.dns === 'Configurado' ? colors.semantic.success : colors.semantic.warning}>{d.dns}</Badge></div>
                <div><Badge color={d.status === 'ativo' ? colors.semantic.success : colors.semantic.warning}>{d.status}</Badge></div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>{d.expires}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_DIM, padding: 4 }}>{IC.edit(14)}</button>
                  <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>{IC.trash(14)}</button>
                </div>
              </div>
            ),
          )
        )}
      </Card>

      <Card>
        <SectionLabel>{kloelT(`Configuracao DNS`)}</SectionLabel>
        <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT_DIM, marginBottom: 12 }}>{kloelT(`Aponte os registros DNS do seu dominio para os servidores KLOEL:`)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 2fr', gap: 8 }}>
          {[
            { type: 'A', name: '@', value: '76.223.105.230' },
            { type: 'CNAME', name: 'www', value: 'proxy.kloel.com' },
          ].map((r) => (
            <React.Fragment key={r.type}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: EMBER, padding: '6px 10px', background: BG_ELEVATED, borderRadius: 4 }}>{r.type}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: TEXT, padding: '6px 10px', background: BG_ELEVATED, borderRadius: 4 }}>{r.name}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: TEXT_DIM, padding: '6px 10px', background: BG_ELEVATED, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {r.value}
                <button type="button" onClick={() => navigator.clipboard.writeText(r.value)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_DIM, padding: 2 }}>{IC.copy(12)}</button>
              </div>
            </React.Fragment>
          ))}
        </div>
      </Card>
    </div>
  );
}
