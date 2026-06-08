'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import {
  CLOSE_BORDER,
  CLOSE_FILL,
  GREEN_BORDER,
  GREEN_FILL,
  ResizeGripGlyph,
  TrafficLight,
} from './ArtifactWindowChrome.controls';
import {
  VIEWPORT_MARGIN,
  clampRectToViewport,
  computeDefaultRect,
  readViewportSize,
  type WindowRect,
} from './ArtifactWindowChrome.geometry';

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

  const endDrag = useCallback(
    function handleEndDrag() {
      dragStateRef.current = null;
      if (typeof window === 'undefined') {
        return;
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', handleEndDrag);
      window.removeEventListener('pointercancel', handleEndDrag);
    },
    [onPointerMove],
  );

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
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
            {header}
          </div>
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
