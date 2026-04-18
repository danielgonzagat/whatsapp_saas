'use client';

import {
  InlineStatus,
  OverlayStatus,
  RemoveIconButton,
} from '@/components/kloel/dashboard/KloelChatComposerSurfaceParts';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { type KloelChatAttachment, type KloelLinkedProduct } from '@/lib/kloel-chat';
import { FileText, ImagePlus, Link2, Music4 } from 'lucide-react';

const F = "'Sora', sans-serif";
const SURFACE = KLOEL_THEME.bgCard;
const SURFACE_ALT = KLOEL_THEME.bgSecondary;
const TEXT = KLOEL_THEME.textPrimary;
const MUTED = KLOEL_THEME.textSecondary;
const MUTED_2 = KLOEL_THEME.textTertiary;
const DIVIDER = KLOEL_THEME.borderPrimary;
const SUCCESS = KLOEL_THEME.success;
const INFO = KLOEL_THEME.info;
const WARNING = KLOEL_THEME.warning;
const EMBER = KLOEL_THEME.accent;

function attachmentIcon(kind: KloelChatAttachment['kind']) {
  if (kind === 'image') return <ImagePlus size={14} strokeWidth={1.8} aria-hidden="true" />;
  if (kind === 'audio') return <Music4 size={14} strokeWidth={1.8} aria-hidden="true" />;
  return <FileText size={14} strokeWidth={1.8} aria-hidden="true" />;
}

function resolveVisualAttachmentSource(attachment: KloelChatAttachment) {
  const mimeType = String(attachment.mimeType || '').toLowerCase();
  const previewUrl = String(attachment.previewUrl || '').trim();
  const uploadedUrl = String(attachment.url || '').trim();
  const isVisual =
    attachment.kind === 'image' || mimeType.startsWith('image/') || previewUrl.length > 0;

  if (!isVisual) {
    return null;
  }

  return previewUrl || uploadedUrl || null;
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 KB';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function statusColor(status: KloelLinkedProduct['status']) {
  if (status === 'published') {
    return SUCCESS;
  }
  if (status === 'affiliate') {
    return INFO;
  }
  return WARNING;
}

interface ComposerTopRailProps {
  attachments: KloelChatAttachment[];
  linkedProduct: KloelLinkedProduct | null;
  onRemoveAttachment: (attachmentId: string) => void;
  onRetryAttachment: (attachmentId: string) => void;
  onRemoveLinkedProduct: () => void;
}

