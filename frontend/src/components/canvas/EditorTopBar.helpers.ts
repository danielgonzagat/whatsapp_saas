import type { MouseEvent as ReactMouseEvent } from 'react';

export interface ResizePreset {
  l: string;
  w: number;
  h: number;
}

type AnyMouseEvent =
  | ReactMouseEvent<Element, MouseEvent>
  | ReactMouseEvent<HTMLElement, MouseEvent>;

export const RESIZE_PRESETS: readonly ResizePreset[] = Object.freeze([
  { l: 'Post Instagram (4:5)', w: 1080, h: 1350 },
  { l: 'Story Instagram', w: 1080, h: 1920 },
  { l: 'Post Facebook', w: 1200, h: 628 },
  { l: 'Post LinkedIn', w: 1200, h: 627 },
  { l: 'Miniatura YouTube', w: 1280, h: 720 },
  { l: 'Quadrado', w: 1080, h: 1080 },
]);

export type DropdownId = 'file' | 'resize' | 'edit' | null;

export function setRowBackground(event: AnyMouseEvent, color: string): void {
  (event.currentTarget as HTMLElement).style.background = color;
}

export function parseCustomDimensions(
  w: string,
  h: string,
): { width: number; height: number } | null {
  const width = Number.parseInt(w, 10);
  const height = Number.parseInt(h, 10);
  if (!(width > 0) || !(height > 0)) {
    return null;
  }
  return { width, height };
}
