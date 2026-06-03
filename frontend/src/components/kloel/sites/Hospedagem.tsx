'use client';

import { kloelT } from '@/lib/i18n/t';
import type { Site } from '@/lib/api/sites';
import { IC, SORA, EMBER, TEXT, TEXT_DIM, TEXT_MUTED, BORDER } from './SitesViewIcons';
import { Badge, Card } from './SitesViewAtoms';

interface HospedagemProps {
  sites?: Site[];
  loading?: boolean;
  error?: unknown;
}

function isPublished(site: Site): boolean {
  return site.status === 'PUBLISHED';
}

function publicPath(site: Site): string {
  return site.slug ? `/s/${site.slug}` : kloelT(`Sem slug publicado`);
}

function formatSiteDate(value: string | null | undefined): string {
  if (!value) {
    return kloelT(`Sem data`);
  }
  return new Date(value).toLocaleDateString('pt-BR');
}

export function Hospedagem({ sites = [], loading = false, error }: HospedagemProps) {
  const publishedSites = sites.filter(isPublished);
  const errorMessage = error instanceof Error
    ? error.message
    : error
      ? kloelT(`Erro ao carregar hospedagem dos sites.`)
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.server(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Hospedagem`)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>{kloelT(`Sites`)}</span>
          <span style={{ fontFamily: SORA, fontSize: 22, color: TEXT }}>{loading && !error ? '...' : sites.length}</span>
        </Card>
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>{kloelT(`Publicados`)}</span>
          <span style={{ fontFamily: SORA, fontSize: 22, color: TEXT }}>{loading && !error ? '...' : publishedSites.length}</span>
        </Card>
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>{kloelT(`Rascunhos`)}</span>
          <span style={{ fontFamily: SORA, fontSize: 22, color: TEXT }}>{loading && !error ? '...' : sites.length - publishedSites.length}</span>
        </Card>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>{kloelT(`Sites hospedados`)}</span>
          <Badge>{kloelT(`BACKEND REAL`)}</Badge>
        </div>

        {errorMessage ? (
          <div style={{ padding: 18, fontFamily: SORA, fontSize: 12, color: '#ef4444' }}>{errorMessage}</div>
        ) : loading ? (
          <div style={{ padding: 18, fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>{kloelT(`Carregando sites...`)}</div>
        ) : sites.length === 0 ? (
          <div style={{ padding: 18, fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>{kloelT(`Nenhum site criado ainda.`)}</div>
        ) : (
          sites.map((site, index) => (
            <div
              key={site.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 16px',
                borderTop: index === 0 ? 'none' : `1px solid ${BORDER}`,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT }}>{site.name || kloelT(`Site sem titulo`)}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: TEXT_DIM }}>{publicPath(site)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Badge color={isPublished(site) ? '#22c55e' : EMBER}>{isPublished(site) ? 'Online' : kloelT(`Construindo`)}</Badge>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: TEXT_MUTED }}>
                  {kloelT(`Atualizado`)} {formatSiteDate(site.updatedAt)}
                </span>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
