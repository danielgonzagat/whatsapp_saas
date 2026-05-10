'use client';

const EMBER = 'colors.ember.primary';
const BORDER = 'var(--border-space, colors.border.space)';
const TEXT = 'var(--text-starlight, colors.text.silver)';
const TEXT_ON_ACCENT = 'var(--app-text-on-accent)';

export function CheckoutCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        fontFamily: "'Sora', sans-serif",
        fontSize: 13,
        color: TEXT,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onChange(!checked)}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: `1px solid ${checked ? EMBER : BORDER}`,
          backgroundColor: checked ? EMBER : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
        aria-hidden="true"
      >
        {checked && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke={TEXT_ON_ACCENT}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      {label}
    </label>
  );
}
