import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANONICAL = join(REPO_ROOT, '.pulse', 'current');

function resolveFirst(...candidates) {
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function parseReportMD(path) {
  const text = readFileSync(path, 'utf8');
  const status = (text.match(/^- Certification:\s+(\S+)/m) ?? [])[1] ?? 'UNKNOWN';
  const human = (text.match(/^- Human replacement:\s+(\S+)/m) ?? [])[1] ?? 'UNKNOWN';
  const score = parseInt((text.match(/^- Score:\s+(\d+)/m) ?? [])[1] ?? '0', 10);
  return { status, humanReplacementStatus: human, score };
}

function parseCertificate(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return {
    humanReplacementStatus: raw.humanReplacementStatus ?? 'UNKNOWN',
    score: raw.score ?? 0,
    status: raw.status ?? 'UNKNOWN',
  };
}

function parseHealth(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const breaks = raw.breaks ?? [];
  const severity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const b of breaks) {
    const sev = b.severity ?? 'low';
    severity[sev] = (severity[sev] ?? 0) + 1;
  }
  return {
    score: raw.score ?? 0,
    severity,
    totalBreaks: breaks.length,
  };
}

function buildCaveats(humanStatus, severity) {
  const caveats = [];
  const { critical, high, medium, low } = severity;

  if (humanStatus === 'NOT_READY') {
    if (critical > 0) caveats.push(`Critical breaks: ${critical}`);
    if (high > 0) caveats.push(`High-severity breaks: ${high}`);
    if (medium > 0) caveats.push(`Medium-severity breaks: ${medium}`);
    if (low > 0 && critical === 0 && high === 0) caveats.push(`Low-severity breaks only: ${low}`);
    if (critical === 0 && high === 0 && medium === 0 && low === 0) {
      caveats.push('NOT_READY with zero breaks — may be gate-level or external-signal blockers');
    }
  }

  return caveats;
}

function main() {
  const certPath = resolveFirst(
    join(CANONICAL, 'PULSE_CERTIFICATE.json'),
    join(REPO_ROOT, 'PULSE_CERTIFICATE.json'),
  );
  const healthPath = resolveFirst(
    join(CANONICAL, 'PULSE_HEALTH.json'),
    join(REPO_ROOT, 'PULSE_HEALTH.json'),
  );
  const reportPath = resolveFirst(
    join(CANONICAL, 'PULSE_REPORT.md'),
    join(REPO_ROOT, 'PULSE_REPORT.md'),
  );

  if (!certPath && !reportPath && !healthPath) {
    console.error('Error: no PULSE artifacts found. Run PULSE first.');
    process.exit(1);
  }

  let humanStatus = 'UNKNOWN';
  let score = 0;
  let severity = { critical: 0, high: 0, medium: 0, low: 0 };
  let totalBreaks = 0;
  const sources = [];

  if (healthPath) {
    sources.push(healthPath);
    const health = parseHealth(healthPath);
    Object.assign(severity, health.severity);
    totalBreaks = health.totalBreaks;
    score = health.score;
  }

  if (certPath) {
    sources.push(certPath);
    const cert = parseCertificate(certPath);
    humanStatus = cert.humanReplacementStatus;
    score = certPath ? cert.score : score;
  }

  if (reportPath && !certPath) {
    sources.push(reportPath);
    const report = parseReportMD(reportPath);
    humanStatus = report.humanReplacementStatus;
    if (!healthPath) score = report.score;
  }

  const caveats = buildCaveats(humanStatus, severity);

  const effectiveStatus =
    humanStatus === 'NOT_READY' &&
    severity.critical === 0 &&
    severity.high === 0
      ? 'READY_WITH_CAVEATS'
      : humanStatus === 'READY'
        ? 'READY'
        : humanStatus === 'NOT_READY'
          ? 'NOT_READY'
          : humanStatus;

  console.log('=== PULSE Status ===');
  console.log(`Source(s): ${sources.join(', ')}`);
  console.log(`Human Replacement Status: ${humanStatus}`);
  console.log(`Effective Status: ${effectiveStatus}`);
  console.log(`Score: ${score}/100`);
  console.log(`Breaks: ${totalBreaks} total (critical=${severity.critical}, high=${severity.high}, medium=${severity.medium}, low=${severity.low})`);

  if (caveats.length > 0) {
    console.log('Caveats:');
    for (const c of caveats) console.log(`  - ${c}`);
  }

  if (effectiveStatus === 'NOT_READY') {
    console.log('\nVerdict: NOT READY — blocks exist that prevent autonomous operation.');
    process.exit(1);
  }

  if (effectiveStatus === 'READY_WITH_CAVEATS') {
    console.log('\nVerdict: READY WITH CAVEATS — no critical/high breaks, but not fully READY.');
    process.exit(0);
  }

  console.log('\nVerdict: READY — PULSE certifies production readiness.');
  process.exit(0);
}

main();
