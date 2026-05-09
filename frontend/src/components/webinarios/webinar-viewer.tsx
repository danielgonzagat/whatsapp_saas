import { ExternalLink, Video, X } from 'lucide-react';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';

import { toEmbedUrl } from './utils';
import type { Webinar } from './types';

interface WebinarViewerProps {
  webinar: Webinar;
  onBack: () => void;
}

export default function WebinarViewer({ webinar, onBack }: WebinarViewerProps) {
  const embedUrl = toEmbedUrl(webinar.url);

  return (
    <div style={viewerPageStyle}>
      <div style={viewerHeaderStyle}>
        <button type="button" onClick={onBack} style={backBtnStyle}>
          <X size={14} aria-hidden="true" /> {kloelT('Voltar')}
        </button>
        <h2 style={viewerTitleStyle}>{webinar.title}</h2>
        <a
          href={webinar.url}
          target="_blank"
          rel="noopener noreferrer"
          style={externalLinkStyle}
        >
          <ExternalLink size={12} aria-hidden="true" /> {kloelT('Abrir original')}
        </a>
      </div>

      {embedUrl ? (
        <div style={embedContainerStyle}>
          <iframe
            src={embedUrl}
            style={iframeStyle}
            sandbox={kloelT('allow-scripts allow-same-origin allow-presentation')}
            allow={kloelT(
              'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
            )}
            allowFullScreen
          />
        </div>
      ) : (
        <div style={embedFallbackStyle}>
          <Video size={48} style={fallbackIconStyle} aria-hidden="true" />
          <p style={fallbackTextStyle}>
            {kloelT('Este link nao pode ser incorporado diretamente.')}
          </p>
          <a
            href={webinar.url}
            target="_blank"
            rel="noopener noreferrer"
            style={fallbackLinkStyle}
          >
            {kloelT('Abrir Webinario')}
          </a>
        </div>
      )}

      {webinar.description && (
        <p style={descriptionStyle}>{webinar.description}</p>
      )}
    </div>
  );
}

const viewerPageStyle: React.CSSProperties = {
  background: 'var(--app-bg-primary)',
  minHeight: '100vh',
  padding: '24px 32px',
  fontFamily: 'Sora, sans-serif',
};

const viewerHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 20,
};

const backBtnStyle: React.CSSProperties = {
  background: 'rgba(232, 93, 48, 0.1)',
  border: '1px solid rgba(232, 93, 48, 0.3)',
  color: colors.ember.primary,
  borderRadius: 6,
  padding: '8px 16px',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'Sora, sans-serif',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const viewerTitleStyle: React.CSSProperties = {
  color: 'var(--app-text-primary)',
  fontSize: 18,
  fontWeight: 600,
  margin: 0,
};

const externalLinkStyle: React.CSSProperties = {
  color: colors.ember.primary,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12,
  marginLeft: 'auto',
};

const embedContainerStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  paddingBottom: '56.25%',
  borderRadius: 8,
  overflow: 'hidden',
  background: colors.background.surface,
};

const iframeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  border: 'none',
};

const embedFallbackStyle: React.CSSProperties = {
  background: 'rgba(232, 93, 48, 0.06)',
  border: '1px solid rgba(232, 93, 48, 0.15)',
  borderRadius: 8,
  padding: 40,
  textAlign: 'center',
};

const fallbackIconStyle: React.CSSProperties = {
  color: colors.ember.primary,
  marginBottom: 16,
};

const fallbackTextStyle: React.CSSProperties = {
  color: 'var(--app-text-primary)',
  fontSize: 14,
  marginBottom: 16,
};

const fallbackLinkStyle: React.CSSProperties = {
  background: colors.ember.primary,
  color: colors.text.silver,
  padding: '10px 24px',
  borderRadius: 6,
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'Sora, sans-serif',
};

const descriptionStyle: React.CSSProperties = {
  color: colors.text.muted,
  fontSize: 13,
  marginTop: 16,
  lineHeight: 1.6,
};
