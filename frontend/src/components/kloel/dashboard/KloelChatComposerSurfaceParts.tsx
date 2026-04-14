'use client';

import { PulseLoader } from '@/components/kloel/PulseLoader';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { type KloelChatAttachment } from '@/lib/kloel-chat';
import { X } from 'lucide-react';
import { type MouseEvent as ReactMouseEvent, type ReactNode, useState } from 'react';

const F = "'Sora', sans-serif";
const TEXT = KLOEL_THEME.textPrimary;
const MUTED = KLOEL_THEME.textSecondary;
const MUTED_2 = KLOEL_THEME.textTertiary;
const ERROR = KLOEL_THEME.error;
const ERROR_BG = KLOEL_THEME.errorBg;
const HOVER = KLOEL_THEME.bgHover;
const OVERLAY = KLOEL_THEME.bgOverlay;
const SURFACE = KLOEL_THEME.bgCard;
const SURFACE_ELEVATED = KLOEL_THEME.bgElevated;

export function PopoverAction({
  icon,
  label,
  meta,
  trailing,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  meta?: string;
  trailing?: ReactNode | null;
  onClick: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        width: '100%',
        border: 'none',
        borderRadius: 8,
        background: isHovered ? HOVER : 'transparent',
        color: TEXT,
        padding: '11px 12px',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: F,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 140ms ease, color 140ms ease',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: MUTED }}>{icon}</span>
        {label}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: MUTED }}>
        {meta ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.01em',
              color: MUTED_2,
            }}
          >
            {meta}
          </span>
        ) : null}
        {trailing ? <span style={{ color: MUTED }}>{trailing}</span> : null}
      </span>
    </button>
  );
}

export function RemoveIconButton({
  label,
  onClick,
}: {
  label: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: 24,
        height: 24,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 12,
        background: OVERLAY,
        color: KLOEL_THEME.textInverse,
        cursor: 'pointer',
      }}
    >
      <X size={12} strokeWidth={2.2} />
    </button>
  );
}

export function OverlayStatus({ attachment }: { attachment: KloelChatAttachment }) {
  if (attachment.status === 'ready') return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          attachment.status === 'error'
            ? `color-mix(in srgb, ${ERROR_BG} 82%, ${SURFACE_ELEVATED})`
            : `color-mix(in srgb, ${SURFACE_ELEVATED} 62%, transparent)`,
        color: KLOEL_THEME.textInverse,
      }}
    >
      {attachment.status === 'uploading' ? (
        <PulseLoader width={28} height={18} />
      ) : (
        <X size={18} strokeWidth={2.2} />
      )}
    </div>
  );
}

export function InlineStatus({ attachment }: { attachment: KloelChatAttachment }) {
  if (attachment.status === 'ready') return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        right: 40,
        color: attachment.status === 'error' ? ERROR : MUTED,
      }}
    >
      {attachment.status === 'uploading' ? (
        <PulseLoader width={18} height={14} />
      ) : (
        <X size={14} strokeWidth={2.2} />
      )}
    </div>
  );
}
