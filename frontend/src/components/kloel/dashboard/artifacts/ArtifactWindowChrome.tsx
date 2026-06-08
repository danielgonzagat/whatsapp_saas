'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { KLOEL_THEME } from '@/lib/kloel-theme';

/**
 * Faithful reuse of the Kloel macOS-style floating window chrome (the same
 * pattern as `KloelGraphOverlay`): a draggable/resizable panel over a dimmed
 * backdrop with traffic-light controls — top-LEFT ember-red closes, top-RIGHT
 * emerald-green toggles fullscreen, bottom-right grip resizes (desktop only).
 *
 * This is the artifacts-track copy so the panel never couples to the graph
 * route model (`KloelGraphNode`/`getKloelGraphOverlayLabel`). The window
 * mechanics, control hues and clamping constants match the graph overlay
 * exactly so the affordance reads identically — the visual identity is
 * preserved, not restyled.
 */

const WINDOW_MIN_WIDTH = 360;
const WINDOW_MIN_HEIGHT = 280;
const VIEWPORT_MARGIN = 24;
const DEFAULT_WIDTH_RATIO = 0.6;
const DEFAULT_HEIGHT_RATIO = 0.8;
const DEFAULT_MAX_WIDTH = 920;
const DEFAULT_MAX_HEIGHT = 900;

// macOS traffic-light hues, tuned to the warm Kloel palette (identical to the
// graph overlay): ember-red close, emerald-green fullscreen.
const CLOSE_FILL = '#E85D30';
const CLOSE_BORDER = '#C44A22';
const GREEN_FILL = '#2DBE76';
const GREEN_BORDER = '#1FA862';

interface WindowRect {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
}

interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

function readViewportSize(): ViewportSize {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 800 };
  }
  return { width: window.innerWidth || 1280, height: window.innerHeight || 800 };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function computeDefaultRect(viewport: ViewportSize): WindowRect {
  const maxWidth = Math.min(DEFAULT_MAX_WIDTH, viewport.width - VIEWPORT_MARGIN);
  const maxHeight = Math.min(DEFAULT_MAX_HEIGHT, viewport.height - VIEWPORT_MARGIN);
  const width = clamp(viewport.width * DEFAULT_WIDTH_RATIO, WINDOW_MIN_WIDTH, maxWidth);
  const height = clamp(viewport.height * DEFAULT_HEIGHT_RATIO, WINDOW_MIN_HEIGHT, maxHeight);
  return {
    width,
    height,
    // Anchor to the right edge so the artifact reads as a side panel over chat.
    left: Math.max(viewport.width - width - VIEWPORT_MARGIN, VIEWPORT_MARGIN / 2),
    top: Math.max((viewport.height - height) / 2, VIEWPORT_MARGIN / 2),
  };
}

function clampRectToViewport(rect: WindowRect, viewport: ViewportSize): WindowRect {
  const maxWidth = Math.max(WINDOW_MIN_WIDTH, viewport.width - VIEWPORT_MARGIN);
  const maxHeight = Math.max(WINDOW_MIN_HEIGHT, viewport.height - VIEWPORT_MARGIN);
  const width = clamp(rect.width, WINDOW_MIN_WIDTH, maxWidth);
  const height = clamp(rect.height, WINDOW_MIN_HEIGHT, maxHeight);
  const left = clamp(
    rect.left,
    VIEWPORT_MARGIN / 2,
    Math.max(viewport.width - width - VIEWPORT_MARGIN / 2, VIEWPORT_MARGIN / 2),
  );
  const top = clamp(
    rect.top,
    VIEWPORT_MARGIN / 2,
    Math.max(viewport.height - height - VIEWPORT_MARGIN / 2, VIEWPORT_MARGIN / 2),
  );
  return { width, height, left, top };
}

