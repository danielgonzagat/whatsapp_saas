'use client';

import type { CSSProperties, SVGProps } from 'react';

interface ConversationsIconProps extends Omit<SVGProps<SVGSVGElement>, 'color'> {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

/** Conversations icon. */
export function ConversationsIcon({
  size = 18,
  color = 'currentColor',
  style,
  ...props
}: ConversationsIconProps) {
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
        transform: 'scale(1.22)',
        transformOrigin: 'center',
        ...style,
      }}
      {...props}
      aria-hidden="true"
    >
      <path
        d="M8.35 5.35H15.65C17.9683 5.35 19.85 7.23166 19.85 9.55V12.15C19.85 14.4683 17.9683 16.35 15.65 16.35H10.8477C10.3307 16.35 9.8263 16.5107 9.40429 16.8099L7.08994 18.4505C6.43432 18.9153 5.525 18.4465 5.525 17.6428V16.6164C5.525 16.0935 5.22144 15.618 4.74634 15.3969C4.10558 15.0986 3.65 14.4498 3.65 13.6944V9.55C3.65 7.23166 5.53166 5.35 7.85 5.35H8.35Z"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default ConversationsIcon;
