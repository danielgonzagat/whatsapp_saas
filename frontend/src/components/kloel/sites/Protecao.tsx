'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useSiteDomains } from '@/hooks/useSites';
import { kloelT } from '@/lib/i18n/t';
import type { Site, SiteDomain } from '@/lib/api/sites';
import { IC, SORA, EMBER, TEXT, TEXT_DIM, TEXT_MUTED, BORDER } from './SitesViewIcons';
import { Badge, Card } from './SitesViewAtoms';

interface ProtecaoProps {
  workspaceId?: string;
  sites?: Site[];
  loading?: boolean;
}

const selectStyle: CSSProperties = {
  minWidth: 220,
  padding: '9px 10px',
  borderRadius: 6,
  border: `1px solid ${BORDER}`,
  background: 'var(--app-bg-secondary)',
  color: TEXT,
  fontFamily: SORA,
  fontSize: 12,
  outline: 'none',
};

function isPublished(site: Site): boolean {
  return site.status === 'PUBLISHED' && Boolean(site.slug);
}

function statusColor(status: string) {
  if (status === 'ACTIVE' || status === 'VERIFIED') {
    return 'rgb(34, 197, 94)';
  }
  if (status === 'FAILED') {
    return 'rgb(239, 68, 68)';
  }
  return EMBER;
}

function hasSecureSsl(domain: SiteDomain): boolean {
  return domain.sslStatus === 'ACTIVE' || domain.sslStatus === 'VERIFIED';
}

export function Protecao({ workspaceId = '', sites = [], loading = false }: ProtecaoProps) {
  const [selectedSiteId, setSelectedSiteId] = useState(() => sites.find(isPublished)?.id ?? '');
  const selectableSites = useMemo(() => sites.filter(isPublished), [sites]);
  const effectiveSelectedSiteId = useMemo(() => {
    if (selectableSites.some((site) => site.id === selectedSiteId)) {
      return selectedSiteId;
    }
    return selectableSites[0]?.id ?? '';
  }, [selectableSites, selectedSiteId]);
  const selectedSite = useMemo(
    () => selectableSites.find((site) => site.id === effectiveSelectedSiteId) ?? null,
    [effectiveSelectedSiteId, selectableSites],
  );
  const { domains, isLoading: domainsLoading, error: domainsError } = useSiteDomains(
    workspaceId,
    effectiveSelectedSiteId || null,
  );
  const secureDomains = domains.filter(hasSecureSsl);
  const domainsErrorMessage = domainsError instanceof Error
    ? domainsError.message
    : domainsError
      ? kloelT(`Nao foi possivel carregar a seguranca dos dominios.`)
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.shield(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Protecao & Seguranca`)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>{kloelT(`Sites`)}</span>
          <span style={{ fontFamily: SORA, fontSize: 22, color: TEXT }}>{loading ? '...' : sites.length}</span>
        </Card>
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>{kloelT(`Dominios`)}</span>
          <span style={{ fontFamily: SORA, fontSize: 22, color: TEXT }}>{domainsLoading ? '...' : domains.length}</span>
        </Card>
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>{kloelT(`SSL ativo`)}</span>
          <span style={{ fontFamily: SORA, fontSize: 22, color: TEXT }}>{domainsLoading ? '...' : secureDomains.length}</span>
        </Card>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>{kloelT(`Estado real de DNS e SSL`)}</span>
          <select
            aria-label={kloelT(`Site para seguranca`)}
            value={effectiveSelectedSiteId}
            onChange={(event) => setSelectedSiteId(event.target.value)}
            disabled={loading || selectableSites.length === 0}
            style={selectStyle}
          >
            {selectableSites.length === 0 ? (
              <option value="">{kloelT(`Nenhum site publicado`)}</option>
            ) : (
              selectableSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name || site.slug || site.id}
                </option>
              ))
            )}
          </select>
        </div>

        {!selectedSite ? (
          <div style={{ padding: 18, fontFamily: SORA, fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
            {kloelT(`Publique um site antes de acompanhar DNS e SSL.`)}
          </div>
        ) : domainsErrorMessage ? (
          <div style={{ padding: 18, fontFamily: SORA, fontSize: 12, color: 'rgb(239, 68, 68)' }}>{domainsErrorMessage}</div>
        ) : loading || domainsLoading ? (
          <div style={{ padding: 18, fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>{kloelT(`Carregando dominios...`)}</div>
        ) : domains.length === 0 ? (
          <div style={{ padding: 18, fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>
            {kloelT(`Nenhum dominio proprio cadastrado para este site.`)}
          </div>
        ) : (
          domains.map((domain, index) => (
            <div
              key={domain.id}
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
                <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT }}>{domain.hostname}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: TEXT_MUTED }}>
                  {domain.isCustom ? kloelT(`Dominio customizado`) : kloelT(`Dominio nativo`)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Badge color={statusColor(domain.dnsStatus)}>DNS {domain.dnsStatus}</Badge>
                <Badge color={statusColor(domain.sslStatus)}>SSL {domain.sslStatus || 'PENDING'}</Badge>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
