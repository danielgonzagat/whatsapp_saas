import { canvasPalette } from '@/lib/canvas-palette-tokens';
import { useId } from 'react';

export function ColorIcon({ s = 16 }: { s?: number }) {
  const gid = useId();
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="5" fill={`url(#${gid}-rg)`} />
      <defs>
        <radialGradient id={`${gid}-rg`}>
          <stop stopColor={canvasPalette.gradientWarm} />
          <stop offset="0.5" stopColor={canvasPalette.gradientTeal} />
          <stop offset="1" stopColor={canvasPalette.gradientBlue} />
        </radialGradient>
      </defs>
    </svg>
  );
}
