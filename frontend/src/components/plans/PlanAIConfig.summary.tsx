'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors, typography } from '@/lib/design-tokens';
import { CheckCircle, Circle, MinusCircle, Sparkles } from 'lucide-react';

interface SummaryItem {
  label: string;
  complete: boolean;
  partial: boolean;
}

interface AISummaryBoxProps {
  summary: string;
  items: SummaryItem[];
}

function completenessColor(complete: boolean, partial: boolean) {
  return complete ? colors.state.success : partial ? colors.brand.amber : colors.text.void;
}

export function AISummaryBox({ summary, items }: AISummaryBoxProps) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: colors.background.space,
        border: `1px solid ${colors.accent.webb}30`,
        boxShadow: 'none',
      }}
    >
      <div className="flex items-start gap-3 mb-4">
        <Sparkles
          className="mt-0.5 h-5 w-5 flex-shrink-0"
          style={{ color: colors.accent.webb }}
          aria-hidden="true"
        />
        <div>
          <h4
            className="text-sm font-semibold"
            style={{ fontFamily: typography.fontFamily.display, color: colors.text.starlight }}
          >
            {kloelT(`Resumo do que a IA sabe sobre este plano`)}
          </h4>
          <p className="mt-2 text-sm" style={{ color: colors.text.moonlight }}>
            {summary}
          </p>
        </div>
      </div>

      <div
        className="grid gap-2 md:grid-cols-4 lg:grid-cols-7 mt-4 pt-4"
        style={{ borderTop: `1px solid ${colors.border.space}` }}
      >
        {items.map((item) => {
          const color = completenessColor(item.complete, item.partial);
          const Icon = item.complete ? CheckCircle : item.partial ? MinusCircle : Circle;
          return (
            <div key={item.label} className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
              <span className="text-[10px] font-medium" style={{ color }}>
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
