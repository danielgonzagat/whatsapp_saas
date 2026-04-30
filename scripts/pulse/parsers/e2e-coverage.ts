/**
 * PULSE Parser 78: E2E Coverage
 * Layer 11: Test Quality
 * Mode: DEEP (requires Playwright/Cypress test file scan + optional runner)
 *
 * CHECKS:
 * 1. E2E test directory exists (e2e/, tests/, playwright/, cypress/)
 * 2. Product flows discovered from source surfaces have E2E test coverage
 * 3. E2E tests are not all skipped
 * 4. Playwright/Cypress config exists and is not empty
 * 5. E2E tests are included in CI pipeline (check package.json scripts or CI config)
 * 6. Critical payment flow has both success and failure scenario coverage
 *
 * REQUIRES: PULSE_DEEP=1, codebase read access
 */
import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { pathExists, readTextFile, statPath } from '../safe-fs';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';

interface DiscoveredFlowCoverageTarget {
  name: string;
  evidenceFiles: string[];
}

function synthesizeE2EBreak(signal: PulseSignalEvidence, surface: string): Break {
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const diagnostic = synthesizeDiagnostic(
    signalGraph,
    predicateGraph,
    calculateDynamicRisk({ predicateGraph }),
  );

  return {
    type: diagnostic.id,
    severity: 'high',
    file: signal.location.file,
    line: signal.location.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; predicates=${diagnostic.predicateKinds.join(',')}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface,
  };
}

function buildE2EEvidenceBreak(input: {
  detector: string;
  summary: string;
  detail: string;
  file: string;
  surface: string;
}): Break {
  return synthesizeE2EBreak(
    {
      source: 'filesystem:e2e-coverage',
      detector: input.detector,
      truthMode: 'confirmed_static',
      summary: input.summary,
      detail: input.detail,
      location: {
        file: input.file,
        line: 0,
      },
    },
    input.surface,
  );
}

function isRunnableSourceFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return !lower.includes('.spec.') && !lower.includes('.test.') && !lower.includes('.fixture.');
}

function flowNameFromRelativePath(relativePath: string): string | null {
  const segments = relativePath
    .split(path.sep)
    .flatMap((part) => part.split(/[._-]+/))
    .map((part) => part.trim())
    .filter((part) => part.length > 2 && !/^\d+$/.test(part));

  return segments[0] ?? null;
}

