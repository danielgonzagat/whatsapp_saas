'use client';

import { kloelT } from '@/lib/i18n/t';
import React from 'react';
import { IC, SORA, MONO, EMBER, TEXT, TEXT_DIM } from './SitesViewIcons';
import { Card, Badge, Btn, EmptyState } from './SitesViewAtoms';
import type { SiteItem } from './SitesViewIcons';

interface EditarSiteListProps {
  savedSites: SiteItem[];
  loading: boolean;
  onSelectSite: (site: SiteItem) => void;
  onDeleteSite: (siteId: string) => void;
}

export function EditarSiteList({ savedSites, loading, onSelectSite, onDeleteSite }: EditarSiteListProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.edit(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Editar Site`)}</span>
      </div>

      {loading ? (
        <Card style={{ padding: '20px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: EMBER }}>{IC.refresh(16)}</span>
          <div>
            <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT }}>{kloelT(`Carregando seus sites`)}</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>{kloelT(`Mantendo a interface estável enquanto os dados chegam.`)}</div>
          </div>
        </Card>
      ) : savedSites.length === 0 ? (
        <EmptyState icon={IC.site} title={kloelT(`Nenhum site encontrado`)} subtitle={kloelT(`Crie seu primeiro site na aba 'Criar Site'`)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {savedSites.map((site) => (
            <Card key={site.id} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '12px 16px' }}>
              <button type="button" onClick={() => onSelectSite(site)} aria-label={`Abrir ${site.name || 'site'}`}
                style={{ color: EMBER, background: 'transparent', border: 'none', padding: 0, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                {IC.site(20)}
              </button>
              <button type="button" onClick={() => onSelectSite(site)} aria-label={`Abrir ${site.name || 'site'}`}
                style={{ flex: 1, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, textAlign: 'left' }}>
                <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT }}>{site.name || 'Site sem titulo'}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>{site.updatedAt ? new Date(site.updatedAt).toLocaleDateString('pt-BR') : 'Sem data'}</div>
              </button>
              {site.published && <Badge color="#10B981">{kloelT(`Publicado`)}</Badge>}
              <Btn variant="ghost" small onClick={() => onSelectSite(site)}>{IC.edit(14)} {kloelT(`Editar`)}</Btn>
              <Btn variant="danger" small onClick={() => onDeleteSite(site.id)}>{IC.trash(14)}</Btn>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
