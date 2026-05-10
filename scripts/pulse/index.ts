#!/usr/bin/env ts-node

import { detectConfig } from './config';
import { fullScan } from './daemon';
import { generateArtifacts } from './artifacts/generate';
import { renderDashboard } from './dashboard';

const args = process.argv.slice(2);
const wantsJson = args.includes('--json') || args.includes('-j');
const wantsReport = args.includes('--report') || args.includes('-r');
const wantsWatch = args.includes('--watch') || args.includes('-w');

async function main(): Promise<void> {
  const config = detectConfig(process.cwd());
  const scanResult = await fullScan(config, { includeParser: () => false, parserTimeoutMs: 1000 });

  if (wantsReport || wantsJson || !wantsWatch) {
    const artifactPaths = generateArtifacts(scanResult, config.rootDir);
    if (wantsJson) {
      process.stdout.write(JSON.stringify(scanResult.certification, null, 2) + '\n');
      return;
    }
    if (wantsReport) {
      process.stdout.write(JSON.stringify(artifactPaths, null, 2) + '\n');
      return;
    }
  }

  renderDashboard(scanResult.health);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
});
