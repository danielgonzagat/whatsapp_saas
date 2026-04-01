import * as fs from 'fs';
import * as path from 'path';
import type {
  Break,
  PulseCertification,
  PulseHealth,
  PulseManifest,
  PulseModuleState,
} from './types';

export interface PulseArtifactSnapshot {
  health: PulseHealth;
  manifest: PulseManifest | null;
  certification: PulseCertification;
}

export interface PulseArtifactPaths {
  reportPath: string;
  matrixPath: string;
  certificatePath: string;
}

function healthBar(score: number): string {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

function tableCell(value: string, max: number = 220): string {
  const compact = value.replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 3)}...`;
}

function severityIcon(severity: string): string {
  if (severity === 'critical') return 'CRITICAL';
  if (severity === 'high') return 'HIGH';
  if (severity === 'medium') return 'WARNING';
  return 'INFO';
}

function groupBreaks(breaks: Break[]): Map<string, Break[]> {
  const groups = new Map<string, Break[]>();
  for (const item of breaks) {
    const key = item.type;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return groups;
}

function generateCorrectionPrompt(breaks: Break[]): string {
  const blocking = breaks.filter(item => item.severity === 'critical' || item.severity === 'high');
  if (blocking.length === 0) {
    return 'No critical/high issues are open. Keep the certificate honest by running deeper gates before declaring production readiness.';
  }

  const lines: string[] = [];
  lines.push('Fix the following blocking issues found by PULSE certification:');
  lines.push('');

  for (const [index, item] of blocking.entries()) {
    lines.push(`${index + 1}. [${item.type}] ${item.file}:${item.line} — ${item.description}`);
    if (item.detail) {
      lines.push(`   Evidence: ${item.detail}`);
    }
  }

  return lines.join('\n');
}

function buildReport(snapshot: PulseArtifactSnapshot): string {
  const { health, manifest, certification } = snapshot;
  const lines: string[] = [];
  const groupedBreaks = groupBreaks(health.breaks);

  lines.push(`# PULSE REPORT — ${certification.timestamp}`);
  lines.push('');
  lines.push(`## Certification Status: ${certification.status}`);
  lines.push('');
  lines.push(`- Score: ${certification.score}/100 (raw scan: ${certification.rawScore}/100)`);
  lines.push(`- Environment: ${certification.environment}`);
  lines.push(`- Commit: ${certification.commitSha}`);
  lines.push(`- Manifest: ${certification.manifestPath || '(missing)'}`);
  lines.push(`- Project: ${manifest ? `${manifest.projectName} (${manifest.projectId})` : '(manifest unavailable)'}`);
  lines.push('');
  lines.push(`## Health Score: ${certification.score}/100`);
  lines.push(`\`${healthBar(certification.score)}\` ${certification.score}%`);
  lines.push('');

  lines.push('## Gates');
  lines.push('');
  lines.push('| Gate | Status | Failure Class | Reason |');
  lines.push('|------|--------|---------------|--------|');
  for (const [gateName, result] of Object.entries(certification.gates)) {
    lines.push(`| ${gateName} | ${result.status.toUpperCase()} | ${result.failureClass || '—'} | ${tableCell(result.reason)} |`);
  }
  lines.push('');

  lines.push('## Evidence Summary');
  lines.push('');
  lines.push(`- Runtime: ${tableCell(certification.evidenceSummary.runtime.summary, 320)}`);
  lines.push(`- Browser: ${tableCell(certification.evidenceSummary.browser.summary, 320)}`);
  lines.push(`- Flows: ${tableCell(certification.evidenceSummary.flows.summary, 320)}`);
  lines.push(`- Invariants: ${tableCell(certification.evidenceSummary.invariants.summary, 320)}`);
  lines.push('');

  lines.push('## Gate Evidence');
  lines.push('');
  for (const [gateName, records] of Object.entries(certification.gateEvidence)) {
    lines.push(`### ${gateName}`);
    lines.push('');
    for (const record of records || []) {
      const metrics = record.metrics
        ? Object.entries(record.metrics).map(([key, value]) => `${key}=${value}`).join(', ')
        : '';
      const artifactText = record.artifactPaths.length > 0 ? record.artifactPaths.join(', ') : '(none)';
      lines.push(`- ${record.kind} | executed=${record.executed} | ${tableCell(record.summary, 320)}`);
      lines.push(`- Artifacts: ${artifactText}${metrics ? ` | Metrics: ${metrics}` : ''}`);
    }
    lines.push('');
  }

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
  lines.push(`| Security | - | ${health.stats.securityIssues} issues |`);
  lines.push(`| Data Safety | - | ${health.stats.dataSafetyIssues} issues |`);
  lines.push(`| Quality | - | ${health.stats.qualityIssues} issues |`);
  lines.push(`| Unavailable Checks | - | ${health.stats.unavailableChecks} unavailable |`);
  lines.push(`| Unknown Surfaces | - | ${health.stats.unknownSurfaces} undeclared |`);
  lines.push('');

  lines.push(`## Breaks (${health.breaks.length} total)`);
  lines.push('');
  for (const type of [...groupedBreaks.keys()].sort()) {
    const group = groupedBreaks.get(type) || [];
    lines.push(`### ${type} (${group.length})`);
    lines.push('');
    lines.push('| Severity | File:Line | Description |');
    lines.push('|----------|-----------|-------------|');
    for (const item of group) {
      lines.push(`| ${severityIcon(item.severity)} | ${item.file}:${item.line} | ${tableCell(item.description)} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## CORRECTION PROMPT');
  lines.push('');
  lines.push('```');
  lines.push(generateCorrectionPrompt(health.breaks));
  lines.push('```');

  return lines.join('\n');
}

function buildMatrix(snapshot: PulseArtifactSnapshot): string {
  const { health, manifest, certification } = snapshot;
  const lines: string[] = [];
  const modules = manifest?.modules || [];

  lines.push('# KLOEL — AUDIT FEATURE MATRIX');
  lines.push('');
  lines.push(`> Updated: ${certification.timestamp.slice(0, 10)} | Status: ${certification.status} | Score: ${certification.score}% | BREAKS: ${health.breaks.length} | ROUTE_NO_CALLER: ${health.breaks.filter(item => item.type === 'ROUTE_NO_CALLER').length}`);
  lines.push('');
  lines.push('## Module Status');
  lines.push('');
  lines.push('| Domain | State | Notes |');
  lines.push('|--------|-------|-------|');

  for (const moduleEntry of modules) {
    lines.push(`| **${moduleEntry.name}** | ${moduleEntry.state} | ${tableCell(moduleEntry.notes, 140)} |`);
  }

  if (modules.length === 0) {
    lines.push('| **Manifest Missing** | BROKEN | Define modules in pulse.manifest.json to close the audit matrix scope |');
  }

  lines.push('');
  lines.push('## Certification');
  lines.push('');
  lines.push('| Gate | Status | Failure Class |');
  lines.push('|------|--------|---------------|');
  for (const [gateName, result] of Object.entries(certification.gates)) {
    lines.push(`| ${gateName} | ${result.status.toUpperCase()} | ${result.failureClass || '—'} |`);
  }
  lines.push('');

  const summary = modules.reduce<Record<PulseModuleState, number>>((acc, moduleEntry) => {
    acc[moduleEntry.state] = (acc[moduleEntry.state] || 0) + 1;
    return acc;
  }, {
    READY: 0,
    PARTIAL: 0,
    SHELL_ONLY: 0,
    MOCKED: 0,
    BROKEN: 0,
    INTERNAL: 0,
  });

  lines.push('## Summary');
  lines.push(`- READY modules: ${summary.READY}`);
  lines.push(`- PARTIAL modules: ${summary.PARTIAL}`);
  lines.push(`- SHELL_ONLY modules: ${summary.SHELL_ONLY}`);
  lines.push(`- MOCKED modules: ${summary.MOCKED}`);
  lines.push(`- BROKEN modules: ${summary.BROKEN}`);
  lines.push(`- INTERNAL modules: ${summary.INTERNAL}`);
  lines.push(`- Total breaks: ${health.breaks.length}`);
  lines.push(`- Certification status: ${certification.status}`);

  return lines.join('\n');
}

function buildCertificate(snapshot: PulseArtifactSnapshot): string {
  const { manifest, certification } = snapshot;
  return JSON.stringify({
    projectId: manifest?.projectId || 'unknown',
    projectName: manifest?.projectName || 'unknown',
    commitSha: certification.commitSha,
    environment: certification.environment,
    manifestPath: certification.manifestPath,
    timestamp: certification.timestamp,
    status: certification.status,
    score: certification.score,
    rawScore: certification.rawScore,
    unsupportedStacks: certification.unsupportedStacks,
    unknownSurfaces: certification.unknownSurfaces,
    unavailableChecks: certification.unavailableChecks,
    criticalFailures: certification.criticalFailures,
    gates: certification.gates,
    evidenceSummary: certification.evidenceSummary,
    gateEvidence: certification.gateEvidence,
  }, null, 2);
}

export function generateArtifacts(snapshot: PulseArtifactSnapshot, rootDir: string): PulseArtifactPaths {
  const reportPath = path.join(rootDir, 'PULSE_REPORT.md');
  const matrixPath = path.join(rootDir, 'AUDIT_FEATURE_MATRIX.md');
  const certificatePath = path.join(rootDir, 'PULSE_CERTIFICATE.json');

  fs.writeFileSync(reportPath, buildReport(snapshot));
  fs.writeFileSync(matrixPath, buildMatrix(snapshot));
  fs.writeFileSync(certificatePath, buildCertificate(snapshot));

  return {
    reportPath,
    matrixPath,
    certificatePath,
  };
}
