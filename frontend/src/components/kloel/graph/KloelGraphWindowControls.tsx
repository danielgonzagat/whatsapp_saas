'use client';

import { Maximize2, Minimize2, X } from 'lucide-react';
import { useState } from 'react';

/**
 * Canonical Mac-style traffic-light window control for the Kloel graph overlay.
 * Glyphs are lucide icons to match the production overlay rendering exactly.
 * NOTE: ArtifactWindowChrome.controls.tsx is a different surface (artifacts
 * panel) and deliberately keeps its own implementation.
 */
export function TrafficLight({
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
        borderRadius: 8,
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
        style={{
          opacity: hovered ? 1 : 0,
          transition: 'opacity .12s ease',
          display: 'flex',
        }}
      >
        {glyph === 'close' ? (
          <X size={8} strokeWidth={2.4} color={glyphColor} aria-hidden="true" />
        ) : glyph === 'restore' ? (
          <Minimize2 size={9} strokeWidth={2} color={glyphColor} aria-hidden="true" />
        ) : (
          <Maximize2 size={9} strokeWidth={2} color={glyphColor} aria-hidden="true" />
        )}
      </span>
    </button>
  );
}
