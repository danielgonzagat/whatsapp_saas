#!/usr/bin/env ts-node
/**
 * PULSE — Live Codebase Nervous System
 *
 * Maps the complete structure of a full-stack web application and finds
 * every disconnection between layers: UI → API → Backend → Database
 *
 * Usage:
 *   npx ts-node scripts/pulse/index.ts              # SCAN mode (static analysis, <5s)
 *   npx ts-node scripts/pulse/index.ts --deep       # DEEP mode (SCAN + runtime tests against Railway)
 *   npx ts-node scripts/pulse/index.ts --total      # TOTAL mode (DEEP + chaos/edge cases)
 *   npx ts-node scripts/pulse/index.ts --watch       # Daemon mode (live)
 *   npx ts-node scripts/pulse/index.ts --report      # Generate PULSE_REPORT.md
 *   npx ts-node scripts/pulse/index.ts --json        # JSON output
 *   npx ts-node scripts/pulse/index.ts --verbose     # Show all breaks (including low severity)
 *   npx ts-node scripts/pulse/index.ts --fmap        # Generate FUNCTIONAL_MAP.md (page-by-page interaction trace)
 *   npx ts-node scripts/pulse/index.ts --customer    # Run customer synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --operator    # Run operator synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --admin       # Run admin synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --shift       # Run shift-time synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --soak        # Run soak-time synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --certify --tier 0  # Certify tier 0 hard gates
 *   npx ts-node scripts/pulse/index.ts --certify --final   # Run final certification target
 */

import { detectConfig } from './config';
import { fullScan, startDaemon } from './daemon';
import { renderDashboard } from './dashboard';
import { generateArtifacts } from './artifacts';
import { computeCertification } from './certification';
import { buildFunctionalMap } from './functional-map';
import { generateFunctionalMapReport, renderFunctionalMapSummary } from './functional-map-report';
import { runDeclaredFlows } from './flows';
import { runDeclaredInvariants } from './invariants';
import { runBrowserStressTest } from './browser-stress-tester';
import { loadPulseLocalEnv } from './local-env';
import { runSyntheticActors, type PulseSyntheticRunMode } from './actors';
import type { PulseBrowserEvidence } from './types';
import {
  collectObservabilityEvidence,
  collectRecoveryEvidence,
  collectRuntimeEvidence,
} from './runtime-evidence';

