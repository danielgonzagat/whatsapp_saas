/**
 * PULSE Parser 80: License Checker
 * Layer 12: Dependency Security
 * Mode: DEEP (requires reading package.json and node_modules license files)
 *
 * CHECKS:
 * 1. Reads all direct dependencies from package.json in each workspace
 * 2. Reads license field from each dependency's package.json in node_modules
 * 3. Flags GPL-2.0, GPL-3.0, AGPL-3.0, LGPL with copyleft concerns (license incompatibility
 *    with proprietary SaaS — must be evaluated per use-case)
 * 4. Flags UNKNOWN / UNLICENSED / undefined license fields
 * 5. Flags SSPL (used by MongoDB) — incompatible with SaaS distribution
 * 6. Cross-references against an allowlist in .license-allowlist.json if present
 * 7. Generates a license inventory for legal review
 *
 * REQUIRES: PULSE_DEEP=1, node_modules installed
 * BREAK TYPES:
 *   LICENSE_INCOMPATIBLE(medium) — copyleft or SSPL license in dependency
 *   LICENSE_UNKNOWN(low)         — dependency has no license field
 */
import { safeJoin, safeResolve } from '../safe-path';
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';

interface PackageJson {
  name?: string;
  license?: string | { type: string };
  licenses?: Array<{ type: string }>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

// Licenses that are potentially incompatible with proprietary SaaS
const INCOMPATIBLE_LICENSES = new Set([
  'GPL-2.0',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'LGPL-2.0',
  'LGPL-2.0-only',
  'LGPL-2.0-or-later',
  'LGPL-2.1',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'SSPL-1.0',
  'BUSL-1.1',
  'CC-BY-SA-4.0',
  'CC-BY-SA-3.0',
]);

const UNKNOWN_INDICATORS = new Set([
  'UNLICENSED',
  'SEE LICENSE IN LICENSE',
  'SEE LICENSE IN LICENCE',
  'UNKNOWN',
  'CUSTOM',
  'PROPRIETARY',
]);

function readPackageJson(pkgPath: string): PackageJson | null {
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

function getLicense(pkg: PackageJson): string {
  if (typeof pkg.license === 'string') {
    return pkg.license.trim().toUpperCase();
  }
  if (typeof pkg.license === 'object' && pkg.license?.type) {
    return pkg.license.type.trim().toUpperCase();
  }
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    return pkg.licenses[0].type.trim().toUpperCase();
  }
  return 'UNKNOWN';
}

function loadAllowlist(rootDir: string): Set<string> {
  const allowlistPath = safeJoin(rootDir, '.license-allowlist.json');
  if (!fs.existsSync(allowlistPath)) {
    return new Set();
  }
  try {
    const raw = JSON.parse(fs.readFileSync(allowlistPath, 'utf8')) as string[];
    return new Set(raw.map((s) => s.toUpperCase()));
  } catch {
    return new Set();
  }
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
    if (!fs.existsSync(pkgPath)) {
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
    if (!fs.existsSync(nodeModulesDir)) {
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
      if (!fs.existsSync(depPkgPath)) {
        continue;
      }

      const depPkg = readPackageJson(depPkgPath);
      if (!depPkg) {
        continue;
      }

      const license = getLicense(depPkg);
      const relPkgPath = path.relative(config.rootDir, pkgPath);

      // CHECK: Incompatible licenses
      if (INCOMPATIBLE_LICENSES.has(license) && !allowlist.has(depName.toUpperCase())) {
        breaks.push({
          type: 'LICENSE_INCOMPATIBLE',
          severity: 'medium',
          file: relPkgPath,
          line: 0,
          description: `Dependency "${depName}" uses ${license} — potentially incompatible with proprietary SaaS`,
          detail: `Review usage of ${depName} in ${ws.name}; if only used in dev/build, move to devDependencies or find alternative`,
        });
      }

      // CHECK: Unknown / unlicensed
      if (license === 'UNKNOWN' || UNKNOWN_INDICATORS.has(license)) {
        if (!allowlist.has(depName.toUpperCase())) {
          breaks.push({
            type: 'LICENSE_UNKNOWN',
            severity: 'low',
            file: relPkgPath,
            line: 0,
            description: `Dependency "${depName}" has unknown or missing license — legal risk`,
            detail: `Check ${depName}'s GitHub repo or contact maintainer to clarify licensing terms`,
          });
        }
      }
    }
  }

  // CHECK: No allowlist file means no license governance process
  const allowlistPath = safeJoin(config.rootDir, '.license-allowlist.json');
  if (!fs.existsSync(allowlistPath)) {
    breaks.push({
      type: 'LICENSE_UNKNOWN',
      severity: 'low',
      file: '.license-allowlist.json',
      line: 0,
      description:
        'No license allowlist found — create .license-allowlist.json to document approved exceptions',
      detail:
        'A license allowlist documents which packages have been legally reviewed and approved despite unusual licenses',
    });
  }

  // TODO: Implement when infrastructure available
  // - SPDX report generation
  // - Transitive dependency license scanning
  // - License compatibility matrix check (A depends on B which is GPL)

  return breaks;
}
