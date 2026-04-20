import { safeJoin, safeResolve } from './safe-path';
import * as fs from 'fs';
import * as path from 'path';
import type { PulseHealth, Break } from './types';

function severityIcon(s: string): string {
  if (s === 'critical') {
    return 'CRITICAL';
  }
  if (s === 'high') {
    return 'HIGH';
  }
  if (s === 'medium') {
    return 'WARNING';
  }
  return 'INFO';
}

function healthBar(score: number): string {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

function groupBreaks(breaks: Break[]): Map<string, Break[]> {
  const groups = new Map<string, Break[]>();
  for (const b of breaks) {
    const key = b.type;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(b);
  }
  return groups;
}

function generateCorrectionPrompt(breaks: Break[]): string {
  const lines: string[] = [];
  lines.push('Fix the following codebase connectivity issues found by PULSE:');
  lines.push('');

  const grouped = groupBreaks(breaks.filter((b) => b.severity !== 'low'));
  let idx = 1;

  const apiNoRoute = grouped.get('API_NO_ROUTE') || [];
  if (apiNoRoute.length > 0) {
    lines.push('## API calls with no backend route');
    lines.push('Create the missing backend endpoints:');
    for (const b of apiNoRoute) {
      lines.push(`${idx}. **${b.file}:${b.line}** — ${b.description}`);
      idx++;
    }
    lines.push('');
  }

  const facades = grouped.get('FACADE') || [];
  if (facades.length > 0) {
    lines.push('## Facades to fix');
    lines.push('Replace fake/stub code with real implementations:');
    for (const b of facades) {
      lines.push(`${idx}. **${b.file}:${b.line}** — ${b.description}`);
      if (b.detail) {
        lines.push(`   Evidence: \`${b.detail}\``);
      }
      idx++;
    }
    lines.push('');
  }

  const deadHandlers = grouped.get('UI_DEAD_HANDLER') || [];
  if (deadHandlers.length > 0) {
    lines.push('## Dead UI handlers');
    lines.push('Connect these UI elements to real backend operations:');
    for (const b of deadHandlers) {
      lines.push(`${idx}. **${b.file}:${b.line}** — ${b.description}`);
      idx++;
    }
    lines.push('');
  }

  const orphans = grouped.get('MODEL_ORPHAN') || [];
  if (orphans.length > 0) {
    lines.push('## Orphaned Prisma models');
    lines.push('These models exist in schema but no service/controller accesses them:');
    for (const b of orphans) {
      lines.push(`${idx}. **${b.file}:${b.line}** — ${b.description}`);
      idx++;
    }
    lines.push('');
  }

  const proxyBreaks = grouped.get('PROXY_NO_UPSTREAM') || [];
  if (proxyBreaks.length > 0) {
    lines.push('## Proxy routes with no upstream backend');
    for (const b of proxyBreaks) {
      lines.push(`${idx}. **${b.file}:${b.line}** — ${b.description}`);
      idx++;
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Generate report. */
export function generateReport(health: PulseHealth, rootDir: string): string {
  const lines: string[] = [];

  lines.push(`# PULSE REPORT — ${health.timestamp}`);
  lines.push('');
  lines.push(`## Health Score: ${health.score}/100`);
  lines.push(`\`${healthBar(health.score)}\` ${health.score}%`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Total | Issues |');
  lines.push('|--------|-------|--------|');
  lines.push(
    `| UI Elements | ${health.stats.uiElements} | ${health.stats.uiDeadHandlers} dead handlers |`,
  );
  lines.push(`| API Calls | ${health.stats.apiCalls} | ${health.stats.apiNoRoute} no backend |`);
  lines.push(
    `| Backend Routes | ${health.stats.backendRoutes} | ${health.stats.backendEmpty} empty |`,
  );
  lines.push(
    `| Prisma Models | ${health.stats.prismaModels} | ${health.stats.modelOrphans} orphaned |`,
  );
  lines.push(
    `| Facades | ${health.stats.facades} | ${health.stats.facadesBySeverity.high} critical, ${health.stats.facadesBySeverity.medium} warning |`,
  );
  lines.push(
    `| Proxy Routes | ${health.stats.proxyRoutes} | ${health.stats.proxyNoUpstream} no upstream |`,
  );
  if (
    health.stats.securityIssues > 0 ||
    health.stats.dataSafetyIssues > 0 ||
    health.stats.qualityIssues > 0
  ) {
    lines.push(`| Security | - | ${health.stats.securityIssues} issues |`);
    lines.push(`| Data Safety | - | ${health.stats.dataSafetyIssues} issues |`);
    lines.push(`| Quality | - | ${health.stats.qualityIssues} issues |`);
  }
  lines.push('');

  // Breaks by type
  const grouped = groupBreaks(health.breaks);
  const typeOrder: Array<[string, string]> = [
    // Core connectivity
    ['API_NO_ROUTE', 'API Calls with No Backend Route'],
    ['FACADE', 'Facades (Fake/Stub Code)'],
    ['UI_DEAD_HANDLER', 'Dead UI Handlers'],
    ['MODEL_ORPHAN', 'Orphaned Prisma Models'],
    ['PROXY_NO_UPSTREAM', 'Proxy Routes with No Upstream'],
    ['ROUTE_NO_CALLER', 'Backend Routes Not Called by Frontend'],
    ['ROUTE_EMPTY', 'Backend Routes with Empty Handlers'],
    // Security
    ['ROUTE_NO_AUTH', 'Routes Without Auth Guard'],
    ['MISSING_WORKSPACE_FILTER', 'Missing Workspace Isolation'],
    ['FINANCIAL_NO_RATE_LIMIT', 'Financial Routes Without Rate Limiting'],
    ['HARDCODED_SECRET', 'Hardcoded Secrets'],
    ['SQL_INJECTION_RISK', 'SQL Injection Risk'],
    ['CSRF_UNPROTECTED', 'CSRF Unprotected'],
    ['XSS_DANGEROUS_HTML', 'XSS via dangerouslySetInnerHTML'],
    ['EVAL_USAGE', 'eval() Usage'],
    ['COOKIE_NOT_HTTPONLY', 'Cookies Without httpOnly'],
    ['SENSITIVE_DATA_IN_LOG', 'Sensitive Data in Logs'],
    ['INTERNAL_ERROR_EXPOSED', 'Internal Errors Exposed to Client'],
    // Financial
    ['FINANCIAL_NO_TRANSACTION', 'Financial Ops Without $transaction'],
    ['TOFIX_WITHOUT_PARSE', 'toFixed Without parseFloat'],
    ['DIVISION_BY_ZERO_RISK', 'Division by Zero Risk'],
    ['FINANCIAL_ERROR_SWALLOWED', 'Financial Errors Swallowed'],
    // Data safety
    ['DANGEROUS_DELETE', 'Delete Without Where Clause'],
    ['JSON_PARSE_UNSAFE', 'JSON.parse Without try/catch'],
    ['EMPTY_CATCH', 'Empty Catch Blocks'],
    ['FETCH_NO_TIMEOUT', 'Fetch Without Timeout'],
    // Integration
    ['QUEUE_NO_PROCESSOR', 'Queue Jobs Without Processor'],
    ['GATEWAY_NO_CONSUMER', 'WebSocket Gateway Without Consumer'],
    ['DUPLICATE_ROUTE', 'Duplicate Routes'],
    ['SERVICE_NOT_PROVIDED', 'Services Not Registered in Module'],
    ['CIRCULAR_IMPORT', 'Circular Imports'],
    // Quality
    ['SSR_UNSAFE_ACCESS', 'SSR Unsafe window/document Access'],
    ['CONSOLE_IN_PRODUCTION', 'console.log in Production'],
    ['PUPPETEER_PAGE_LEAK', 'Puppeteer Page Leak'],
    ['HARDCODED_INTERNAL_URL', 'Hardcoded Internal URLs'],
    ['INTERVAL_NO_CLEANUP', 'setInterval Without Cleanup'],
  ];

  lines.push(`## Breaks (${health.breaks.length} total)`);
  lines.push('');

  for (const [type, title] of typeOrder) {
    const group = grouped.get(type);
    if (!group || group.length === 0) {
      continue;
    }

    lines.push(`### ${title} (${group.length})`);
    lines.push('');
    lines.push('| Severity | File:Line | Description |');
    lines.push('|----------|-----------|-------------|');
    for (const b of group) {
      lines.push(`| ${severityIcon(b.severity)} | ${b.file}:${b.line} | ${b.description} |`);
    }
    lines.push('');
  }

  // Correction prompt
  lines.push('---');
  lines.push('');
  lines.push('## CORRECTION PROMPT');
  lines.push('');
  lines.push(
    'Copy and paste the following into Claude Code to fix all critical and warning issues:',
  );
  lines.push('');
  lines.push('```');
  lines.push(generateCorrectionPrompt(health.breaks));
  lines.push('```');

  const report = lines.join('\n');
  const reportPath = safeJoin(rootDir, 'PULSE_REPORT.md');
  fs.writeFileSync(reportPath, report);
  return reportPath;
}
