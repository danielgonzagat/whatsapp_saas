'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type ActionIcon = 'copy' | 'edit' | 'retry' | 'thumbsUp' | 'thumbsDown';

export interface MessageActionBarItem {
  id: string;
  label: string;
  icon: ActionIcon;
  onClick: () => void | Promise<void>;
  active?: boolean;
  disabled?: boolean;
}

interface MessageActionBarProps {
  content: string;
  actions: MessageActionBarItem[];
  align?: 'left' | 'right';
  visible?: boolean;
  copyLabel?: string;
  showLabels?: boolean;
}

const EMBER = '#E85D30';
const TEXT_PRIMARY = 'var(--app-text-primary, #FFFFFF)';
const TEXT_SECONDARY = 'var(--app-text-secondary, #8A8A8E)';
const TOOLTIP_BG = 'var(--app-bg-tertiary, #1A1A1E)';

function MessageIcon({ icon, stroke }: { icon: ActionIcon | 'check'; stroke: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 18 18',
    fill: 'none',
    stroke,
    strokeWidth: 1.65,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (icon) {
    case 'copy':
      return (
        <svg {...common}>
          <rect x="6.1" y="5.9" width="8.4" height="9" rx="1.8" />
          <path d="M4.5 11.4H3.8a1.8 1.8 0 0 1-1.8-1.8V3.8A1.8 1.8 0 0 1 3.8 2h5.8A1.8 1.8 0 0 1 11.4 3.8v.7" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <polyline points="3.4 9.5 7.1 12.8 14.6 5.2" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...common}>
          <path d="M10.8 3.1l4.1 4.1" />
          <path d="M4 14l2.7-.6 7-7a1.7 1.7 0 1 0-2.4-2.4l-7 7L4 14z" />
        </svg>
      );
    case 'retry':
      return (
        <svg {...common}>
          <path d="M14.4 7.3A5.8 5.8 0 0 0 4.1 5.9" />
          <path d="M3.8 2.8v3.7h3.7" />
          <path d="M3.6 10.7a5.8 5.8 0 0 0 10.3 1.5" />
          <path d="M14.2 15.2v-3.7h-3.7" />
        </svg>
      );
    case 'thumbsUp':
      return (
        <svg {...common}>
          <path d="M6.2 7.3V15H3.8A1.8 1.8 0 0 1 2 13.2V9.1a1.8 1.8 0 0 1 1.8-1.8h2.4z" />
          <path d="M6.2 7.3 8.7 2.9c.3-.6 1.1-.8 1.7-.5.5.3.8.9.7 1.5l-.5 3.4h3a1.8 1.8 0 0 1 1.8 2l-.8 4.7a1.8 1.8 0 0 1-1.8 1.5H6.2" />
        </svg>
      );
    case 'thumbsDown':
      return (
        <svg {...common}>
          <path d="M6.2 10.7V3H3.8A1.8 1.8 0 0 0 2 4.8v4.1a1.8 1.8 0 0 0 1.8 1.8h2.4z" />
          <path d="M6.2 10.7 8.7 15.1c.3.6 1.1.8 1.7.5.5-.3.8-.9.7-1.5l-.5-3.4h3a1.8 1.8 0 0 0 1.8-2l-.8-4.7A1.8 1.8 0 0 0 12.8 3H6.2" />
        </svg>
      );
    default:
      return null;
  }
}

export function MessageActionBar({
  content,
  actions,
  align = 'left',
  visible = true,
  copyLabel = 'Copiar',
  showLabels = false,
}: MessageActionBarProps) {
  const [copied, setCopied] = useState(false);
  const [tooltipId, setTooltipId] = useState<string | null>(null);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const [focusedAction, setFocusedAction] = useState<string | null>(null);
  const [canHover, setCanHover] = useState(true);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setCanHover(media.matches);

    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const resolvedVisible = visible || !canHover;

  const items = useMemo<MessageActionBarItem[]>(
    () => [
      {
        id: 'copy',
        label: copyLabel,
        icon: 'copy',
        onClick: async () => {
          await navigator.clipboard.writeText(content);
        },
      },
      ...actions,
    ],
    [actions, content, copyLabel],
  );

  const showTooltip = (id: string) => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
    }

    tooltipTimerRef.current = setTimeout(() => {
      setTooltipId(id);
    }, 300);
  };

  const hideTooltip = () => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
    }
    setTooltipId(null);
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        marginTop: 8,
        minHeight: 28,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          opacity: resolvedVisible ? 1 : 0,
          pointerEvents: resolvedVisible ? 'auto' : 'none',
          transition: 'opacity 150ms ease-in-out',
        }}
      >
        {items.map((action) => {
          const isCopy = action.id === 'copy';
          const isHovered = hoveredAction === action.id;
          const isFocused = focusedAction === action.id;
          const isActive = Boolean(action.active);
          const isDisabled = Boolean(action.disabled);
          const stroke = isDisabled
            ? '#4B4B50'
            : isActive
              ? EMBER
              : isHovered || isFocused
                ? EMBER
                : TEXT_SECONDARY;

          return (
            <div key={action.id} style={{ position: 'relative' }}>
              <button
                type="button"
                aria-label={action.label}
                tabIndex={0}
                disabled={isDisabled}
                onMouseEnter={() => {
                  setHoveredAction(action.id);
                  showTooltip(action.id);
                }}
                onMouseLeave={() => {
                  setHoveredAction((current) => (current === action.id ? null : current));
                  hideTooltip();
                }}
                onFocus={() => {
                  setFocusedAction(action.id);
                  showTooltip(action.id);
                }}
                onBlur={() => {
                  setFocusedAction((current) => (current === action.id ? null : current));
                  hideTooltip();
                }}
                onClick={async () => {
                  hideTooltip();
                  await action.onClick();

                  if (isCopy) {
                    if (copiedTimerRef.current) {
                      clearTimeout(copiedTimerRef.current);
                    }
                    setCopied(true);
                    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
                  }
                }}
                style={{
                  minWidth: showLabels ? 'auto' : 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: showLabels ? 6 : 0,
                  borderRadius: 6,
                  border: `1px solid ${isActive ? `${EMBER}33` : 'transparent'}`,
                  background: 'transparent',
                  color: stroke,
                  cursor: isDisabled ? 'default' : 'pointer',
                  outline: isFocused ? `1px solid ${EMBER}` : 'none',
                  outlineOffset: 1,
                  transition: 'color 150ms ease, border-color 150ms ease, outline-color 150ms ease',
                  padding: showLabels ? '0 10px' : 0,
                }}
              >
                <MessageIcon icon={isCopy && copied ? 'check' : action.icon} stroke={stroke} />
                {showLabels ? (
                  <span
                    style={{
                      fontFamily: "var(--font-sora), 'Sora', sans-serif",
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 500,
                      lineHeight: 1,
                      color: stroke,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {action.label}
                  </span>
                ) : null}
              </button>

              {tooltipId === action.id ? (
                <div
                  role="tooltip"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: 'calc(100% + 8px)',
                    transform: 'translateX(-50%)',
                    background: TOOLTIP_BG,
                    color: TEXT_PRIMARY,
                    fontFamily: "var(--font-sora), 'Sora', sans-serif",
                    fontSize: 12,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid #222226',
                    boxShadow: `0 12px 28px rgba(0, 0, 0, 0.35)`,
                    zIndex: 5,
                    opacity: 1,
                    transition: 'opacity 150ms ease',
                  }}
                >
                  {action.label}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
