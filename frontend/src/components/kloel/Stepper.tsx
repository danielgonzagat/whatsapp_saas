'use client';

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
        const isClickable = isCompleted && onStepClick;

        return (
          <div
            key={step.id}
            style={{
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {/* Step indicator */}
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
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "'Sora', sans-serif",
                  transition: 'all 150ms ease',
                  background: isActive
                    ? '#E85D30'
                    : isCompleted
                      ? '#E0DDD8'
                      : '#19191C',
                  color: isActive || isCompleted ? '#0A0A0C' : '#3A3A3F',
                  boxShadow: 'none',
                }}
              >
                {isCompleted ? String.fromCharCode(10003) : step.id}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  fontFamily: "'Sora', sans-serif",
                  color: isActive
                    ? '#E0DDD8'
                    : isCompleted
                      ? '#6E6E73'
                      : '#3A3A3F',
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
                  background: isCompleted ? '#E0DDD8' : '#19191C',
                  transition: 'background 150ms ease',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
