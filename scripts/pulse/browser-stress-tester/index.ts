#!/usr/bin/env ts-node
/**
 * PULSE Browser Stress Tester
 *
 * Opens a real Playwright browser, navigates to application pages,
 * finds interactive elements, and tests them with runtime evidence.
 */

import * as fs from 'fs';
import * as path from 'path';
import { detectConfig } from '../config';
import { fullScan } from '../daemon';
import { buildFunctionalMap } from '../functional-map';
import { obtainAuthToken, injectAuth, verifyAuth } from './auth';
import { testPage } from './page-tester';
import { generateStressTestReport, renderTerminalSummary } from './reporter';
import type {
  BrowserStressRunOptions,
  BrowserStressRunResult,
  BrowserTestStatus,
  PageTestResult,
  StressTestConfig,
  StressTestResult,
  TestDataEntry,
} from './types';

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
  if (PAGE_PRIORITY[route] !== undefined) return PAGE_PRIORITY[route];
  for (const [prefix, priority] of Object.entries(PAGE_PRIORITY)) {
    if (route.startsWith(prefix + '/')) return priority + 1;
  }
  return 100;
}

function parseCliArgs(argv: string[]): BrowserStressRunOptions {
  return {
    headed: argv.includes('--headed'),
    fast: argv.includes('--fast'),
    pageFilter: argv.includes('--page') ? argv[argv.indexOf('--page') + 1] : null,
    groupFilter: argv.includes('--group') ? argv[argv.indexOf('--group') + 1] : null,
    slowMo: argv.includes('--slow-mo') ? parseInt(argv[argv.indexOf('--slow-mo') + 1], 10) : 50,
    log: true,
  };
}

function buildRunResult(
  partial: Partial<BrowserStressRunResult> & Pick<BrowserStressRunResult, 'frontendUrl' | 'backendUrl' | 'screenshotDir' | 'summary'>,
): BrowserStressRunResult {
  return {
    attempted: false,
    executed: false,
    exitCode: 1,
    reportPath: null,
    stressResult: null,
    ...partial,
  };
}

