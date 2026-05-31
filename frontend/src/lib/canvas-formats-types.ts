/* ═══════════════════════════════════════════
   KLOEL CANVAS — Format Types
   Pure type declarations extracted from canvas-formats.ts.
   ═══════════════════════════════════════════ */

export interface FormatItem {
  /** L property. */
  l: string; // label
  /** S property. */
  s?: string; // size display string
  /** M property. */
  m: string; // mockup type
  /** C property. */
  c: [string, string]; // gradient colors
  /** W property. */
  w: number; // width px
  /** H property. */
  h: number; // height px
  /** P property. */
  p?: string; // platform name (for social filter)
}

/** Category item shape. */
export interface CategoryItem {
  /** Id property. */
  id: string;
  /** Label property. */
  label: string;
  /** Icon property. */
  icon: string;
}

/** Pill item shape. */
export interface PillItem {
  /** Id property. */
  id: string;
  /** L property. */
  l: string;
  /** C property. */
  c: [string, string];
}

/** Editor sidebar tab item shape. */
export interface EditorTabItem {
  /** Id property. */
  id: string;
  /** L property. */
  l: string;
  /** Icon property. */
  icon: string;
}
