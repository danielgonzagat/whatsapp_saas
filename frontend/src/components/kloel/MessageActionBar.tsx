'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { colors } from '@/lib/design-tokens';
import {
  MessageIcon,
  resolveIconStroke,
  useCanHover,
  useTooltipController,
  type ActionIcon,
} from './MessageActionBar.helpers';

/** Message action bar item shape. */
export interface MessageActionBarItem {
  /** Id property. */
  id: string;
  /** Label property. */
  label: string;
  /** Icon property. */
  icon: ActionIcon;
  /** On click property. */
  onClick: () => void | Promise<void>;
  /** Active property. */
  active?: boolean;
  /** Disabled property. */
  disabled?: boolean;
}

interface MessageActionBarProps {
  content: string;
  actions: MessageActionBarItem[];
  align?: 'left' | 'right';
  visible?: boolean;
  copyLabel?: string;
}

const EMBER = colors.ember.primary;
const TEXT_PRIMARY = 'var(--app-text-primary, #FFFFFF)'; // PULSE_VISUAL_OK: CSS var fallback
const TEXT_SECONDARY = 'var(--app-text-secondary, #8A8A8E)'; // PULSE_VISUAL_OK: CSS var fallback
const TOOLTIP_BG = 'var(--app-bg-tertiary, #1A1A1E)'; // PULSE_VISUAL_OK: CSS var fallback
const DISABLED_STROKE = '#4B4B50'; // PULSE_VISUAL_OK: disabled icon stroke

/** Message action bar. */
export function MessageActionBar({
  content,
  actions,
  align = 'left',
  visible = true,
  copyLabel = 'Copiar',
}: MessageActionBarProps) {
  const [copied, setCopied] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const [focusedAction, setFocusedAction] = useState<string | null>(null);
  const canHover = useCanHover();
  const { tooltipId, showTooltip, hideTooltip } = useTooltipController();
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
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
          const stroke = resolveIconStroke({
            disabled: isDisabled,
            active: isActive,
            hovered: isHovered,
            focused: isFocused,
            embeColor: EMBER,
            secondaryColor: TEXT_SECONDARY,
            disabledColor: DISABLED_STROKE,
          });

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
                  minWidth: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0,
                  borderRadius: 6,
                  border: 'none',
                  background: 'transparent',
                  color: stroke,
                  cursor: isDisabled ? 'default' : 'pointer',
                  outline: isFocused ? `1px solid ${EMBER}` : 'none',
                  outlineOffset: 1,
                  transition: 'color 150ms ease, outline-color 150ms ease',
                  padding: 0,
                }}
              >
                <MessageIcon
                  icon={isCopy && copied ? 'check' : action.icon}
                  stroke={stroke}
                  active={isActive}
                  activeFill={EMBER}
                />
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
                    border: '1px solid colors.border.space', // PULSE_VISUAL_OK: tooltip border, matches design border.space
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
