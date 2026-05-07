import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __partDirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(join(__partDirname, '..', '..', '..', '..'));

const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT || join(VAULT_ROOT, 'Kloel', '99 - Espelho do Codigo'),
);
const SOURCE_MIRROR_DIR = join(MIRROR_ROOT, '_source');

const PULSE_CURRENT_DIR = join(REPO_ROOT, '.pulse', 'current');

const PULSE_PARITY_GAPS_PATH = join(PULSE_CURRENT_DIR, 'PULSE_PARITY_GAPS.json');
const PULSE_STRUCTURAL_GRAPH_PATH = join(PULSE_CURRENT_DIR, 'PULSE_STRUCTURAL_GRAPH.json');
const PULSE_PRODUCT_GRAPH_PATH = join(PULSE_CURRENT_DIR, 'PULSE_PRODUCT_GRAPH.json');
const PULSE_SCOPE_STATE_PATH = join(PULSE_CURRENT_DIR, 'PULSE_SCOPE_STATE.json');
const PULSE_REPORT_PATH = join(REPO_ROOT, 'PULSE_REPORT.md');

// ── fingerprint ────────────────────────────────────────────────────────────

const fpCache = new Map();
export function fingerprint(rule, file, message) {
  const raw = `pulse:${rule}:${file}:${message}`;
  if (fpCache.has(raw)) return fpCache.get(raw);
  const h = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  fpCache.set(raw, h);
  return h;
}

// ── severity helpers ───────────────────────────────────────────────────────

const FINANCIAL_AUTH_PAYMENT_PATTERNS = [
  /\/billing\//,
  /\/checkout\//,
  /\/wallet/,
  /\/payment/,
  /\/payout/,
  /\/kyc\//,
  /\/auth\//,
  /\/login/,
  /\/signin/,
  /\/accounts\//,
  /\/settings\//,
  /\/split\//,
  /\/ledger/,
  /\/connect\//,
  /\/bank/,
  /\/carteira/,
];

