'use client';

import { useState } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { colors, motion, radius, shadows } from '@/lib/design-tokens';

// ============================================
// TYPES
// ============================================

export type StepStatus = 'pending' | 'in-progress' | 'completed' | 'awaiting-confirmation' | 'error';

export interface AgentStep {
  id: string;
  title: string;
  description?: string;
  status: StepStatus;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentTimelineProps {
  /** List of steps in the agent plan */
  steps: AgentStep[];
  /** Title of the plan */
  title?: string;
  /** Is collapsible? */
  collapsible?: boolean;
  /** Start collapsed? */
  defaultCollapsed?: boolean;
  /** Called when step needs confirmation */
  onConfirmStep?: (stepId: string) => void;
  /** Additional class */
  className?: string;
}

// ============================================
// STATUS ICONS
// ============================================

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'completed':
      return (
        <CheckCircle2 
          className="w-5 h-5" 
          style={{ color: colors.brand.green }}
        />
      );
    case 'in-progress':
      return (
        <Loader2 
          className="w-5 h-5 animate-spin" 
          style={{ color: colors.brand.cyan }}
        />
      );
    case 'awaiting-confirmation':
      return (
        <AlertTriangle 
          className="w-5 h-5" 
          style={{ color: colors.state.warning }}
        />
      );
    case 'error':
      return (
        <Circle 
          className="w-5 h-5" 
          style={{ color: colors.state.error }}
        />
      );
    default:
      return (
        <Circle 
          className="w-5 h-5" 
          style={{ color: colors.text.muted }}
        />
      );
  }
}

// ============================================
// COMPONENT
// ============================================

export function AgentTimeline({
  steps,
  title = 'Plano do Agente',
  collapsible = true,
  defaultCollapsed = false,
  onConfirmStep,
  className,
}: AgentTimelineProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const completedCount = steps.filter(s => s.status === 'completed').length;
  const totalCount = steps.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div
      className={cn('w-full', className)}
      style={{
        backgroundColor: colors.background.surface1,
        borderRadius: radius.lg,
        border: `1px solid ${colors.stroke}`,
        boxShadow: shadows.card,
        overflow: 'hidden',
        transition: `all ${motion.duration.normal} ${motion.easing.default}`,
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => collapsible && setIsCollapsed(!isCollapsed)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3',
          collapsible && 'cursor-pointer hover:bg-white/[0.02]'
        )}
        style={{
          borderBottom: isCollapsed ? 'none' : `1px solid ${colors.divider}`,
        }}
      >
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5" style={{ color: colors.brand.cyan }} />
          <span 
            className="font-medium text-sm"
            style={{ color: colors.text.primary }}
          >
            {title}
          </span>
          <span 
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: colors.background.surface2,
              color: colors.text.muted,
            }}
          >
            {completedCount}/{totalCount}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Progress bar */}
          <div 
            className="w-20 h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: colors.background.surface2 }}
          >
            <div 
              className="h-full rounded-full transition-all duration-300"
              style={{ 
                width: `${progress}%`,
                backgroundColor: colors.brand.green,
              }}
            />
          </div>

          {collapsible && (
            isCollapsed ? (
              <ChevronDown className="w-4 h-4" style={{ color: colors.text.muted }} />
            ) : (
              <ChevronUp className="w-4 h-4" style={{ color: colors.text.muted }} />
            )
          )}
        </div>
      </button>

      {/* Steps List */}
      {!isCollapsed && (
        <div className="px-4 py-3 space-y-1">
          {steps.map((step, idx) => (
            <div 
              key={step.id} 
              className="flex items-start gap-3 py-2 relative"
            >
              {/* Connector Line */}
              {idx < steps.length - 1 && (
                <div 
                  className="absolute left-[9px] top-8 w-px h-[calc(100%-8px)]"
                  style={{ 
                    backgroundColor: step.status === 'completed' 
                      ? colors.brand.green 
                      : colors.stroke 
                  }}
                />
              )}

              {/* Status Icon */}
              <div className="relative z-10 flex-shrink-0 mt-0.5">
                <StatusIcon status={step.status} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span 
                    className={cn(
                      'text-sm font-medium',
                      step.status === 'completed' && 'line-through opacity-70'
                    )}
                    style={{ 
                      color: step.status === 'error' 
                        ? colors.state.error 
                        : colors.text.primary 
                    }}
                  >
                    {step.title}
                  </span>

                  {step.status === 'in-progress' && (
                    <span 
                      className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${colors.brand.cyan}20`,
                        color: colors.brand.cyan,
                      }}
                    >
                      em andamento
                    </span>
                  )}

                  {step.status === 'awaiting-confirmation' && (
                    <span 
                      className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${colors.state.warning}20`,
                        color: colors.state.warning,
                      }}
                    >
                      aguardando
                    </span>
                  )}
                </div>

                {step.description && (
                  <p 
                    className="text-sm mt-0.5"
                    style={{ color: colors.text.muted }}
                  >
                    {step.description}
                  </p>
                )}

                {step.timestamp && (
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" style={{ color: colors.text.muted }} />
                    <span 
                      className="text-xs"
                      style={{ color: colors.text.muted }}
                    >
                      {step.timestamp}
                    </span>
                  </div>
                )}

                {/* Confirmation Button */}
                {step.status === 'awaiting-confirmation' && onConfirmStep && (
                  <button
                    type="button"
                    onClick={() => onConfirmStep(step.id)}
                    className="mt-2 px-3 py-1 text-xs font-medium rounded-md transition-colors"
                    style={{
                      backgroundColor: colors.brand.green,
                      color: colors.background.obsidian,
                    }}
                  >
                    Confirmar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// MINI VARIANT (single line)
// ============================================

export function AgentTimelineMini({
  steps,
  className,
}: Pick<AgentTimelineProps, 'steps' | 'className'>) {
  const currentStep = steps.find(s => s.status === 'in-progress' || s.status === 'awaiting-confirmation');
  const completedCount = steps.filter(s => s.status === 'completed').length;

  if (!currentStep && completedCount === steps.length) {
    return (
      <div 
        className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-full', className)}
        style={{
          backgroundColor: `${colors.brand.green}15`,
          border: `1px solid ${colors.brand.green}30`,
        }}
      >
        <CheckCircle2 className="w-4 h-4" style={{ color: colors.brand.green }} />
        <span className="text-sm" style={{ color: colors.brand.green }}>
          Concluído
        </span>
      </div>
    );
  }

  return (
    <div 
      className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-full', className)}
      style={{
        backgroundColor: colors.background.surface1,
        border: `1px solid ${colors.stroke}`,
      }}
    >
      {currentStep?.status === 'in-progress' && (
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: colors.brand.cyan }} />
      )}
      {currentStep?.status === 'awaiting-confirmation' && (
        <AlertTriangle className="w-4 h-4" style={{ color: colors.state.warning }} />
      )}
      <span className="text-sm" style={{ color: colors.text.secondary }}>
        {currentStep?.title || `${completedCount}/${steps.length} passos`}
      </span>
    </div>
  );
}