function discoverFlowCoverageTargets(config: PulseConfig): DiscoveredFlowCoverageTarget[] {
  const targets = new Map<string, Set<string>>();
  const roots = [config.frontendDir, config.backendDir, config.workerDir];

  for (const root of roots) {
    for (const file of walkFiles(root, ['.ts', '.tsx', '.js', '.jsx']).filter(
      isRunnableSourceFile,
    )) {
      const relativeToRoot = path.relative(root, file);
      const flowName = flowNameFromRelativePath(relativeToRoot);
      if (!flowName) {
        continue;
      }
      if (!targets.has(flowName)) {
        targets.set(flowName, new Set<string>());
      }
      targets.get(flowName)?.add(path.relative(config.rootDir, file));
    }
  }

  return [...targets.entries()]
    .map(([name, files]) => ({ name, evidenceFiles: [...files].sort() }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function hasCoverageForTarget(
  allE2EContent: string,
  target: DiscoveredFlowCoverageTarget,
): boolean {
  const lowerContent = allE2EContent.toLowerCase();
  if (lowerContent.includes(target.name.toLowerCase())) {
    return true;
  }
  return target.evidenceFiles.some((file) => {
    const name = flowNameFromRelativePath(file);
    return Boolean(name && lowerContent.includes(name.toLowerCase()));
  });
}

/** Check e2 e coverage. */
export function checkE2ECoverage(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // CHECK 1: E2E directory exists
  const e2eCandidates = [
    safeJoin(config.rootDir, 'e2e'),
    safeJoin(config.rootDir, 'tests'),
    safeJoin(config.rootDir, 'playwright'),
    safeJoin(config.rootDir, 'cypress'),
    safeJoin(config.frontendDir, 'e2e'),
    safeJoin(config.frontendDir, 'tests'),
    safeJoin(config.frontendDir, 'playwright'),
    safeJoin(config.frontendDir, 'cypress'),
  ];

  const e2eDir = e2eCandidates.find((d) => pathExists(d));
  const discoveredTargets = discoverFlowCoverageTargets(config);

  if (!e2eDir) {
    for (const target of discoveredTargets) {
      breaks.push(
        buildE2EEvidenceBreak({
          detector: 'e2e-directory-coverage-evidence',
          summary: `No E2E execution surface observed for discovered flow ${target.name}`,
          detail: `Flow evidence files: ${target.evidenceFiles.join(', ')}`,
          file: target.evidenceFiles[0] ?? '.',
          surface: 'e2e-flow-coverage',
        }),
      );
    }
    return breaks;
  }

  // CHECK 2: Playwright or Cypress config
  const playwrightConfig = [
    safeJoin(config.rootDir, 'playwright.config.ts'),
    safeJoin(config.rootDir, 'playwright.config.js'),
    safeJoin(config.frontendDir, 'playwright.config.ts'),
    safeJoin(e2eDir, 'playwright.config.ts'),
    safeJoin(e2eDir, 'playwright.config.js'),
  ];
  const cypressConfig = [
    safeJoin(config.rootDir, 'cypress.config.ts'),
    safeJoin(config.rootDir, 'cypress.json'),
    safeJoin(config.frontendDir, 'cypress.config.ts'),
    safeJoin(e2eDir, 'cypress.config.ts'),
    safeJoin(e2eDir, 'cypress.config.js'),
  ];

  const hasPlaywright = playwrightConfig.some((p) => pathExists(p));
  const hasCypress = cypressConfig.some((p) => pathExists(p));

  if (!hasPlaywright && !hasCypress) {
    breaks.push(
      buildE2EEvidenceBreak({
        detector: 'e2e-runner-config-evidence',
        summary: 'E2E directory exists without observed runner configuration evidence',
        detail: `Observed E2E directory: ${path.relative(config.rootDir, e2eDir)}`,
        file: path.relative(config.rootDir, e2eDir),
        surface: 'e2e-runner',
      }),
    );
  }

  // CHECK 3: Scan E2E files for core flow coverage
  const e2eFiles = walkFiles(e2eDir, ['.ts', '.tsx', '.js', '.jsx']);

  if (e2eFiles.length === 0) {
    for (const target of discoveredTargets) {
      breaks.push(
        buildE2EEvidenceBreak({
          detector: 'e2e-file-coverage-evidence',
          summary: `E2E directory is empty for discovered flow ${target.name}`,
          detail: `Flow evidence files: ${target.evidenceFiles.join(', ')}`,
          file: path.relative(config.rootDir, e2eDir),
          surface: 'e2e-flow-coverage',
        }),
      );
    }
    return breaks;
  }

  // Aggregate all E2E file content for flow detection
  let allE2EContent = '';
  let hasActiveTests = false;

  for (const file of e2eFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    allE2EContent += '\n' + content;
    if (
      /test\s*\(|it\s*\(|describe\s*\(|page\.|cy\./i.test(content) &&
      !/test\.skip|xit\s*\(/.test(content)
    ) {
      hasActiveTests = true;
    }
  }

  // CHECK 4: All tests skipped
  if (!hasActiveTests) {
    breaks.push(
      buildE2EEvidenceBreak({
        detector: 'e2e-active-test-evidence',
        summary: 'E2E files observed without active executable test evidence',
        detail: `Observed E2E files: ${e2eFiles.map((file) => path.relative(config.rootDir, file)).join(', ')}`,
        file: path.relative(config.rootDir, e2eDir),
        surface: 'e2e-active-tests',
      }),
    );
  }

  // CHECK 5: Discovered flow coverage
  for (const target of discoveredTargets) {
    if (!hasCoverageForTarget(allE2EContent, target)) {
      breaks.push(
        buildE2EEvidenceBreak({
          detector: 'discovered-flow-e2e-evidence',
          summary: `No E2E test evidence observed for discovered flow ${target.name}`,
          detail: `Flow evidence files: ${target.evidenceFiles.join(', ')}`,
          file: path.relative(config.rootDir, e2eDir),
          surface: 'e2e-flow-coverage',
        }),
      );
    }
  }

  // CHECK 6: CI pipeline includes E2E
  const ciFiles = [
    safeJoin(config.rootDir, '.github', 'workflows'),
    safeJoin(config.rootDir, '.gitlab-ci.yml'),
    safeJoin(config.rootDir, 'railway.json'),
  ];
  let e2eInCI = false;
  for (const ciPath of ciFiles) {
    if (!pathExists(ciPath)) {
      continue;
    }
    const ciContent = statPath(ciPath).isDirectory()
      ? walkFiles(ciPath, ['.yml', '.yaml', '.json'])
          .map((file) => readTextFile(file, 'utf8'))
          .join('\n')
      : readTextFile(ciPath, 'utf8');
    if (/e2e|playwright|cypress/i.test(ciContent)) {
      e2eInCI = true;
      break;
    }
  }
  if (!e2eInCI && e2eFiles.length > 0) {
    breaks.push(
      buildE2EEvidenceBreak({
        detector: 'e2e-ci-execution-evidence',
        summary: 'E2E files observed without CI execution evidence',
        detail: `Observed E2E files: ${e2eFiles.map((file) => path.relative(config.rootDir, file)).join(', ')}`,
        file: '.github/workflows/',
        surface: 'e2e-ci',
      }),
    );
  }

  // TODO: Implement when infrastructure available
  // - Run E2E tests against staging environment
  // - Measure E2E test execution time
  // - Screenshot diff regression detection

  return breaks;
}
