import * as path from 'path';
import type { PulseConfig } from './types';
import { generateArtifacts } from './artifacts';
import { renderDashboard } from './dashboard';
import { fullScan, type FullScanResult } from './daemon';
import { classifyWatchChange, shouldRescanForWatchChange } from './daemon-watch-classifier';
import { refreshScanResultForWatchChange } from './daemon-watch-state';
import { PULSE_EXTERNAL_INPUT_FILES } from './external-signals';
import { safeJoin } from './safe-path';

function getWatchGlobs(config: PulseConfig): string[] {
  return [
    safeJoin(config.rootDir, 'frontend/**/*.{ts,tsx,js,jsx,mjs,cjs,css,scss,json,md}'),
    safeJoin(config.rootDir, 'frontend-admin/**/*.{ts,tsx,js,jsx,mjs,cjs,css,scss,json,md}'),
    safeJoin(config.rootDir, 'backend/**/*.{ts,js,mjs,cjs,json,sql,md,yml,yaml}'),
    safeJoin(config.rootDir, 'worker/**/*.{ts,js,mjs,cjs,json,sql,md,yml,yaml}'),
    safeJoin(config.rootDir, 'e2e/**/*.{ts,tsx,js,jsx,mjs,cjs,json,md,yml,yaml}'),
    safeJoin(config.rootDir, 'scripts/**/*.{ts,js,mjs,cjs,json,md,yml,yaml}'),
    safeJoin(config.rootDir, 'docs/**/*.{md,json,yml,yaml}'),
    safeJoin(config.rootDir, 'docker/**/*.{yml,yaml,json,md}'),
    safeJoin(config.rootDir, 'nginx/**/*.{conf,yml,yaml,json,md}'),
    safeJoin(config.rootDir, '.github/workflows/**/*.{yml,yaml,json}'),
    safeJoin(config.rootDir, 'pulse.manifest.json'),
    safeJoin(config.rootDir, 'PULSE_CODACY_STATE.json'),
    ...PULSE_EXTERNAL_INPUT_FILES.filter((fileName) => fileName !== 'PULSE_CODACY_STATE.json').map(
      (fileName) => safeJoin(config.rootDir, fileName),
    ),
    safeJoin(config.rootDir, 'package.json'),
    safeJoin(config.rootDir, 'package-lock.json'),
    safeJoin(config.rootDir, 'Dockerfile'),
    safeJoin(config.rootDir, 'Dockerfile.*'),
  ];
}

/** Start daemon. */
export async function startDaemon(config: PulseConfig): Promise<void> {
  let chokidar: {
    watch: (
      paths: string[],
      options: Record<string, unknown>,
    ) => {
      on: (event: 'change', callback: (filePath: string) => void) => void;
      close: () => void;
    };
  };
  try {
    chokidar = require('chokidar');
  } catch {
    console.error('  chokidar not installed. Run: npm install --save-dev chokidar');
    console.error('  Falling back to single scan mode.');
    return;
  }

  let scanResult = await fullScan(config);
  renderDashboard(scanResult.health, scanResult.certification, { watching: true });

  const debounceTimers = new Map<string, NodeJS.Timeout>();

  const watcher = chokidar.watch([...getWatchGlobs(config), config.schemaPath].filter(Boolean), {
    ignored:
      /(node_modules|\.next|dist|\.git|coverage|\.turbo|build|\.cache|\.pulse|\.claude|\.copilot)/,
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on('change', (filePath: string) => {
    const existing = debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    debounceTimers.set(
      filePath,
      setTimeout(async () => {
        debounceTimers.delete(filePath);
        const changeKind = classifyWatchChange(filePath, config);
        if (shouldRescanForWatchChange(changeKind)) {
          scanResult = await refreshScanResultForWatchChange(
            config,
            scanResult,
            changeKind,
            {},
            filePath,
          );
          renderDashboard(scanResult.health, scanResult.certification, { watching: true });
        }
      }, 500),
    );
  });

  // Keyboard input
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', async (data: Buffer) => {
      const key = data.toString();
      if (key === 'q' || key === '\x03') {
        // q or Ctrl+C
        watcher.close();
        process.stdin.setRawMode(false);
        process.exit(0);
      }
      if (key === 'r') {
        scanResult = await fullScan(config);
        renderDashboard(scanResult.health, scanResult.certification, { watching: true });
      }
      if (key === 'e') {
        const paths = generateArtifacts(scanResult, config.rootDir);
        renderDashboard(scanResult.health, scanResult.certification, { watching: true });
        console.log(`  Report exported to: ${paths.reportPath}`);
      }
    });
  }

  console.log('  Watching for changes... Press [q] to quit, [r] to rescan, [e] to export.');
}
