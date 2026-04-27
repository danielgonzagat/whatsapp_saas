/**
 * GitNexusCodeGraphProvider — implements CodeGraphProvider via npx gitnexus.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  CodeGraphProvider,
  CodeGraphStatusInput,
  CodeGraphStatus,
  CodeGraphAnalyzeInput,
  CodeGraphAnalyzeResult,
  GitNexusImpactInput,
  GitNexusImpactReport,
  GitNexusRepoStatus,
  GitNexusIndexState,
  CodeGraphEvidenceInput,
  CodeGraphEvidence,
} from './types';
import { runGitNexus } from './command';

export class GitNexusCodeGraphProvider implements CodeGraphProvider {
  getName(): string {
    return 'gitnexus';
  }

  async isAvailable(): Promise<boolean> {
    const result = await runGitNexus(['--version']);
    return result.exitCode === 0 && result.stdout.includes('gitnexus');
  }

  async getStatus(input: CodeGraphStatusInput): Promise<CodeGraphStatus> {
    const { repoRoot } = input;
    const indexPath = path.join(repoRoot, '.gitnexus');
    const indexExists = fs.existsSync(indexPath);
    const registryPath = path.join(process.env.HOME ?? '~', '.gitnexus', 'registry.json');
    const registryDetected = fs.existsSync(registryPath);

    const warnings: string[] = [];
    const errors: string[] = [];

    let currentCommit: string | null = null;
    try {
      const { execFileSync } = await import('node:child_process');
      currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim();
    } catch {
      warnings.push('Could not resolve current commit.');
    }

    let available = false;
    let availability: GitNexusRepoStatus['availability'] = 'unknown';
    let indexState: GitNexusIndexState = 'missing';
    let lastIndexedCommit: string | null = null;
    let lastIndexedAt: string | null = null;

    try {
      const result = await runGitNexus(['status'], repoRoot, 120_000);
      available = result.exitCode === 0;
      availability = available ? 'available' : 'failed';

      if (!available) {
        errors.push(result.stderr.slice(0, 200));
      }

      if (indexExists) {
        const statusFile = path.join(indexPath, 'status.json');
        if (fs.existsSync(statusFile)) {
          try {
            const raw = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
            lastIndexedCommit = raw.commit ?? raw.lastCommit ?? null;
            lastIndexedAt = raw.indexedAt ?? raw.lastIndexedAt ?? null;
          } catch {
            /* ignore parse errors */
          }
        }

        if (lastIndexedCommit && currentCommit) {
          indexState = lastIndexedCommit === currentCommit ? 'fresh' : 'stale';
        } else {
          indexState = 'unknown';
        }
      } else {
        indexState = 'missing';
        warnings.push(
          '.gitnexus/ index directory not found. Run pulse:gitnexus:index to create it.',
        );
      }
    } catch (err) {
      availability = 'failed';
      errors.push(String(err).slice(0, 200));
    }

    return {
      provider: 'gitnexus',
      available,
      availability,
      repoRoot,
      currentCommit,
      indexPath,
      indexExists,
      indexState,
      registryDetected,
      lastIndexedCommit,
      lastIndexedAt,
      warnings,
      errors,
    };
  }

  async analyzeRepo(input: CodeGraphAnalyzeInput): Promise<CodeGraphAnalyzeResult> {
    const args: string[] = ['analyze', input.repoRoot, '--skip-agents-md'];
    if (input.force) args.push('--force');
    // Skills generate .claude/skills/generated/ — opt-in, not default
    const result = await runGitNexus(args, input.repoRoot, 600_000);
    return { indexed: result.exitCode === 0, commandResult: result };
  }

  async getImpact(input: GitNexusImpactInput): Promise<GitNexusImpactReport> {
    const status = await this.getStatus({ repoRoot: input.repoRoot });
    const impactedSymbols: string[] = [];
    const impactedFiles: string[] = [];
    const impactedCapabilities: string[] = [];
    const impactedFlows: string[] = [];
    const evidence: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!status.available || !status.indexExists) {
      warnings.push('GitNexus index not available; impact analysis based on file paths only.');
    }

    // Detect changes via gitnexus (if available) and fallback to PULSE structural heuristics
    if (status.indexExists) {
      try {
        const dcResult = await runGitNexus(
          ['detect-changes', '--scope', 'all'],
          input.repoRoot,
          120_000,
        );
        if (dcResult.exitCode === 0 && dcResult.stdout) {
          evidence.push(dcResult.stdout.slice(0, 4000));
          // Parse symbols from output
          const lines = dcResult.stdout.split('\n');
          for (const line of lines) {
            if (line.includes('→')) impactedSymbols.push(line.trim());
          }
        }
      } catch {
        errors.push('detect-changes command failed.');
      }
    }

    // Fallback: use changed files for capability/flow mapping
    for (const file of input.changedFiles) {
      impactedFiles.push(file);
      const cap = filePathToCapability(file);
      if (cap) impactedCapabilities.push(cap);
      const flow = filePathToFlow(file);
      if (flow) impactedFlows.push(flow);
    }

    let riskLevel: GitNexusImpactReport['riskLevel'] = 'unknown';
    if (input.changedFiles.some((f) => isCriticalPath(f))) {
      riskLevel = 'critical';
    } else if (impactedCapabilities.length > 3) {
      riskLevel = 'high';
    } else if (impactedCapabilities.length > 0) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    return {
      provider: 'gitnexus',
      status: { ...status, warnings, errors },
      changedFiles: input.changedFiles,
      impactedSymbols,
      impactedFiles,
      impactedCapabilities: [...new Set(impactedCapabilities)],
      impactedFlows: [...new Set(impactedFlows)],
      riskLevel,
      evidence,
      warnings,
      errors,
    };
  }

  async collectEvidence(input: CodeGraphEvidenceInput): Promise<CodeGraphEvidence> {
    const status = await this.getStatus({ repoRoot: input.repoRoot });
    const commit = status.currentCommit;
    const rawCommands = [
      status.indexExists
        ? await runGitNexus(['status'], input.repoRoot)
        : {
            command: 'gitnexus',
            args: ['status'],
            exitCode: -1,
            stdout: '',
            stderr: '',
            durationMs: 0,
            timedOut: false,
          },
    ];

    return {
      provider: 'gitnexus',
      generatedAt: new Date().toISOString(),
      repoRoot: input.repoRoot,
      commit,
      status,
      rawCommands,
    };
  }
}

