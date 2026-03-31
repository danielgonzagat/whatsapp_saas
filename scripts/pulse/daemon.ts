import * as path from 'path';
import type { PulseConfig, PulseHealth } from './types';
import { parseSchema } from './parsers/schema-parser';
import { parseBackendRoutes } from './parsers/backend-parser';
import { traceServices } from './parsers/service-tracer';
import { parseAPICalls, parseProxyRoutes } from './parsers/api-parser';
import { parseUIElements } from './parsers/ui-parser';
import { detectFacades } from './parsers/facade-detector';
import { buildHookRegistry } from './parsers/hook-registry';
import { buildGraph } from './graph';
import { renderDashboard } from './dashboard';
import { generateReport } from './report';

type ParserType = 'schema' | 'backend' | 'service' | 'api' | 'ui' | 'facade' | 'proxy';

function getParserType(filePath: string, config: PulseConfig): ParserType | null {
  const rel = path.relative(config.rootDir, filePath);
  if (rel.endsWith('schema.prisma')) return 'schema';
  if (rel.includes('backend') && rel.endsWith('.controller.ts')) return 'backend';
  if (rel.includes('backend') && rel.endsWith('.service.ts')) return 'service';
  if (rel.includes('frontend') && rel.match(/\/app\/api\/.*\/route\.ts$/)) return 'proxy';
  if (rel.includes('frontend') && rel.match(/\/lib\/api\/.*\.ts$/)) return 'api';
  if (rel.includes('frontend') && rel.endsWith('.tsx')) return 'ui';
  return null;
}

export async function startDaemon(config: PulseConfig): Promise<void> {
  let chokidar: any;
  try {
    chokidar = require('chokidar');
  } catch {
    console.error('  chokidar not installed. Run: npm install --save-dev chokidar');
    console.error('  Falling back to single scan mode.');
    return;
  }

  let health = fullScan(config);
  renderDashboard(health, { watching: true });

  const debounceTimers = new Map<string, NodeJS.Timeout>();

  const watcher = chokidar.watch(
    [
      path.join(config.frontendDir, '**/*.{ts,tsx}'),
      path.join(config.backendDir, '**/*.{ts}'),
      config.schemaPath,
    ].filter(Boolean),
    {
      ignored: /(node_modules|\.next|dist|\.git|coverage)/,
      persistent: true,
      ignoreInitial: true,
    }
  );

  watcher.on('change', (filePath: string) => {
    const existing = debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    debounceTimers.set(filePath, setTimeout(() => {
      debounceTimers.delete(filePath);
      const parserType = getParserType(filePath, config);
      if (parserType) {
        health = fullScan(config); // Full re-scan for simplicity
        renderDashboard(health, { watching: true });
      }
    }, 500));
  });

  // Keyboard input
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (data: Buffer) => {
      const key = data.toString();
      if (key === 'q' || key === '\x03') { // q or Ctrl+C
        watcher.close();
        process.stdin.setRawMode(false);
        process.exit(0);
      }
      if (key === 'r') {
        health = fullScan(config);
        renderDashboard(health, { watching: true });
      }
      if (key === 'e') {
        const reportPath = generateReport(health, config.rootDir);
        renderDashboard(health, { watching: true });
        console.log(`  Report exported to: ${reportPath}`);
      }
    });
  }

  console.log('  Watching for changes... Press [q] to quit, [r] to rescan, [e] to export.');
}

export function fullScan(config: PulseConfig): PulseHealth {
  const prismaModels = parseSchema(config);
  const backendRoutes = parseBackendRoutes(config);
  const serviceTraces = traceServices(config);
  const apiCalls = parseAPICalls(config);
  const proxyRoutes = parseProxyRoutes(config);
  const hookRegistry = buildHookRegistry(config);
  const uiElements = parseUIElements(config, hookRegistry);
  const facades = detectFacades(config);

  return buildGraph({
    uiElements,
    apiCalls,
    backendRoutes,
    prismaModels,
    serviceTraces,
    proxyRoutes,
    facades,
    globalPrefix: config.globalPrefix,
  });
}
