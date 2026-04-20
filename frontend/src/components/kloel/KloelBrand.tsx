import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import { KLOEL_SPORES } from './kloel-brand-spores';

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
const ember = '#E85D30';

const spores = KLOEL_SPORES;

function MushroomStyles() {
  return (
    <style>{`
      .kloel-mushroom__cap-group,
      .kloel-mushroom__stem-group,
      .kloel-mushroom__circuit-cap,
      .kloel-mushroom__node-cap,
      .kloel-mushroom__circuit-stem,
      .kloel-mushroom__node-stem,
      .kloel-mushroom__spore {
        transform-box: view-box;
      }

      @media (prefers-reduced-motion: no-preference) {
        .kloel-mushroom--animated .kloel-mushroom__cap-group {
          animation: kloel-cap-breathe 3000ms ease-in-out infinite;
          transform-origin: 100px 100px;
        }

        .kloel-mushroom--animated .kloel-mushroom__stem-group {
          animation: kloel-stem-breathe 3000ms ease-in-out infinite;
          transform-origin: 100px 100px;
        }

        .kloel-mushroom--animated .kloel-mushroom__circuit-cap {
          animation: kloel-pump-cap 3000ms ease-in-out infinite;
        }

        .kloel-mushroom--animated .kloel-mushroom__node-cap {
          animation: kloel-node-cap-pulse 3000ms ease-in-out infinite;
        }

        .kloel-mushroom--animated .kloel-mushroom__circuit-stem {
          animation: kloel-pump-stem 3000ms ease-in-out infinite;
        }

        .kloel-mushroom--animated .kloel-mushroom__node-stem {
          animation: kloel-node-stem-pulse 3000ms ease-in-out infinite;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .kloel-mushroom--animated .kloel-mushroom__cap-group,
        .kloel-mushroom--animated .kloel-mushroom__stem-group,
        .kloel-mushroom--animated .kloel-mushroom__circuit-cap,
        .kloel-mushroom--animated .kloel-mushroom__node-cap,
        .kloel-mushroom--animated .kloel-mushroom__circuit-stem,
        .kloel-mushroom--animated .kloel-mushroom__node-stem,
        .kloel-mushroom--animated .kloel-mushroom__spore {
          animation: none !important;
        }

        .kloel-mushroom--animated .kloel-mushroom__spore {
          opacity: 0 !important;
        }
      }

      @keyframes kloel-cap-breathe {
        0% { transform: scaleY(1) scaleX(1); }
        35% { transform: scaleY(1.15) scaleX(1.04); }
        50% { transform: scaleY(0.88) scaleX(1.08); }
        65% { transform: scaleY(1) scaleX(1); }
        100% { transform: scaleY(1) scaleX(1); }
      }

      @keyframes kloel-stem-breathe {
        0% { transform: scaleY(1) scaleX(1); }
        35% { transform: scaleY(1.08) scaleX(0.95); }
        50% { transform: scaleY(0.85) scaleX(1.12); }
        65% { transform: scaleY(1) scaleX(1); }
        100% { transform: scaleY(1) scaleX(1); }
      }

      @keyframes kloel-pump-cap {
        0% { stroke-opacity: 0.35; stroke-width: 1.2; }
        33% { stroke-opacity: 0.4; stroke-width: 1.2; }
        40% { stroke-opacity: 1; stroke-width: 2.4; }
        50% { stroke-opacity: 1; stroke-width: 2.6; }
        58% { stroke-opacity: 0.5; stroke-width: 1.4; }
        68% { stroke-opacity: 0.35; stroke-width: 1.2; }
        100% { stroke-opacity: 0.35; stroke-width: 1.2; }
      }

      @keyframes kloel-node-cap-pulse {
        0% { r: 2.5; fill-opacity: 0.55; }
        33% { r: 2.5; fill-opacity: 0.55; }
        40% { r: 4.2; fill-opacity: 1; }
        50% { r: 4.5; fill-opacity: 1; }
        58% { r: 3; fill-opacity: 0.7; }
        68% { r: 2.5; fill-opacity: 0.55; }
        100% { r: 2.5; fill-opacity: 0.55; }
      }

      @keyframes kloel-pump-stem {
        0% { stroke-opacity: 0.3; stroke-width: 1; }
        40% { stroke-opacity: 0.3; stroke-width: 1; }
        46% { stroke-opacity: 1; stroke-width: 2.5; }
        55% { stroke-opacity: 1; stroke-width: 2.8; }
        63% { stroke-opacity: 0.5; stroke-width: 1.3; }
        72% { stroke-opacity: 0.3; stroke-width: 1; }
        100% { stroke-opacity: 0.3; stroke-width: 1; }
      }

      @keyframes kloel-node-stem-pulse {
        0% { r: 2; fill-opacity: 0.4; }
        40% { r: 2; fill-opacity: 0.4; }
        46% { r: 3.8; fill-opacity: 1; }
        55% { r: 4.2; fill-opacity: 1; }
        63% { r: 2.8; fill-opacity: 0.6; }
        72% { r: 2; fill-opacity: 0.4; }
        100% { r: 2; fill-opacity: 0.4; }
      }

      @keyframes kloel-sp-l1  { 0%,43%{ opacity:0; cx:38;  cy:96; } 49%{ opacity:.7; } 100%{ opacity:0; cx:-10; cy:90; } }
      @keyframes kloel-sp-l2  { 0%,43%{ opacity:0; cx:36;  cy:88; } 49%{ opacity:.55; } 100%{ opacity:0; cx:-5;  cy:62; } }
      @keyframes kloel-sp-ul1 { 0%,43%{ opacity:0; cx:48;  cy:75; } 49%{ opacity:.7; } 100%{ opacity:0; cx:10;  cy:22; } }
      @keyframes kloel-sp-ul2 { 0%,43%{ opacity:0; cx:53;  cy:80; } 49%{ opacity:.5; } 100%{ opacity:0; cx:18;  cy:32; } }
      @keyframes kloel-sp-tl1 { 0%,43%{ opacity:0; cx:70;  cy:58; } 49%{ opacity:.7; } 100%{ opacity:0; cx:45;  cy:-10; } }
      @keyframes kloel-sp-tl2 { 0%,43%{ opacity:0; cx:78;  cy:62; } 49%{ opacity:.45; } 100%{ opacity:0; cx:55;  cy:-2; } }
      @keyframes kloel-sp-t1  { 0%,43%{ opacity:0; cx:94;  cy:48; } 49%{ opacity:.8; } 100%{ opacity:0; cx:90;  cy:-25; } }
      @keyframes kloel-sp-t2  { 0%,43%{ opacity:0; cx:106; cy:50; } 49%{ opacity:.6; } 100%{ opacity:0; cx:112; cy:-20; } }
      @keyframes kloel-sp-tr1 { 0%,43%{ opacity:0; cx:122; cy:56; } 49%{ opacity:.7; } 100%{ opacity:0; cx:158; cy:-8; } }
      @keyframes kloel-sp-tr2 { 0%,43%{ opacity:0; cx:128; cy:62; } 49%{ opacity:.5; } 100%{ opacity:0; cx:150; cy:0; } }
      @keyframes kloel-sp-ur1 { 0%,43%{ opacity:0; cx:148; cy:75; } 49%{ opacity:.65; } 100%{ opacity:0; cx:195; cy:25; } }
      @keyframes kloel-sp-ur2 { 0%,43%{ opacity:0; cx:152; cy:82; } 49%{ opacity:.45; } 100%{ opacity:0; cx:190; cy:38; } }
      @keyframes kloel-sp-r1  { 0%,43%{ opacity:0; cx:160; cy:88; } 49%{ opacity:.6; } 100%{ opacity:0; cx:210; cy:65; } }
      @keyframes kloel-sp-r2  { 0%,43%{ opacity:0; cx:163; cy:95; } 49%{ opacity:.7; } 100%{ opacity:0; cx:212; cy:90; } }
    `}</style>
  );
}

