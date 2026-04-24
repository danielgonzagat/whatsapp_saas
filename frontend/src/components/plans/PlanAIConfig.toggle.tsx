'use client';
import { colors } from '@/lib/design-tokens';
import { useId } from 'react';

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const toggleLabelId = useId();
  return (
    <div className="flex items-center gap-3 py-1">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${toggleLabelId}-lbl`}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
        style={{ backgroundColor: checked ? colors.accent.webb : colors.background.corona }}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
      <span
        id={`${toggleLabelId}-lbl`}
        className="text-sm"
        style={{ color: colors.text.starlight }}
      >
        {label}
      </span>
    </div>
  );
}
