'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useSiteApps, useSiteMutations } from '@/hooks/useSites';
import { kloelT } from '@/lib/i18n/t';
import type { Site, SiteAppIntegration } from '@/lib/api/sites';
import { IC, SORA, EMBER, TEXT, TEXT_DIM, TEXT_MUTED, BORDER } from './SitesViewIcons';
import { Badge, Btn, Card, SectionLabel } from './SitesViewAtoms';

interface SiteAppField {
  key: string;
  label: string;
  placeholder: string;
}

interface SiteAppDefinition {
  key: string;
  label: string;
  description: string;
  fields: SiteAppField[];
}

export interface AppsProps {
  workspaceId: string;
  sites: Site[];
  loading: boolean;
  error?: unknown;
}

export const SITE_APP_CATALOG: SiteAppDefinition[] = [
  {
    key: 'google-analytics',
    label: 'Google Analytics',
    description: 'Instala o identificador de medicao nas paginas publicadas deste site.',
    fields: [{ key: 'trackingId', label: 'ID de medicao', placeholder: 'G-XXXXXXXXXX' }],
  },
];

const inputStyle: CSSProperties = {
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

export function readSiteAppConfigValue(
  config: Record<string, unknown> | null | undefined,
  key: string,
): string {
  const value = config?.[key];
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function mergeSiteAppCatalog(apps: SiteAppIntegration[]): SiteAppDefinition[] {
  const knownKeys = new Set(SITE_APP_CATALOG.map((definition) => definition.key));
  const backendOnlyApps = apps
    .filter((app) => !knownKeys.has(app.appKey))
    .map((app) => ({
      key: app.appKey,
      label: app.appKey,
      description: 'Aplicativo registrado no backend deste site.',
      fields: [],
    }));
  return [...SITE_APP_CATALOG, ...backendOnlyApps];
}

export function buildSiteAppConfigPayload(
  definition: SiteAppDefinition,
  app: SiteAppIntegration | undefined,
  draft: Record<string, string> | undefined,
): Record<string, unknown> {
  const nextConfig: Record<string, unknown> = { ...(app?.config ?? {}) };
  for (const field of definition.fields) {
    nextConfig[field.key] = draft?.[field.key] ?? readSiteAppConfigValue(app?.config, field.key);
  }
  return nextConfig;
}

export function Apps({ workspaceId, sites, loading, error }: AppsProps) {
  const [selectedSiteId, setSelectedSiteId] = useState(() => sites[0]?.id ?? '');
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const effectiveSelectedSiteId = useMemo(() => {
    if (sites.some((site) => site.id === selectedSiteId)) {
      return selectedSiteId;
    }
    return sites[0]?.id ?? '';
  }, [selectedSiteId, sites]);
  const selectedSite = useMemo(
    () => sites.find((site) => site.id === effectiveSelectedSiteId) ?? null,
    [effectiveSelectedSiteId, sites],
  );
  const {
    apps,
    isLoading: appsLoading,
    error: appsError,
    mutate: mutateApps,
  } = useSiteApps(workspaceId, selectedSite?.id ?? null);
  const { upsertApp } = useSiteMutations(workspaceId);

  const appsByKey = useMemo(() => new Map(apps.map((app) => [app.appKey, app])), [apps]);
  const appDefinitions = useMemo(() => mergeSiteAppCatalog(apps), [apps]);

  const updateDraft = (draftKey: string, fieldKey: string, value: string) => {
    setDrafts((current) => ({
      ...current,
      [draftKey]: { ...(current[draftKey] ?? {}), [fieldKey]: value },
    }));
  };

  const saveApp = async (definition: SiteAppDefinition, enabled: boolean) => {
    if (!selectedSite) {
      return;
    }
    const app = appsByKey.get(definition.key);
    const draftKey = `${selectedSite.id}:${definition.key}`;
    const config = buildSiteAppConfigPayload(definition, app, drafts[draftKey]);
    setSavingKey(draftKey);
    setActionError('');
    try {
      await upsertApp(selectedSite.id, definition.key, { enabled, config });
      await mutateApps();
      setSavedKey(draftKey);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Nao foi possivel salvar o app do site.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.puzzle(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Apps & Integracoes`)}</span>
      </div>

      {error ? (
        <Card style={{ color: TEXT_DIM, fontFamily: SORA, fontSize: 13 }}>
          {kloelT(`Erro ao carregar sites para instalar apps.`)}
        </Card>
      ) : loading ? (
        <Card style={{ color: TEXT_DIM, fontFamily: SORA, fontSize: 13 }}>
          {kloelT(`Carregando sites...`)}
        </Card>
      ) : sites.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '36px 24px' }}>
          <div style={{ fontFamily: SORA, fontSize: 16, color: TEXT, marginBottom: 8 }}>
            {kloelT(`Nenhum site encontrado`)}
          </div>
          <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT_DIM, lineHeight: 1.6 }}>
            {kloelT(`Crie um site antes de instalar scripts e aplicativos de publicacao.`)}
          </div>
        </Card>
      ) : (
        <>
          <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT, marginBottom: 4 }}>
                  {kloelT(`Site alvo`)}
                </div>
                <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT_MUTED }}>
                  {kloelT(`Os apps salvos aqui persistem em /sites/:id/apps/:appKey.`)}
                </div>
              </div>
              <select
                aria-label="Selecionar site para apps"
                value={effectiveSelectedSiteId}
                onChange={(event) => setSelectedSiteId(event.target.value)}
                style={{
                  minWidth: 220,
                  padding: '9px 12px',
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  background: 'var(--app-bg-secondary)',
                  color: TEXT,
                  fontFamily: SORA,
                  fontSize: 12,
                }}
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name || site.slug || site.id}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          <div>
            <SectionLabel>{kloelT(`Apps instalaveis`)}</SectionLabel>
            {appsError ? (
              <Card style={{ color: TEXT_DIM, fontFamily: SORA, fontSize: 13 }}>
                {kloelT(`Erro ao carregar apps deste site.`)}
              </Card>
            ) : appsLoading ? (
              <Card style={{ color: TEXT_DIM, fontFamily: SORA, fontSize: 13 }}>
                {kloelT(`Carregando apps do site...`)}
              </Card>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {appDefinitions.map((definition) => {
                  const app = appsByKey.get(definition.key);
                  const enabled = Boolean(app?.enabled);
                  const draftKey = `${effectiveSelectedSiteId}:${definition.key}`;
                  const busy = savingKey === draftKey;
                  return (
                    <Card key={definition.key} style={{ display: 'grid', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontFamily: SORA, fontSize: 14, color: TEXT }}>
                              {definition.label}
                            </span>
                            <Badge color={enabled ? 'var(--app-success)' : TEXT_MUTED}>
                              {enabled ? 'ATIVO' : 'OFF'}
                            </Badge>
                          </div>
                          <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
                            {definition.description}
                          </div>
                        </div>
                        <Btn
                          variant={enabled ? 'danger' : 'primary'}
                          disabled={busy}
                          onClick={() => void saveApp(definition, !enabled)}
                        >
                          {busy
                            ? kloelT(`Salvando...`)
                            : enabled
                              ? `${kloelT(`Desativar`)} ${definition.label}`
                              : `${kloelT(`Ativar`)} ${definition.label}`}
                        </Btn>
                      </div>

                      {definition.fields.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                          {definition.fields.map((field) => (
                            <label key={field.key} style={{ fontFamily: SORA, fontSize: 11, color: TEXT_MUTED }}>
                              {field.label}
                              <input
                                aria-label={`${definition.label} ${field.label}`}
                                value={drafts[draftKey]?.[field.key] ?? readSiteAppConfigValue(app?.config, field.key)}
                                placeholder={field.placeholder}
                                onChange={(event) => updateDraft(draftKey, field.key, event.target.value)}
                                style={inputStyle}
                              />
                            </label>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: SORA, fontSize: 11, color: TEXT_MUTED }}>
                          {savedKey === draftKey ? kloelT(`Salvo no backend`) : kloelT(`Estado carregado do backend`)}
                        </span>
                        {definition.fields.length > 0 && (
                          <Btn variant="ghost" small disabled={busy} onClick={() => void saveApp(definition, enabled)}>
                            {kloelT(`Salvar configuracao`)}
                          </Btn>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {actionError && (
            <Card style={{ color: 'var(--app-error)', fontFamily: SORA, fontSize: 12 }}>
              {actionError}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
