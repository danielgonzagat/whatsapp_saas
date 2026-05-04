/**
 * PULSE Parser 80: License Checker
 * Layer 12: Dependency Security
 * Mode: DEEP (requires reading package.json and node_modules license files)
 *
 * CHECKS:
 * 1. Reads all direct dependencies from package.json in each workspace
 * 2. Reads license field from each dependency's package.json in node_modules
 * 3. Classifies observed license expressions through SPDX-style token predicates
 * 4. Flags missing, package-local, or non-standard license evidence
 * 5. Cross-references reviewed exceptions in .license-allowlist.json if present
 * 6. Generates diagnostics for legal review
 *
 * REQUIRES: PULSE_DEEP=1, node_modules installed
 * BREAK TYPES:
 *   Generated from evidence category parts instead of fixed decision literals.
 */
import { safeJoin } from '../safe-path';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { pathExists, readTextFile } from '../safe-fs';

interface PackageJson {
  name?: string;
  license?: string | { type: string };
  licenses?: Array<{ type: string }>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface LicenseEvidence {
  expression: string | null;
  tokens: string[];
}

interface LicenseDiagnosticInput {
  categoryParts: string[];
  severity: Break['severity'];
  file: string;
  workspaceName: string;
  dependencyName: string;
  evidence: LicenseEvidence;
  predicate: string;
  summary: string;
  recommendation: string;
}

function diagnosticType(parts: string[]): string {
  return parts.map((part) => part.toUpperCase()).join('_');
}

function buildLicenseDiagnostic(input: LicenseDiagnosticInput): Break {
  const licenseExpression = input.evidence.expression ?? 'missing license field';
  return {
    type: diagnosticType(input.categoryParts),
    severity: input.severity,
    file: input.file,
    line: 0,
    description: `Dependency "${input.dependencyName}" ${input.summary}`,
    detail:
      `${input.recommendation}. Observed license evidence: ${licenseExpression}; ` +
      `predicate=${input.predicate}; workspace=${input.workspaceName}.`,
    source:
      `grammar-kernel:license-checker;truthMode=observed_dependency_metadata;` +
      `predicate=${input.predicate};dependency=${input.dependencyName}`,
  };
}

function appendLicenseDiagnostic(breaks: Break[], input: LicenseDiagnosticInput): void {
  breaks.push(buildLicenseDiagnostic(input));
}

function readPackageJson(pkgPath: string): PackageJson | null {
  try {
    return JSON.parse(readTextFile(pkgPath, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

function readLicenseExpression(pkg: PackageJson): string | null {
  if (typeof pkg.license === 'string') {
    const expression = pkg.license.trim();
    return expression.length > 0 ? expression : null;
  }
  if (typeof pkg.license === 'object' && pkg.license?.type) {
    const expression = pkg.license.type.trim();
    return expression.length > 0 ? expression : null;
  }
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    const expression = pkg.licenses[0].type.trim();
    return expression.length > 0 ? expression : null;
  }
  return null;
}

function isLicenseTokenChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function tokenizeLicenseExpression(expression: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (const char of expression) {
    if (isLicenseTokenChar(char)) {
      current += char.toUpperCase();
      continue;
    }
    if (current.length > 0) {
      tokens.push(current);
      current = '';
    }
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function getLicenseEvidence(pkg: PackageJson): LicenseEvidence {
  const expression = readLicenseExpression(pkg);
  return {
    expression,
    tokens: expression ? tokenizeLicenseExpression(expression) : [],
  };
}

function loadAllowlist(rootDir: string): Set<string> {
  const allowlistPath = safeJoin(rootDir, '.license-allowlist.json');
  if (!pathExists(allowlistPath)) {
    return new Set();
  }
  try {
    const raw = JSON.parse(readTextFile(allowlistPath, 'utf8')) as string[];
    return new Set(raw.map((s) => s.toUpperCase()));
  } catch {
    return new Set();
  }
}

function tokenEqualsAny(token: string, first: string, second: string): boolean {
  return token === first || token === second;
}

function hasReciprocalSourcePredicate(evidence: LicenseEvidence): boolean {
  return evidence.tokens.some(
    (token) => token.endsWith('GPL') || tokenEqualsAny(token, 'SSPL', 'BUSL'),
  );
}

function hasShareAlikePredicate(evidence: LicenseEvidence): boolean {
  return evidence.tokens.includes('CC') && evidence.tokens.includes('SA');
}

function hasPackageLocalLicensePointer(evidence: LicenseEvidence): boolean {
  const tokens = evidence.tokens;
  return tokens[0] === 'SEE' && tokens[1] === 'LICENSE' && tokens[2] === 'IN';
}

function hasNonStandardLicensePredicate(evidence: LicenseEvidence): boolean {
  return evidence.tokens.some(
    (token) =>
      tokenEqualsAny(token, 'UNKNOWN', 'UNLICENSED') ||
      tokenEqualsAny(token, 'CUSTOM', 'PROPRIETARY'),
  );
}

function isReviewedException(allowlist: Set<string>, dependencyName: string): boolean {
  return allowlist.has(dependencyName.toUpperCase());
}

/** Check licenses. */
export function checkLicenses(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const allowlist = loadAllowlist(config.rootDir);

  const workspaces = [
    { name: 'backend', dir: config.backendDir },
    { name: 'frontend', dir: config.frontendDir },
    { name: 'worker', dir: config.workerDir },
  ];

  for (const ws of workspaces) {
    const pkgPath = safeJoin(ws.dir, 'package.json');
    if (!pathExists(pkgPath)) {
      continue;
    }

    const pkg = readPackageJson(pkgPath);
    if (!pkg) {
      continue;
    }

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.peerDependencies,
      // devDependencies are typically not shipped, so lower priority
    };

    const nodeModulesDir = safeJoin(ws.dir, 'node_modules');
    if (!pathExists(nodeModulesDir)) {
      continue;
    }

    const checked = new Set<string>();

    for (const depName of Object.keys(allDeps)) {
      if (checked.has(depName)) {
        continue;
      }
      checked.add(depName);

      // Handle scoped packages (@org/name)
      const depPkgPath = safeJoin(nodeModulesDir, depName, 'package.json');
      if (!pathExists(depPkgPath)) {
        continue;
      }

      const depPkg = readPackageJson(depPkgPath);
      if (!depPkg) {
        continue;
      }

      const licenseEvidence = getLicenseEvidence(depPkg);
      const relPkgPath = path.relative(config.rootDir, pkgPath);
      const isAllowedException = isReviewedException(allowlist, depName);

      const hasReciprocalObligation =
        hasReciprocalSourcePredicate(licenseEvidence) || hasShareAlikePredicate(licenseEvidence);
      if (hasReciprocalObligation && !isAllowedException) {
        appendLicenseDiagnostic(breaks, {
          categoryParts: ['license', 'reciprocal', 'review'],
          severity: 'medium',
          file: relPkgPath,
          workspaceName: ws.name,
          dependencyName: depName,
          evidence: licenseEvidence,
          predicate: 'reciprocal_source_or_share_alike_obligation',
          summary: 'declares a reciprocal-source or share-alike license expression',
          recommendation:
            `Review usage of ${depName} in ${ws.name}; if only used in dev/build, ` +
            'move it to devDependencies or document the legal approval',
        });
      }

      const needsLicenseClarification =
        licenseEvidence.expression === null ||
        hasPackageLocalLicensePointer(licenseEvidence) ||
        hasNonStandardLicensePredicate(licenseEvidence);
      if (needsLicenseClarification && !isAllowedException) {
        appendLicenseDiagnostic(breaks, {
          categoryParts: ['license', 'metadata', 'review'],
          severity: 'low',
          file: relPkgPath,
          workspaceName: ws.name,
          dependencyName: depName,
          evidence: licenseEvidence,
          predicate: 'missing_or_non_standard_license_metadata',
          summary: 'has missing, package-local, or non-standard license metadata',
          recommendation: `Check ${depName}'s upstream repository or maintainer metadata`,
        });
      }
    }
  }

  // CHECK: No allowlist file means no license governance process
  const allowlistPath = safeJoin(config.rootDir, '.license-allowlist.json');
  if (!pathExists(allowlistPath)) {
    appendLicenseDiagnostic(breaks, {
      categoryParts: ['license', 'governance', 'review'],
      severity: 'low',
      file: '.license-allowlist.json',
      workspaceName: 'repository',
      dependencyName: 'reviewed license exception registry',
      evidence: {
        expression: null,
        tokens: [],
      },
      predicate: 'reviewed_exception_registry_absent',
      summary: 'has no reviewed exception registry evidence',
      recommendation:
        'Create .license-allowlist.json to document packages that legal review approved despite unusual license metadata',
    });
  }

  // TODO: Implement when infrastructure available
  // - SPDX report generation
  // - Transitive dependency license scanning
  // - License compatibility matrix check (A depends on B which is GPL)

  return breaks;
}
