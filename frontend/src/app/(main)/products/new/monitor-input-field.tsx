'use client';

import { colors, typography } from '@/lib/design-tokens';
import { monitorLabel } from './shared-styles';
import type React from 'react';

export function MonitorInputField({
  label,
  children,
  hint,
}: {
  label?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      {label && <span style={monitorLabel}>{label}</span>}
      {children}
      {hint && (
        <p
          style={{
            marginTop: 4,
            fontSize: 11,
            color: colors.text.dust,
            fontFamily: typography.fontFamily.sans,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
