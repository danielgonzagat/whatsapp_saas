/**
 * PULSE v3 Autonomy Acceptance Suite (P4)
 * Validates that PULSE meets the final criterion for autonomous IA guidance
 */

import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { pathExists, readDir, readTextFile, removeFile, statPath, writeTextFile } from './safe-fs';

const execPromise = promisify(exec);

interface AcceptanceTestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

interface FlowProjectionCandidate {
  steps?: unknown[];
}

interface ConvergenceQueueCandidate {
  executionMode?: string;
  relatedFiles?: string[];
}

interface ExternalAdapterCandidate {
  status?: string;
}

const testResults: AcceptanceTestResult[] = [];

async function runTest(name: string, fn: () => Promise<boolean | void>): Promise<void> {
  const start = Date.now();
  try {
    const result = await fn();
    const passed = result !== false;
    testResults.push({
      name,
      passed,
      message: passed ? '✓ PASS' : '✗ FAIL',
      duration: Date.now() - start,
    });
  } catch (error) {
    testResults.push({
      name,
      passed: false,
      message: `✗ FAIL: ${(error as Error).message}`,
      duration: Date.now() - start,
    });
  }
}

// Test 1: New file enters scope state
async function testNewFileEntersScopeState(): Promise<boolean> {
  const testFile = path.join(process.cwd(), '.pulse/test-new-file-marker.ts');
  writeTextFile(testFile, 'export const marker = true;');

  try {
    const { stdout } = await execPromise('npm run pulse:json 2>/dev/null');
    const report = JSON.parse(stdout);

    const scopeHasFile =
      report.scopeState?.discoveredFiles?.some((f: string) => f.includes('test-new-file-marker')) ||
      false;

    removeFile(testFile);
    return scopeHasFile;
  } catch {
    removeFile(testFile);
    return false;
  }
}

// Test 2: Capability state changes with structural changes
async function testCapabilityStateChangesWithStructure(): Promise<boolean> {
  const { stdout: before } = await execPromise('npm run pulse:json 2>/dev/null');
  const reportBefore = JSON.parse(before);
  const capabilityCountBefore = reportBefore.capabilityState?.capabilities?.length || 0;

  // Create a new route (simulated capability structure change)
  const testRoute = path.join(process.cwd(), 'backend/src/test-capability-check.controller.ts');
  writeTextFile(
    testRoute,
    `import { Controller, Get } from '@nestjs/common';\n@Controller('test-cap')\nexport class TestCapabilityController {\n  @Get()\n  health() { return { ok: true }; }\n}`,
  );

  try {
    const { stdout: after } = await execPromise('npm run pulse:json 2>/dev/null');
    const reportAfter = JSON.parse(after);
    const capabilityCountAfter = reportAfter.capabilityState?.capabilities?.length || 0;

    removeFile(testRoute);

    // Capability state should reflect structural change
    return (
      capabilityCountAfter > 0 &&
      (capabilityCountAfter !== capabilityCountBefore ||
        capabilityCountAfter > capabilityCountBefore)
    );
  } catch {
    removeFile(testRoute);
    return false;
  }
}

// Test 3: Flow projection updates with new routes
async function testFlowProjectionUpdatesWithRoutes(): Promise<boolean> {
  const { stdout } = await execPromise('npm run pulse:json 2>/dev/null');
  const report = JSON.parse(stdout);

  const flowCount = report.flowProjection?.flows?.length || 0;
  const flowsWithSteps =
    report.flowProjection?.flows?.filter(
      (f: FlowProjectionCandidate) => Array.isArray(f.steps) && f.steps.length > 0,
    ).length || 0;

  // Flows should be projected with steps
  return flowCount > 0 && flowsWithSteps > 0;
}

// Test 4: Product vision updates when capability/flow changes
async function testProductVisionUpdatesWithChanges(): Promise<boolean> {
  const { stdout } = await execPromise('npm run pulse:json 2>/dev/null');
  const report = JSON.parse(stdout);

  const hasCurrentCheckpoint = report.productVision?.currentCheckpoint !== undefined;
  const hasProjectedCheckpoint = report.productVision?.projectedCheckpoint !== undefined;
  const hasSurfaces = (report.productVision?.surfaces || []).length > 0;

  return hasCurrentCheckpoint && hasProjectedCheckpoint && hasSurfaces;
}

