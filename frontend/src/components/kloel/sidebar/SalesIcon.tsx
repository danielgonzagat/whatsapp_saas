'use client';

import type { CSSProperties, SVGProps } from 'react';

interface SalesIconProps extends Omit<SVGProps<SVGSVGElement>, 'color'> {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

export function SalesIcon({ size = 18, color = 'currentColor', style, ...props }: SalesIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      {...props}
    >
      <circle cx="12" cy="12" r="10.15" fill={color} fillOpacity="0.14" />
      <circle cx="12" cy="12" r="8.7" fill="none" stroke={color} strokeWidth="1.5" />
      <text
        x="12"
        y="12.45"
        fill={color}
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="11.75"
        fontWeight="700"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        $
      </text>
    </svg>
  );
}

export default SalesIcon;