const args = process.argv.slice(2);
const tierArgIndex = args.indexOf('--tier');
const parsedTier = tierArgIndex >= 0 ? Number.parseInt(args[tierArgIndex + 1] || '', 10) : null;
const flags = {
  watch: args.includes('--watch') || args.includes('-w'),
  report: args.includes('--report') || args.includes('-r'),
  json: args.includes('--json') || args.includes('-j'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  deep: args.includes('--deep') || args.includes('-d'),
  total: args.includes('--total') || args.includes('-t'),
  fmap: args.includes('--functional-map') || args.includes('--fmap') || args.includes('-f'),
  certify: args.includes('--certify'),
  final: args.includes('--final'),
  tier: Number.isFinite(parsedTier) ? parsedTier : null,
  manifestValidate: args.includes('--manifest-validate'),
  headed: args.includes('--headed'),
  fast: args.includes('--fast'),
  customer: args.includes('--customer'),
  operator: args.includes('--operator'),
  admin: args.includes('--admin'),
  shift: args.includes('--shift'),
  soak: args.includes('--soak'),
  pageFilter: args.includes('--page') ? args[args.indexOf('--page') + 1] : null,
  groupFilter: args.includes('--group') ? args[args.indexOf('--group') + 1] : null,
  slowMo: args.includes('--slow-mo') ? parseInt(args[args.indexOf('--slow-mo') + 1], 10) : 50,
};
const inferredSyntheticModes = new Set<PulseSyntheticRunMode>([
  flags.customer ? 'customer' : null,
  flags.operator ? 'operator' : null,
  flags.admin ? 'admin' : null,
  flags.shift ? 'shift' : null,
  flags.soak ? 'soak' : null,
].filter((value): value is PulseSyntheticRunMode => Boolean(value)));

if (flags.final || (typeof flags.tier === 'number' && flags.tier >= 1)) {
  inferredSyntheticModes.add('customer');
}
if (flags.final || (typeof flags.tier === 'number' && flags.tier >= 2)) {
  inferredSyntheticModes.add('operator');
  inferredSyntheticModes.add('admin');
}
if (flags.final || (typeof flags.tier === 'number' && flags.tier >= 4)) {
  inferredSyntheticModes.add('soak');
}

const requestedSyntheticModes = [...inferredSyntheticModes];

const actorModeRequested = requestedSyntheticModes.length > 0;

function compactReason(value: string, max: number = 500): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 3)}...`;
}

function deriveBrowserEvidenceFromActors(
  actorModeRequested: boolean,
  browserEvidence: PulseBrowserEvidence,
  syntheticEvidence: ReturnType<typeof runSyntheticActors>,
) {
  if (!actorModeRequested || browserEvidence.executed) {
    return browserEvidence;
  }

  const actorResults = [
    ...syntheticEvidence.customer.results,
    ...syntheticEvidence.operator.results,
    ...syntheticEvidence.admin.results,
    ...syntheticEvidence.soak.results,
  ].filter(result => result.requested && result.runner === 'playwright-spec');

  if (actorResults.length === 0) {
    return browserEvidence;
  }

  const executed = actorResults.filter(result => result.executed);
  const passed = executed.filter(result => result.status === 'passed');
  const blocking = executed.filter(result => result.status === 'failed' || result.status === 'checker_gap');

  return {
    ...browserEvidence,
    attempted: true,
    executed: executed.length > 0,
    artifactPaths: [...new Set([...browserEvidence.artifactPaths, ...executed.flatMap(result => result.artifactPaths)])],
    summary: executed.length === 0
      ? `No requested Playwright synthetic scenarios executed successfully. Requested: ${actorResults.map(result => result.scenarioId).join(', ')}.`
      : blocking.length > 0
        ? `Synthetic Playwright scenarios executed with failures: ${blocking.map(result => result.scenarioId).join(', ')}.`
        : `Synthetic Playwright scenarios executed successfully: ${passed.map(result => result.scenarioId).join(', ')}.`,
    totalTested: actorResults.length,
    passRate: executed.length > 0 ? Math.round((passed.length / executed.length) * 100) : 0,
    blockingInteractions: blocking.length,
  };
}

// Activate runtime parsers when --deep/--total or synthetic actor modes are passed
if (flags.deep || flags.total || actorModeRequested || flags.final || (typeof flags.tier === 'number' && flags.tier >= 0)) {
  process.env.PULSE_DEEP = '1';
}
if (flags.total || actorModeRequested || flags.final || (typeof flags.tier === 'number' && flags.tier >= 1)) {
  process.env.PULSE_TOTAL = '1';
}

async function main() {
  const loadedEnvFiles = loadPulseLocalEnv(process.cwd());

  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║    PULSE — Live Codebase Nervous System         ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');

  // 1. Detect project structure
  const config = detectConfig(process.cwd());
  console.log(`  Frontend:  ${config.frontendDir}`);
  console.log(`  Backend:   ${config.backendDir}`);
  console.log(`  Schema:    ${config.schemaPath || '(not found)'}`);
  console.log(`  Prefix:    ${config.globalPrefix || '(none)'}`);
  const mode = process.env.PULSE_TOTAL === '1' ? 'TOTAL' : process.env.PULSE_DEEP === '1' ? 'DEEP' : 'SCAN';
  console.log(`  Mode:      ${mode}${mode !== 'SCAN' ? ' (runtime parsers active)' : ''}`);
  if (flags.final || flags.tier !== null) {
    console.log(`  Target:    ${flags.final ? 'FINAL' : `TIER ${flags.tier}`}`);
  }
  if (actorModeRequested) {
    console.log(`  Actors:    ${requestedSyntheticModes.join(', ')}`);
  }
  if (loadedEnvFiles.length > 0) {
    console.log(`  Local env: ${loadedEnvFiles.join(', ')} loaded`);
  }
  console.log('');
  console.log('  Scanning...');

  // 2. Full scan
  const startTime = Date.now();
  let scanResult = await fullScan(config);
  const { health, coreData } = scanResult;
  let certification = scanResult.certification;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Done in ${elapsed}s`);
  const runtimeEvidence = await collectRuntimeEvidence(certification.environment);
  const observabilityEvidence = collectObservabilityEvidence(config.rootDir, runtimeEvidence);
  const recoveryEvidence = collectRecoveryEvidence(config.rootDir);
  let browserEvidence = certification.evidenceSummary.browser;

  if (flags.total) {
    console.log('  Executing browser certification...');
    const browserRun = await runBrowserStressTest({
      headed: flags.headed,
      fast: flags.fast,
      pageFilter: flags.pageFilter,
      groupFilter: flags.groupFilter,
      slowMo: flags.slowMo,
      log: true,
    });
    browserEvidence = {
      ...certification.evidenceSummary.browser,
      attempted: browserRun.attempted,
      executed: browserRun.executed,
      artifactPaths: [
        ...new Set([
          ...(certification.evidenceSummary.browser.artifactPaths || []),
          ...(browserRun.artifactPath ? [browserRun.artifactPath] : []),
          ...(browserRun.reportPath ? [browserRun.reportPath] : []),
          browserRun.screenshotDir,
        ]),
      ],
      summary: compactReason(browserRun.summary),
      failureCode: browserRun.preflight.status,
      preflight: {
        status: browserRun.preflight.status,
        detail: compactReason(browserRun.preflight.detail, 280),
        checkedAt: browserRun.preflight.checkedAt,
      },
      totalPages: browserRun.stressResult?.summary.totalPages,
      totalTested: browserRun.stressResult?.summary.totalTested,
      passRate: browserRun.stressResult?.summary.passRate,
      blockingInteractions: browserRun.stressResult
        ? (
            browserRun.stressResult.summary.byStatus.QUEBRADO
            + browserRun.stressResult.summary.byStatus.CRASH
            + browserRun.stressResult.summary.byStatus.TIMEOUT
          )
        : undefined,
    };

  }

  const flowEvidence = await runDeclaredFlows({
    environment: certification.environment,
    manifest: scanResult.manifest,
    health: scanResult.health,
    parserInventory: scanResult.parserInventory,
  });

  const invariantEvidence = runDeclaredInvariants({
    environment: certification.environment,
    manifest: scanResult.manifest,
    health: scanResult.health,
    parserInventory: scanResult.parserInventory,
  });

  const syntheticEvidence = runSyntheticActors({
    rootDir: config.rootDir,
    environment: certification.environment,
    manifest: scanResult.manifest,
    resolvedManifest: scanResult.resolvedManifest,
    codebaseTruth: scanResult.codebaseTruth,
    runtimeEvidence,
    browserEvidence,
    flowEvidence,
    requestedModes: requestedSyntheticModes,
  });
  browserEvidence = deriveBrowserEvidenceFromActors(actorModeRequested, browserEvidence, syntheticEvidence);

  certification = computeCertification({
    rootDir: config.rootDir,
    manifestResult: scanResult.manifestResult,
    parserInventory: scanResult.parserInventory,
    health: scanResult.health,
    codebaseTruth: scanResult.codebaseTruth,
    resolvedManifest: scanResult.resolvedManifest,
    certificationTarget: {
      tier: flags.tier,
      final: flags.final,
    },
    executionEvidence: {
      ...certification.evidenceSummary,
      runtime: runtimeEvidence,
      browser: browserEvidence,
      flows: flowEvidence,
      invariants: invariantEvidence,
      observability: observabilityEvidence,
      recovery: recoveryEvidence,
      customer: syntheticEvidence.customer,
      operator: syntheticEvidence.operator,
      admin: syntheticEvidence.admin,
      soak: syntheticEvidence.soak,
      syntheticCoverage: syntheticEvidence.syntheticCoverage,
      worldState: syntheticEvidence.worldState,
    },
  });

  scanResult = {
    ...scanResult,
    certification,
  };

  if (flags.manifestValidate) {
    if (scanResult.manifest && certification.gates.scopeClosed.status === 'pass' && certification.gates.specComplete.status === 'pass') {
      console.log('  Manifest valid.');
      process.exit(0);
    }

    console.error('  Manifest invalid.');
    console.error(`  ${certification.gates.specComplete.reason}`);
    console.error(`  ${certification.gates.scopeClosed.reason}`);
    process.exit(1);
  }

  // 3. Functional Map (if --fmap)
  if (flags.fmap) {
    console.log('  Building functional map...');
    const fmapStart = Date.now();
    const fmapResult = buildFunctionalMap(config, coreData);
    const fmapElapsed = ((Date.now() - fmapStart) / 1000).toFixed(1);
    console.log(`  Functional map built in ${fmapElapsed}s`);

    // Store in health stats
    health.stats.functionalMap = {
      totalInteractions: fmapResult.summary.totalInteractions,
      byStatus: fmapResult.summary.byStatus,
      functionalScore: fmapResult.summary.functionalScore,
    };

    if (flags.json) {
      console.log(JSON.stringify({
        health,
        certification,
        codebaseTruth: scanResult.codebaseTruth,
        resolvedManifest: scanResult.resolvedManifest,
        functionalMap: fmapResult,
      }, null, 2));
    } else {
      renderDashboard(health, certification, { verbose: flags.verbose });
      renderFunctionalMapSummary(fmapResult);
      const fmapPath = generateFunctionalMapReport(fmapResult, config.rootDir);
      console.log(`  Functional map saved to: ${fmapPath}`);
      const artifactPaths = generateArtifacts(scanResult, config.rootDir);
      console.log(`  Report saved to: ${artifactPaths.reportPath}`);
    }

    process.exit(0);
  }

  // 4. Output
  if (flags.json) {
    console.log(JSON.stringify({
      health,
      certification,
      codebaseTruth: scanResult.codebaseTruth,
      resolvedManifest: scanResult.resolvedManifest,
    }, null, 2));
  } else if (flags.report) {
    const artifactPaths = generateArtifacts(scanResult, config.rootDir);
    renderDashboard(health, certification, { verbose: flags.verbose });
    console.log(`  Report saved to: ${artifactPaths.reportPath}`);
  } else {
    renderDashboard(health, certification, { verbose: flags.verbose });

    if (!flags.watch) {
      const artifactPaths = generateArtifacts(scanResult, config.rootDir);
      console.log(`  Report saved to: ${artifactPaths.reportPath}`);
    }
  }

  // 5. Watch mode
  if (flags.watch) {
    await startDaemon(config);
  } else {
    if (flags.certify) {
      process.exit(certification.status === 'CERTIFIED' ? 0 : 1);
    }

    const criticalBreaks = health.breaks.filter(b => b.severity === 'high').length;
    process.exit(criticalBreaks > 0 ? 1 : 0);
  }
}

main().catch(e => {
  console.error('PULSE error:', e.message || e);
  process.exit(2);
});
