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
 */

import { detectConfig } from './config';
import { fullScan, startDaemon } from './daemon';
import { renderDashboard } from './dashboard';
import { generateArtifacts } from './artifacts';
import { computeCertification } from './certification';
import { buildFunctionalMap } from './functional-map';
import { generateFunctionalMapReport, renderFunctionalMapSummary } from './functional-map-report';
import { runBrowserStressTest } from './browser-stress-tester';

const args = process.argv.slice(2);
const flags = {
  watch: args.includes('--watch') || args.includes('-w'),
  report: args.includes('--report') || args.includes('-r'),
  json: args.includes('--json') || args.includes('-j'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  deep: args.includes('--deep') || args.includes('-d'),
  total: args.includes('--total') || args.includes('-t'),
  fmap: args.includes('--functional-map') || args.includes('--fmap') || args.includes('-f'),
  certify: args.includes('--certify'),
  manifestValidate: args.includes('--manifest-validate'),
  headed: args.includes('--headed'),
  fast: args.includes('--fast'),
  pageFilter: args.includes('--page') ? args[args.indexOf('--page') + 1] : null,
  groupFilter: args.includes('--group') ? args[args.indexOf('--group') + 1] : null,
  slowMo: args.includes('--slow-mo') ? parseInt(args[args.indexOf('--slow-mo') + 1], 10) : 50,
};

function compactReason(value: string, max: number = 500): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 3)}...`;
}

// Activate runtime parsers when --deep or --total is passed
if (flags.deep || flags.total) {
  process.env.PULSE_DEEP = '1';
}
if (flags.total) {
  process.env.PULSE_TOTAL = '1';
}

async function main() {
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
  const mode = flags.total ? 'TOTAL' : flags.deep ? 'DEEP' : 'SCAN';
  console.log(`  Mode:      ${mode}${mode !== 'SCAN' ? ' (runtime parsers active)' : ''}`);
  console.log('');
  console.log('  Scanning...');

  // 2. Full scan
  const startTime = Date.now();
  let scanResult = await fullScan(config);
  const { health, coreData } = scanResult;
  let certification = scanResult.certification;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Done in ${elapsed}s`);

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
    const browserEvidence = {
      ...certification.evidenceSummary.browser,
      attempted: browserRun.attempted,
      executed: browserRun.executed,
      artifactPaths: [
        ...new Set([
          ...(certification.evidenceSummary.browser.artifactPaths || []),
          ...(browserRun.reportPath ? [browserRun.reportPath] : []),
          browserRun.screenshotDir,
        ]),
      ],
      summary: browserRun.error
        ? compactReason(`${browserRun.summary} ${browserRun.error}`.trim())
        : compactReason(browserRun.summary),
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

    certification = computeCertification({
      rootDir: config.rootDir,
      manifestResult: scanResult.manifestResult,
      parserInventory: scanResult.parserInventory,
      health: scanResult.health,
      executionEvidence: {
        ...certification.evidenceSummary,
        browser: browserEvidence,
      },
    });

    scanResult = {
      ...scanResult,
      certification,
    };
  }

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
      console.log(JSON.stringify({ health, certification, functionalMap: fmapResult }, null, 2));
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
    console.log(JSON.stringify({ health, certification }, null, 2));
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