export function ComposerTopRail({
  attachments,
  linkedProduct,
  onRemoveAttachment,
  onRetryAttachment,
  onRemoveLinkedProduct,
}: ComposerTopRailProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        paddingBottom: 10,
        marginBottom: 12,
      }}
    >
      {attachments.map((attachment) => {
        const visualSource = resolveVisualAttachmentSource(attachment);

        return visualSource ? (
          <div
            key={attachment.id}
            style={{
              position: 'relative',
              width: 72,
              height: 72,
              padding: 0,
              borderRadius: 12,
              overflow: 'hidden',
              border: `1px solid ${DIVIDER}`,
              background: SURFACE_ALT,
            }}
          >
            <button
              type="button"
              aria-label={`Abrir prévia de ${attachment.name}`}
              disabled={attachment.status !== 'ready' || !visualSource}
              onClick={() => {
                const targetUrl = attachment.url || visualSource;
                if (attachment.status === 'ready' && targetUrl) {
                  window.open(targetUrl, '_blank', 'noopener,noreferrer');
                }
              }}
              style={{
                width: '100%',
                height: '100%',
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: attachment.status === 'ready' ? 'pointer' : 'default',
              }}
            >
              {visualSource ? (
                // biome-ignore lint/performance/noImgElement: user-uploaded attachment preview from blob URL, sized by parent layout
                <img
                  src={visualSource}
                  alt={attachment.name}
                  width={56}
                  height={56}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: MUTED,
                  }}
                >
                  <ImagePlus size={18} strokeWidth={1.8} aria-hidden="true" />
                </div>
              )}
            </button>

            <OverlayStatus attachment={attachment} />
            <RemoveIconButton
              label={`Remover ${attachment.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveAttachment(attachment.id);
              }}
            />
          </div>
        ) : (
          <div
            key={attachment.id}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              maxWidth: 240,
              minHeight: 58,
              padding: '10px 40px 10px 12px',
              borderRadius: 12,
              border: `1px solid ${DIVIDER}`,
              background: SURFACE_ALT,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `color-mix(in srgb, ${EMBER} 10%, ${SURFACE})`,
                color: EMBER,
                flexShrink: 0,
              }}
            >
              {attachmentIcon(attachment.kind)}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1.35,
                  color: TEXT,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={attachment.name}
              >
                {attachment.name}
              </div>
              <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.2, color: MUTED_2 }}>
                {attachment.status === 'error'
                  ? attachment.error || 'Falha no upload'
                  : attachment.status === 'uploading'
                    ? 'Enviando arquivo...'
                    : `${formatFileSize(attachment.size)} · pronto`}
              </div>
              {attachment.status === 'error' ? (
                <button
                  type="button"
                  onClick={() => onRetryAttachment(attachment.id)}
                  style={{
                    marginTop: 8,
                    border: 'none',
                    background: 'transparent',
                    color: EMBER,
                    padding: 0,
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: F,
                    cursor: 'pointer',
                  }}
                >
                  Tentar novamente
                </button>
              ) : null}
            </div>

            <InlineStatus attachment={attachment} />
            <RemoveIconButton
              label={`Remover ${attachment.name}`}
              onClick={() => onRemoveAttachment(attachment.id)}
            />
          </div>
        );
      })}

      {linkedProduct ? (
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            maxWidth: 280,
            minHeight: 58,
            padding: '10px 40px 10px 12px',
            borderRadius: 12,
            border: `1px solid color-mix(in srgb, ${EMBER} 18%, ${DIVIDER})`,
            background: `color-mix(in srgb, ${EMBER} 10%, ${SURFACE})`,
          }}
        >
          {linkedProduct.imageUrl ? (
            <img
              src={linkedProduct.imageUrl}
              alt=""
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `color-mix(in srgb, ${EMBER} 22%, ${SURFACE_ALT})`,
                color: EMBER,
                flexShrink: 0,
              }}
            >
              <Link2 size={15} strokeWidth={2} aria-hidden="true" />
            </div>
          )}

          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1.35,
                  color: TEXT,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={linkedProduct.name}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 18,
                    height: 18,
                    borderRadius: 12,
                    background: `color-mix(in srgb, ${EMBER} 18%, ${SURFACE_ALT})`,
                    color: EMBER,
                    flexShrink: 0,
                  }}
                >
                  <Link2 size={10} strokeWidth={2.1} aria-hidden="true" />
                </span>
                {linkedProduct.name}
              </span>
            </div>
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  lineHeight: 1.2,
                  fontWeight: 700,
                  color: statusColor(linkedProduct.status),
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                }}
              >
                {linkedProduct.status === 'published'
                  ? 'Publicado'
                  : linkedProduct.status === 'affiliate'
                    ? 'Afiliado'
                    : 'Rascunho'}
              </span>
              {linkedProduct.subtitle ? (
                <span
                  style={{
                    fontSize: 11,
                    lineHeight: 1.2,
                    color: MUTED_2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={linkedProduct.subtitle}
                >
                  {linkedProduct.subtitle}
                </span>
              ) : null}
            </div>
          </div>

          <RemoveIconButton
            label={`Remover vínculo com ${linkedProduct.name}`}
            onClick={onRemoveLinkedProduct}
          />
        </div>
      ) : null}
    </div>
  );
}
