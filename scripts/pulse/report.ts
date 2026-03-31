import * as fs from 'fs';
import * as path from 'path';
import type { PulseHealth, Break } from './types';

function severityIcon(s: string): string {
  if (s === 'high') return 'CRITICAL';
  if (s === 'medium') return 'WARNING';
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
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b);
  }
  return groups;
}

function generateCorrectionPrompt(breaks: Break[]): string {
  const lines: string[] = [];
  lines.push('Fix the following codebase connectivity issues found by PULSE:');
  lines.push('');

  const grouped = groupBreaks(breaks.filter(b => b.severity !== 'low'));
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
      if (b.detail) lines.push(`   Evidence: \`${b.detail}\``);
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
  lines.push(`| UI Elements | ${health.stats.uiElements} | ${health.stats.uiDeadHandlers} dead handlers |`);
  lines.push(`| API Calls | ${health.stats.apiCalls} | ${health.stats.apiNoRoute} no backend |`);
  lines.push(`| Backend Routes | ${health.stats.backendRoutes} | ${health.stats.backendEmpty} empty |`);
  lines.push(`| Prisma Models | ${health.stats.prismaModels} | ${health.stats.modelOrphans} orphaned |`);
  lines.push(`| Facades | ${health.stats.facades} | ${health.stats.facadesBySeverity.high} critical, ${health.stats.facadesBySeverity.medium} warning |`);
  lines.push(`| Proxy Routes | ${health.stats.proxyRoutes} | ${health.stats.proxyNoUpstream} no upstream |`);
  lines.push('');

  // Breaks by type
  const grouped = groupBreaks(health.breaks);
  const typeOrder: Array<[string, string]> = [
    ['API_NO_ROUTE', 'API Calls with No Backend Route'],
    ['FACADE', 'Facades (Fake/Stub Code)'],
    ['UI_DEAD_HANDLER', 'Dead UI Handlers'],
    ['MODEL_ORPHAN', 'Orphaned Prisma Models'],
    ['PROXY_NO_UPSTREAM', 'Proxy Routes with No Upstream'],
    ['ROUTE_NO_CALLER', 'Backend Routes Not Called by Frontend'],
    ['ROUTE_EMPTY', 'Backend Routes with Empty Handlers'],
  ];

  lines.push(`## Breaks (${health.breaks.length} total)`);
  lines.push('');

  for (const [type, title] of typeOrder) {
    const group = grouped.get(type);
    if (!group || group.length === 0) continue;

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
  lines.push('Copy and paste the following into Claude Code to fix all critical and warning issues:');
  lines.push('');
  lines.push('```');
  lines.push(generateCorrectionPrompt(health.breaks));
  lines.push('```');

  const report = lines.join('\n');
  const reportPath = path.join(rootDir, 'PULSE_REPORT.md');
  fs.writeFileSync(reportPath, report);
  return reportPath;
}
