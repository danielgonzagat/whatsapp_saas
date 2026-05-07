'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import type { CSSProperties, ReactNode } from 'react';

type MushroomVisualProps = {
  size?: number;
  traceColor?: string;
  style?: CSSProperties;
  title?: string;
  animated?: boolean;
  spores?: 'none' | 'animated' | 'static';
  ariaHidden?: boolean;
  fit?: 'default' | 'icon';
};

type MarkProps = {
  size?: number;
  traceColor?: string;
  style?: CSSProperties;
  title?: string;
  animated?: boolean;
  spores?: 'none' | 'animated' | 'static';
};

type WordmarkProps = {
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  style?: CSSProperties;
  children?: ReactNode;
};

type LockupProps = {
  markSize?: number;
  gap?: number;
  traceColor?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: number;
  style?: CSSProperties;
  animated?: boolean;
  spores?: 'none' | 'animated' | 'static';
};

type LoadingStateProps = {
  size?: number;
  traceColor?: string;
  label?: string;
  hint?: string;
  textColor?: string;
  minHeight?: number | string;
  style?: CSSProperties;
};

const soraFont = "var(--font-sora), 'Sora', sans-serif";

/** Kloel mushroom visual. */
export function KloelMushroomVisual({
  size = 20,
  traceColor: _traceColor,
  style,
  title = 'Kloel',
  animated: _animated,
  spores: _spores,
  ariaHidden = false,
  fit = 'default',
}: MushroomVisualProps) {
  const src = '/kloel-mushroom-animated.svg';

  return (
    <img
      src={src}
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : title}
      alt={ariaHidden ? '' : title}
      role={ariaHidden ? 'presentation' : 'img'}
      width={size}
      height={size}
      style={{
        display: 'block',
        flexShrink: 0,
        objectFit: 'contain',
        objectPosition: 'center',
        padding: fit === 'icon' ? Math.round(size * 0.04) : 0,
        transform: 'translate3d(0,0,0)',
        ...style,
      }}
    />
  );
}

/** Kloel mushroom mark. */
export function KloelMushroomMark({
  size = 20,
  traceColor = '#FFFFFF', // PULSE_VISUAL_OK: SVG circuit trace, default white
  style,
  title = 'Kloel',
  animated = true,
  spores = 'animated',
}: MarkProps) {
  return (
    <KloelMushroomVisual
      size={size}
      traceColor={traceColor}
      style={style}
      title={title}
      fit="icon"
      animated={animated}
      spores={spores}
    />
  );
}

/** Kloel wordmark. */
export function KloelWordmark({
  color = colors.text.silver,
  fontSize = 16,
  fontWeight = 600,
  style,
  children = 'Kloel',
}: WordmarkProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: soraFont,
        fontSize,
        fontWeight,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Kloel brand lockup. */
export function KloelBrandLockup({
  markSize = 20,
  gap = 10,
  traceColor = '#FFFFFF', // PULSE_VISUAL_OK: SVG circuit trace, default white
  textColor = colors.text.silver,
  fontSize = 16,
  fontWeight = 600,
  style,
  animated = true,
  spores = 'animated',
}: LockupProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap,
        textDecoration: 'none',
        ...style,
      }}
    >
      <KloelMushroomMark
        size={markSize}
        traceColor={traceColor}
        animated={animated}
        spores={spores}
      />
      <KloelWordmark color={textColor} fontSize={fontSize} fontWeight={fontWeight} />
    </span>
  );
}

/** Kloel loading state. */
export function KloelLoadingState({
  size = 84,
  traceColor = '#FFFFFF', // PULSE_VISUAL_OK: SVG circuit trace, default white
  label = 'Carregando Kloel',
  hint,
  textColor = colors.text.silver,
  minHeight = 320,
  style,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        textAlign: 'center',
        ...style,
      }}
    >
      <KloelMushroomVisual size={size} traceColor={traceColor} animated spores="animated" />
      <div style={{ display: 'grid', gap: 6 }}>
        <p
          style={{
            margin: 0,
            fontFamily: soraFont,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: textColor,
          }}
        >
          {label}
        </p>
        {hint ? (
          <p
            style={{
              margin: 0,
              fontFamily: soraFont,
              fontSize: 13,
              lineHeight: 1.5,
              color: textColor,
              opacity: 0.6,
            }}
          >
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
