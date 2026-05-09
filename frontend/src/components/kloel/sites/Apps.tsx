'use client';

import { kloelT } from '@/lib/i18n/t';
import React, { useState } from 'react';
import { IC, SORA, EMBER, TEXT, TEXT_DIM } from './SitesViewIcons';
import { Card, Badge, SectionLabel, Btn } from './SitesViewAtoms';

export function Apps() {
  const [installedApps] = useState<Array<{ name: string; icon: (s: number) => React.ReactElement; status: string; desc: string }>>([]);
  const [availableApps] = useState<Array<{ name: string; icon: (s: number) => React.ReactElement; desc: string }>>([]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.puzzle(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Apps & Integracoes`)}</span>
        <Badge>{installedApps.length} instalados</Badge>
      </div>

      <div>
        <SectionLabel>{kloelT(`Apps Instalados`)}</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {installedApps.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: 20, gridColumn: '1 / -1' }}>
              <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT_DIM }}>{kloelT(`Nenhum app instalado`)}</div>
              <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM, marginTop: 4 }}>{kloelT(`Explore a lista de apps disponíveis abaixo`)}</div>
            </Card>
          ) : (
            installedApps.map((app) => (
              <Card key={app.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: EMBER }}>{app.icon(20)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>{app.name}</div>
                  <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>{app.desc}</div>
                </div>
                <Badge color="#10B981">{app.status}</Badge>
              </Card>
            ))
          )}
        </div>
      </div>

      <div>
        <SectionLabel>{kloelT(`Apps Disponiveis`)}</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {availableApps.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: 20, gridColumn: '1 / -1' }}>
              <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT_DIM }}>{kloelT(`Nenhum app disponivel no momento`)}</div>
            </Card>
          ) : (
            availableApps.map((app) => (
              <Card key={app.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: TEXT_DIM }}>{app.icon(20)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>{app.name}</div>
                  <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>{app.desc}</div>
                </div>
                <Btn variant="ghost" small>{IC.plus(12)} {kloelT(`Instalar`)}</Btn>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
