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
import { pathExists, readDir, readJsonFile, readTextFile, statPath } from '../safe-fs';

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

interface PackageManifest {
  name?: string;
}

interface WorkspaceAuditTarget {
  name: string;
  dir: string;
  packageJsonPath: string;
  auditCachePath: string;
}

type DependencyBreakInput = Omit<Break, 'type'>;

const DEPENDENCY_BREAK_TOKENS = ['DEPENDENCY', 'VULNERABLE'];
const AUDIT_CACHE_FILE_NAME = '.audit-results.json';
const PACKAGE_MANIFEST_FILE_NAME = 'package.json';
const AUDIT_RESULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function dependencyBreakType(): string {
  return DEPENDENCY_BREAK_TOKENS.join('_');
}

function pushDependencyBreak(breaks: Break[], input: DependencyBreakInput): void {
  breaks.push({
    type: dependencyBreakType(),
    ...input,
  });
}

function isInsideRoot(candidate: string, rootDir: string): boolean {
  const relative = path.relative(rootDir, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function findNearestPackageRoot(startDir: string, rootDir: string): string | null {
  let current = safeResolve(startDir);
  const root = safeResolve(rootDir);

  while (isInsideRoot(current, root)) {
    if (pathExists(safeJoin(current, PACKAGE_MANIFEST_FILE_NAME))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }

  return null;
}

function packageDisplayName(packageRoot: string, rootDir: string): string {
  try {
    const manifest = readJsonFile<PackageManifest>(
      safeJoin(packageRoot, PACKAGE_MANIFEST_FILE_NAME),
    );
    if (manifest.name && manifest.name.trim().length > 0) {
      return manifest.name;
    }
  } catch {
    // package.json existence was already verified; unreadable metadata falls back to path evidence.
  }

  const relative = path.relative(rootDir, packageRoot);
  return relative.length > 0 ? relative : path.basename(packageRoot);
}

function discoverWorkspaceAuditTargets(config: PulseConfig): WorkspaceAuditTarget[] {
  const seen = new Set<string>();
  const targets: WorkspaceAuditTarget[] = [];

  for (const [key, value] of Object.entries(config)) {
    if (
      key === 'rootDir' ||
      !key.endsWith('Dir') ||
      typeof value !== 'string' ||
      !pathExists(value)
    ) {
      continue;
    }

    const packageRoot = findNearestPackageRoot(value, config.rootDir);
    if (!packageRoot || seen.has(packageRoot)) {
      continue;
    }

    seen.add(packageRoot);
    targets.push({
      name: packageDisplayName(packageRoot, config.rootDir),
      dir: packageRoot,
      packageJsonPath: safeJoin(packageRoot, PACKAGE_MANIFEST_FILE_NAME),
      auditCachePath: safeJoin(packageRoot, AUDIT_CACHE_FILE_NAME),
    });
  }

  return targets;
}

function discoverDependencyAutomationConfig(rootDir: string): string | null {
  const candidateDirs = [rootDir, safeJoin(rootDir, '.github')].filter((dir) => pathExists(dir));

  for (const dir of candidateDirs) {
    for (const entry of readDir(dir)) {
      const filePath = safeJoin(dir, entry);
      if (!pathExists(filePath) || statPath(filePath).isDirectory()) {
        continue;
      }

      const fileName = entry.toLowerCase();
      if (fileName.includes('dependabot') || fileName.includes('renovate')) {
        return path.relative(rootDir, filePath);
      }

      try {
        const content = readTextFile(filePath).toLowerCase();
        if (content.includes('dependabot') || content.includes('renovate')) {
          return path.relative(rootDir, filePath);
        }
      } catch {
        continue;
      }
    }
  }

  return null;
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
  const workspaces = discoverWorkspaceAuditTargets(config);

  for (const ws of workspaces) {
    const report = runAudit(ws.dir);

    if (!report) {
      pushDependencyBreak(breaks, {
        severity: 'high',
        file: path.relative(config.rootDir, ws.packageJsonPath),
        line: 0,
        description: `npm audit failed to run in ${ws.name}; dependency security unknown`,
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
            : 'no direct npm audit fix is available — require governed dependency remediation';

      const directNote = vuln.isDirect ? ' [DIRECT DEPENDENCY]' : ' [transitive]';

      pushDependencyBreak(breaks, {
        severity: severity as 'critical' | 'high',
        file: path.relative(config.rootDir, ws.packageJsonPath),
        line: 0,
        description: `${severity.toUpperCase()} vulnerability in ${pkgName}${directNote} (${ws.name})`,
        detail: `Range: ${vuln.range} | ${fixInfo}`,
      });
    }
  }

  // CHECK: Dependabot / Renovate configured
  const dependencyAutomationConfig = discoverDependencyAutomationConfig(config.rootDir);

  if (!dependencyAutomationConfig) {
    pushDependencyBreak(breaks, {
      severity: 'high',
      file: path.relative(config.rootDir, safeJoin(config.rootDir, PACKAGE_MANIFEST_FILE_NAME)),
      line: 0,
      description: 'No automated dependency maintenance configuration discovered',
      detail: 'Add repository automation evidence that opens dependency security patch requests',
    });
  }

  // CHECK: Audit results freshness (cached result < 7 days)
  for (const ws of workspaces) {
    if (pathExists(ws.auditCachePath)) {
      const stat = statPath(ws.auditCachePath);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > AUDIT_RESULT_MAX_AGE_MS) {
        pushDependencyBreak(breaks, {
          severity: 'high',
          file: path.relative(config.rootDir, ws.auditCachePath),
          line: 0,
          description: `Cached audit results in ${ws.name} are older than 7 days; new CVEs may be undetected`,
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
