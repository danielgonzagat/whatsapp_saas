'use client';

import { ErrorBoundary } from '@/components/kloel/ErrorBoundary';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { Grip } from 'lucide-react';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getKloelGraphOverlayLabel } from './KloelGraph.routes';
import type { KloelGraphNode } from './KloelGraph.routes';
import { useGraphTheme } from './KloelGraphTheme';
import { TrafficLight } from './KloelGraphWindowControls';

const WINDOW_MIN_WIDTH = 360;
const WINDOW_MIN_HEIGHT = 280;
const VIEWPORT_MARGIN = 24;
const DEFAULT_WIDTH_RATIO = 0.8;
const DEFAULT_HEIGHT_RATIO = 0.8;
const DEFAULT_MAX_WIDTH = 1320;
const DEFAULT_MAX_HEIGHT = 900;

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
  return {
    width: window.innerWidth || 1280,
    height: window.innerHeight || 800,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/** Centered default window rect, clamped to the current viewport. */
function computeDefaultRect(viewport: ViewportSize): WindowRect {
  const maxWidth = Math.min(DEFAULT_MAX_WIDTH, viewport.width - VIEWPORT_MARGIN);
  const maxHeight = Math.min(DEFAULT_MAX_HEIGHT, viewport.height - VIEWPORT_MARGIN);
  const width = clamp(viewport.width * DEFAULT_WIDTH_RATIO, WINDOW_MIN_WIDTH, maxWidth);
  const height = clamp(viewport.height * DEFAULT_HEIGHT_RATIO, WINDOW_MIN_HEIGHT, maxHeight);
  return {
    width,
    height,
    left: Math.max((viewport.width - width) / 2, VIEWPORT_MARGIN / 2),
    top: Math.max((viewport.height - height) / 2, VIEWPORT_MARGIN / 2),
  };
}

/** Re-clamp a stored rect into the current viewport so resizing never breaks layout. */
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

export function KloelGraphOverlay({
  activeNode,
  children,
  onClose,
}: {
  readonly activeNode: KloelGraphNode | undefined;
  readonly children: ReactNode;
  readonly onClose: () => void;
}) {
  const { C, mode } = useGraphTheme();
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
          {
            ...drag.startRect,
            left: drag.startRect.left + deltaX,
            top: drag.startRect.top + deltaY,
          },
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

  const endDrag = useCallback(function handleEndDrag() {
    dragStateRef.current = null;
    if (typeof window === 'undefined') {
      return;
    }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', handleEndDrag);
    window.removeEventListener('pointercancel', handleEndDrag);
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
    ? {
        position: 'fixed',
        inset: isMobile ? 0 : VIEWPORT_MARGIN / 2,
        width: 'auto',
        height: 'auto',
      }
    : {
        position: 'fixed',
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };

  const glyphColor = mode === 'light' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.6)';
  // macOS traffic-light hues, tuned to the warm Kloel palette: ember-red close,
  // emerald-green fullscreen. These are deliberate fixed control hues (not theme
  // tokens) so the affordance reads as a window control in both light and dark.
  const closeFill = KLOEL_THEME.error;
  const closeBorder = KLOEL_THEME.error;
  const greenFill = KLOEL_THEME.success;
  const greenBorder = KLOEL_THEME.success;

  return (
    <div
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
        aria-label={getKloelGraphOverlayLabel(activeNode)}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          ...panelStyle,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: `1px solid ${C.divider}`,
          borderRadius: fillsViewport && isMobile ? 0 : 12,
          background: 'var(--bg-void, #0A0A0C)',
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
            justifyContent: 'space-between',
            padding: '0 12px',
            cursor: windowed ? 'grab' : 'default',
            // Transparent chrome bar so the inner screen stays edge-to-edge in feel;
            // the controls float on top of the screen surface.
            background: 'transparent',
            zIndex: 2,
            touchAction: 'none',
          }}
        >
          <span data-window-control>
            <TrafficLight
              glyph="close"
              label="Fechar overlay do grafo"
              onActivate={onClose}
              fill={closeFill}
              border={closeBorder}
              glyphColor={glyphColor}
            />
          </span>
          <span data-window-control>
            <TrafficLight
              glyph={fullscreen ? 'restore' : 'fullscreen'}
              label={fullscreen ? 'Restaurar janela' : 'Expandir janela'}
              onActivate={toggleFullscreen}
              fill={greenFill}
              border={greenBorder}
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
            // Pull the screen up under the chrome bar so the panel keeps its
            // "almost invisible" full-bleed look while the controls float on top.
            marginTop: -36,
            paddingTop: 36,
          }}
        >
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
        {windowed && (
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
              color: C.dim,
              cursor: 'nwse-resize',
              zIndex: 3,
              touchAction: 'none',
            }}
          >
            <Grip size={14} strokeWidth={1.4} color={C.dim} aria-hidden="true" />
          </button>
        )}
      </section>
    </div>
  );
}
