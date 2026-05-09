import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import type { CSSProperties, ReactNode } from 'react';
import { KLOEL_SPORES } from './kloel-brand-spores';

type MushroomVisualProps = {
  size?: number | undefined;
  traceColor?: string | undefined;
  style?: CSSProperties | undefined;
  title?: string | undefined;
  animated?: boolean | undefined;
  spores?: 'none' | 'animated' | 'static' | undefined;
  ariaHidden?: boolean | undefined;
  fit?: 'default' | 'icon' | undefined;
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
const ember = colors.ember.primary;

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
          animation: kloel-line-pulse 3000ms ease-in-out infinite;
        }

        .kloel-mushroom--animated .kloel-mushroom__node-cap {
          animation: kloel-node-pulse 3000ms ease-in-out infinite;
        }

        .kloel-mushroom--animated .kloel-mushroom__circuit-stem {
          animation: kloel-line-pulse 3000ms ease-in-out infinite 180ms;
        }

        .kloel-mushroom--animated .kloel-mushroom__node-stem {
          animation: kloel-node-pulse 3000ms ease-in-out infinite 180ms;
        }

        .kloel-mushroom--animated .kloel-mushroom__spore {
          animation: kloel-spore-float 3000ms ease-out infinite;
          transform: translate3d(0, 0, 0);
          will-change: opacity, transform;
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

      @keyframes kloel-line-pulse {
        0%, 33%, 68%, 100% { stroke-opacity: 0.35; transform: scale(1); }
        42%, 55% { stroke-opacity: 1; transform: scale(1.04); }
      }

      @keyframes kloel-node-pulse {
        0%, 33%, 68%, 100% { fill-opacity: 0.55; transform: scale(1); }
        42%, 55% { fill-opacity: 1; transform: scale(1.45); }
      }

      @keyframes kloel-spore-float {
        0%, 43% { opacity: 0; transform: translate3d(0, 0, 0) scale(0.8); }
        49% { opacity: var(--spore-opacity, .65); }
        100% { opacity: 0; transform: translate3d(var(--spore-x, 0), var(--spore-y, -40px), 0) scale(1); }
      }
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
        style={
          {
            '--spore-x': `${spore.endCx - spore.startCx}px`,
            '--spore-y': `${spore.endCy - spore.startCy}px`,
            '--spore-opacity': spore.opacity,
            animationDelay: `${spore.delayMs}ms`,
          } as CSSProperties
        }
      />
    );
  });
}

/** Kloel mushroom visual. */
export function KloelMushroomVisual({
  size = 20,
  traceColor = '#FFFFFF', // PULSE_VISUAL_OK: SVG circuit trace, default white
  style,
  title = 'Kloel',
  animated = true,
  spores: sporeMode = 'animated',
  ariaHidden = false,
  fit = 'default',
}: MushroomVisualProps) {
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
      style={{
        display: 'block',
        flexShrink: 0,
        overflow: 'visible',
        transform: 'translate3d(0,0,0)',
        ...style,
      }}
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
          <path d={kloelT(`M40,100 Q35,50 70,30 Q100,15 130,30 Q165,50 160,100 Z`)} fill={ember} />
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
