'use client';

import { useState } from 'react';

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

export function ResizeGripGlyph({ color }: { readonly color: string }) {
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
