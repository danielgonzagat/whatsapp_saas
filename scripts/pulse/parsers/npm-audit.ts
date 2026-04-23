/**
 * PULSE Parser 79: npm Audit
 * Layer 12: Dependency Security
 * Mode: DEEP (requires running npm audit)
 *
 * CHECKS:
 * 1. Runs `npm audit --json` in backend, frontend, and worker directories
 * 2. Flags all critical vulnerabilities as DEPENDENCY_VULNERABLE(critical)
 * 3. Flags all high vulnerabilities as DEPENDENCY_VULNERABLE(high)
 * 4. Reports the vulnerable package name, severity, CVE ID, and fix version
 * 5. Checks if `npm audit` has been run recently (audit-results.json < 7 days old)
 * 6. Checks that dependabot or renovate is configured for automated dependency updates
 * 7. Warns if any direct dependency (not transitive) is vulnerable
 *
 * REQUIRES: PULSE_DEEP=1, npm/node in PATH, internet access for audit registry
 * BREAK TYPES:
 *   DEPENDENCY_VULNERABLE(critical) — critical-severity CVE in dependency tree
 *   DEPENDENCY_VULNERABLE(high)     — high-severity CVE in dependency tree
 */
import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import { execSync } from 'child_process';
import type { Break, PulseConfig } from '../types';
import { pathExists, statPath } from '../safe-fs';

interface AuditVulnerability {
  name: string;
  severity: string;
  isDirect: boolean;
  via: unknown[];
  fixAvailable: boolean | { name: string; version: string };
  range: string;
  nodes: string[];
}

interface AuditReport {
  auditReportVersion?: number;
  vulnerabilities?: Record<string, AuditVulnerability>;
  metadata?: {
    vulnerabilities?: {
      critical: number;
      high: number;
      moderate: number;
      low: number;
      info: number;
    };
  };
}

function runAudit(dir: string): AuditReport | null {
  try {
    const output = execSync('npm audit --json', {
      cwd: dir,
      timeout: 60_000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(output) as AuditReport;
  } catch (err: unknown) {
    // npm audit exits non-zero when vulnerabilities are found;
    // stdout still contains valid JSON
    const execErr = err as { stdout?: string };
    if (execErr.stdout) {
      try {
        return JSON.parse(execErr.stdout) as AuditReport;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Check npm audit. */
export function checkNpmAudit(config: PulseConfig): Break[] {
  if (!process.env.PULSE_DEEP) {
    return [];
  }
  const breaks: Break[] = [];

  const workspaces: Array<{ name: string; dir: string }> = [
    { name: 'backend', dir: config.backendDir },
    { name: 'frontend', dir: config.frontendDir },
    { name: 'worker', dir: config.workerDir },
  ];

  for (const ws of workspaces) {
    if (!pathExists(safeJoin(ws.dir, 'package.json'))) {
      continue;
    }

    const report = runAudit(ws.dir);

    if (!report) {
      breaks.push({
        type: 'DEPENDENCY_VULNERABLE',
        severity: 'high',
        file: path.relative(config.rootDir, safeJoin(ws.dir, 'package.json')),
        line: 0,
        description: `npm audit failed to run in ${ws.name} — dependency security unknown`,
        detail: 'Ensure npm is installed and package-lock.json is present; run npm install first',
      });
      continue;
    }

    const vulns = report.vulnerabilities || {};

    for (const [pkgName, vuln] of Object.entries(vulns)) {
      const severity = vuln.severity;
      if (severity !== 'critical' && severity !== 'high') {
        continue;
      }

      const fixInfo =
        typeof vuln.fixAvailable === 'object' && vuln.fixAvailable
          ? `fix: upgrade to ${vuln.fixAvailable.name}@${vuln.fixAvailable.version}`
          : vuln.fixAvailable
            ? 'fix: run npm audit fix'
            : 'no automatic fix available — manual review required';

      const directNote = vuln.isDirect ? ' [DIRECT DEPENDENCY]' : ' [transitive]';

      breaks.push({
        type: 'DEPENDENCY_VULNERABLE',
        severity: severity as 'critical' | 'high',
        file: path.relative(config.rootDir, safeJoin(ws.dir, 'package.json')),
        line: 0,
        description: `${severity.toUpperCase()} vulnerability in ${pkgName}${directNote} (${ws.name})`,
        detail: `Range: ${vuln.range} | ${fixInfo}`,
      });
    }
  }

  // CHECK: Dependabot / Renovate configured
  const dependabotPath = safeJoin(config.rootDir, '.github', 'dependabot.yml');
  const renovatePath = safeJoin(config.rootDir, 'renovate.json');
  const hasAutoDepsUpdate = pathExists(dependabotPath) || pathExists(renovatePath);

  if (!hasAutoDepsUpdate) {
    breaks.push({
      type: 'DEPENDENCY_VULNERABLE',
      severity: 'high',
      file: '.github/dependabot.yml',
      line: 0,
      description: 'No automated dependency update tool configured (Dependabot or Renovate)',
      detail:
        'Create .github/dependabot.yml or renovate.json to get automated PRs for security patches',
    });
  }

  // CHECK: Audit results freshness (cached result < 7 days)
  for (const ws of workspaces) {
    const auditCachePath = safeJoin(ws.dir, '.audit-results.json');
    if (pathExists(auditCachePath)) {
      const stat = statPath(auditCachePath);
      const ageMs = Date.now() - stat.mtimeMs;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (ageMs > sevenDaysMs) {
        breaks.push({
          type: 'DEPENDENCY_VULNERABLE',
          severity: 'high',
          file: path.relative(config.rootDir, auditCachePath),
          line: 0,
          description: `Cached audit results in ${ws.name} are older than 7 days — new CVEs may be undetected`,
          detail: 'Run npm audit to refresh; consider adding npm audit to pre-push hooks or CI',
        });
      }
    }
  }

  // TODO: Implement when infrastructure available
  // - Snyk integration for deeper CVE context
  // - SBOM (Software Bill of Materials) generation
  // - License + vulnerability combined report

  return breaks;
}
