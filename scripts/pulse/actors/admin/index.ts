/**
 * Admin structural-observation registry.
 *
 * Maps admin scenario ids to their structural observers. Used by the
 * synthetic-actor evaluator to back `playwright-spec`-runner admin scenarios
 * with a scan-mode observation when no live Playwright run was requested.
 *
 * Mirrors `actors/operator/index.ts` so admin and operator scenarios share a
 * single observation contract.
 */
import { observeSettingsKycBanking } from './settings-kyc-banking';
import { observeWhatsappSessionControl } from './whatsapp-session-control';
import type { AdminStructuralCheck } from './structural-checks';

export interface AdminScenarioObservation {
  passed: boolean;
  summary: string;
  checks: AdminStructuralCheck[];
  truthMode: 'inferred';
}

export type AdminScenarioObserver = (rootDir: string) => AdminScenarioObservation;

const OBSERVERS: Record<string, AdminScenarioObserver> = {
  'admin-settings-kyc-banking': observeSettingsKycBanking,
  'admin-whatsapp-session-control': observeWhatsappSessionControl,
};

export function getAdminScenarioObserver(scenarioId: string): AdminScenarioObserver | null {
  return OBSERVERS[scenarioId] || null;
}

export function listAdminScenarioIds(): string[] {
  return Object.keys(OBSERVERS).sort();
}

/** Run all registered admin observers and return their bundle. */
export function runAllAdminObservers(rootDir: string): AdminScenarioObservation[] {
  return Object.values(OBSERVERS).map((observer) => observer(rootDir));
}