export function isFinancialAuthPaymentRoute(file) {
  return FINANCIAL_AUTH_PAYMENT_PATTERNS.some((p) => p.test(file));
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
export function severityScore(s) {
  const idx = SEVERITY_ORDER.indexOf(s);
  return idx === -1 ? 99 : idx;
}
export function maxSeverity(a, b) {
  return severityScore(a) <= severityScore(b) ? a : b;
}

// ── PULSE data loaders ─────────────────────────────────────────────────────

export function loadJSON(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function loadPULSEParityGaps() {
  const data = loadJSON(PULSE_PARITY_GAPS_PATH);
  if (!data || !Array.isArray(data.gaps)) return [];
  return data.gaps;
}

export function loadStructuralGraphNodes() {
  const data = loadJSON(PULSE_STRUCTURAL_GRAPH_PATH);
  if (!data || !Array.isArray(data.nodes)) return [];
  return data.nodes;
}

export function loadProductGraph() {
  return loadJSON(PULSE_PRODUCT_GRAPH_PATH);
}

export function loadScopeState() {
  return loadJSON(PULSE_SCOPE_STATE_PATH);
}

export function loadPULSEReportText() {
  if (!existsSync(PULSE_REPORT_PATH)) return '';
  return readFileSync(PULSE_REPORT_PATH, 'utf8');
}

// ── signal extractors ──────────────────────────────────────────────────────

export function extractGapFindings(gaps) {
  const findings = [];
  for (const gap of gaps) {
    const kind = gap.kind || 'unknown';
    const severity = gap.severity || 'high';
    const summary = gap.summary || gap.title || '';
    const relatedFiles = gap.relatedFiles || [];

    const rule = kind;

    for (const file of relatedFiles) {
      let effSeverity = severity;
      if (kind === 'ui_without_persistence' && isFinancialAuthPaymentRoute(file)) {
        effSeverity = 'critical';
      }

      findings.push({
        line: 0,
        column: 0,
        category: 'pulse',
        severity: effSeverity,
        engine: 'pulse',
        rule,
        message: summary,
        fingerprint: fingerprint(rule, file, summary),
        file,
      });
    }
  }
  return findings;
}

export function extractShellFacadeFindings(nodes) {
  const findings = [];

  const fileRoles = new Map();
  for (const node of nodes) {
    const file = node.file || '';
    if (!file) continue;
    const role = node.role || '';
    const existing = fileRoles.get(file) || new Set();
    existing.add(role);
    fileRoles.set(file, existing);
  }

  for (const [file, roles] of fileRoles) {
    if (
      roles.has('interface') &&
      !roles.has('persistence') &&
      !roles.has('orchestration') &&
      !roles.has('side_effect')
    ) {
      const sev = isFinancialAuthPaymentRoute(file) ? 'critical' : 'high';
      findings.push({
        line: 0,
        column: 0,
        category: 'pulse',
        severity: sev,
        engine: 'pulse',
        rule: 'shell_only',
        message:
          'Interface node lacks persistence, orchestration, or side-effect — likely shell/façade route.',
        fingerprint: fingerprint('shell_only', file, 'interface-without-persistence-chain'),
        file,
      });
      continue;
    }

    if (
      roles.has('interface') &&
      roles.has('orchestration') &&
      !roles.has('persistence') &&
      !roles.has('side_effect')
    ) {
      const sev = isFinancialAuthPaymentRoute(file) ? 'critical' : 'high';
      findings.push({
        line: 0,
        column: 0,
        category: 'pulse',
        severity: sev,
        engine: 'pulse',
        rule: 'shell_only',
        message:
          'Interface+orchestration node lacks persistence and side-effect — rich shell/façade.',
        fingerprint: fingerprint('shell_only', file, 'orchestration-without-persistence'),
        file,
      });
      continue;
    }

    if (!roles.has('persistence') && (roles.has('side_effect') || roles.has('orchestration'))) {
      findings.push({
        line: 0,
        column: 0,
        category: 'pulse',
        severity: 'high',
        engine: 'pulse',
        rule: 'placebo_integration',
        message:
          'Node has orchestration/side-effect but lacks persistence — possible placebo integration.',
        fingerprint: fingerprint('placebo_integration', file, 'missing-persistence'),
        file,
      });
    }
  }

  return findings;
}

export function extractPhantomAndLatentFindings(productGraph) {
  if (!productGraph) return [];
  const findings = [];

  const phantomCaps = productGraph.phantomCapabilities || [];
  for (const capId of phantomCaps) {
    findings.push({
      line: 0,
      column: 0,
      category: 'pulse',
      severity: 'critical',
      engine: 'pulse',
      rule: 'phantom_surface',
      message: `Declared surface/capability ${capId} is phantom — incomplete materialization.`,
      fingerprint: fingerprint('phantom_surface', capId, 'phantom-capability'),
      file: null,
    });
  }

  const latentCaps = productGraph.latentCapabilities || [];
  for (const capId of latentCaps) {
    findings.push({
      line: 0,
      column: 0,
      category: 'pulse',
      severity: 'medium',
      engine: 'pulse',
      rule: 'latent_capability',
      message: `Capability ${capId} is latent — structurally inferred but not proven real.`,
      fingerprint: fingerprint('latent_capability', capId, 'latent-capability'),
      file: null,
    });
  }

  return findings;
}

export function extractOrphanFindings(scopeState) {
  if (!scopeState || !Array.isArray(scopeState.files)) return [];
  const findings = [];

  for (const f of scopeState.files) {
    if (f.status === 'orphan' && f.relativePath) {
      findings.push({
        line: 0,
        column: 0,
        category: 'pulse',
        severity: 'low',
        engine: 'pulse',
        rule: 'dead_handler',
        message: 'File classified as orphan — no connections found in structural graph.',
        fingerprint: fingerprint('dead_handler', f.relativePath, 'orphan-file'),
        file: f.relativePath,
      });
    }
  }

  return findings;
}

export function extractReportTextSignals(reportText) {
  if (!reportText) return [];
  const findings = [];

  const phantomLines = reportText
    .split('\n')
    .filter((l) => l.includes('phantom surface') || l.includes('phantom capability'));
  for (const line of phantomLines) {
    const name = line.split(':')[0]?.trim() || 'unknown';
    findings.push({
      line: 0,
      column: 0,
      category: 'pulse',
      severity: 'critical',
      engine: 'pulse',
      rule: 'phantom_surface',
      message: `${name}: ${line.slice(0, 200)}`.replace(/\n/g, ' '),
      fingerprint: fingerprint('phantom_surface', name, 'report-text'),
      file: null,
    });
  }

  return findings;
}

// ── aggregate all signals ──────────────────────────────────────────────────

export function collectAllFindings() {
  const all = [];

  const gaps = loadPULSEParityGaps();
  all.push(...extractGapFindings(gaps));

  const nodes = loadStructuralGraphNodes();
  all.push(...extractShellFacadeFindings(nodes));

  const productGraph = loadProductGraph();
  all.push(...extractPhantomAndLatentFindings(productGraph));

  const scopeState = loadScopeState();
  all.push(...extractOrphanFindings(scopeState));

  const reportText = loadPULSEReportText();
  all.push(...extractReportTextSignals(reportText));

  return all;
}

export {
  REPO_ROOT,
  SOURCE_MIRROR_DIR,
  PULSE_CURRENT_DIR,
  PULSE_PARITY_GAPS_PATH,
  PULSE_STRUCTURAL_GRAPH_PATH,
};
