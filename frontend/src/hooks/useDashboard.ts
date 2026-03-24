'use client';

import { useAnalyticsDashboard } from './useAnalytics';
import { useAutopilotStatus } from './useAutopilot';

/**
 * Composite hook that combines the analytics dashboard and autopilot status
 * into a single return value for the main dashboard page.
 */
export function useDashboard() {
  const { dashboard, isLoading: dashLoading, error: dashError, mutate: mutateDashboard } = useAnalyticsDashboard();
  const { status: autopilot, isLoading: autopilotLoading, error: autopilotError, mutate: mutateAutopilot } = useAutopilotStatus();

  return {
    dashboard,
    autopilot,
    isLoading: dashLoading || autopilotLoading,
    error: dashError || autopilotError,
    mutateDashboard,
    mutateAutopilot,
  };
}
