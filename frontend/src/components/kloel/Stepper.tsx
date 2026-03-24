'use client';

import { colors } from '@/lib/design-tokens';

interface Step {
  id: number;
  label: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        padding: '16px 0',
      }}
    >
      {steps.map((step, idx) => {
        const isCompleted = step.id < currentStep;
        const isActive = step.id === currentStep;
        const isFuture = step.id > currentStep;
        const isClickable = isCompleted && onStepClick;

        return (
          <div
            key={step.id}
            style={{
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {/* Step dot */}
            <button
              onClick={() => isClickable && onStepClick(step.id)}
              disabled={!isClickable}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                background: 'none',
                border: 'none',
                cursor: isClickable ? 'pointer' : 'default',
                padding: '4px 8px',
                minWidth: 60,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "'Outfit', sans-serif",
                  transition: 'all 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  background: isActive
                    ? colors.accent.webb
                    : isCompleted
                      ? colors.state.success
                      : colors.background.stellar,
                  color: isActive || isCompleted ? '#FFFFFF' : colors.text.void,
                  boxShadow: isActive
                    ? '0 0 12px rgba(78, 122, 224, 0.3)'
                    : isCompleted
                      ? '0 0 8px rgba(45, 212, 160, 0.2)'
                      : 'none',
                }}
              >
                {isCompleted ? '✓' : step.id}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  fontFamily: "'DM Sans', sans-serif",
                  color: isActive
                    ? colors.text.starlight
                    : isCompleted
                      ? colors.text.moonlight
                      : colors.text.void,
                  textAlign: 'center',
                  lineHeight: 1.2,
                  maxWidth: 70,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {step.label}
              </span>
            </button>

            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div
                style={{
                  width: 24,
                  height: 2,
                  borderRadius: 1,
                  background: isCompleted
                    ? colors.state.success
                    : colors.border.space,
                  transition: 'background 250ms',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
