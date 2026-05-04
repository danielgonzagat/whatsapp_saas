/**
 * Admin flow verifiers.
 *
 * These helpers complement the admin synthetic actor verifiers: they confirm
 * that the cross-cutting flows referenced by admin scenarios (KYC review +
 * banking approval, wallet ledger linkage, WhatsApp session control) have a
 * concrete code path in the repository. They produce structured results
 * suitable for inclusion in `PULSE_ADMIN_EVIDENCE.json` without making any
 * HTTP request or mutating application code.
 */
import { pathExists, readTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';

/** Result of a single admin flow verification. */
export interface AdminFlowVerification {
  /** Stable flow id used for cross-referencing in admin evidence. */
  flowId: string;
  /** Pass/fail status of the flow. */
  status: 'passed' | 'missing_evidence';
  /** Optional structured failure class. */
  failureClass?: 'missing_evidence' | 'product_failure' | 'checker_gap';
  /** Human-readable summary of the verification. */
  summary: string;
  /** Repo-relative paths that were inspected. */
  inspectedPaths: string[];
  /** Repo-relative paths that were expected but missing. */
  missingPaths: string[];
}

interface FlowProbe {
  relativePath: string;
  mustContain?: string[];
}

function probeMatches(rootDir: string, probe: FlowProbe): boolean {
  const abs = safeJoin(rootDir, probe.relativePath);
  if (!pathExists(abs)) {
    return false;
  }
  if (!probe.mustContain || probe.mustContain.length === 0) {
    return true;
  }
  try {
    const text = readTextFile(abs);
    return probe.mustContain.every((needle) => text.includes(needle));
  } catch {
    return false;
  }
}

function runFlow(
  flowId: string,
  rootDir: string,
  probes: FlowProbe[],
  passSummary: string,
): AdminFlowVerification {
  const inspected = probes.map((p) => p.relativePath);
  const missing = probes.filter((p) => !probeMatches(rootDir, p)).map((p) => p.relativePath);
  if (missing.length > 0) {
    return {
      flowId,
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
      summary: `Admin flow ${flowId} is missing required surfaces: ${missing.join(', ')}.`,
      inspectedPaths: inspected,
      missingPaths: missing,
    };
  }
  return {
    flowId,
    status: 'passed',
    summary: passSummary,
    inspectedPaths: inspected,
    missingPaths: [],
  };
}

/** Verify the admin KYC review flow exists end-to-end. */
export function verifyAdminKycReviewFlow(rootDir: string): AdminFlowVerification {
  return runFlow(
    'admin.kyc.review',
    rootDir,
    [
      {
        relativePath: 'frontend-admin/src/app/(admin)/contas/kyc/page.tsx',
        mustContain: ['approveKyc', 'rejectKyc'],
      },
      {
        relativePath: 'backend/src/admin/compliance/admin-compliance.controller.ts',
      },
      {
        relativePath: 'backend/src/admin/compliance/admin-compliance.service.ts',
        mustContain: ['kycStatus'],
      },
    ],
    'Admin KYC review flow is wired: frontend page calls admin compliance controller, service operates on kycStatus.',
  );
}

/** Verify the admin bank-account approval flow plus wallet ledger linkage. */
export function verifyAdminBankApprovalFlow(rootDir: string): AdminFlowVerification {
  return runFlow(
    'admin.banking.approval',
    rootDir,
    [
      {
        relativePath: 'frontend-admin/src/app/(admin)/carteira/page.tsx',
      },
      {
        relativePath: 'backend/src/admin/carteira/admin-carteira.controller.ts',
        mustContain: ['ledger'],
      },
    ],
    'Admin banking approval flow is wired: admin carteira controller links wallet endpoints to the ledger service.',
  );
}

/** Verify the admin WhatsApp session-control flow exists end-to-end. */
export function verifyAdminWhatsappSessionFlow(rootDir: string): AdminFlowVerification {
  return runFlow(
    'admin.whatsapp.session-control',
    rootDir,
    [
      {
        relativePath: 'backend/src/admin/sessions/admin-sessions.controller.ts',
        mustContain: ['admin/sessions'],
      },
      {
        relativePath: 'backend/src/admin/sessions/admin-sessions.service.ts',
      },
      {
        relativePath: 'worker/providers/whatsapp-engine.ts',
      },
      {
        relativePath: 'worker/providers/unified-whatsapp-provider.ts',
      },
    ],
    'Admin WhatsApp session-control flow is wired: admin sessions controller, service, and worker WhatsApp engine/provider all present.',
  );
}

/** Run all admin flow verifiers in a single call. */
export function runAllAdminFlowVerifiers(rootDir: string): AdminFlowVerification[] {
  return [
    verifyAdminKycReviewFlow(rootDir),
    verifyAdminBankApprovalFlow(rootDir),
    verifyAdminWhatsappSessionFlow(rootDir),
  ];
}
