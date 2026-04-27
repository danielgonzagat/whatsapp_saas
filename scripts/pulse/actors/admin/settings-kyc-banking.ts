/**
 * Admin scenario: `admin-settings-kyc-banking`.
 *
 * Verifies — by structural observation only — that the admin-side KYC review
 * and banking-approval surfaces are wired end-to-end:
 *   - Frontend admin pages for KYC review, workspace inspection, and wallet.
 *   - Backend admin compliance controller + service operating on `kycStatus`.
 *   - Backend admin carteira controller linked to the wallet ledger service.
 *
 * Scan-mode evidence is emitted with `truthMode: 'inferred'` — each assertion
 * checks file existence / content fragments. No HTTP request, DB query, or
 * Playwright execution is performed. Marking as `observed` would be a
 * semantic lie.
 */
import {
  checkAdminPaths,
  allAdminPresent,
  summarizeAdminMissing,
  type AdminStructuralCheck,
  type AdminStructuralCheckSpec,
} from './structural-checks';

const CHECKS: ReadonlyArray<AdminStructuralCheckSpec> = [
  // Frontend admin surfaces (KYC review, workspace inspection, wallet).
  {
    label: 'frontend-admin-kyc-page',
    relPath: 'frontend-admin/src/app/(admin)/contas/kyc/page.tsx',
    mustContain: ['approveKyc', 'rejectKyc'],
  },
  {
    label: 'frontend-admin-workspace-page',
    relPath: 'frontend-admin/src/app/(admin)/contas/[workspaceId]/page.tsx',
  },
  {
    label: 'frontend-admin-carteira-page',
    relPath: 'frontend-admin/src/app/(admin)/carteira/page.tsx',
  },

  // Backend admin compliance stack (KYC review).
  {
    label: 'backend-admin-compliance-controller',
    relPath: 'backend/src/admin/compliance/admin-compliance.controller.ts',
  },
  {
    label: 'backend-admin-compliance-service',
    relPath: 'backend/src/admin/compliance/admin-compliance.service.ts',
    mustContain: ['kycStatus'],
  },
  {
    label: 'backend-admin-compliance-module',
    relPath: 'backend/src/admin/compliance/admin-compliance.module.ts',
  },

  // Backend admin carteira (banking approval + wallet ledger linkage).
  {
    label: 'backend-admin-carteira-controller',
    relPath: 'backend/src/admin/carteira/admin-carteira.controller.ts',
    mustContain: ['ledger'],
  },
  {
    label: 'backend-admin-carteira-module',
    relPath: 'backend/src/admin/carteira/admin-carteira.module.ts',
  },
];

export interface SettingsKycBankingObservation {
  passed: boolean;
  summary: string;
  checks: AdminStructuralCheck[];
  truthMode: 'inferred';
}

export function observeSettingsKycBanking(rootDir: string): SettingsKycBankingObservation {
  const checks = checkAdminPaths(rootDir, CHECKS);
  const passed = allAdminPresent(checks);
  const summary = passed
    ? `admin-settings-kyc-banking: ${checks.length} structural anchors present (inferred from file paths — no HTTP/DB execution).`
    : `admin-settings-kyc-banking missing structural anchors: ${summarizeAdminMissing(checks)}.`;
  return { passed, summary, checks, truthMode: 'inferred' };
}
