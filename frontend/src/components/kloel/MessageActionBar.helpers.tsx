'use client';

import { useEffect, useRef, useState } from 'react';

/** Action icon type. */
export type ActionIcon = 'copy' | 'edit' | 'retry' | 'thumbsUp' | 'thumbsDown';

interface MessageIconProps {
  icon: ActionIcon | 'check';
  stroke: string;
  active?: boolean;
  activeFill: string;
}

/** Message icon. */
export function MessageIcon({ icon, stroke, active = false, activeFill }: MessageIconProps) {
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
        <svg {...common} aria-hidden="true">
          <rect x="6.1" y="5.9" width="8.4" height="9" rx="1.8" />
          <path d="M4.5 11.4H3.8a1.8 1.8 0 0 1-1.8-1.8V3.8A1.8 1.8 0 0 1 3.8 2h5.8A1.8 1.8 0 0 1 11.4 3.8v.7" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common} aria-hidden="true">
          <polyline points="3.4 9.5 7.1 12.8 14.6 5.2" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M10.8 3.1l4.1 4.1" />
          <path d="M4 14l2.7-.6 7-7a1.7 1.7 0 1 0-2.4-2.4l-7 7L4 14z" />
        </svg>
      );
    case 'retry':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M14.4 7.3A5.8 5.8 0 0 0 4.1 5.9" />
          <path d="M3.8 2.8v3.7h3.7" />
          <path d="M3.6 10.7a5.8 5.8 0 0 0 10.3 1.5" />
          <path d="M14.2 15.2v-3.7h-3.7" />
        </svg>
      );
    case 'thumbsUp':
      return (
        <svg {...common} aria-hidden="true">
          <path
            d="M6.2 7.3V15H3.8A1.8 1.8 0 0 1 2 13.2V9.1a1.8 1.8 0 0 1 1.8-1.8h2.4Z"
            fill={active ? activeFill : 'none'}
          />
          <path
            d="M6.2 7.3 8.7 2.9c.3-.6 1.1-.8 1.7-.5.5.3.8.9.7 1.5l-.5 3.4h3a1.8 1.8 0 0 1 1.8 2l-.8 4.7a1.8 1.8 0 0 1-1.8 1.5H6.2Z"
            fill={active ? activeFill : 'none'}
          />
        </svg>
      );
    case 'thumbsDown':
      return (
        <svg {...common} aria-hidden="true">
          <path
            d="M6.2 10.7V3H3.8A1.8 1.8 0 0 0 2 4.8v4.1a1.8 1.8 0 0 0 1.8 1.8h2.4Z"
            fill={active ? activeFill : 'none'}
          />
          <path
            d="M6.2 10.7 8.7 15.1c.3.6 1.1.8 1.7.5.5-.3.8-.9.7-1.5l-.5-3.4h3a1.8 1.8 0 0 0 1.8-2l-.8-4.7A1.8 1.8 0 0 0 12.8 3H6.2Z"
            fill={active ? activeFill : 'none'}
          />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Tracks whether the device supports hover + fine pointer. Used to decide
 * whether the action bar needs to stay visible (touch) or can hide until
 * hover (mouse).
 */
export function useCanHover(): boolean {
  const [canHover, setCanHover] = useState(true);

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

  return canHover;
}

/**
 * Controls a single tooltip id with a delayed reveal and immediate hide.
 * Cleans up on unmount.
 */
export function useTooltipController() {
  const [tooltipId, setTooltipId] = useState<string | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  const showTooltip = (id: string) => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
    }
    tooltipTimerRef.current = setTimeout(() => setTooltipId(id), 300);
  };

  const hideTooltip = () => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
    }
    setTooltipId(null);
  };

  return { tooltipId, showTooltip, hideTooltip } as const;
}

/** Resolve icon stroke. */
export function resolveIconStroke(params: {
  disabled: boolean;
  active: boolean;
  hovered: boolean;
  focused: boolean;
  embeColor: string;
  secondaryColor: string;
  disabledColor: string;
}): string {
  const { disabled, active, hovered, focused, embeColor, secondaryColor, disabledColor } = params;
  if (disabled) {
    return disabledColor;
  }
  if (active) {
    return embeColor;
  }
  if (hovered || focused) {
    return embeColor;
  }
  return secondaryColor;
}
