/* ═══════════════════════════════════════════
   KLOEL CANVAS — SVG Mockup Components
   Phone, Desktop, Doc, Circle, Square previews
   ═══════════════════════════════════════════ */

import type React from 'react';
import { colors } from '@/lib/design-tokens';

interface MockupProps {
  c1: string;
  c2: string;
}

interface PhoneProps extends MockupProps {
  story?: boolean;
}

interface DesktopProps extends MockupProps {
  chart?: boolean;
}

/** Phone svg. */
export const PhoneSVG: React.FC<PhoneProps> = ({ c1, c2, story }) => (
  <svg width="48" height="82" viewBox="0 0 48 82" fill="none" aria-hidden="true">
    <rect
      x="1"
      y="1"
      width="46"
      height="80"
      rx="8"
      fill={colors.background.elevated}
      stroke={colors.border.space}
      strokeWidth="1"
    />
    <rect x="15" y="4" width="18" height="3" rx="1.5" fill={colors.border.space} />
    <rect x="4" y="10" width="40" height="62" rx="2" fill={`url(#p${c1.slice(1)})`} />
    {!story && (
      <>
        <rect x="4" y="10" width="40" height="8" fill="rgba(0,0,0,0.3)" />
        <circle cx="9" cy="14" r="2.5" fill="rgba(255,255,255,0.25)" />
        <rect x="14" y="12.5" width="14" height="2" rx="1" fill="rgba(255,255,255,0.25)" />
        <rect x="4" y="50" width="40" height="6" fill="rgba(0,0,0,0.2)" />
        <circle
          cx="9"
          cy="53"
          r="1.8"
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="0.7"
        />
        <circle
          cx="15"
          cy="53"
          r="1.8"
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="0.7"
        />
        <rect x="6" y="58" width="24" height="1.5" rx="0.75" fill="rgba(255,255,255,0.15)" />
        <rect x="6" y="61" width="16" height="1.2" rx="0.6" fill="rgba(255,255,255,0.1)" />
      </>
    )}
    {story && (
      <>
        <rect x="4" y="10" width="40" height="10" fill="rgba(0,0,0,0.3)" />
        <rect x="6" y="12" width="36" height="1.2" rx="0.6" fill="rgba(255,255,255,0.3)" />
        <circle
          cx="10"
          cy="17"
          r="3"
          fill="rgba(255,255,255,0.2)"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="0.5"
        />
        <rect x="15" y="15.5" width="14" height="2" rx="1" fill="rgba(255,255,255,0.25)" />
        <rect x="12" y="55" width="24" height="5" rx="2.5" fill="rgba(255,255,255,0.15)" />
      </>
    )}
    <rect x="4" y="68" width="40" height="4" fill="rgba(0,0,0,0.2)" />
    <defs>
      <linearGradient id={`p${c1.slice(1)}`} x1="0" y1="0" x2="48" y2="82">
        <stop stopColor={c1} />
        <stop offset="1" stopColor={c2} />
      </linearGradient>
    </defs>
  </svg>
);

/** Desktop svg. */
export const DesktopSVG: React.FC<DesktopProps> = ({ c1, c2, chart }) => (
  <svg width="82" height="54" viewBox="0 0 82 54" fill="none" aria-hidden="true">
    <rect
      x="1"
      y="1"
      width="80"
      height="46"
      rx="4"
      fill={colors.background.elevated}
      stroke={colors.border.space}
      strokeWidth="1"
    />
    <circle cx="41" cy="5" r="1.2" fill={colors.border.space} />
    <rect x="4" y="8" width="74" height="34" rx="1" fill={`url(#d${c1.slice(1)})`} />
    <rect x="4" y="8" width="14" height="34" fill="rgba(0,0,0,0.25)" />
    <rect x="6" y="11" width="10" height="1.5" rx="0.75" fill="rgba(255,255,255,0.15)" />
    <rect x="6" y="14" width="8" height="1.2" rx="0.6" fill="rgba(255,255,255,0.08)" />
    <rect x="6" y="17" width="10" height="1.2" rx="0.6" fill="rgba(255,255,255,0.08)" />
    {chart ? (
      [22, 28, 34, 40, 46, 52, 58].map((x, i) => (
        <rect
          key={x}
          x={x}
          y={32 - [6, 10, 14, 8, 16, 12, 7][i]}
          width="4.5"
          height={[6, 10, 14, 8, 16, 12, 7][i]}
          rx="1"
          fill={i === 2 || i === 4 ? c2 : 'rgba(255,255,255,0.12)'}
          opacity={i === 2 || i === 4 ? 0.5 : 1}
        />
      ))
    ) : (
      <>
        <rect x="22" y="11" width="20" height="2.5" rx="1" fill="rgba(255,255,255,0.2)" />
        <rect x="22" y="17" width="16" height="12" rx="1.5" fill="rgba(255,255,255,0.06)" />
        <rect x="42" y="17" width="16" height="12" rx="1.5" fill="rgba(255,255,255,0.06)" />
        <rect x="62" y="17" width="14" height="12" rx="1.5" fill="rgba(255,255,255,0.06)" />
        <rect x="22" y="33" width="22" height="4" rx="2" fill={c2} opacity="0.3" />
      </>
    )}
    <rect x="32" y="49" width="18" height="3" rx="1.5" fill={colors.border.space} />
    <rect x="37" y="47" width="8" height="3" fill={colors.border.space} />
    <defs>
      <linearGradient id={`d${c1.slice(1)}`} x1="0" y1="0" x2="82" y2="54">
        <stop stopColor={c1} stopOpacity="0.85" />
        <stop offset="1" stopColor={c2} stopOpacity="0.65" />
      </linearGradient>
    </defs>
  </svg>
);

