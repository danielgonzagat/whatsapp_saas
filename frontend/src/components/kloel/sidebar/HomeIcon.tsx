'use client';

import { kloelT } from '@/lib/i18n/t';
import type { CSSProperties, SVGProps } from 'react';

interface HomeIconProps extends Omit<SVGProps<SVGSVGElement>, 'color'> {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

/** Home icon. */
export function HomeIcon({ size = 18, color = 'currentColor', style, ...props }: HomeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'block',
        overflow: 'visible',
        transform: 'scale(1.2)',
        transformOrigin: 'center',
        ...style,
      }}
      {...props}
      aria-hidden="true"
    >
      <path
        d={kloelT(
          `M4.85 10.15L12 4.15L19.15 10.15V18.2C19.15 19.0284 18.4784 19.7 17.65 19.7H6.35C5.52157 19.7 4.85 19.0284 4.85 18.2V10.15Z`,
        )}
        stroke={color}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default HomeIcon;
