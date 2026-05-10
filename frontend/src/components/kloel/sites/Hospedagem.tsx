'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { IC, SORA, MONO, EMBER, TEXT, TEXT_DIM, TEXT_MUTED, BG_ELEVATED } from './SitesViewIcons';
import { Card, Badge, Stat, SectionLabel } from './SitesViewAtoms';
import { ProgressBar } from './SitesViewControls';

export function Hospedagem() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.server(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Hospedagem`)}</span>
        <Badge color={colors.semantic.success}>{kloelT(`Plano Pro`)}</Badge>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Stat label="CPU" value="23%" sub={kloelT(`2 vCPUs`)} icon={IC.cpu} />
        <Stat label={kloelT(`Memoria`)} value="512MB" sub={kloelT(`de 1GB`)} icon={IC.server} />
        <Stat label={kloelT(`Armazenamento`)} value="2.4GB" sub={kloelT(`de 10GB`)} icon={IC.cloud} />
        <Stat label={kloelT(`Bandwidth`)} value="45GB" sub={kloelT(`de 100GB / mes`)} icon={IC.upload} />
      </div>

      <Card>
        <SectionLabel>{kloelT(`Uso de Recursos`)}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { label: 'CPU', value: 23, max: 100, color: colors.semantic.success },
            { label: 'Memoria RAM', value: 512, max: 1024, color: colors.semantic.info },
            { label: 'Disco', value: 2.4, max: 10, color: colors.semantic.warning },
            { label: 'Bandwidth', value: 45, max: 100, color: EMBER },
          ].map((r) => (
            <div key={r.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT }}>{r.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>
                  {r.value}{r.label === 'CPU' ? '%' : r.label === 'Memoria RAM' ? 'MB' : 'GB'} / {r.max}{r.label === 'CPU' ? '%' : r.label === 'Memoria RAM' ? 'MB' : 'GB'}
                </span>
              </div>
              <ProgressBar value={r.value} max={r.max} color={r.color} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionLabel>{kloelT(`Informacoes do Servidor`)}</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Regiao', value: 'Sao Paulo (sa-east-1)' },
            { label: 'IP', value: '76.223.105.230' },
            { label: 'Runtime', value: 'Node.js 20 LTS' },
            { label: 'CDN', value: 'CloudFront (ativo)' },
            { label: 'SSL', value: "Let's Encrypt (auto-renovacao)" },
            { label: 'Backups', value: 'Diarios (7 dias retencao)' },
          ].map((info) => (
            <div key={info.label} style={{ padding: '8px 12px', background: BG_ELEVATED, borderRadius: 6 }}>
              <div style={{ fontFamily: SORA, fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 2 }}>{info.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: TEXT }}>{info.value}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionLabel>{kloelT(`Uptime (30 dias)`)}</SectionLabel>
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 40 }}>
          {Array.from({ length: 30 }, (_, i) => (
            <div key={`uptime-${i}`} style={{ flex: 1, height: 40, background: colors.semantic.success, borderRadius: 2, opacity: 0.3 }} />
          ))}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--app-text-secondary)', marginTop: 8, textAlign: 'center' }}>
          {kloelT(`Dados indisponiveis — conecte seu site`)}
        </div>
      </Card>
    </div>
  );
}
