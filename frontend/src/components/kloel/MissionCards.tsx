'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { colors, radius, shadows, motion } from '@/lib/design-tokens';

// ============================================
// TYPES
// ============================================

export type MissionStatus = 'pending' | 'in-progress' | 'completed' | 'suggested';

export interface MissionCardData {
  id: string;
  title: string;
  description?: string;
  icon?: React.ElementType;
  status?: MissionStatus;
  /** If true, this is a priority mission */
  priority?: boolean;
  /** Action when clicked */
  action?: () => void;
  /** Prompt to send when clicked */
  prompt?: string;
}

export interface MissionCardsProps {
  /** Title above the cards */
  title?: string;
  /** List of missions */
  missions: MissionCardData[];
  /** Called when a mission is clicked */
  onMissionClick?: (mission: MissionCardData) => void;
  /** Max number of missions to show */
  maxVisible?: number;
  /** Additional class */
  className?: string;
}

// ============================================
// STATUS STYLES
// ============================================

const STATUS_STYLES: Record<MissionStatus, { bg: string; border: string; badge?: string }> = {
  pending: {
    bg: colors.background.surface1,
    border: colors.stroke,
  },
  'in-progress': {
    bg: colors.background.surface1,
    border: colors.brand.cyan,
    badge: colors.brand.cyan,
  },
  completed: {
    bg: colors.background.surface1,
    border: `${colors.brand.green}50`,
    badge: colors.brand.green,
  },
  suggested: {
    bg: colors.background.surface1,
    border: colors.stroke,
  },
};

// ============================================
// MISSION CARD
// ============================================

function MissionCard({
  mission,
  onClick,
}: {
  mission: MissionCardData;
  onClick?: () => void;
}) {
  const status = mission.status || 'suggested';
  const styles = STATUS_STYLES[status];
  const Icon = mission.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 rounded-xl transition-all group',
        'hover:scale-[1.02]',
        mission.priority && 'ring-1 ring-offset-1 ring-offset-transparent'
      )}
      style={{
        backgroundColor: styles.bg,
        border: `1px solid ${mission.priority ? colors.brand.green : styles.border}`,
        boxShadow: shadows.card,
        transition: `all ${motion.duration.normal} ${motion.easing.default}`,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        {Icon && (
          <div
            className="p-2 rounded-lg flex-shrink-0"
            style={{
              backgroundColor: mission.priority
                ? `${colors.brand.green}15`
                : `${colors.brand.cyan}15`,
            }}
          >
            <Icon
              className="w-5 h-5"
              style={{
                color: mission.priority ? colors.brand.green : colors.brand.cyan,
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className="font-semibold text-sm"
              style={{ color: colors.text.primary }}
            >
              {mission.title}
            </h3>

            {/* Priority badge */}
            {mission.priority && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: `${colors.brand.green}20`,
                  color: colors.brand.green,
                }}
              >
                Prioridade
              </span>
            )}

            {/* Status badge */}
            {status === 'in-progress' && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: `${colors.brand.cyan}20`,
                  color: colors.brand.cyan,
                }}
              >
                Em andamento
              </span>
            )}
            {status === 'completed' && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: `${colors.brand.green}20`,
                  color: colors.brand.green,
                }}
              >
                ✓ Concluído
              </span>
            )}
          </div>

          {mission.description && (
            <p
              className="text-sm mt-1 line-clamp-2"
              style={{ color: colors.text.secondary }}
            >
              {mission.description}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ============================================
// MISSION CARDS LIST
// ============================================

export function MissionCards({
  title = 'Missões sugeridas',
  missions,
  onMissionClick,
  maxVisible = 6,
  className,
}: MissionCardsProps) {
  const visibleMissions = missions.slice(0, maxVisible);

  if (visibleMissions.length === 0) return null;

  return (
    <div className={className}>
      {title && (
        <h2
          className="text-sm font-medium mb-4"
          style={{ color: colors.text.muted }}
        >
          {title}
        </h2>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleMissions.map((mission) => (
          <MissionCard
            key={mission.id}
            mission={mission}
            onClick={() => {
              if (mission.action) {
                mission.action();
              } else if (onMissionClick) {
                onMissionClick(mission);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================
// PROOF CARDS (minimal status cards)
// ============================================

export interface ProofCardData {
  id: string;
  label: string;
  value: string | number;
  status?: 'good' | 'warning' | 'error' | 'neutral';
  icon?: React.ElementType;
}

export interface ProofCardsProps {
  proofs: ProofCardData[];
  className?: string;
}

const PROOF_STATUS_COLORS = {
  good: colors.brand.green,
  warning: colors.state.warning,
  error: colors.state.error,
  neutral: colors.text.muted,
};

export function ProofCards({ proofs, className }: ProofCardsProps) {
  return (
    <div className={cn('flex flex-wrap gap-3', className)}>
      {proofs.map((proof) => {
        const Icon = proof.icon;
        const statusColor = PROOF_STATUS_COLORS[proof.status || 'neutral'];

        return (
          <div
            key={proof.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              backgroundColor: colors.background.surface1,
              border: `1px solid ${colors.stroke}`,
            }}
          >
            {Icon && <Icon className="w-4 h-4" style={{ color: statusColor }} />}
            <span className="text-xs" style={{ color: colors.text.muted }}>
              {proof.label}:
            </span>
            <span
              className="text-sm font-medium"
              style={{ color: colors.text.primary }}
            >
              {proof.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
