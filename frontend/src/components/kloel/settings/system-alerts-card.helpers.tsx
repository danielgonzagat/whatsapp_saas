'use client';

import type { ComponentType, SVGProps } from 'react';
import { ChevronRight } from 'lucide-react';

/** Alert type type. */
export type AlertType = 'success' | 'warning' | 'error' | 'info';

/** Alert definition shape. */
export interface AlertDefinition {
  /** Id property. */
  id: string;
  /** Type property. */
  type: AlertType;
  /** Message property. */
  message: string;
  /** Detail property. */
  detail?: string;
}

/** Alert style tokens shape. */
export interface AlertStyleTokens {
  /** Bg property. */
  bg: string;
  /** Text property. */
  text: string;
  /** Icon property. */
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Icon color property. */
  iconColor: string;
}

/** Resolve notice tone. */
export function resolveNoticeTone(type: AlertType): 'danger' | 'warning' | 'info' | 'neutral' {
  if (type === 'error') {
    return 'danger';
  }
  if (type === 'warning') {
    return 'warning';
  }
  if (type === 'info') {
    return 'info';
  }
  return 'neutral';
}

interface AlertRowProps {
  alert: AlertDefinition;
  styles: AlertStyleTokens;
  onResolve: (alert: AlertDefinition) => void;
}

/** Alert row. */
export function AlertRow({ alert, styles, onResolve }: AlertRowProps) {
  const Icon = styles.icon;
  const hasDetail = Boolean(alert.detail?.trim());
  const showResolveCta = alert.type !== 'success' && hasDetail;

  return (
    <div className={`flex items-center justify-between rounded-md ${styles.bg} p-4`}>
      <div className="flex items-center gap-3">
        <Icon className={`h-5 w-5 ${styles.iconColor}`} />
        <span className={`text-sm font-medium ${styles.text}`}>{alert.message}</span>
      </div>
      {showResolveCta ? (
        <button
          type="button"
          onClick={() => onResolve(alert)}
          className={`flex items-center gap-1 text-xs font-medium ${styles.text} hover:underline`}
        >
          Ver como resolver
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
