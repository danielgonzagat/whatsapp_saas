'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useSiteDomains, useSiteMutations } from '@/hooks/useSites';
import { kloelT } from '@/lib/i18n/t';
import { IC, SORA, EMBER, TEXT, TEXT_DIM, TEXT_MUTED, BORDER } from './SitesViewIcons';
import { Badge, Btn, Card } from './SitesViewAtoms';
import type { Site, SiteDomain } from '@/lib/api/sites';

interface DominiosProps {
  workspaceId?: string;
  sites?: Site[];
  loading?: boolean;
}

const fieldStyle: CSSProperties = {
  width: '100%',
  marginTop: 6,
  padding: '10px 12px',
  borderRadius: 6,
  border: `1px solid ${BORDER}`,
  background: 'var(--app-bg-secondary)',
  color: TEXT,
  fontFamily: SORA,
  fontSize: 12,
  outline: 'none',
};

function normalizeHostname(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function dnsStatusColor(status: SiteDomain['dnsStatus']) {
  if (status === 'VERIFIED') {
    return 'rgb(34, 197, 94)';
  }
  if (status === 'FAILED') {
    return 'rgb(239, 68, 68)';
  }
  return EMBER;
}

function sslStatusColor(status: string) {
  if (status === 'ACTIVE' || status === 'VERIFIED') {
    return 'rgb(34, 197, 94)';
  }
  if (status === 'FAILED') {
    return 'rgb(239, 68, 68)';
  }
  return EMBER;
}

export function Dominios({ workspaceId = '', sites = [], loading = false }: DominiosProps) {
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState(() => sites[0]?.id ?? '');
  const [hostnameDraft, setHostnameDraft] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [addingDomain, setAddingDomain] = useState(false);

  const published = useMemo(() => sites.filter((s) => s.status === 'PUBLISHED' && s.slug), [sites]);
  const selectableSites = useMemo(() => (published.length > 0 ? published : sites), [published, sites]);
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

  const { domains, isLoading: domainsLoading, error: domainsError, mutate: mutateDomains } = useSiteDomains(
    workspaceId,
    effectiveSelectedSiteId || null,
  );
  const { addDomain } = useSiteMutations(workspaceId);
  const draftCount = sites.length - published.length;
  const domainsErrorMessage = domainsError instanceof Error
    ? domainsError.message
    : domainsError
      ? kloelT(`Nao foi possivel carregar os dominios deste site.`)
      : null;

  const copyUrl = (slug: string) => {
    if (typeof window === 'undefined' || !navigator.clipboard) {
      return;
    }
    void navigator.clipboard.writeText(`${window.location.origin}/s/${slug}`);
    setCopiedSlug(slug);
    window.setTimeout(() => setCopiedSlug((current) => (current === slug ? null : current)), 1800);
  };

  const handleAddDomain = async () => {
    const hostname = normalizeHostname(hostnameDraft);
    setActionError(null);
    setActionSuccess(null);

    if (!workspaceId || !selectedSite) {
      setActionError(kloelT(`Selecione um site real antes de conectar o dominio.`));
      return;
    }

    if (!hostname) {
      setActionError(kloelT(`Informe um dominio valido.`));
      return;
    }

    setAddingDomain(true);
    try {
      const response = await addDomain(selectedSite.id, { hostname });
      if (response?.error) {
        throw new Error(response.error);
      }
      await mutateDomains();
      setHostnameDraft('');
      setActionSuccess(kloelT(`Dominio enviado para verificacao DNS.`));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : kloelT(`Nao foi possivel adicionar o dominio.`));
    } finally {
      setAddingDomain(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.globe(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Dominios`)}</span>
      </div>

      {loading ? (
        <Card style={{ padding: '32px 24px', textAlign: 'center' }}>
          <span style={{ fontFamily: SORA, fontSize: 13, color: TEXT_DIM }}>
            {kloelT(`Carregando seus sites...`)}
          </span>
        </Card>
      ) : published.length === 0 ? (
        <Card
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '40px 24px',
            gap: 16,
          }}
        >
          <span style={{ color: EMBER, opacity: 0.25 }}>{IC.globe(48)}</span>
          <div>
            <div style={{ fontFamily: SORA, fontSize: 16, color: TEXT, marginBottom: 8 }}>
              {kloelT(`Nenhum site publicado ainda`)}
            </div>
            <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT_DIM, maxWidth: 480, lineHeight: 1.6 }}>
              {kloelT(`Publique um site na aba Visao Geral para ele ganhar um endereco publico em /s/seu-slug.`)}
            </div>
          </div>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          {published.map((site, index) => (
            <div
              key={site.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 16px',
                borderTop: index === 0 ? 'none' : `1px solid ${EMBER}1a`,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT }}>
                  {site.name || kloelT(`Site sem titulo`)}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: TEXT_DIM }}>
                  /s/{site.slug}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <a
                  href={`/s/${site.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontFamily: SORA,
                    fontSize: 12,
                    color: TEXT,
                    textDecoration: 'none',
                    border: `1px solid ${EMBER}33`,
                    borderRadius: 6,
                    padding: '6px 12px',
                  }}
                >
                  {kloelT(`Abrir`)}
                </a>
                <button
                  type="button"
                  onClick={() => copyUrl(site.slug)}
                  style={{
                    fontFamily: SORA,
                    fontSize: 12,
                    color: copiedSlug === site.slug ? EMBER : TEXT,
                    background: 'transparent',
                    border: `1px solid ${EMBER}33`,
                    borderRadius: 6,
                    padding: '6px 12px',
                    cursor: 'pointer',
                  }}
                >
                  {copiedSlug === site.slug ? kloelT(`Copiado`) : kloelT(`Copiar URL`)}
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {!loading && draftCount > 0 && (
        <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT_MUTED }}>
          {kloelT(`Voce tem`)} {draftCount}{' '}
          {kloelT(`site(s) em rascunho. Publique-os para gerar o endereco publico.`)}
        </div>
      )}

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>
              {kloelT(`Dominio proprio`)}
            </div>
            <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM, lineHeight: 1.6, marginTop: 4 }}>
              {kloelT(`Conecte dominios ao site selecionado. A verificacao de DNS e SSL vem do backend real.`)}
            </div>
          </div>
          {selectedSite && <Badge>{selectedSite.name || kloelT(`Site sem titulo`)}</Badge>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.85fr) minmax(220px, 1.15fr) auto', gap: 12, alignItems: 'end' }}>
          <label style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>
            {kloelT(`Site`)}
            <select
              aria-label={kloelT(`Site para dominio`)}
              value={effectiveSelectedSiteId}
              onChange={(event) => setSelectedSiteId(event.target.value)}
              disabled={loading || selectableSites.length === 0}
              style={fieldStyle}
            >
              {selectableSites.length === 0 ? (
                <option value="">{kloelT(`Nenhum site`)}</option>
              ) : (
                selectableSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name || site.slug || site.id}
                  </option>
                ))
              )}
            </select>
          </label>

          <label style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>
            {kloelT(`Dominio proprio`)}
            <input
              aria-label={kloelT(`Dominio proprio`)}
              value={hostnameDraft}
              onChange={(event) => setHostnameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleAddDomain();
                }
              }}
              placeholder="loja.seudominio.com.br"
              style={fieldStyle}
            />
          </label>

          <Btn
            onClick={() => { void handleAddDomain(); }}
            disabled={!workspaceId || !selectedSite || !hostnameDraft.trim() || addingDomain}
          >
            {addingDomain ? kloelT(`Adicionando...`) : kloelT(`Adicionar dominio`)}
          </Btn>
        </div>

        {actionError && <div style={{ fontFamily: SORA, fontSize: 12, color: 'rgb(239, 68, 68)' }}>{actionError}</div>}
        {actionSuccess && <div style={{ fontFamily: SORA, fontSize: 12, color: 'rgb(34, 197, 94)' }}>{actionSuccess}</div>}
        {domainsErrorMessage && <div style={{ fontFamily: SORA, fontSize: 12, color: 'rgb(239, 68, 68)' }}>{domainsErrorMessage}</div>}

        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {domainsLoading ? (
            <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>
              {kloelT(`Carregando dominios cadastrados...`)}
            </div>
          ) : domains.length === 0 ? (
            <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
              {kloelT(`Nenhum dominio proprio cadastrado para este site.`)}
            </div>
          ) : (
            domains.map((domain) => (
              <div
                key={domain.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>{domain.hostname}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: TEXT_MUTED }}>
                    {domain.isCustom ? kloelT(`Dominio customizado`) : kloelT(`Dominio nativo`)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Badge color={dnsStatusColor(domain.dnsStatus)}>DNS {domain.dnsStatus}</Badge>
                  <Badge color={sslStatusColor(domain.sslStatus)}>SSL {domain.sslStatus || 'PENDING'}</Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