/** Doc svg. */
export const DocSVG: React.FC<MockupProps> = ({ c1, c2 }) => (
  <svg width="44" height="60" viewBox="0 0 44 60" fill="none" aria-hidden="true">
    <rect
      x="1"
      y="1"
      width="42"
      height="58"
      rx="3"
      fill={colors.background.elevated}
      stroke={colors.border.space}
      strokeWidth="1"
    />
    <rect x="4" y="4" width="36" height="52" rx="1" fill="#FAFAFA" />
    <rect x="7" y="8" width="18" height="2.5" rx="1" fill={c1} opacity="0.6" />
    <rect x="7" y="13" width="28" height="1.5" rx="0.75" fill="#D1D5DB" />
    <rect x="7" y="16" width="24" height="1.5" rx="0.75" fill="#D1D5DB" />
    <rect x="7" y="19" width="20" height="1.5" rx="0.75" fill="#D1D5DB" />
    <rect
      x="7"
      y="24"
      width="30"
      height="14"
      rx="2"
      fill={`url(#dc${c1.slice(1)})`}
      opacity="0.5"
    />
    <rect x="7" y="41" width="26" height="1.5" rx="0.75" fill="#D1D5DB" />
    <rect x="7" y="44" width="22" height="1.5" rx="0.75" fill="#D1D5DB" />
    <rect x="7" y="49" width="14" height="3.5" rx="1.75" fill={c1} opacity="0.5" />
    <defs>
      <linearGradient id={`dc${c1.slice(1)}`} x1="7" y1="24" x2="37" y2="38">
        <stop stopColor={c1} />
        <stop offset="1" stopColor={c2} />
      </linearGradient>
    </defs>
  </svg>
);

/** Circle svg. */
export const CircleSVG: React.FC<MockupProps> = ({ c1, c2 }) => (
  <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
    <circle cx="26" cy="26" r="25" fill={`url(#cr${c1.slice(1)})`} />
    <circle cx="26" cy="21" r="7" fill="rgba(255,255,255,0.2)" />
    <ellipse cx="26" cy="37" rx="10" ry="7" fill="rgba(255,255,255,0.14)" />
    <defs>
      <linearGradient id={`cr${c1.slice(1)}`} x1="0" y1="0" x2="52" y2="52">
        <stop stopColor={c1} />
        <stop offset="1" stopColor={c2} />
      </linearGradient>
    </defs>
  </svg>
);

/** Square svg. */
export const SquareSVG: React.FC<MockupProps> = ({ c1, c2 }) => (
  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
    <rect x="1" y="1" width="54" height="54" rx="4" fill={`url(#sq${c1.slice(1)})`} />
    <rect x="7" y="7" width="22" height="2.5" rx="1" fill="rgba(255,255,255,0.25)" />
    <rect x="7" y="12" width="14" height="1.5" rx="0.75" fill="rgba(255,255,255,0.12)" />
    <rect x="7" y="18" width="42" height="20" rx="2" fill="rgba(0,0,0,0.12)" />
    <circle
      cx="28"
      cy="28"
      r="5"
      fill="rgba(255,255,255,0.08)"
      stroke="rgba(255,255,255,0.15)"
      strokeWidth="0.5"
    />
    <polygon points="26,26 26,30 30,28" fill="rgba(255,255,255,0.3)" />
    <rect x="7" y="42" width="18" height="4" rx="2" fill="rgba(255,255,255,0.15)" />
    <defs>
      <linearGradient id={`sq${c1.slice(1)}`} x1="0" y1="0" x2="56" y2="56">
        <stop stopColor={c1} />
        <stop offset="1" stopColor={c2} />
      </linearGradient>
    </defs>
  </svg>
);

/* ═══ Mockup Map ═══ */
export const MockupMap: Record<string, (colors: [string, string]) => React.ReactElement> = {
  'phone-post': ([c1, c2]) => <PhoneSVG c1={c1} c2={c2} />,
  'phone-story': ([c1, c2]) => <PhoneSVG c1={c1} c2={c2} story />,
  desktop: ([c1, c2]) => <DesktopSVG c1={c1} c2={c2} />,
  'desktop-chart': ([c1, c2]) => <DesktopSVG c1={c1} c2={c2} chart />,
  doc: ([c1, c2]) => <DocSVG c1={c1} c2={c2} />,
  circle: ([c1, c2]) => <CircleSVG c1={c1} c2={c2} />,
  square: ([c1, c2]) => <SquareSVG c1={c1} c2={c2} />,
};
