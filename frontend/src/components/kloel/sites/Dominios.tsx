'use client';

import { useState } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { IC, SORA, EMBER, TEXT, TEXT_DIM, TEXT_MUTED } from './SitesViewIcons';
import { Card } from './SitesViewAtoms';
import type { Site } from '@/lib/api/sites';

/**
 * Domains tab. KloelSite publishes to a real slug-based public address
 * (`/s/<slug>`, served by site-public.controller). Custom-domain connection
 * (Cloudflare/DNS) is not built yet, so this lists the REAL working public URLs
 * of the user's published sites and keeps an honest note about custom domains —
 * no fabricated domain rows.
 */
export function Dominios({
  sites = [],
  loading = false,
}: {
  sites?: Site[];
  loading?: boolean;
}) {
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const published = sites.filter((s) => s.status === 'PUBLISHED' && s.slug);
  const draftCount = sites.length - published.length;

  const copyUrl = (slug: string) => {
    if (typeof window === 'undefined' || !navigator.clipboard) {
      return;
    }
    void navigator.clipboard.writeText(`${window.location.origin}/s/${slug}`);
    setCopiedSlug(slug);
    window.setTimeout(() => setCopiedSlug((current) => (current === slug ? null : current)), 1800);
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

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 18px' }}>
        <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>
          {kloelT(`Dominio proprio`)}
        </div>
        <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
          {kloelT(`Conectar um dominio proprio (ex: seusite.com.br) via Cloudflare ainda nao esta disponivel
          no painel. Enquanto isso, seus sites publicados funcionam no endereco /s/seu-slug acima, e voce pode
          apontar um dominio manualmente no seu provedor de DNS.`)}
        </div>
      </Card>
    </div>
  );
}