// ── Path → Capability/Flow mapping ────────────────────────────────────

const DOMAIN_MAP: Record<string, { capability: string; flow: string }> = {
  'backend/src/auth/': { capability: 'Auth', flow: 'auth-login' },
  'backend/src/checkout/': { capability: 'Checkout', flow: 'checkout-payment' },
  'backend/src/wallet/': { capability: 'Wallet', flow: 'wallet-withdrawal' },
  'backend/src/billing/': { capability: 'Billing', flow: 'billing-invoice' },
  'backend/src/whatsapp/': { capability: 'WhatsApp Core', flow: 'whatsapp-message-send' },
  'backend/src/inbox/': { capability: 'Inbox/Chat', flow: 'inbox-conversation' },
  'backend/src/products/': { capability: 'Products', flow: 'product-create' },
  'backend/src/payments/': { capability: 'Payments', flow: 'payment-reconciliation' },
  'backend/src/ledger/': { capability: 'Ledger', flow: 'ledger-audit' },
  'backend/src/campaigns/': { capability: 'Campaigns', flow: 'campaign-execute' },
  'backend/src/autopilot/': { capability: 'Autopilot', flow: 'autopilot-run' },
  'backend/src/crm/': { capability: 'CRM', flow: 'crm-pipeline' },
  'backend/src/settings/': { capability: 'Settings', flow: 'settings-kyc' },
  'backend/src/partnerships/': { capability: 'Partnerships', flow: 'partnership-create' },
  'backend/src/analytics/': { capability: 'Analytics', flow: 'analytics-report' },
  'backend/prisma/': { capability: 'Database Models', flow: 'schema-migration' },
  'frontend/src/app/checkout/': { capability: 'Checkout', flow: 'checkout-payment' },
  'frontend/src/app/whatsapp/': { capability: 'WhatsApp Core', flow: 'whatsapp-message-send' },
  'frontend/src/app/settings/': { capability: 'Settings', flow: 'settings-kyc' },
  'frontend/src/app/products/': { capability: 'Products', flow: 'product-create' },
  'worker/': { capability: 'Workers/Queues', flow: 'queue-process' },
};

const CRITICAL_PATHS = [
  'backend/src/payments/',
  'backend/src/ledger/',
  'backend/src/wallet/',
  'backend/src/billing/',
  'backend/src/checkout/',
  'backend/prisma/schema.prisma',
];

function filePathToCapability(filePath: string): string | null {
  for (const [prefix, mapping] of Object.entries(DOMAIN_MAP)) {
    if (filePath.startsWith(prefix)) return mapping.capability;
  }
  return null;
}

function filePathToFlow(filePath: string): string | null {
  for (const [prefix, mapping] of Object.entries(DOMAIN_MAP)) {
    if (filePath.startsWith(prefix)) return mapping.flow;
  }
  return null;
}

function isCriticalPath(filePath: string): boolean {
  return CRITICAL_PATHS.some((p) => filePath.startsWith(p));
}
