'use client';
import { colors } from '@/lib/design-tokens';
import { OBJECTIONS } from './PlanAIConfig.data';
import { PLAN_AI_INPUT_STYLE } from './PlanAIConfig.shared';

interface ObjectionsSectionProps {
  objectionStates: Record<string, { enabled: boolean; response: string }>;
  setObjectionStates: (v: Record<string, { enabled: boolean; response: string }>) => void;
}

export function ObjectionsSection({ objectionStates, setObjectionStates }: ObjectionsSectionProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {OBJECTIONS.map((obj) => {
        const st = objectionStates[obj.id];
        const isEnabled = st?.enabled;
        return (
          <div
            key={obj.id}
            className="flex items-center justify-between rounded-xl px-4 py-3 transition-all"
            style={{
              background: isEnabled ? colors.background.space : colors.background.void,
              border: `1px solid ${isEnabled ? colors.border.space : colors.border.void}`,
              opacity: isEnabled ? 1 : 0.5,
            }}
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setObjectionStates({
                    ...objectionStates,
                    [obj.id]: { ...st, enabled: !st?.enabled },
                  })
                }
                className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0"
                style={{
                  backgroundColor: isEnabled ? colors.accent.webb : colors.background.corona,
                }}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`}
                />
              </button>
              <span
                className="text-sm font-semibold"
                style={{ color: isEnabled ? colors.text.starlight : colors.text.dust }}
              >
                {obj.label}
              </span>
            </div>
            <select
              value={st?.response}
              onChange={(e) =>
                setObjectionStates({
                  ...objectionStates,
                  [obj.id]: { ...st, response: e.target.value },
                })
              }
              disabled={!isEnabled}
              className="max-w-[180px] rounded-lg px-2 py-1 text-xs focus:outline-none disabled:cursor-not-allowed"
              style={{ ...PLAN_AI_INPUT_STYLE, fontSize: '12px' }}
            >
              {obj.responses.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
