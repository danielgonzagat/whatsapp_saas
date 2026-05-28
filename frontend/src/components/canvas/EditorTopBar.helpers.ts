import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { colors } from '@/lib/design-tokens';

/** Resize preset shape. */
export interface ResizePreset {
  /** L property. */
  l: string;
  /** W property. */
  w: number;
  /** H property. */
  h: number;
}

type AnyMouseEvent =
  | ReactMouseEvent<Element, MouseEvent>
  | ReactMouseEvent<HTMLElement, MouseEvent>;

/** Resize_presets. */
export const RESIZE_PRESETS: readonly ResizePreset[] = Object.freeze([
  { l: 'Post Instagram (4:5)', w: 1080, h: 1350 },
  { l: 'Story Instagram', w: 1080, h: 1920 },
  { l: 'Post Facebook', w: 1200, h: 628 },
  { l: 'Post LinkedIn', w: 1200, h: 627 },
  { l: 'Miniatura YouTube', w: 1280, h: 720 },
  { l: 'Quadrado', w: 1080, h: 1080 },
]);

/** Dropdown id type. */
export type DropdownId = 'file' | 'resize' | 'edit' | null;

/** Set row background. */
export function setRowBackground(event: AnyMouseEvent, color: string): void {
  (event.currentTarget as HTMLElement).style.background = color;
}

/** Parse custom dimensions. */
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

/**
 * Apply parsed custom dimensions through the optional callback.
 * Returns true when the callback was invoked, false on invalid input.
 */
export function applyCustomDimensions(
  w: string,
  h: string,
  onResize?: (width: number, height: number) => void,
): boolean {
  const dimensions = parseCustomDimensions(w, h);
  if (!dimensions) {
    return false;
  }
  onResize?.(dimensions.width, dimensions.height);
  return true;
}

/** Sora display font stack used across the top bar. */
export const SORA_FONT = "var(--font-sora), 'Sora', sans-serif";

/** JetBrains Mono font stack used for numerics, shortcuts, and avatar initials. */
export const MONO_FONT = "var(--font-jetbrains), 'JetBrains Mono', monospace";

/** Top bar root container style. */
export const TOOLBAR_CONTAINER_STYLE: CSSProperties = Object.freeze({
  height: 42,
  background: colors.background.surface,
  borderBottom: `1px solid ${colors.canvas.border}`,
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  gap: 6,
  flexShrink: 0,
});

/** Icon-only top bar button (home/undo/redo). */
export const TOOLBAR_ICON_BUTTON_STYLE: CSSProperties = Object.freeze({
  background: 'none',
  border: 'none',
  color: colors.text.muted,
  cursor: 'pointer',
  display: 'flex',
  padding: 4,
});

/** Vertical separator color (matches existing inline tag). */
export const SEPARATOR_COLOR = colors.canvas.hover;

/** Dropdown menu container. */
export const DROPDOWN_MENU_STYLE: CSSProperties = Object.freeze({
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: 4,
  background: colors.background.surface,
  border: `1px solid ${colors.canvas.border}`,
  borderRadius: 6,
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  padding: '4px 0',
  minWidth: 220,
  zIndex: 100,
});

/** Single dropdown row. */
export const DROPDOWN_ITEM_STYLE: CSSProperties = Object.freeze({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '7px 12px',
  background: 'none',
  border: 'none',
  fontSize: 11,
  fontFamily: SORA_FONT,
  color: colors.text.silver,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background 100ms',
});

/** Right-aligned shortcut label inside a dropdown row. */
export const DROPDOWN_SHORTCUT_STYLE: CSSProperties = Object.freeze({
  fontSize: 9,
  fontFamily: MONO_FONT,
  color: colors.text.dim,
  marginLeft: 16,
});

/** Horizontal separator between dropdown sections. */
export const DROPDOWN_SEPARATOR_STYLE: CSSProperties = Object.freeze({
  height: 1,
  background: colors.canvas.border,
  margin: '4px 0',
});

