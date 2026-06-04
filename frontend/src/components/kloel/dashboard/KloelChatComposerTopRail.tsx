'use client';

import { kloelT } from '@/lib/i18n/t';
import {
  InlineStatus,
  OverlayStatus,
  RemoveIconButton,
} from '@/components/kloel/dashboard/KloelChatComposerSurfaceParts';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { type KloelChatAttachment, type KloelLinkedProduct } from '@/lib/kloel-chat';
import { FileText, ImagePlus, Link2, Music4 } from 'lucide-react';
import Image from 'next/image';

const F = "'Sora', sans-serif";
const SURFACE = KLOEL_THEME.bgCard;
const SURFACE_ALT = KLOEL_THEME.bgSecondary;
const TEXT = KLOEL_THEME.textPrimary;
const MUTED = KLOEL_THEME.textSecondary;
const MUTED_2 = KLOEL_THEME.textTertiary;
const DIVIDER = KLOEL_THEME.borderPrimary;
const EMBER = KLOEL_THEME.accent;

function attachmentIcon(kind: KloelChatAttachment['kind']) {
  if (kind === 'image') {
    return <ImagePlus size={14} strokeWidth={1.8} aria-hidden="true" />;
  }
  if (kind === 'audio') {
    return <Music4 size={14} strokeWidth={1.8} aria-hidden="true" />;
  }
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

interface ComposerTopRailProps {
  attachments: KloelChatAttachment[];
  linkedProduct: KloelLinkedProduct | null;
  onRemoveAttachment: (attachmentId: string) => void;
  onRetryAttachment: (attachmentId: string) => void;
  onRemoveLinkedProduct: () => void;
}

/** Composer top rail. */
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
        gap: 5,
        paddingBottom: 5,
        marginBottom: 7,
      }}
    >
      {attachments.map((attachment) => {
        const visualSource = resolveVisualAttachmentSource(attachment);

        return visualSource ? (
          <div
            key={attachment.id}
            style={{
              position: 'relative',
              width: 48,
              height: 48,
              padding: 0,
              borderRadius: 6,
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
                <Image
                  src={visualSource}
                  alt={attachment.name}
                  width={48}
                  height={48}
                  unoptimized
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
              gap: 8,
              maxWidth: 240,
              minHeight: 40,
              padding: '6px 30px 6px 8px',
              borderRadius: 6,
              border: `1px solid ${DIVIDER}`,
              background: SURFACE_ALT,
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
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
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1.25,
                  color: TEXT,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={attachment.name}
              >
                {attachment.name}
              </div>
              {attachment.status !== 'ready' ? (
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 10.5,
                    lineHeight: 1.15,
                    color: MUTED_2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {attachment.status === 'error'
                    ? attachment.error || 'Falha no upload'
                    : 'Enviando'}
                </div>
              ) : null}
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
                  {kloelT(`Tentar novamente`)}
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
            gap: 8,
            maxWidth: 280,
            minHeight: 40,
            padding: '6px 30px 6px 8px',
            borderRadius: 6,
            border: `1px solid color-mix(in srgb, ${EMBER} 12%, ${DIVIDER})`,
            background: `color-mix(in srgb, ${EMBER} 5%, ${SURFACE})`,
          }}
        >
          {linkedProduct.imageUrl ? (
            <Image
              src={linkedProduct.imageUrl}
              alt=""
              width={26}
              height={26}
              unoptimized
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `color-mix(in srgb, ${EMBER} 22%, ${SURFACE_ALT})`,
                color: EMBER,
                flexShrink: 0,
              }}
            >
              <Link2 size={13} strokeWidth={2} aria-hidden="true" />
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
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1.25,
                  color: TEXT,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={linkedProduct.name}
              >
                {linkedProduct.name}
              </span>
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