export async function runBrowserStressTest(options: BrowserStressRunOptions = {}): Promise<BrowserStressRunResult> {
  const flags: Required<BrowserStressRunOptions> = {
    headed: options.headed ?? false,
    fast: options.fast ?? false,
    pageFilter: options.pageFilter ?? null,
    groupFilter: options.groupFilter ?? null,
    slowMo: options.slowMo ?? 50,
    log: options.log ?? true,
  };
  const log = (...args: Array<string | number>) => {
    if (flags.log) console.log(...args);
  };

  const config = detectConfig(process.cwd());
  const frontendUrl = process.env.PULSE_FRONTEND_URL || 'http://localhost:3000';
  const backendUrl = process.env.PULSE_BACKEND_URL || process.env.E2E_API_URL || 'https://whatsappsaas-copy-production.up.railway.app';
  const screenshotDir = path.join(config.rootDir, 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  let browser: any = null;

  try {
    log('');
    log('  ╔══════════════════════════════════════════════════════════╗');
    log('  ║  PULSE — Browser Stress Tester                         ║');
    log('  ║  Testing ALL interactions in REAL browser               ║');
    log('  ╚══════════════════════════════════════════════════════════╝');
    log('');

    log('  Building functional map...');
    const scanResult = await fullScan(config);
    const fmapResult = buildFunctionalMap(config, scanResult.coreData);
    log(`  Functional map: ${fmapResult.summary.totalPages} pages, ${fmapResult.summary.totalInteractions} static interactions`);

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

    log(`  Frontend:   ${frontendUrl}`);
    log(`  Backend:    ${backendUrl}`);
    log(`  Mode:       ${flags.headed ? 'HEADED (visible)' : 'HEADLESS'}`);
    log(`  Persistence: ${flags.fast ? 'SKIP' : 'CHECK'}`);
    log('');

    let chromium: any;
    try {
      chromium = require('playwright').chromium;
    } catch {
      try {
        chromium = require(require.resolve('playwright', { paths: [path.join(config.rootDir, 'node_modules')] })).chromium;
      } catch {
        return buildRunResult({
          attempted: true,
          executed: false,
          exitCode: 1,
          frontendUrl,
          backendUrl,
          screenshotDir,
          summary: 'Playwright is not installed. Browser evidence is unavailable.',
          error: 'Playwright not installed. Run: npm install -D playwright && npx playwright install chromium',
        });
      }
    }

    log('  Launching browser...');
    browser = await chromium.launch({
      headless: stressConfig.headless,
      slowMo: stressConfig.slowMo,
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      ignoreHTTPSErrors: true,
    });
    let page = await context.newPage();

    log('  Authenticating...');
    let creds;
    try {
      creds = await obtainAuthToken(backendUrl);
      log(`  Logged in as: ${creds.email} (workspace: ${creds.workspaceId.slice(0, 8)}...)`);
    } catch (error: any) {
      return buildRunResult({
        attempted: true,
        executed: false,
        exitCode: 1,
        frontendUrl,
        backendUrl,
        screenshotDir,
        summary: 'Browser evidence could not authenticate against the backend.',
        error: `AUTH FAILED: ${error.message}`,
      });
    }

    await injectAuth(page, creds, frontendUrl);
    const authOk = await verifyAuth(page, frontendUrl);
    if (!authOk) {
      return buildRunResult({
        attempted: true,
        executed: false,
        exitCode: 1,
        frontendUrl,
        backendUrl,
        screenshotDir,
        summary: 'Browser evidence could not verify a logged-in frontend session.',
        error: `Auth injection failed. Make sure the frontend is running at ${frontendUrl}`,
      });
    }
    log('  Auth verified — dashboard loaded');
    log('');

    let pagesToTest = fmapResult.pages.filter(item => !item.isRedirect);
    pagesToTest = pagesToTest.filter(item => {
      if (item.route.includes(':') && !item.route.startsWith('/products/')) return false;
      return true;
    });

    if (flags.pageFilter) {
      pagesToTest = pagesToTest.filter(item => item.route === flags.pageFilter || item.route.startsWith(flags.pageFilter + '/'));
    }
    if (flags.groupFilter) {
      pagesToTest = pagesToTest.filter(item => item.group === flags.groupFilter);
    }

    pagesToTest.sort((a, b) => getPagePriority(a.route) - getPagePriority(b.route));

    const publicSkip = new Set(['/', '/login', '/register', '/terms', '/privacy', '/onboarding', '/onboarding-chat']);
    log(`  Testing ${pagesToTest.length} pages...`);
    log(`  ${'─'.repeat(60)}`);

    const startTime = Date.now();
    const pageResults: PageTestResult[] = [];
    const createdData: TestDataEntry[] = [];

    for (let index = 0; index < pagesToTest.length; index++) {
      const fmapPage = pagesToTest[index];
      const route = fmapPage.route;
      const progress = `[${index + 1}/${pagesToTest.length}]`;

      if (publicSkip.has(route)) {
        log(`  ${progress} ${route} — skipping (public/auth page)`);
        pageResults.push({
          route,
          group: fmapPage.group,
          loadTimeMs: 0,
          loadStatus: 'ok',
          elementsFound: 0,
          elementsTested: 0,
          results: [],
          screenshotPath: null,
          consoleErrors: [],
        });
        continue;
      }

      if (flags.log) {
        process.stdout.write(`  ${progress} ${route}...`);
      }

      try {
        const result = await testPage(page, route, fmapPage, stressConfig, createdData);
        pageResults.push(result);

        const ok = result.results.filter(item => item.browserStatus === 'FUNCIONA').length;
        const broken = result.results.filter(item => item.browserStatus === 'QUEBRADO').length;
        const facade = result.results.filter(item => item.browserStatus === 'FACHADA').length;

        log(` ${result.loadTimeMs}ms | ${result.elementsFound} found | ${ok} ok, ${broken} broken, ${facade} facade`);

        if (result.loadStatus === 'redirect' || page.url().includes('/login')) {
          log('  ↳ Re-injecting auth...');
          await injectAuth(page, creds, frontendUrl);
        }
      } catch (error: any) {
        log(` CRASH: ${error.message?.slice(0, 80)}`);
        pageResults.push({
          route,
          group: fmapPage.group,
          loadTimeMs: 0,
          loadStatus: 'error',
          elementsFound: 0,
          elementsTested: 0,
          results: [],
          screenshotPath: null,
          consoleErrors: [error.message?.slice(0, 200) || 'Unknown'],
        });

        try {
          await page.goto(frontendUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await injectAuth(page, creds, frontendUrl);
        } catch {
          page = await context.newPage();
          await injectAuth(page, creds, frontendUrl);
        }
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const allResults = pageResults.flatMap(item => item.results);
    const byStatus: Record<BrowserTestStatus, number> = {
      FUNCIONA: 0,
      QUEBRADO: 0,
      FACHADA: 0,
      TIMEOUT: 0,
      CRASH: 0,
      NAO_TESTAVEL: 0,
    };
    for (const result of allResults) byStatus[result.browserStatus]++;

    const totalElements = pageResults.reduce((sum, item) => sum + item.elementsFound, 0);
    const loadTimes = pageResults.filter(item => item.loadTimeMs > 0).map(item => item.loadTimeMs);
    const avgLoad = loadTimes.length > 0 ? loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length : 0;
    const crashes = pageResults.filter(item => item.loadStatus === 'error').map(item => item.route);

    const stressResult: StressTestResult = {
      config: stressConfig,
      pages: pageResults,
      summary: {
        totalPages: pageResults.length,
        totalElements,
        totalTested: allResults.length,
        byStatus,
        passRate: allResults.length > 0 ? byStatus.FUNCIONA / allResults.length : 0,
        avgPageLoadMs: avgLoad,
        totalDurationMs,
        crashes,
      },
      createdTestData: createdData,
      timestamp: new Date().toISOString(),
    };

    log('');
    log(`  ${'─'.repeat(60)}`);
    renderTerminalSummary(stressResult);

    const reportPath = generateStressTestReport(stressResult, fmapResult, config.rootDir);
    log(`  Report saved to: ${reportPath}`);
    log(`  Screenshots dir: ${screenshotDir}`);

    const blockingInteractions = byStatus.QUEBRADO + byStatus.CRASH + byStatus.TIMEOUT;
    const failRate = blockingInteractions / (allResults.length || 1);

    return {
      attempted: true,
      executed: true,
      exitCode: failRate > 0.5 ? 1 : 0,
      frontendUrl,
      backendUrl,
      screenshotDir,
      reportPath,
      summary: blockingInteractions > 0
        ? `Browser evidence executed with ${blockingInteractions} blocking interaction(s).`
        : 'Browser evidence executed without blocking interactions.',
      stressResult,
    };
  } catch (error: any) {
    return buildRunResult({
      attempted: true,
      executed: false,
      exitCode: 1,
      frontendUrl,
      backendUrl,
      screenshotDir,
      summary: 'Browser evidence failed before completing the stress run.',
      error: error.message || String(error),
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
      log('  Browser closed.');
      log('');
    }
  }
}

async function main() {
  const result = await runBrowserStressTest(parseCliArgs(process.argv.slice(2)));

  if (!result.executed && result.error) {
    console.error(`  ${result.error}`);
  }

  process.exit(result.exitCode);
}

if (require.main === module) {
  main().catch(error => {
    console.error('PULSE Stress Tester error:', error.message || error);
    process.exit(2);
  });
}
