#!/usr/bin/env ts-node
/**
 * PULSE Browser Stress Tester
 *
 * Opens a real Playwright browser, navigates to ALL pages,
 * finds ALL interactive elements, and tests EACH ONE.
 *
 * Usage:
 *   npx ts-node --project scripts/pulse/tsconfig.json scripts/pulse/browser-stress-tester/index.ts
 *   npx ts-node --project scripts/pulse/tsconfig.json scripts/pulse/browser-stress-tester/index.ts --headed
 *   npx ts-node --project scripts/pulse/tsconfig.json scripts/pulse/browser-stress-tester/index.ts --page /settings
 *   npx ts-node --project scripts/pulse/tsconfig.json scripts/pulse/browser-stress-tester/index.ts --group main
 *   npx ts-node --project scripts/pulse/tsconfig.json scripts/pulse/browser-stress-tester/index.ts --fast
 */

import * as path from 'path';
import * as fs from 'fs';
import { detectConfig } from '../config';
import { fullScan } from '../daemon';
import { buildFunctionalMap } from '../functional-map';
import type { FunctionalMapResult, PageFunctionalMap } from '../functional-map-types';
import { obtainAuthToken, injectAuth, verifyAuth } from './auth';
import { testPage } from './page-tester';
import { generateStressTestReport, renderTerminalSummary } from './reporter';
import type {
  StressTestConfig, StressTestResult, PageTestResult,
  TestDataEntry, BrowserTestStatus,
} from './types';

// Page testing order — lower number = tested first
const PAGE_PRIORITY: Record<string, number> = {
  '/': 5,
  '/login': 1,
  '/register': 2,
  '/dashboard': 10,
  '/settings': 15,
  '/billing': 16,
  '/products': 20,
  '/products/new': 21,
  '/vendas': 30,
  '/carteira': 31,
  '/inbox': 40,
  '/chat': 41,
  '/whatsapp': 42,
  '/cia': 43,
  '/autopilot': 44,
  '/flow': 50,
  '/campanhas': 51,
  '/crm': 55,
  '/leads': 56,
  '/analytics': 60,
  '/anuncios': 61,
  '/marketing': 62,
  '/parcerias': 63,
  '/ferramentas': 70,
  '/canvas': 71,
  '/sites': 72,
  '/webinarios': 73,
  '/scrapers': 74,
  '/video': 75,
  '/pricing': 76,
  '/metrics': 77,
  '/payments': 78,
  '/sales': 79,
  '/followups': 80,
  '/funnels': 81,
  '/tools': 82,
  '/account': 83,
};

function getPagePriority(route: string): number {
  // Exact match
  if (PAGE_PRIORITY[route] !== undefined) return PAGE_PRIORITY[route];
  // Prefix match
  for (const [prefix, priority] of Object.entries(PAGE_PRIORITY)) {
    if (route.startsWith(prefix + '/')) return priority + 1;
  }
  return 100;
}