function CloseGlyph({ color }: { readonly color: string }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <path d="M1 1L7 7M7 1L1 7" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ExpandGlyph({ color }: { readonly color: string }) {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
      <path
        d="M5.2 0.8H8.2V3.8M3.8 8.2H0.8V5.2"
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RestoreGlyph({ color }: { readonly color: string }) {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
      <path
        d="M8 1L5 4M5 4V1.5M5 4H7.5M1 8L4 5M4 5V7.5M4 5H1.5"
        fill="none"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ResizeGripGlyph({ color }: { readonly color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M13 7L7 13M13 11L11 13"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

function TrafficLight({
  glyph,
  label,
  onActivate,
  fill,
  border,
  glyphColor,
}: {
  readonly glyph: 'close' | 'fullscreen' | 'restore';
  readonly label: string;
  readonly onActivate: () => void;
  readonly fill: string;
  readonly border: string;
  readonly glyphColor: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onActivate}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        width: 14,
        height: 14,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        background: fill,
        border: `0.5px solid ${border}`,
        cursor: 'pointer',
        lineHeight: 0,
        transition: 'filter .15s ease',
        filter: hovered ? 'brightness(0.92)' : 'none',
        boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.06)',
      }}
    >
      <span
        aria-hidden="true"
        style={{ opacity: hovered ? 1 : 0, transition: 'opacity .12s ease', display: 'flex' }}
      >
        {glyph === 'close' ? (
          <CloseGlyph color={glyphColor} />
        ) : glyph === 'restore' ? (
          <RestoreGlyph color={glyphColor} />
        ) : (
          <ExpandGlyph color={glyphColor} />
        )}
      </span>
    </button>
  );
}

/** A floating macOS-style window hosting arbitrary artifact content. */
export function ArtifactWindowChrome({
  ariaLabel,
  header,
  children,
  onClose,
}: {
  readonly ariaLabel: string;
  /** Optional inline header content rendered between the two traffic lights. */
  readonly header?: ReactNode;
  readonly children: ReactNode;
  readonly onClose: () => void;
}) {
  const { isMobile } = useResponsiveViewport();
  const [rect, setRect] = useState<WindowRect>(() => computeDefaultRect(readViewportSize()));
  const [fullscreen, setFullscreen] = useState(false);
  const dragStateRef = useRef<{
    readonly mode: 'move' | 'resize';
    readonly pointerId: number;
    readonly originX: number;
    readonly originY: number;
    readonly startRect: WindowRect;
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const sync = () => {
      const next = readViewportSize();
      setRect((current) => clampRectToViewport(current, next));
    };
    sync();
    window.addEventListener('resize', sync, { passive: true });
    return () => window.removeEventListener('resize', sync);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleFullscreen = useCallback(() => {
    setFullscreen((current) => !current);
  }, []);

  const onPointerMove = useCallback((event: globalThis.PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const deltaX = event.clientX - drag.originX;
    const deltaY = event.clientY - drag.originY;
    const currentViewport = readViewportSize();
    if (drag.mode === 'move') {
      setRect(
        clampRectToViewport(
          { ...drag.startRect, left: drag.startRect.left + deltaX, top: drag.startRect.top + deltaY },
          currentViewport,
        ),
      );
      return;
    }
    setRect(
      clampRectToViewport(
        {
          ...drag.startRect,
          width: drag.startRect.width + deltaX,
          height: drag.startRect.height + deltaY,
        },
        currentViewport,
      ),
    );
  }, []);

  const endDrag = useCallback(() => {
    dragStateRef.current = null;
    if (typeof window === 'undefined') {
      return;
    }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
  }, [onPointerMove]);

  useEffect(() => endDrag, [endDrag]);

  const beginDrag = useCallback(
    (dragMode: 'move' | 'resize', event: ReactPointerEvent) => {
      if (isMobile || fullscreen) {
        return;
      }
      event.preventDefault();
      dragStateRef.current = {
        mode: dragMode,
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        startRect: rect,
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    },
    [endDrag, fullscreen, isMobile, onPointerMove, rect],
  );

  const windowed = !isMobile && !fullscreen;
  const fillsViewport = isMobile || fullscreen;

  const panelStyle: CSSProperties = fillsViewport
    ? { position: 'fixed', inset: isMobile ? 0 : VIEWPORT_MARGIN / 2, width: 'auto', height: 'auto' }
    : { position: 'fixed', left: rect.left, top: rect.top, width: rect.width, height: rect.height };

  const glyphColor = 'rgba(0,0,0,0.6)';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.12)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
      }}
    >
      <section
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          ...panelStyle,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: `1px solid ${KLOEL_THEME.borderPrimary}`,
          borderRadius: fillsViewport && isMobile ? 0 : 12,
          background: KLOEL_THEME.bgPrimary,
          boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
          maxWidth: '100vw',
          maxHeight: '100vh',
        }}
      >
        <div
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('[data-window-control]')) {
              return;
            }
            beginDrag('move', event);
          }}
          style={{
            position: 'relative',
            flex: '0 0 auto',
            height: 36,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 12px',
            cursor: windowed ? 'grab' : 'default',
            background: KLOEL_THEME.bgSecondary,
            borderBottom: `1px solid ${KLOEL_THEME.borderPrimary}`,
            zIndex: 2,
            touchAction: 'none',
          }}
        >
          <span data-window-control style={{ display: 'flex' }}>
            <TrafficLight
              glyph="close"
              label="Fechar artefato"
              onActivate={onClose}
              fill={CLOSE_FILL}
              border={CLOSE_BORDER}
              glyphColor={glyphColor}
            />
          </span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>{header}</div>
          <span data-window-control style={{ display: 'flex' }}>
            <TrafficLight
              glyph={fullscreen ? 'restore' : 'fullscreen'}
              label={fullscreen ? 'Restaurar janela' : 'Expandir janela'}
              onActivate={toggleFullscreen}
              fill={GREEN_FILL}
              border={GREEN_BORDER}
              glyphColor={glyphColor}
            />
          </span>
        </div>
        <div
          style={{
            position: 'relative',
            flex: '1 1 auto',
            minHeight: 0,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </div>
        {windowed ? (
          <button
            type="button"
            data-window-control
            aria-label="Redimensionar janela"
            title="Redimensionar"
            onPointerDown={(event) => beginDrag('resize', event)}
            style={{
              position: 'absolute',
              right: 2,
              bottom: 2,
              width: 18,
              height: 18,
              padding: 0,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              border: 'none',
              background: 'transparent',
              color: KLOEL_THEME.textTertiary,
              cursor: 'nwse-resize',
              zIndex: 3,
              touchAction: 'none',
            }}
          >
            <ResizeGripGlyph color={KLOEL_THEME.textTertiary} />
          </button>
        ) : null}
      </section>
    </div>
  );
}
