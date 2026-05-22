'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { apiFetch } from '@/lib/api';
import { useState, useEffect } from 'react';
import { IC, TEXT, TEXT_DIM, BORDER } from './SitesViewIcons';
import { Card, Badge, Stat, SectionLabel, StatusDot, Btn } from './SitesViewAtoms';
import { NeuralPulse } from './NeuralPulse';
import type { SiteItem } from './SitesViewIcons';

function OverviewSiteCard({ site, isMobile }: { site: SiteItem; isMobile: boolean }) {
  const status: 'online' | 'offline' | 'warning' | 'building' = site.published ? 'online' : 'building';
  return (
    <Card style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 14, cursor: 'pointer' }}>
      <StatusDot status={status} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 14, color: TEXT }}>{site.name || 'Site sem titulo'}</div>
        {site.slug && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: TEXT_DIM }}>{site.slug}</div>}
      </div>
      <Badge color={status === 'online' ? colors.semantic.success : colors.semantic.purple}>{status === 'online' ? 'Online' : 'Construindo'}</Badge>
      {site.updatedAt && (
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: TEXT_DIM }}>
          {new Date(site.updatedAt).toLocaleDateString('pt-BR')}
        </span>
      )}
    </Card>
  );
}

export function VisaoGeral({ switchTab }: { switchTab: (id: string) => void }) {
  const { isMobile } = useResponsiveViewport();
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/kloel/site/list')
      .then((res) => {
        const data = res.data as { sites?: SiteItem[] } | undefined;
        if (data?.sites) {setSites(data.sites);}
      })
      .finally(() => setLoading(false));
  }, []);

  const publishedSites = sites.filter((s) => s.published);
  const totalSites = sites.length;
  const publishedCount = publishedSites.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Stat label={kloelT(`Sites`)} value={loading ? '...' : String(totalSites)} icon={IC.site} />
        <Stat label={kloelT(`Publicados`)} value={loading ? '...' : String(publishedCount)} icon={IC.globe} />
        <Stat label={kloelT(`Rascunhos`)} value={loading ? '...' : String(totalSites - publishedCount)} icon={IC.edit} />
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: TEXT_DIM }}>{kloelT(`Trafego em tempo real`)}</span>
          <Badge>LIVE</Badge>
        </div>
        <NeuralPulse w={800} h={80} />
      </Card>

      <div>
        <SectionLabel>{kloelT(`Seus Sites`)}</SectionLabel>
        {loading ? (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: TEXT_DIM }}>{kloelT(`Carregando...`)}</div>
        ) : sites.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: 30 }}>
            <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 14, color: TEXT }}>{kloelT(`Nenhum site encontrado`)}</div>
            <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: TEXT_DIM, marginTop: 8 }}>{kloelT(`Crie seu primeiro site na aba Criar Site`)}</div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sites.map((s) => (
              <OverviewSiteCard key={s.id} site={s} isMobile={isMobile} />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionLabel>{kloelT(`Acoes Rapidas`)}</SectionLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="primary" onClick={() => switchTab('criar')}>{IC.plus(14)} {kloelT(`Criar Novo Site`)}</Btn>
          <Btn variant="ghost" onClick={() => switchTab('dominios')}>{IC.globe(14)} {kloelT(`Gerenciar Dominios`)}</Btn>
          <Btn variant="ghost" onClick={() => switchTab('apps')}>{IC.puzzle(14)} {kloelT(`Instalar Apps`)}</Btn>
          <Btn variant="ghost" onClick={() => switchTab('protecao')}>{IC.shield(14)} {kloelT(`Verificar Seguranca`)}</Btn>
        </div>
      </div>
    </div>
  );
}
