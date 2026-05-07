'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

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

let cachedSvgText: string | null = null;
let activeFetch: Promise<string> | null = null;

function fetchMushroomSvg(): Promise<string> {
  if (cachedSvgText) return Promise.resolve(cachedSvgText);
  if (!activeFetch) {
    activeFetch = fetch('/kloel-mushroom-animated.svg')
      .then((r) => {
        if (!r.ok) throw new Error(`Mushroom SVG fetch failed: ${r.status}`);
        return r.text();
      })
      .then((text) => {
        cachedSvgText = text;
        activeFetch = null;
        return text;
      })
      .catch((err) => {
        activeFetch = null;
        throw err;
      });
  }
  return activeFetch;
}

function processSvg(
  svgText: string,
  traceColor: string,
  animated: boolean,
  spores: 'none' | 'animated' | 'static',
): string {
  let result = svgText;

  result = result.replace(
    'width="200" height="200"',
    'width="100%" height="100%" style="display:block"',
  );

  if (traceColor !== '#FFFFFF') {
    result = result.replace(/stroke="#FFFFFF"/g, `stroke="${traceColor}"`);
    result = result.replace(/fill="#FFFFFF"/g, `fill="${traceColor}"`);
  }

  const injections: string[] = [];

  if (!animated) {
    injections.push(
      '.cap-group,.stem-group,.circuit-cap,.node-cap,.circuit-stem,.node-stem,' +
        '.sp-L1,.sp-L2,.sp-UL1,.sp-UL2,.sp-TL1,.sp-TL2,.sp-T1,.sp-T2,' +
        '.sp-TR1,.sp-TR2,.sp-UR1,.sp-UR2,.sp-R1,.sp-R2{animation:none}',
    );
  }

  if (spores === 'none') {
    injections.push('.spore{display:none}');
  } else if (spores === 'static') {
    injections.push(
      '.sp-L1,.sp-L2,.sp-UL1,.sp-UL2,.sp-TL1,.sp-TL2,.sp-T1,.sp-T2,' +
        '.sp-TR1,.sp-TR2,.sp-UR1,.sp-UR2,.sp-R1,.sp-R2{opacity:.6;animation:none}',
    );
  }

  if (injections.length > 0) {
    result = result.replace('</style>', `${injections.join('')}</style>`);
  }

  return result;
}

/** Kloel mushroom visual. */
export function KloelMushroomVisual({
  size = 20,
  traceColor = '#FFFFFF',
  style,
  title = 'Kloel',
  animated = true,
  spores = 'animated',
  ariaHidden = false,
  fit = 'default',
}: MushroomVisualProps) {
  const [svgText, setSvgText] = useState<string | null>(null);
  const svgHostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMushroomSvg()
      .then((raw) => {
        if (cancelled) return;
        setSvgText(processSvg(raw, traceColor, animated, spores));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [traceColor, animated, spores]);

  const padding = fit === 'icon' ? Math.round(size * 0.04) : 0;
  const sharedStyle: CSSProperties = {
    display: 'block',
    flexShrink: 0,
    objectFit: 'contain',
    objectPosition: 'center',
    padding,
    transform: 'translate3d(0,0,0)',
    ...style,
  };

  useEffect(() => {
    const host = svgHostRef.current;
    if (!host || !svgText || typeof DOMParser === 'undefined') return;

    const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = parsed.documentElement;
    if (svg.nodeName.toLowerCase() !== 'svg') return;

    svg.setAttribute('aria-hidden', ariaHidden ? 'true' : 'false');
    if (!ariaHidden) {
      svg.setAttribute('aria-label', title);
      svg.setAttribute('role', 'img');
    } else {
      svg.setAttribute('role', 'presentation');
    }
    host.replaceChildren(document.importNode(svg, true));
  }, [ariaHidden, svgText, title]);

  if (svgText) {
    return (
      <span
        ref={svgHostRef}
        aria-hidden={ariaHidden}
        aria-label={ariaHidden ? undefined : title}
        role={ariaHidden ? 'presentation' : 'img'}
        style={{
          width: size,
          height: size,
          ...sharedStyle,
        }}
      />
    );
  }

  return (
    <img
      src="/kloel-mushroom-animated.svg"
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : title}
      alt={ariaHidden ? '' : title}
      role={ariaHidden ? 'presentation' : 'img'}
      width={size}
      height={size}
      style={sharedStyle}
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
