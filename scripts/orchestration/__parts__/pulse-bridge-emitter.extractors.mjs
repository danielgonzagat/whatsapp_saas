/**
 * PULSE Bridge Emitter — finding extractors (split from
 * pulse-bridge-emitter.mjs to keep the main script below the
 * architecture-guard line budget).
 *
 * Each extract*() function takes a single PULSE artifact (already JSON-
 * parsed by pulse-bridge-emitter.loaders.mjs) and returns synthetic
 * `kloel.findings.v1` entries with engine="pulse". They are pure
 * functions: no I/O, no side effects.
 */

import { fingerprint, isFinancialAuthPaymentRoute } from './pulse-bridge-emitter.helpers.mjs';
import {
  loadPULSEParityGaps,
  loadProductGraph,
  loadPULSEReportText,
  loadScopeState,
  loadStructuralGraphNodes,
} from './pulse-bridge-emitter.loaders.mjs';

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
    // Interface-only files missing all other roles = shell
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

    // Interface + orchestration but no persistence/side_effect = rich shell
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

    // Missing persistence alone (has side_effect or orchestration) = placebo
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