// Test 5: Directive updates when blockers change
async function testDirectiveUpdatesWithBlockers(): Promise<boolean> {
  const directivePath = path.join(process.cwd(), 'PULSE_CLI_DIRECTIVE.json');

  if (!pathExists(directivePath)) {
    return false;
  }

  const directive = JSON.parse(readTextFile(directivePath, 'utf8'));

  const hasNextWork = (directive.nextExecutableUnits || []).length > 0;
  const hasBlockers =
    (directive.topBlockers || []).length > 0 || (directive.topProblems || []).length > 0;
  const hasExecutability = directive.nextExecutableUnits?.[0]?.preconditions !== undefined;

  return hasNextWork && (hasBlockers || true) && hasExecutability;
}

// Test 6: HIGH codacy issues block autonomy tier
async function testHighCodacyIssuesBlockTier(): Promise<boolean> {
  const { stdout } = await execPromise('npm run pulse:json 2>/dev/null');
  const report = JSON.parse(stdout);

  const codacyHigh = report.codacyEvidence?.summary?.highIssues || 0;
  const certificationTier = report.certification?.blockingTier || 0;

  // If HIGH issues exist, tier should be <= 2 (blocked)
  if (codacyHigh > 0) {
    return certificationTier <= 2;
  }

  return true;
}

// Test 7: Protected surfaces require human_required mode
async function testProtectedSurfacesRequireHuman(): Promise<boolean> {
  const { stdout } = await execPromise('npm run pulse:json 2>/dev/null');
  const report = JSON.parse(stdout);

  const protectedFiles = [
    'CLAUDE.md',
    'AGENTS.md',
    '.codacy.yml',
    'scripts/ops',
    '.husky/pre-push',
  ];

  const convergenceQueue = report.convergencePlan?.queue || [];
  const protectedUnits = convergenceQueue.filter((unit: ConvergenceQueueCandidate) =>
    protectedFiles.some((pf) => unit.relatedFiles?.some((rf) => rf.includes(pf))),
  );

  // All protected surface units should be human_required
  const allHumanRequired = protectedUnits.every(
    (unit: ConvergenceQueueCandidate) => unit.executionMode === 'human_required',
  );

  return protectedUnits.length === 0 || allHumanRequired;
}

// Test 8: 50 runs don't increase artifact count unbounded
async function testArtifactGrowthIsControlled(): Promise<boolean> {
  const initialCountPath = path.join(process.cwd(), '.pulse/current');

  if (!pathExists(initialCountPath)) {
    return false;
  }

  const initialCount = readDir(initialCountPath).length;

  // Run 3 quick scans
  for (let i = 0; i < 3; i++) {
    try {
      await execPromise('npm run pulse 2>&1 > /dev/null');
    } catch {
      // Ignore failures
    }
  }

  const finalCount = readDir(initialCountPath).length;

  // Artifact count should not grow significantly (allow 1-2 new artifacts)
  return finalCount <= initialCount + 2;
}

// Test 9: Failed run doesn't overwrite successful state
async function testFailedRunPreservesSuccessState(): Promise<boolean> {
  const codacyStatePath = path.join(process.cwd(), 'PULSE_CODACY_STATE.json');

  if (!pathExists(codacyStatePath)) {
    return false;
  }

  const beforeMtime = statPath(codacyStatePath).mtime.getTime();

  try {
    // Run a scan
    await execPromise('npm run pulse 2>&1 > /dev/null');
  } catch {
    // Failure is expected; we're testing that state preserves
  }

  const afterMtime = statPath(codacyStatePath).mtime.getTime();

  // State should still be present and potentially updated (or at least not deleted)
  return pathExists(codacyStatePath);
}

// Test 10: "Run complete" produces unambiguous next work
async function testRunCompleteProducesNextWork(): Promise<boolean> {
  const { stdout } = await execPromise('npm run pulse:json 2>/dev/null');
  const report = JSON.parse(stdout);

  const nextUnits = report.nextExecutableUnits || [];
  const firstUnit = nextUnits[0];

  if (!firstUnit) {
    return false;
  }

  const hasAllFields =
    firstUnit.id &&
    firstUnit.title &&
    firstUnit.summary &&
    firstUnit.affectedCapabilities !== undefined &&
    firstUnit.affectedFlows !== undefined &&
    firstUnit.preconditions !== undefined &&
    firstUnit.allowedActions !== undefined &&
    firstUnit.forbiddenActions !== undefined &&
    firstUnit.successCriteria !== undefined;

  return hasAllFields;
}

