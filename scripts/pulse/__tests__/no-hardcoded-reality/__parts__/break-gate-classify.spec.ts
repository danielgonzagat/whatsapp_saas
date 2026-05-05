import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { auditPulseNoHardcodedReality } from '../../../no-hardcoded-reality-audit';
import { deriveZeroValue } from '../../../dynamic-reality-kernel';

describe('PULSE no-hardcoded-reality contracts', () => {
  it('classifies direct breaks.push type strings as hardcoded blocker identity risk', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-break-push-type-'));
    const parserDir = path.join(rootDir, 'scripts/pulse/parsers');
    fs.mkdirSync(parserDir, { recursive: true });
    fs.writeFileSync(
      path.join(parserDir, 'direct-blocker.ts'),
      [
        'export function check() {',
        '  const breaks = [];',
        "  breaks.push({ type: 'STATIC_PRODUCT_BLOCKER', severity: 'critical' });",
        '  return breaks;',
        '}',
      ].join('\n'),
    );

    expect(auditPulseNoHardcodedReality(rootDir).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_const_declaration_risk',
          context: 'const.declaration',
          samples: ['breaks'],
        }),
        expect.objectContaining({
          kind: 'hardcoded_break_push_type_risk',
          context: 'breaks.push.type',
          samples: ['STATIC_PRODUCT_BLOCKER'],
        }),
      ]),
    );
  });

  it('classifies parser ALLOWED and regex gates that emit direct blockers as evidence risk', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-parser-rule-blocker-'));
    const parserDir = path.join(rootDir, 'scripts/pulse/parsers');
    fs.mkdirSync(parserDir, { recursive: true });
    fs.writeFileSync(
      path.join(parserDir, 'rule-blocker.ts'),
      [
        "const ALLOWED_PRODUCT_TABLES = ['Product'];",
        'const PRODUCT_RE = /Product|CheckoutOrder/;',
        'export function check() {',
        '  const breaks = [];',
        "  breaks.push({ type: 'STATIC_PRODUCT_BLOCKER', severity: 'critical' });",
        '  return breaks;',
        '}',
      ].join('\n'),
    );

    expect(auditPulseNoHardcodedReality(rootDir).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_parser_rule_blocker_risk',
          context: 'ALLOWED_PRODUCT_TABLES',
          samples: ['ALLOWED_PRODUCT_TABLES'],
        }),
        expect.objectContaining({
          kind: 'hardcoded_parser_rule_blocker_risk',
          context: 'PRODUCT_RE',
          samples: ['PRODUCT_RE'],
        }),
      ]),
    );
  });

  it('classifies SQL that names product tables as hardcoded reality evidence risk', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-sql-reality-table-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'sql-check.ts'),
      'const query = `SELECT id, name FROM "Product" WHERE id = $1 LIMIT 1`;',
    );

    expect(auditPulseNoHardcodedReality(rootDir).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_const_declaration_risk',
          context: 'const.declaration',
          samples: ['query'],
        }),
        expect.objectContaining({
          kind: 'hardcoded_sql_reality_table_risk',
          context: 'sql.reality_table',
          samples: ['Product'],
        }),
      ]),
    );
  });

  it('classifies fixed gate, profile, and threshold collections as decision risk', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-fixed-decision-gates-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'decision-gates.ts'),
      [
        "const REQUIRED_GATES = ['runtimePass', 'customerPass'];",
        "const FINAL_PROFILES = ['production-final'];",
        'const SCORE_THRESHOLDS = [90, 95];',
      ].join('\n'),
    );

    expect(auditPulseNoHardcodedReality(rootDir).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_gate_profile_threshold_risk',
          context: 'REQUIRED_GATES',
          samples: ['runtimePass', 'customerPass'],
        }),
        expect.objectContaining({
          kind: 'hardcoded_gate_profile_threshold_risk',
          context: 'FINAL_PROFILES',
          samples: ['production-final'],
        }),
        expect.objectContaining({
          kind: 'hardcoded_gate_profile_threshold_risk',
          context: 'SCORE_THRESHOLDS',
          samples: ['90', '95'],
        }),
      ]),
    );
  });

  it('classifies structural enum, regex, and path decisions without product-domain assumptions', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-structural-hardcodes-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'structural-decisions.ts'),
      [
        "enum GateProfile { Final = 'production-final', Audit = 'audit-only' }",
        'const ROUTE_DECISION_RE = /\\/api\\/(alpha|beta)\\b/;',
        "const PATH_DECISIONS = ['/api/alpha', 'services/core/src/**/*.ts'];",
      ].join('\n'),
    );

    expect(auditPulseNoHardcodedReality(rootDir).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_decision_enum_risk',
          context: 'GateProfile',
          samples: ['production-final', 'audit-only'],
        }),
        expect.objectContaining({
          kind: 'hardcoded_decision_regex_risk',
          context: 'ROUTE_DECISION_RE',
          samples: ['/\\/api\\/(alpha|beta)\\b/'],
        }),
        expect.objectContaining({
          kind: 'hardcoded_path_decision_risk',
          context: 'PATH_DECISIONS',
          samples: ['/api/alpha', 'services/core/src/**/*.ts'],
        }),
      ]),
    );
  });

  it('classifies literal branch predicates in decision functions as hardcode evidence', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-branch-hardcodes-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'branch-decisions.ts'),
      [
        'export function decideGateProfile(input: { profile: string; score: number }) {',
        '  switch (input.profile) {',
        "    case 'production-final':",
        "      return 'final';",
        "    case 'audit-only':",
        "      return 'audit';",
        '    default:',
        "      return 'unknown';",
        '  }',
        '}',
        'export const selectRiskDecision = (input: { score: number }) => {',
        '  if (input.score >= 90) {',
        "    return 'high';",
        '  }',
        "  return 'low';",
        '};',
      ].join('\n'),
    );

    expect(auditPulseNoHardcodedReality(rootDir).predicates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_branch_decision_predicate',
          context: 'decideGateProfile',
          samples: ["case 'production-final'", "case 'audit-only'"],
        }),
        expect.objectContaining({
          kind: 'hardcoded_branch_decision_predicate',
          context: 'selectRiskDecision',
          samples: ['input.score >= 90'],
        }),
      ]),
    );
  });
});
