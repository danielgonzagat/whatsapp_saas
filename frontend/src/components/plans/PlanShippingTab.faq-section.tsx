'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors, typography } from '@/lib/design-tokens';
import { Bot, ChevronUp, ChevronDown } from 'lucide-react';
import { FAQ_QUESTIONS, FAQ_ANSWERS } from './PlanShippingTab.constants';

interface PlanFaqSectionProps {
  faqAnswers: Record<number, string>;
  setFaqAnswers: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  openFaqs: Record<number, boolean>;
  toggleFaq: (i: number) => void;
}

const selectClass = 'w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none';

const inputStyle: React.CSSProperties = {
  background: colors.background.nebula,
  border: `1px solid ${colors.border.space}`,
  color: colors.text.starlight,
  borderRadius: '6px',
};

export function PlanFaqSection({
  faqAnswers,
  setFaqAnswers,
  openFaqs,
  toggleFaq,
}: PlanFaqSectionProps) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: colors.background.space,
        border: `1px solid ${colors.border.space}`,
        borderRadius: '6px',
      }}
    >
      <h3
        className="mb-4 text-sm font-semibold uppercase"
        style={{
          fontFamily: typography.fontFamily.display,
          color: colors.text.starlight,
          letterSpacing: '0.02em',
        }}
      >
        Política de entrega — FAQ
      </h3>
      <div className="space-y-3">
        {FAQ_QUESTIONS.map((q, i) => {
          const isOpen = openFaqs[i] ?? false;
          return (
            <div
              key={q}
              className="rounded-xl overflow-hidden transition-all"
              style={{
                background: colors.background.nebula,
                border: `1px solid ${colors.border.space}`,
              }}
            >
              <button
                type="button"
                onClick={() => toggleFaq(i)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:opacity-80"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: colors.text.starlight }}>
                    {q}
                  </span>
                  <span
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase flex-shrink-0"
                    style={{
                      background: `${colors.accent.webb}15`,
                      color: colors.accent.webb,
                      letterSpacing: '0.05em',
                    }}
                  >
                    <Bot className="h-2.5 w-2.5" aria-hidden="true" />{' '}
                    {kloelT(`IA usa esta resposta`)}
                  </span>
                </div>
                {isOpen ? (
                  <ChevronUp
                    className="h-4 w-4 flex-shrink-0"
                    style={{ color: colors.text.dust }}
                    aria-hidden="true"
                  />
                ) : (
                  <ChevronDown
                    className="h-4 w-4 flex-shrink-0"
                    style={{ color: colors.text.dust }}
                    aria-hidden="true"
                  />
                )}
              </button>
              <div
                className="overflow-hidden transition-all"
                style={{
                  maxHeight: isOpen ? '200px' : '0px',
                  opacity: isOpen ? 1 : 0,
                  transition: 'max-height 300ms ease, opacity 250ms ease',
                }}
              >
                <div className="px-4 pb-4">
                  <select
                    value={faqAnswers[i]}
                    onChange={(e) => setFaqAnswers({ ...faqAnswers, [i]: e.target.value })}
                    className={selectClass}
                    style={inputStyle}
                  >
                    {(FAQ_ANSWERS[i] || []).map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