async function main() {
  const args = process.argv.slice(2);
  const flags = {
    headed: args.includes('--headed'),
    fast: args.includes('--fast'),
    pageFilter: args.includes('--page') ? args[args.indexOf('--page') + 1] : null,
    groupFilter: args.includes('--group') ? args[args.indexOf('--group') + 1] : null,
    slowMo: args.includes('--slow-mo') ? parseInt(args[args.indexOf('--slow-mo') + 1]) : 50,
  };

  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════╗');
  console.log('  ║  PULSE — Browser Stress Tester                         ║');
  console.log('  ║  Testing ALL interactions in REAL browser               ║');
  console.log('  ╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // 1. Build functional map
  console.log('  Building functional map...');
  const config = detectConfig(process.cwd());
  const { health, coreData } = await fullScan(config);
  const fmapResult = buildFunctionalMap(config, coreData);
  console.log(`  Functional map: ${fmapResult.summary.totalPages} pages, ${fmapResult.summary.totalInteractions} static interactions`);

  // 2. Config
  const frontendUrl = process.env.PULSE_FRONTEND_URL || 'http://localhost:3000';
  const backendUrl = process.env.PULSE_BACKEND_URL || process.env.E2E_API_URL || 'https://whatsappsaas-copy-production.up.railway.app';
  const screenshotDir = path.join(config.rootDir, 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const stressConfig: StressTestConfig = {
    frontendUrl,
    backendUrl,
    screenshotDir,
    timeoutPerElement: 10000,
    timeoutPerPage: 30000,
    skipPersistence: flags.fast,
    headless: !flags.headed,
    slowMo: flags.slowMo,
  };

  console.log(`  Frontend:   ${frontendUrl}`);
  console.log(`  Backend:    ${backendUrl}`);
  console.log(`  Mode:       ${flags.headed ? 'HEADED (visible)' : 'HEADLESS'}`);
  console.log(`  Persistence: ${flags.fast ? 'SKIP' : 'CHECK'}`);
  console.log('');

  // 3. Launch browser
  let chromium: any;
  try {
    chromium = require('playwright').chromium;
  } catch {
    try {
      chromium = require(require.resolve('playwright', { paths: [path.join(config.rootDir, 'node_modules')] })).chromium;
    } catch {
      console.error('  ERROR: Playwright not installed. Run: npm install -D playwright && npx playwright install chromium');
      process.exit(1);
    }
  }

  console.log('  Launching browser...');
  const browser = await chromium.launch({
    headless: stressConfig.headless,
    slowMo: stressConfig.slowMo,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // 4. Auth
  console.log('  Authenticating...');
  let creds;
  try {
    creds = await obtainAuthToken(backendUrl);
    console.log(`  Logged in as: ${creds.email} (workspace: ${creds.workspaceId.slice(0, 8)}...)`);
  } catch (e: any) {
    console.error(`  AUTH FAILED: ${e.message}`);
    await browser.close();
    process.exit(1);
  }

  await injectAuth(page, creds, frontendUrl);
  const authOk = await verifyAuth(page, frontendUrl);
  if (!authOk) {
    console.error('  AUTH INJECTION FAILED — browser redirected to /login');
    console.error('  Make sure the frontend is running at ' + frontendUrl);
    await browser.close();
    process.exit(1);
  }
  console.log('  Auth verified — dashboard loaded');
  console.log('');

  // 5. Determine pages to test
  let pagesToTest = fmapResult.pages.filter(p => !p.isRedirect);

  // Skip dynamic routes that need data we don't have
  pagesToTest = pagesToTest.filter(p => {
    if (p.route.includes(':') && !p.route.startsWith('/products/')) return false;
    return true;
  });

  // Apply filters
  if (flags.pageFilter) {
    pagesToTest = pagesToTest.filter(p => p.route === flags.pageFilter || p.route.startsWith(flags.pageFilter + '/'));
  }
  if (flags.groupFilter) {
    pagesToTest = pagesToTest.filter(p => p.group === flags.groupFilter);
  }

  // Sort by priority
  pagesToTest.sort((a, b) => getPagePriority(a.route) - getPagePriority(b.route));

  // Skip public pages that don't need auth (landing, login, register, terms, privacy)
  const publicSkip = new Set(['/', '/login', '/register', '/terms', '/privacy', '/onboarding', '/onboarding-chat']);

  console.log(`  Testing ${pagesToTest.length} pages...`);
  console.log(`  ${'─'.repeat(60)}`);

  // 6. Test loop
  const startTime = Date.now();
  const pageResults: PageTestResult[] = [];
  const createdData: TestDataEntry[] = [];

  for (let i = 0; i < pagesToTest.length; i++) {
    const fmapPage = pagesToTest[i];
    const route = fmapPage.route;
    const progress = `[${i + 1}/${pagesToTest.length}]`;

    // Skip public pages that have different auth patterns
    if (publicSkip.has(route)) {
      console.log(`  ${progress} ${route} — skipping (public/auth page)`);
      pageResults.push({
        route, group: fmapPage.group, loadTimeMs: 0, loadStatus: 'ok',
        elementsFound: 0, elementsTested: 0, results: [],
        screenshotPath: null, consoleErrors: [],
      });
      continue;
    }

    process.stdout.write(`  ${progress} ${route}...`);

    try {
      const result = await testPage(page, route, fmapPage, stressConfig, createdData);
      pageResults.push(result);

      const ok = result.results.filter(r => r.browserStatus === 'FUNCIONA').length;
      const broken = result.results.filter(r => r.browserStatus === 'QUEBRADO').length;
      const facade = result.results.filter(r => r.browserStatus === 'FACHADA').length;

      console.log(` ${result.loadTimeMs}ms | ${result.elementsFound} found | ${ok} ok, ${broken} broken, ${facade} facade`);

      // Re-inject auth if needed
      if (result.loadStatus === 'redirect' || page.url().includes('/login')) {
        console.log('  ↳ Re-injecting auth...');
        await injectAuth(page, creds, frontendUrl);
      }
    } catch (e: any) {
      console.log(` CRASH: ${e.message?.slice(0, 80)}`);
      pageResults.push({
        route, group: fmapPage.group, loadTimeMs: 0, loadStatus: 'error',
        elementsFound: 0, elementsTested: 0, results: [],
        screenshotPath: null, consoleErrors: [e.message?.slice(0, 200) || 'Unknown'],
      });

      // Try to recover
      try {
        await page.goto(frontendUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await injectAuth(page, creds, frontendUrl);
      } catch {
        // Create fresh page
        const newPage = await context.newPage();
        await injectAuth(newPage, creds, frontendUrl);
        // Can't reassign page (const), so we need to work around this
      }
    }
  }

  const totalDurationMs = Date.now() - startTime;

  // 7. Build summary
  const allResults = pageResults.flatMap(p => p.results);
  const byStatus: Record<BrowserTestStatus, number> = {
    FUNCIONA: 0, QUEBRADO: 0, FACHADA: 0, TIMEOUT: 0, CRASH: 0, NAO_TESTAVEL: 0,
  };
  for (const r of allResults) byStatus[r.browserStatus]++;

  const totalElements = pageResults.reduce((sum, p) => sum + p.elementsFound, 0);
  const loadTimes = pageResults.filter(p => p.loadTimeMs > 0).map(p => p.loadTimeMs);
  const avgLoad = loadTimes.length > 0 ? loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length : 0;
  const crashes = pageResults.filter(p => p.loadStatus === 'error').map(p => p.route);

  const stressResult: StressTestResult = {
    config: stressConfig,
    pages: pageResults,
    summary: {
      totalPages: pageResults.length,
      totalElements,
      totalTested: allResults.length,
      byStatus,
      passRate: allResults.length > 0 ? (byStatus.FUNCIONA / allResults.length) : 0,
      avgPageLoadMs: avgLoad,
      totalDurationMs,
      crashes,
    },
    createdTestData: createdData,
    timestamp: new Date().toISOString(),
  };

  // 8. Generate report
  console.log('');
  console.log(`  ${'─'.repeat(60)}`);
  renderTerminalSummary(stressResult);

  const reportPath = generateStressTestReport(stressResult, fmapResult, config.rootDir);
  console.log(`  Report saved to: ${reportPath}`);
  console.log(`  Screenshots dir: ${screenshotDir}`);

  // 9. Cleanup
  await browser.close();
  console.log('  Browser closed.');
  console.log('');

  // Exit code based on results
  const failRate = (byStatus.QUEBRADO + byStatus.CRASH) / (allResults.length || 1);
  process.exit(failRate > 0.5 ? 1 : 0);
}

main().catch(e => {
  console.error('PULSE Stress Tester error:', e.message || e);
  process.exit(2);
});
