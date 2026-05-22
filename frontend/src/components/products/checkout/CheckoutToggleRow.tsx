'use client';
import { CheckoutToggle } from './CheckoutToggle';

const TEXT = 'var(--text-starlight, colors.text.silver)';

export function CheckoutToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: TEXT }}>{label}</span>
      <CheckoutToggle checked={checked} onChange={onChange} />
    </div>
  );
}
