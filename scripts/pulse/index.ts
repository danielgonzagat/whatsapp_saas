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
 */

import { detectConfig } from './config';
import { fullScan, startDaemon } from './daemon';
import { renderDashboard } from './dashboard';
import { generateReport } from './report';

const args = process.argv.slice(2);
const flags = {
  watch: args.includes('--watch') || args.includes('-w'),
  report: args.includes('--report') || args.includes('-r'),
  json: args.includes('--json') || args.includes('-j'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  deep: args.includes('--deep') || args.includes('-d'),
  total: args.includes('--total') || args.includes('-t'),
};

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
  const health = await fullScan(config);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Done in ${elapsed}s`);

  // 3. Output
  if (flags.json) {
    console.log(JSON.stringify(health, null, 2));
  } else if (flags.report) {
    const reportPath = generateReport(health, config.rootDir);
    renderDashboard(health, { verbose: flags.verbose });
    console.log(`  Report saved to: ${reportPath}`);
  } else {
    renderDashboard(health, { verbose: flags.verbose });

    if (!flags.watch) {
      // Also generate report in single scan mode
      const reportPath = generateReport(health, config.rootDir);
      console.log(`  Report saved to: ${reportPath}`);
    }
  }

  // 4. Watch mode
  if (flags.watch) {
    await startDaemon(config);
  } else {
    // Exit with code based on health
    const criticalBreaks = health.breaks.filter(b => b.severity === 'high').length;
    process.exit(criticalBreaks > 0 ? 1 : 0);
  }
}

main().catch(e => {
  console.error('PULSE error:', e.message || e);
  process.exit(2);
});
