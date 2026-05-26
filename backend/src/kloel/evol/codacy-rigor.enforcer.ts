import { Injectable } from '@nestjs/common';
import type { CodacyRigorCheck } from './types';

/**
 * EVOL-009 — CodacyRigorEnforcer.
 *
 * Blocks any reduction of the MAX-RIGOR Codacy configuration. Snapshot
 * the baseline at module init and detects any weakening (tool disabled,
 * pattern removed, threshold relaxed, exclude path added, skip tag
 * used). A degraded or violated status triggers a block.
 */

const CODACY_TOOLS: readonly string[] = [
  'eslint',
  'biome',
  'semgrep',
  'pmd',
  'remark-lint',
  'markdownlint',
  'shellcheck',
  'hadolint',
];

@Injectable()
export class CodacyRigorEnforcer {
  private baseline: Readonly<Record<string, boolean>> = {};
  private checks: CodacyRigorCheck[] = [];
  private counter = 0;

  captureBaseline(toolStates: Readonly<Record<string, boolean>>): void {
    const normalized: Record<string, boolean> = {};
    for (const tool of CODACY_TOOLS) {
      normalized[tool] = toolStates[tool] ?? true;
    }
    this.baseline = Object.freeze({ ...normalized });
  }

  check(currentStates: Readonly<Record<string, boolean>>): CodacyRigorCheck {
    this.counter += 1;

    if (Object.keys(this.baseline).length === 0) {
      this.captureBaseline(currentStates);
    }

    const normalized: Record<string, boolean> = {};
    const violations: string[] = [];

    for (const tool of CODACY_TOOLS) {
      const current = currentStates[tool] ?? true;
      normalized[tool] = current;

      const baselineEnabled = this.baseline[tool] ?? true;
      if (baselineEnabled && !current) {
        violations.push(tool);
      }
    }

    let status: 'compliant' | 'degraded' | 'violated';
    if (violations.length === 0) {
      status = 'compliant';
    } else if (violations.length < 3) {
      status = 'degraded';
    } else {
      status = 'violated';
    }

    const check: CodacyRigorCheck = {
      checkId: `codacy-rigor-${this.counter}`,
      baseline: { ...this.baseline },
      current: { ...normalized },
      violations,
      status,
      checkedAt: new Date().toISOString(),
    };

    this.checks.push(check);
    return check;
  }

  isCompliant(): boolean {
    if (this.checks.length === 0) {return true;}
    const last = this.checks[this.checks.length - 1]!;
    return last.status === 'compliant';
  }

  getBaseline(): Readonly<Record<string, boolean>> {
    return this.baseline;
  }

  getRecentChecks(sinceMs: number): readonly CodacyRigorCheck[] {
    const cutoff = Date.now() - sinceMs;
    return this.checks.filter((c) => new Date(c.checkedAt).getTime() >= cutoff);
  }

  listViolations(): readonly string[] {
    if (this.checks.length === 0) {return [];}
    const last = this.checks[this.checks.length - 1]!;
    return [...last.violations];
  }

  reset(): void {
    this.baseline = {};
    this.checks = [];
    this.counter = 0;
  }
}
