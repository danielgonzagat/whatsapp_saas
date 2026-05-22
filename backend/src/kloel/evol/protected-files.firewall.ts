import { Injectable } from '@nestjs/common';
import type { ProtectedFilesFirewall, ViolationKind } from './types';

/**
 * EVOL-008 — ProtectedFilesFirewall.
 *
 * Blocks any touch on protected governance files. Scans file access
 * patterns against the canonical protected files list from
 * ops/protected-governance-files.json. Any violation is logged,
 * blocked, and may trigger escalation.
 */

const PROTECTED_PATTERNS: readonly string[] = [
  'CLAUDE.md',
  'AGENTS.md',
  'CODEX.md',
  'docs/design/**',
  'ops/**',
  'scripts/ops/check-*.mjs',
  'scripts/ops/lib/*.mjs',
  '.husky/pre-push',
  '.github/workflows/**',
  'backend/eslint.config.mjs',
  'frontend/eslint.config.mjs',
  'worker/eslint.config.mjs',
  '.codacy.yml',
  'docs/codacy/**',
  'package.json',
  'scripts/pulse/no-hardcoded-reality-audit.ts',
];

@Injectable()
export class ProtectedFilesFirewallService {
  private violations: ProtectedFilesFirewall[] = [];
  private counter = 0;

  check(filePath: string, agentIdentity: string): ProtectedFilesFirewall | null {
    const violationKind = this.classify(filePath);
    if (!violationKind) return null;

    this.counter += 1;

    const violation: ProtectedFilesFirewall = {
      violationId: `pf-violation-${this.counter}`,
      filePath,
      agentIdentity,
      violationKind,
      blockedAt: new Date().toISOString(),
      reason: `Protected file access blocked: ${filePath} matches governance pattern. Violation kind: ${violationKind}.`,
      escalationRequired: violationKind === 'governance_breach',
    };

    this.violations.push(violation);
    return violation;
  }

  isProtected(filePath: string): boolean {
    return this.classify(filePath) !== null;
  }

  classify(filePath: string): ViolationKind | null {
    for (const pattern of PROTECTED_PATTERNS) {
      if (this.matches(pattern, filePath)) {
        if (pattern.includes('governance') || pattern.includes('.github') || pattern === 'CLAUDE.md' || pattern === 'AGENTS.md' || pattern === 'CODEX.md') {
          return 'governance_breach';
        }
        if (pattern.includes('eslint') || pattern.includes('codacy')) {
          return 'codacy_weakening';
        }
        if (pattern.includes('.husky') || pattern.includes('check-')) {
          return 'bypass_suppression';
        }
        return 'protected_file_touch';
      }
    }
    return null;
  }

  listViolations(): readonly ProtectedFilesFirewall[] {
    return [...this.violations];
  }

  recentViolations(sinceMs: number): readonly ProtectedFilesFirewall[] {
    const cutoff = Date.now() - sinceMs;
    return this.violations.filter((v) => new Date(v.blockedAt).getTime() >= cutoff);
  }

  violationCount(): number {
    return this.violations.length;
  }

  reset(): void {
    this.violations = [];
    this.counter = 0;
  }

  private matches(pattern: string, filePath: string): boolean {
    const normalized = filePath.replace(/^\.\//, '');

    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      return normalized === prefix || normalized.startsWith(prefix + '/');
    }

    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\//g, '\\/') + '$');
      return regex.test(normalized);
    }

    return normalized === pattern || normalized.startsWith(pattern + '/') || normalized.endsWith('/' + pattern);
  }
}
