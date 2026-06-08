const WINDOW_MIN_WIDTH = 360;
const WINDOW_MIN_HEIGHT = 280;
export const VIEWPORT_MARGIN = 24;
const DEFAULT_WIDTH_RATIO = 0.6;
const DEFAULT_HEIGHT_RATIO = 0.8;
const DEFAULT_MAX_WIDTH = 920;
const DEFAULT_MAX_HEIGHT = 900;

export interface WindowRect {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
}

interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export function readViewportSize(): ViewportSize {
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

export function computeDefaultRect(viewport: ViewportSize): WindowRect {
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

export function clampRectToViewport(rect: WindowRect, viewport: ViewportSize): WindowRect {
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
