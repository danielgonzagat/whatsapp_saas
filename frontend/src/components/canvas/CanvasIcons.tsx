import { kloelT } from '@/lib/i18n/t';
/* ═══════════════════════════════════════════
   KLOEL CANVAS — SVG Icon Factory
   Terminator Design System — SVG only, zero libs
   ═══════════════════════════════════════════ */

import type React from 'react';
import { useId } from 'react';
import { IC1 } from './CanvasIcons.catalog1';
import { IC2 } from './CanvasIcons.catalog2';
import { IC3 } from './CanvasIcons.catalog3';

type IconFn = (s?: number) => React.ReactElement;

/** Color icon needs useId for SVG gradient — must be a component */
export function ColorIcon({ s = 16 }: { s?: number }) {
  const gid = useId();
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="5" fill={`url(#${gid}-rg)`} />
      <defs>
        <radialGradient id={`${gid}-rg`}>
          <stop stopColor={kloelT(`#FF6B6B`)} />
          <stop offset="0.5" stopColor={kloelT(`#4ECDC4`)} />
          <stop offset="1" stopColor={kloelT(`#45B7D1`)} />
        </radialGradient>
      </defs>
    </svg>
  );
}

export const IC: Record<string, IconFn> = {
  ...IC1,
  ...IC2,
  ...IC3,
  target: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  camera: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        d={kloelT(
          `M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z`,
        )}
      />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  printer: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <polyline points="6 9 6 2 18 2 18 9" />
      <path
        d={kloelT(`M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2`)}
      />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  ),
  globe: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path
        d={kloelT(
          `M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z`,
        )}
      />
    </svg>
  ),
  mail: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        d={kloelT(`M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z`)}
      />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  table: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  ),
  board: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  ruler: (s = 16) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="1" y="6" width="22" height="12" rx="2" transform={kloelT(`rotate(-45 12 12)`)} />
    </svg>
  ),
};

/* ═══ Icon-name lookup for categories ═══ */
const ICON_MAP: Record<string, IconFn> = {
  spark: IC.spark,
  heart: IC.heart,
  target: IC.target,
  video: IC.video,
  camera: IC.camera,
  printer: IC.printer,
  file: IC.file,
  board: IC.board,
  table: IC.table,
  globe: IC.globe,
  mail: IC.mail,
  ruler: IC.ruler,
  upload: IC.upload,
  chart: IC.chart,
  grid: IC.grid,
  apps: IC.apps,
  type: IC.type,
  crown: IC.crown,
  tool: IC.tool,
  folder: IC.folder,
  wand: IC.wand,
  bg: IC.bg,
};

/** Get icon. */
export function getIcon(name: string): IconFn {
  return ICON_MAP[name] || IC.spark;
}