function renderSpores(mode: MushroomVisualProps['spores']) {
  if (mode === 'none') {
    return null;
  }

  return spores.map((spore) => {
    if (mode === 'static') {
      return (
        <circle
          key={spore.id}
          cx={spore.endCx}
          cy={spore.endCy}
          r={spore.radius}
          fill={ember}
          opacity={Math.max(0.35, spore.opacity - 0.1)}
        />
      );
    }

    return (
      <circle
        key={spore.id}
        className="kloel-mushroom__spore"
        cx={spore.startCx}
        cy={spore.startCy}
        r={spore.radius}
        fill={ember}
        style={{
          animation: `${spore.animation} 3000ms ease-out infinite ${spore.delayMs}ms`,
        }}
      />
    );
  });
}

export function KloelMushroomVisual({
  size = 20,
  traceColor = '#FFFFFF',
  style,
  title = 'Kloel',
  animated = true,
  spores: sporeMode = 'animated',
  ariaHidden = false,
  fit = 'default',
}: MushroomVisualProps) {
  if (animated) {
    return (
      <span
        aria-hidden={ariaHidden}
        aria-label={ariaHidden ? undefined : title}
        role={ariaHidden ? 'presentation' : 'img'}
        style={{
          width: size,
          height: size,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          ...style,
        }}
      >
        <Image
          src="/kloel-mushroom-animated.svg"
          alt=""
          aria-hidden
          draggable={false}
          unoptimized
          width={size}
          height={size}
          sizes={`${size}px`}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'contain',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      </span>
    );
  }

  const viewBox = fit === 'icon' ? '22 4 156 156' : '0 0 200 200';

  return (
    <svg
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : title}
      role={ariaHidden ? 'presentation' : 'img'}
      width={size}
      height={size}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      className={animated ? 'kloel-mushroom--animated' : undefined}
      style={{ display: 'block', flexShrink: 0, overflow: 'visible', ...style }}
    >
      <MushroomStyles />
      <g>
        <g className={animated ? 'kloel-mushroom__stem-group' : undefined}>
          <rect x="88" y="100" width="24" height="50" rx="3" fill={ember} />
          <line
            className={animated ? 'kloel-mushroom__circuit-stem' : undefined}
            x1="100"
            y1="105"
            x2="100"
            y2="145"
            stroke={traceColor}
            strokeLinecap="round"
          />
          <circle
            className={animated ? 'kloel-mushroom__node-stem' : undefined}
            cx="100"
            cy="118"
            r="2"
            fill={traceColor}
          />
          <circle
            className={animated ? 'kloel-mushroom__node-stem' : undefined}
            cx="100"
            cy="135"
            r="2"
            fill={traceColor}
          />
        </g>

        {renderSpores(sporeMode)}

        <g className={animated ? 'kloel-mushroom__cap-group' : undefined}>
          <path d="M40,100 Q35,50 70,30 Q100,15 130,30 Q165,50 160,100 Z" fill={ember} />
          <line
            className={animated ? 'kloel-mushroom__circuit-cap' : undefined}
            x1="70"
            y1="70"
            x2="90"
            y2="50"
            stroke={traceColor}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <line
            className={animated ? 'kloel-mushroom__circuit-cap' : undefined}
            x1="90"
            y1="50"
            x2="115"
            y2="50"
            stroke={traceColor}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <line
            className={animated ? 'kloel-mushroom__circuit-cap' : undefined}
            x1="115"
            y1="50"
            x2="130"
            y2="65"
            stroke={traceColor}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <line
            className={animated ? 'kloel-mushroom__circuit-cap' : undefined}
            x1="100"
            y1="75"
            x2="100"
            y2="40"
            stroke={traceColor}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <circle
            className={animated ? 'kloel-mushroom__node-cap' : undefined}
            cx="70"
            cy="70"
            r="2.5"
            fill={traceColor}
          />
          <circle
            className={animated ? 'kloel-mushroom__node-cap' : undefined}
            cx="90"
            cy="50"
            r="2.5"
            fill={traceColor}
          />
          <circle
            className={animated ? 'kloel-mushroom__node-cap' : undefined}
            cx="115"
            cy="50"
            r="2.5"
            fill={traceColor}
          />
          <circle
            className={animated ? 'kloel-mushroom__node-cap' : undefined}
            cx="130"
            cy="65"
            r="2.5"
            fill={traceColor}
          />
          <circle
            className={animated ? 'kloel-mushroom__node-cap' : undefined}
            cx="100"
            cy="40"
            r="2.5"
            fill={traceColor}
          />
        </g>
      </g>
    </svg>
  );
}

export function KloelMushroomMark({
  size = 20,
  traceColor = '#FFFFFF',
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

export function KloelWordmark({
  color = '#E0DDD8',
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

export function KloelBrandLockup({
  markSize = 20,
  gap = 10,
  traceColor = '#FFFFFF',
  textColor = '#E0DDD8',
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

export function KloelLoadingState({
  size = 84,
  traceColor = '#FFFFFF',
  label = 'Carregando Kloel',
  hint,
  textColor = '#E0DDD8',
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
