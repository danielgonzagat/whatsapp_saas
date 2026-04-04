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
      <circle cx="12" cy="12" r="8.15" stroke={color} strokeWidth="1.75" />
      <path
        d="M14.35 8.25C13.68 7.66 12.81 7.32 11.88 7.32C9.84 7.32 8.4 8.47 8.4 10.12C8.4 11.56 9.39 12.34 11.7 13.11C13.62 13.75 14.44 14.33 14.44 15.59C14.44 16.97 13.24 17.86 11.53 17.86C10.43 17.86 9.32 17.49 8.52 16.86"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 5.75V7.3" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
      <path d="M12 16.72V18.27" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export default SalesIcon;
