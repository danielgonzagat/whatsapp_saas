'use client';

import type { CSSProperties, SVGProps } from 'react';

interface HomeIconProps extends Omit<SVGProps<SVGSVGElement>, 'color'> {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

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
        ...style,
      }}
      {...props}
    >
      <path
        d="M5.5 10.25L12 4.75L18.5 10.25V18C18.5 18.8284 17.8284 19.5 17 19.5H7C6.17157 19.5 5.5 18.8284 5.5 18V10.25Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default HomeIcon;
