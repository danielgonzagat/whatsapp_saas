'use client';

import { useState } from 'react';
import { 
  ShieldAlert, 
  Check, 
  X,
  Pencil,
  AlertTriangle,
  Users,
  MessageSquare,
  CreditCard,
  Trash2,
  Power,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { colors, motion, radius, shadows } from '@/lib/design-tokens';

// ============================================
// TYPES
// ============================================

export type SensitiveOperationType = 
  | 'mass-send'
  | 'payment'
  | 'delete'
  | 'power-toggle'
  | 'export'
  | 'custom';

export interface SensitiveOperationDetails {
  type: SensitiveOperationType;
  /** Main message describing the action */
  message: string;
  /** Additional details */
  details?: string[];
  /** Parameters that can be edited */
  parameters?: Array<{
    key: string;
    label: string;
    value: string | number;
    editable?: boolean;
  }>;
  /** Warning level */
  severity?: 'low' | 'medium' | 'high';
}

export interface SensitiveOperationGateProps {
  /** Operation details */
  operation: SensitiveOperationDetails;
  /** Called when user approves */
  onApprove: () => void;
  /** Called when user wants to edit */
  onEdit?: () => void;
  /** Called when user cancels */
  onCancel: () => void;
  /** Is processing? */
  isProcessing?: boolean;
  /** Additional class */
  className?: string;
}

// ============================================
// TYPE ICONS
// ============================================

const TYPE_ICONS: Record<SensitiveOperationType, React.ElementType> = {
  'mass-send': MessageSquare,
  'payment': CreditCard,
  'delete': Trash2,
  'power-toggle': Power,
  'export': Users,
  'custom': AlertTriangle,
};

const SEVERITY_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
  low: {
    bg: `${colors.state.info}10`,
    border: `${colors.state.info}30`,
    icon: colors.state.info,
  },
  medium: {
    bg: `${colors.state.warning}10`,
    border: `${colors.state.warning}30`,
    icon: colors.state.warning,
  },
  high: {
    bg: `${colors.state.error}10`,
    border: `${colors.state.error}30`,
    icon: colors.state.error,
  },
};

// ============================================
// COMPONENT
// ============================================

export function SensitiveOperationGate({
  operation,
  onApprove,
  onEdit,
  onCancel,
  isProcessing = false,
  className,
}: SensitiveOperationGateProps) {
  const [isHovered, setIsHovered] = useState<'approve' | 'edit' | 'cancel' | null>(null);

  const Icon = TYPE_ICONS[operation.type] || AlertTriangle;
  const severity = operation.severity || 'medium';
  const severityColors = SEVERITY_COLORS[severity];

  return (
    <div
      className={cn('w-full max-w-lg mx-auto', className)}
      style={{
        backgroundColor: colors.background.surface1,
        borderRadius: radius.xl,
        border: `1px solid ${colors.stroke}`,
        boxShadow: shadows.elevated,
        overflow: 'hidden',
        transition: `all ${motion.duration.normal} ${motion.easing.default}`,
      }}
    >
      {/* Header with Icon */}
      <div 
        className="flex items-center gap-3 px-5 py-4"
        style={{
          backgroundColor: severityColors.bg,
          borderBottom: `1px solid ${severityColors.border}`,
        }}
      >
        <div 
          className="p-2 rounded-lg"
          style={{ backgroundColor: `${severityColors.icon}20` }}
        >
          <ShieldAlert 
            className="w-5 h-5"
            style={{ color: severityColors.icon }}
          />
        </div>
        <div>
          <h3 
            className="font-semibold text-base"
            style={{ color: colors.text.primary }}
          >
            Confirmação Necessária
          </h3>
          <p 
            className="text-sm"
            style={{ color: colors.text.secondary }}
          >
            Esta ação requer sua aprovação
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4 space-y-4">
        {/* Main Message */}
        <div className="flex items-start gap-3">
          <Icon 
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            style={{ color: colors.brand.cyan }}
          />
          <p 
            className="text-base"
            style={{ color: colors.text.primary }}
          >
            {operation.message}
          </p>
        </div>

        {/* Details */}
        {operation.details && operation.details.length > 0 && (
          <ul className="space-y-1 pl-8">
            {operation.details.map((detail, idx) => (
              <li 
                key={idx}
                className="text-sm flex items-center gap-2"
                style={{ color: colors.text.secondary }}
              >
                <span 
                  className="w-1 h-1 rounded-full"
                  style={{ backgroundColor: colors.text.muted }}
                />
                {detail}
              </li>
            ))}
          </ul>
        )}

        {/* Parameters */}
        {operation.parameters && operation.parameters.length > 0 && (
          <div 
            className="rounded-lg p-3 space-y-2"
            style={{ backgroundColor: colors.background.surface2 }}
          >
            {operation.parameters.map((param) => (
              <div 
                key={param.key}
                className="flex items-center justify-between"
              >
                <span 
                  className="text-sm"
                  style={{ color: colors.text.muted }}
                >
                  {param.label}
                </span>
                <span 
                  className="text-sm font-medium"
                  style={{ color: colors.text.primary }}
                >
                  {param.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div 
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderTop: `1px solid ${colors.divider}` }}
      >
        {/* Cancel */}
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          onMouseEnter={() => setIsHovered('cancel')}
          onMouseLeave={() => setIsHovered(null)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50"
          style={{
            backgroundColor: isHovered === 'cancel' ? colors.background.surface2 : 'transparent',
            border: `1px solid ${colors.stroke}`,
            color: colors.text.secondary,
          }}
        >
          <X className="w-4 h-4" />
          Cancelar
        </button>

        {/* Edit (optional) */}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            disabled={isProcessing}
            onMouseEnter={() => setIsHovered('edit')}
            onMouseLeave={() => setIsHovered(null)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50"
            style={{
              backgroundColor: isHovered === 'edit' ? colors.background.surface2 : 'transparent',
              border: `1px solid ${colors.stroke}`,
              color: colors.text.secondary,
            }}
          >
            <Pencil className="w-4 h-4" />
            Editar
          </button>
        )}

        {/* Approve */}
        <button
          type="button"
          onClick={onApprove}
          disabled={isProcessing}
          onMouseEnter={() => setIsHovered('approve')}
          onMouseLeave={() => setIsHovered(null)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50"
          style={{
            backgroundColor: isHovered === 'approve' ? colors.brand.greenHover : colors.brand.green,
            color: colors.background.obsidian,
          }}
        >
          <Check className="w-4 h-4" />
          Aprovar
        </button>
      </div>
    </div>
  );
}

// ============================================
// INLINE VARIANT (for chat messages)
// ============================================

export function SensitiveOperationGateInline({
  operation,
  onApprove,
  onCancel,
  isProcessing = false,
  className,
}: Omit<SensitiveOperationGateProps, 'onEdit'>) {
  return (
    <div
      className={cn('inline-flex items-center gap-3 p-3 rounded-lg', className)}
      style={{
        backgroundColor: colors.background.surface1,
        border: `1px solid ${colors.state.warning}40`,
      }}
    >
      <AlertTriangle className="w-5 h-5" style={{ color: colors.state.warning }} />
      
      <span 
        className="text-sm flex-1"
        style={{ color: colors.text.primary }}
      >
        {operation.message}
      </span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="p-1.5 rounded-md transition-colors hover:bg-white/5"
          style={{ color: colors.text.muted }}
        >
          <X className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={isProcessing}
          className="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
          style={{
            backgroundColor: colors.brand.green,
            color: colors.background.obsidian,
          }}
        >
          Aprovar
        </button>
      </div>
    </div>
  );
}