/**
 * Build the trigger button style for a top bar dropdown.
 * `withIconLayout` adds flex/gap rules when the trigger has an inline icon.
 */
export function buildDropdownTriggerStyle(
  isOpen: boolean,
  withIconLayout = false,
): CSSProperties {
  const base: CSSProperties = {
    background: isOpen ? colors.canvas.border : 'none',
    border: 'none',
    color: colors.text.silver,
    fontSize: 12,
    fontFamily: SORA_FONT,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 4,
  };
  if (!withIconLayout) {
    return base;
  }
  return {
    ...base,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  };
}

/** Resize dropdown menu uses a wider min width. */
export const RESIZE_DROPDOWN_MENU_STYLE: CSSProperties = Object.freeze({
  ...DROPDOWN_MENU_STYLE,
  minWidth: 260,
});

/** Custom dimension input wrapper row. */
export const CUSTOM_DIMENSION_ROW_STYLE: CSSProperties = Object.freeze({
  padding: '8px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
});

/** Custom W/H number input style. */
export const CUSTOM_DIMENSION_INPUT_STYLE: CSSProperties = Object.freeze({
  width: 60,
  background: colors.background.void,
  border: `1px solid ${colors.canvas.border}`,
  borderRadius: 4,
  color: colors.text.silver,
  fontSize: 11,
  fontFamily: MONO_FONT,
  padding: '4px 6px',
  outline: 'none',
});

/** "x" glyph between W and H inputs. */
export const CUSTOM_DIMENSION_SEPARATOR_STYLE: CSSProperties = Object.freeze({
  color: colors.text.dim,
  fontSize: 11,
});

/** Apply (custom dimensions) button. */
export const APPLY_BUTTON_STYLE: CSSProperties = Object.freeze({
  background: colors.ember.primary,
  border: 'none',
  borderRadius: 4,
  color: colors.background.void,
  fontSize: 10,
  fontWeight: 700,
  fontFamily: SORA_FONT,
  padding: '4px 10px',
  cursor: 'pointer',
});

/** Center area wrapper that holds the design name input + saving indicator. */
export const CENTER_CONTAINER_STYLE: CSSProperties = Object.freeze({
  flex: 1,
  textAlign: 'center',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
});

/** Design name text input. */
export const DESIGN_NAME_INPUT_STYLE: CSSProperties = Object.freeze({
  fontSize: 12,
  color: colors.text.muted,
  fontFamily: SORA_FONT,
  background: 'none',
  border: 'none',
  outline: 'none',
  textAlign: 'center',
  maxWidth: 280,
});

/** "Salvando..." status label wrapper. */
export const SAVING_LABEL_STYLE: CSSProperties = Object.freeze({
  fontSize: 9,
  color: colors.ember.primary,
  fontFamily: MONO_FONT,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
});

/** Pulsing dot next to "Salvando...". */
export const SAVING_DOT_STYLE: CSSProperties = Object.freeze({
  width: 5,
  height: 5,
  borderRadius: '16%',
  background: colors.ember.primary,
  animation: 'pE 1.5s ease-in-out infinite',
  display: 'inline-block',
});

/** Avatar tile (top right). */
export const AVATAR_STYLE: CSSProperties = Object.freeze({
  width: 28,
  height: 28,
  borderRadius: 6,
  background: colors.ember.primary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: 4,
});

/** Avatar initials label. */
export const AVATAR_LABEL_STYLE: CSSProperties = Object.freeze({
  color: colors.background.void,
  fontFamily: MONO_FONT,
  fontSize: 11,
  fontWeight: 700,
});

/** Primary share/export button on the right. */
export const SHARE_BUTTON_STYLE: CSSProperties = Object.freeze({
  background: colors.ember.primary,
  border: 'none',
  borderRadius: 4,
  padding: '6px 14px',
  color: colors.background.void,
  fontSize: 11,
  fontWeight: 700,
  fontFamily: SORA_FONT,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  marginLeft: 4,
});
