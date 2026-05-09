'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors, typography } from '@/lib/design-tokens';
import { STEPS } from './types';
import { Check } from 'lucide-react';

export function MonitorStepper({
  currentStep,
  visibleSteps,
}: {
  currentStep: number;
  visibleSteps: number[];
}) {
  const filtered = STEPS.filter((s) => visibleSteps.includes(s.id));

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
        {filtered.map((step, idx) => {
          const isActive = step.id === currentStep;
          const isCompleted = step.id < currentStep;

          return (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: 64,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: typography.fontFamily.display,
                    backgroundColor: isCompleted
                      ? colors.state.success
                      : isActive
                        ? colors.accent.webb
                        : colors.background.nebula,
                    color: isCompleted || isActive ? 'var(--app-text-on-accent)' : colors.text.void,
                    border: isActive
                      ? `2px solid ${colors.accent.webb}`
                      : isCompleted
                        ? `2px solid ${colors.state.success}`
                        : `1px solid ${colors.border.space}`,
                    transition: 'all 150ms ease',
                  }}
                >
                  {isCompleted ? <Check className="h-4 w-4" aria-hidden="true" /> : step.id}
                </div>
                <span
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    fontWeight: 500,
                    fontFamily: typography.fontFamily.display,
                    color: isActive
                      ? colors.accent.webb
                      : isCompleted
                        ? colors.state.success
                        : colors.text.void,
                    letterSpacing: '0.02em',
                    transition: 'color 150ms ease',
                  }}
                >
                  {kloelT(step.label)}
                </span>
              </div>
              {idx < filtered.length - 1 && (
                <div
                  style={{
                    width: 40,
                    height: 2,
                    backgroundColor:
                      step.id < currentStep ? colors.state.success : colors.border.space,
                    marginBottom: 18,
                    transition: 'background-color 150ms ease',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
