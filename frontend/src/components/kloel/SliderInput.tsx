'use client';

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
            background: `linear-gradient(to right, #E85D30 0%, #E85D30 ${percentage}%, #19191C ${percentage}%, #19191C 100%)`,
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
            color: '#3A3A3F',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {labels.map((label, i) => (
            <span
              key={i}
              style={{
                color: i === value - min ? '#E85D30' : '#3A3A3F',
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
          border-radius: 6px;
          background: #E85D30;
          border: 2px solid #0A0A0C;
          box-shadow: none;
          cursor: pointer;
        }
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 6px;
          background: #E85D30;
          border: 2px solid #0A0A0C;
          box-shadow: none;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
