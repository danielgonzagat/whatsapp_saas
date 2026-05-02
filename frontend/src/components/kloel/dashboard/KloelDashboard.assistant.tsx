'use client';

import { kloelT } from '@/lib/i18n/t';
import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { isRecord, type JsonRecord } from './KloelDashboard.helpers';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { Globe } from 'lucide-react';
import Image from 'next/image';
import { E, MUTED, TEXT, SURFACE, DIVIDER } from './KloelDashboard.subcomponents';

interface AssistantAssetSource {
  title?: string | null;
  name?: string | null;
  url?: string | null;
}

export function AssistantThinkingState({ label }: { label: 'Kloel está pensando' }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 28,
        color: MUTED,
      }}
    >
      <KloelMushroomVisual size={18} animated spores="animated" traceColor={E} ariaHidden />
      <span style={{ fontSize: 13, color: MUTED }}>{label}</span>
    </div>
  );
}

export function AssistantAssetBlock({ metadata }: { metadata?: JsonRecord | null }) {
  const generatedImageUrl =
    typeof metadata?.generatedImageUrl === 'string' ? metadata.generatedImageUrl : null;
  const generatedImageFilename =
    typeof metadata?.generatedImageFilename === 'string' && metadata.generatedImageFilename.trim()
      ? metadata.generatedImageFilename.trim()
      : 'kloel-image.png';
  const generatedImageDownloadHref = generatedImageUrl
    ? generatedImageUrl.startsWith('data:')
      ? generatedImageUrl
      : `/api/kloel/download-image?url=${encodeURIComponent(generatedImageUrl)}&filename=${encodeURIComponent(generatedImageFilename)}`
    : null;
  const generatedSiteHtml =
    typeof metadata?.generatedSiteHtml === 'string' ? metadata.generatedSiteHtml : null;
  const webSources = Array.isArray(metadata?.webSources)
    ? metadata.webSources.filter((source): source is AssistantAssetSource => isRecord(source))
    : [];

  if (!generatedImageUrl && !generatedSiteHtml && webSources.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
      {generatedImageUrl ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            width: 'min(100%, 520px)',
          }}
        >
          <a
            href={generatedImageUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block',
              width: '100%',
              borderRadius: 14,
              overflow: 'hidden',
              border: `1px solid ${DIVIDER}`,
              textDecoration: 'none',
            }}
          >
            <Image
              src={generatedImageUrl}
              alt="Imagem criada pelo Kloel"
              unoptimized
              width={800}
              height={600}
              style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover' }}
            />
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <a
              href={generatedImageUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 36,
                padding: '0 14px',
                borderRadius: 999,
                border: `1px solid ${DIVIDER}`,
                background: SURFACE,
                color: TEXT,
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              {kloelT(`Abrir`)}
            </a>
            <a
              href={generatedImageDownloadHref || generatedImageUrl}
              download={generatedImageUrl.startsWith('data:') ? generatedImageFilename : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 36,
                padding: '0 14px',
                borderRadius: 999,
                border: `1px solid color-mix(in srgb, ${E} 22%, ${DIVIDER})`,
                background: `color-mix(in srgb, ${E} 10%, ${SURFACE})`,
                color: E,
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              {kloelT(`Baixar`)}
            </a>
          </div>
        </div>
      ) : null}

      {generatedSiteHtml ? (
        <div
          style={{
            width: 'min(100%, 620px)',
            borderRadius: 14,
            border: `1px solid ${DIVIDER}`,
            overflow: 'hidden',
            background: SURFACE,
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: `1px solid ${DIVIDER}`,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: MUTED,
            }}
          >
            {kloelT(`Preview do site`)}
          </div>
          <iframe
            title={kloelT(`Preview do site gerado`)}
            srcDoc={generatedSiteHtml}
            sandbox="allow-same-origin"
            style={{
              width: '100%',
              minHeight: 320,
              border: 'none',
              background: KLOEL_THEME.textInverse,
            }}
          />
        </div>
      ) : null}

      {webSources.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            width: 'min(100%, 620px)',
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: MUTED,
            }}
          >
            {kloelT(`Fontes`)}
          </span>
          {webSources.map((source, index) => {
            const title =
              typeof source?.title === 'string' && source.title.trim()
                ? source.title.trim()
                : `Fonte ${index + 1}`;
            const url = typeof source?.url === 'string' ? source.url : '';
            if (!url) {
              return null;
            }
            return (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 44,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${DIVIDER}`,
                  textDecoration: 'none',
                  color: TEXT,
                  background: SURFACE,
                }}
              >
                <Globe size={14} strokeWidth={1.9} color={E} aria-hidden="true" />
                <span
                  style={{
                    fontSize: 14,
                    lineHeight: 1.4,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {title}
                </span>
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
