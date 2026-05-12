'use client';
import { colors } from '@/lib/design-tokens';

const BORDER = 'var(--border-space, colors.border.space)';
const TEXT_ON_ACCENT = 'var(--app-text-on-accent)';
const GREEN = colors.semantic.success;

export function CheckoutToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 8,
        backgroundColor: checked ? GREEN : BORDER,
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        padding: 0,
        flexShrink: 0,
        transition: 'background-color 0.2s ease',
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '16%',
          backgroundColor: TEXT_ON_ACCENT,
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          transition: 'left 0.2s ease',
        }}
      />
    </button>
  );
}