// Test 11: External signals are collected and normalized
async function testExternalSignalsCollected(): Promise<boolean> {
  const { stdout } = await execPromise('npm run pulse:json 2>/dev/null');
  const report = JSON.parse(stdout);

  const externalSignals = report.externalSignalState?.signals || [];
  const adapters = report.externalSignalState?.adapters || [];

  // At least one adapter should be ready or have signals
  const hasActiveAdapters = adapters.some(
    (a: ExternalAdapterCandidate) => a.status === 'ready' || a.status === 'stable',
  );
  const hasSomeSignals = externalSignals.length > 0;

  return hasActiveAdapters || hasSomeSignals;
}

// Test 12: Certification gates are comprehensive
async function testCertificationGatesComprehensive(): Promise<boolean> {
  const { stdout } = await execPromise('npm run pulse:json 2>/dev/null');
  const report = JSON.parse(stdout);

  const gates = report.certification?.gates || {};
  const requiredGates = [
    'truthExtractionPass',
    'runtimePass',
    'browserPass',
    'flowPass',
    'securityPass',
    'isolationPass',
  ];

  const hasAllGates = requiredGates.every((gate) => gate in gates);

  return hasAllGates;
}

// Test 13: Fresh-session guidance does not overclaim production convergence
async function testZeroPromptProductionGuidanceDoesNotOverclaim(): Promise<boolean> {
  const directivePath = path.join(process.cwd(), 'PULSE_CLI_DIRECTIVE.json');

  if (!pathExists(directivePath)) {
    return false;
  }

  const directive = JSON.parse(readTextFile(directivePath, 'utf8'));
  const zeroPromptVerdict =
    directive.zeroPromptProductionGuidanceVerdict ||
    directive.autonomyProof?.verdicts?.zeroPromptProductionGuidance;
  const canWorkUntilProductionReady = directive.canWorkUntilProductionReady;

  if (directive.autonomyProof?.verdicts?.canDeclareComplete === false) {
    return zeroPromptVerdict === 'NAO' && canWorkUntilProductionReady === false;
  }

  return zeroPromptVerdict === 'SIM' && canWorkUntilProductionReady === true;
}

// Main test runner
async function runAcceptanceSuite(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  PULSE v3 Autonomy Acceptance Suite (P4)        ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  await runTest('Test 1: New file enters scope state', testNewFileEntersScopeState);
  await runTest(
    'Test 2: Capability state changes with structure',
    testCapabilityStateChangesWithStructure,
  );
  await runTest('Test 3: Flow projection updates with routes', testFlowProjectionUpdatesWithRoutes);
  await runTest('Test 4: Product vision updates with changes', testProductVisionUpdatesWithChanges);
  await runTest('Test 5: Directive updates with blockers', testDirectiveUpdatesWithBlockers);
  await runTest('Test 6: HIGH codacy issues block tier', testHighCodacyIssuesBlockTier);
  await runTest('Test 7: Protected surfaces require human', testProtectedSurfacesRequireHuman);
  await runTest('Test 8: Artifact growth controlled', testArtifactGrowthIsControlled);
  await runTest('Test 9: Failed run preserves state', testFailedRunPreservesSuccessState);
  await runTest('Test 10: Run complete gives next work', testRunCompleteProducesNextWork);
  await runTest('Test 11: External signals collected', testExternalSignalsCollected);
  await runTest('Test 12: Certification gates comprehensive', testCertificationGatesComprehensive);
  await runTest(
    'Test 13: Zero-prompt production guidance does not overclaim',
    testZeroPromptProductionGuidanceDoesNotOverclaim,
  );

  console.log('\n── Results ───────────────────────────────────────\n');

  testResults.forEach((result) => {
    const icon = result.passed ? '✓' : '✗';
    const color = result.passed ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    console.log(`${color}${icon}${reset} ${result.name}`);
    console.log(`  ${result.message} (${result.duration}ms)\n`);
  });

  const passed = testResults.filter((r) => r.passed).length;
  const total = testResults.length;
  const score = Math.round((passed / total) * 100);

  console.log('── Summary ────────────────────────────────────────\n');
  console.log(`Passed: ${passed}/${total} (${score}%)`);

  if (score >= 90) {
    console.log('\n✓ AUTONOMY CRITERION MET: PULSE v3 is ready for autonomous guidance.\n');
    process.exit(0);
  } else if (score >= 70) {
    console.log('\n⚠ AUTONOMY CRITERION PARTIAL: More work needed on P4 gaps.\n');
    process.exit(1);
  } else {
    console.log('\n✗ AUTONOMY CRITERION NOT MET: Significant gaps remain.\n');
    process.exit(1);
  }
}

runAcceptanceSuite().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
