import type { CSSProperties, ReactNode } from 'react';

type MarkProps = {
  size?: number;
  traceColor?: string;
  style?: CSSProperties;
  title?: string;
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
};

const soraFont = "var(--font-sora), 'Sora', sans-serif";

export function KloelMushroomMark({
  size = 20,
  traceColor = '#FFFFFF',
  style,
  title = 'kloel',
}: MarkProps) {
  return (
    <svg
      aria-label={title}
      role="img"
      width={size}
      height={size}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      <g transform="translate(100 100)">
        <path d="M-60 0Q-65-50-30-70Q0-85 30-70Q65-50 60 0Z" fill="#E85D30" />
        <rect x="-12" y="0" width="24" height="50" rx="3" fill="#E85D30" />
        <line x1="-30" y1="-30" x2="-10" y2="-50" stroke={traceColor} strokeWidth="1.2" />
        <line x1="-10" y1="-50" x2="15" y2="-50" stroke={traceColor} strokeWidth="1.2" />
        <line x1="15" y1="-50" x2="30" y2="-35" stroke={traceColor} strokeWidth="1.2" />
        <line x1="0" y1="-25" x2="0" y2="-60" stroke={traceColor} strokeWidth="1.2" />
        <circle cx="-30" cy="-30" r="2.5" fill={traceColor} />
        <circle cx="-10" cy="-50" r="2.5" fill={traceColor} />
        <circle cx="15" cy="-50" r="2.5" fill={traceColor} />
        <circle cx="30" cy="-35" r="2.5" fill={traceColor} />
        <circle cx="0" cy="-60" r="2.5" fill={traceColor} />
        <line x1="0" y1="5" x2="0" y2="45" stroke={traceColor} strokeWidth="1" opacity="0.6" />
        <circle cx="0" cy="25" r="2" fill={traceColor} opacity="0.8" />
      </g>
    </svg>
  );
}

export function KloelWordmark({
  color = '#E0DDD8',
  fontSize = 16,
  fontWeight = 600,
  style,
  children = 'kloel',
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
        textTransform: 'lowercase',
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
      <KloelMushroomMark size={markSize} traceColor={traceColor} />
      <KloelWordmark color={textColor} fontSize={fontSize} fontWeight={fontWeight} />
    </span>
  );
}
