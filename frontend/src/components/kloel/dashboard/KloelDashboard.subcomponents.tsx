'use client';

import { kloelT } from '@/lib/i18n/t';
import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { openCookiePreferences } from '@/components/kloel/cookies/CookieProvider';
import { KLOEL_CHAT_QUICK_ACTIONS } from '@/lib/kloel-chat';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, LayoutTemplate, Megaphone, PenLine, Search } from 'lucide-react';

export const S_RE = /\s+/;
export const F = "'Sora', sans-serif";
export const E = KLOEL_THEME.accent;
export const EMBER = KLOEL_THEME.accent;
export const V = KLOEL_THEME.bgPrimary;
export const TEXT = KLOEL_THEME.textPrimary;
export const MUTED = KLOEL_THEME.textSecondary;
export const MUTED_2 = KLOEL_THEME.textTertiary;
export const SURFACE = KLOEL_THEME.bgCard;
export const DIVIDER = KLOEL_THEME.borderPrimary;
export const CHAT_MAX_WIDTH = 760;
export const CHAT_INLINE_PADDING = 'clamp(16px, 3vw, 24px)';
export const CHAT_SAFE_BOTTOM = 'max(20px, env(safe-area-inset-bottom, 0px))';
export const CHAT_SCROLL_BOTTOM_SPACE = 56;
export const SLOW_HINT_DELAY_MS = 30_000;
export const MAX_ATTACHMENTS_PER_PROMPT = 10;

export type QuickActionIconName = (typeof KLOEL_CHAT_QUICK_ACTIONS)[number]['icon'];

export function DropOverlay() {
  return (
    <motion.div
      key="kloel-chat-drop-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      style={{
        position: 'absolute',
        inset: 16,
        zIndex: 40,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        border: `1px dashed color-mix(in srgb, ${EMBER} 55%, ${DIVIDER})`,
        background: `color-mix(in srgb, ${EMBER} 8%, ${V})`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${EMBER} 14%, transparent)`,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: '18px 22px',
          borderRadius: 14,
          background: `color-mix(in srgb, ${SURFACE} 88%, transparent)`,
          border: `1px solid color-mix(in srgb, ${EMBER} 16%, ${DIVIDER})`,
          color: TEXT,
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {kloelT(`Solte arquivos aqui para anexar`)}
        </span>
        <span style={{ fontSize: 12, lineHeight: 1.45, color: MUTED }}>
          {kloelT(`Imagens, documentos, PDFs, textos e áudios entram direto na ChatBar.`)}
        </span>
      </div>
    </motion.div>
  );
}

export function DashboardEmptyGreeting({ greetingLine }: { greetingLine: string }) {
  return (
    <motion.div
      key="kloel-empty-state"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 22,
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'clamp(14px, 2vw, 18px)',
        }}
      >
        <KloelMushroomVisual
          size={60}
          ariaHidden
          animated={false}
          spores="none"
          style={{
            width: 'clamp(48px, 4.8vw, 60px)',
            height: 'auto',
            display: 'block',
            flexShrink: 0,
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />

        <h1
          suppressHydrationWarning
          style={{
            fontSize: 'clamp(30px, 5vw, 42px)',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            margin: 0,
            color: TEXT,
            lineHeight: 1.02,
          }}
        >
          {greetingLine}
        </h1>
      </div>
    </motion.div>
  );
}

export function QuickActionIcon({ icon }: { icon: QuickActionIconName }) {
  const commonProps = {
    size: 14,
    strokeWidth: 2,
    'aria-hidden': true as const,
  };

  switch (icon) {
    case 'chart':
      return <BarChart3 {...commonProps} />;
    case 'layout':
      return <LayoutTemplate {...commonProps} />;
    case 'megaphone':
      return <Megaphone {...commonProps} />;
    case 'pen':
      return <PenLine {...commonProps} />;
    case 'search':
      return <Search {...commonProps} />;
    default:
      return null;
  }
}

export function ChatDisclaimer() {
  return (
    <motion.div
      key="kloel-chat-disclaimer"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={{
        margin: '12px auto 0',
        width: '100%',
        fontSize: 11,
        color: MUTED_2,
        lineHeight: 1.35,
        textAlign: 'center',
        letterSpacing: '-0.01em',
      }}
    >
      <span>{kloelT(`Kloel é uma IA e pode errar. Confira informações importantes.`)} </span>
      <button
        type="button"
        onClick={openCookiePreferences}
        style={{
          appearance: 'none',
          border: 'none',
          background: 'transparent',
          padding: 0,
          margin: 0,
          font: 'inherit',
          color: 'inherit',
          textDecoration: 'underline',
          textUnderlineOffset: '2px',
          cursor: 'pointer',
        }}
      >
        {kloelT(`Consulte as Preferências de cookies.`)}
      </button>
    </motion.div>
  );
}

export function ConversationHeaderBar({ title }: { title: string }) {
  return (
    <div style={{ width: '100%', flexShrink: 0 }}>
      <div
        style={{
          maxWidth: CHAT_MAX_WIDTH,
          width: '100%',
          margin: '0 auto',
          padding: `10px ${CHAT_INLINE_PADDING} 0`,
          boxSizing: 'border-box',
          minHeight: 54,
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--app-border-subtle)',
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: TEXT,
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </span>
      </div>
    </div>
  );
}

export function DashboardGlobalStyles() {
  return (
    <style>{`
        @keyframes kloel-stream-caret {
          0%, 49% {
            opacity: 1;
          }

          50%, 100% {
            opacity: 0.18;
          }
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }

        textarea::placeholder {
          color: ${MUTED};
        }

        ::-webkit-scrollbar {
          width: 4px;
        }

        ::-webkit-scrollbar-thumb {
          background: ${DIVIDER};
          border-radius: 14px;
        }
      `}</style>
  );
}
