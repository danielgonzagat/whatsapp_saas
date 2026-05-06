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

function deriveSettingsKycBankingChecks(): ReadonlyArray<AdminStructuralCheckSpec> {
  return [
    // Frontend admin surfaces (KYC review, workspace inspection, wallet).
    {
      relPath: 'frontend-admin/src/app/(admin)/contas/kyc/page.tsx',
      mustContain: ['approveKyc', 'rejectKyc'],
    },
    {
      relPath: 'frontend-admin/src/app/(admin)/contas/[workspaceId]/page.tsx',
    },
    {
      relPath: 'frontend-admin/src/app/(admin)/carteira/page.tsx',
    },

    // Backend admin compliance stack (KYC review).
    {
      relPath: 'backend/src/admin/compliance/admin-compliance.controller.ts',
    },
    {
      relPath: 'backend/src/admin/compliance/admin-compliance.service.ts',
      mustContain: ['kycStatus'],
    },
    {
      relPath: 'backend/src/admin/compliance/admin-compliance.module.ts',
    },

    // Backend admin carteira (banking approval + wallet ledger linkage).
    {
      relPath: 'backend/src/admin/carteira/admin-carteira.controller.ts',
      mustContain: ['ledger'],
    },
    {
      relPath: 'backend/src/admin/carteira/admin-carteira.module.ts',
    },
  ];
}

export interface SettingsKycBankingObservation {
  passed: boolean;
  summary: string;
  checks: AdminStructuralCheck[];
  truthMode: 'inferred';
}

export function observeSettingsKycBanking(rootDir: string): SettingsKycBankingObservation {
  const checks = checkAdminPaths(rootDir, deriveSettingsKycBankingChecks());
  const passed = allAdminPresent(checks);
  const summary = passed
    ? `admin-settings-kyc-banking: ${checks.length} structural anchors present (inferred from file paths — no HTTP/DB execution).`
    : `admin-settings-kyc-banking missing structural anchors: ${summarizeAdminMissing(checks)}.`;
  return { passed, summary, checks, truthMode: 'inferred' };
}
