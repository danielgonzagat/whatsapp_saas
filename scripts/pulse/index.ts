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
 *   npx ts-node scripts/pulse/index.ts --guidance    # Print dynamic CLI directive JSON
 *   npx ts-node scripts/pulse/index.ts --prove       # Print autonomy proof verdict JSON
 *   npx ts-node scripts/pulse/index.ts --vision      # Print dynamic product vision JSON
 *   npx ts-node scripts/pulse/index.ts --autonomous  # Run the autonomous Pulse -> Codex loop
 *   npx ts-node scripts/pulse/index.ts --autonomous --parallel-agents 3  # Run manager + workers
 *   npx ts-node scripts/pulse/index.ts --autonomous --risk-profile dangerous  # Expand ai_safe blast radius
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

import { activateRuntimeParserEnv } from './index-cli';
import { main } from './__parts__/index/main';

activateRuntimeParserEnv();

main().catch((e) => {
  console.error('PULSE error:', e.message || e);
  console.error(e.stack?.split('\n').slice(0, 8).join('\n'));
  process.exit(2);
});
