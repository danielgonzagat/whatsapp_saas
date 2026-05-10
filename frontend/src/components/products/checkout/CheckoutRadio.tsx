'use client';

const EMBER = 'colors.ember.primary';
const BORDER = 'var(--border-space, colors.border.space)';
const TEXT = 'var(--text-starlight, colors.text.silver)';

export function CheckoutRadio({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
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
        type="radio"
        checked={checked}
        onChange={() => onChange()}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: `2px solid ${checked ? EMBER : BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {checked && (
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: EMBER,
            }}
          />
        )}
      </div>
      {label}
    </label>
  );
}
