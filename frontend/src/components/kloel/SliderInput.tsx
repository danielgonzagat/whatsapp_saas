'use client';

import { colors } from '@/lib/design-tokens';

interface SliderInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  labels?: string[];
}

export function SliderInput({ value, onChange, min = 1, max = 5, step = 1, labels }: SliderInputProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'relative', height: 24, display: 'flex', alignItems: 'center' }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            width: '100%',
            height: 4,
            appearance: 'none',
            WebkitAppearance: 'none',
            background: `linear-gradient(to right, ${colors.accent.webb} 0%, ${colors.accent.webb} ${percentage}%, ${colors.background.corona} ${percentage}%, ${colors.background.corona} 100%)`,
            borderRadius: 2,
            outline: 'none',
            cursor: 'pointer',
          }}
        />
      </div>
      {labels && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            color: colors.text.dust,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {labels.map((label, i) => (
            <span
              key={i}
              style={{
                color: i === value - min ? colors.accent.webb : colors.text.dust,
                fontWeight: i === value - min ? 600 : 400,
              }}
            >
              {label}
            </span>
          ))}
        </div>
      )}
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${colors.accent.webb};
          border: 2px solid ${colors.background.void};
          box-shadow: 0 0 8px rgba(78, 122, 224, 0.3);
          cursor: pointer;
        }
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${colors.accent.webb};
          border: 2px solid ${colors.background.void};
          box-shadow: 0 0 8px rgba(78, 122, 224, 0.3);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
