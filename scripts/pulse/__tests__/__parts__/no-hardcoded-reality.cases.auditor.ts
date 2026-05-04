import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { auditPulseNoHardcodedReality } from '../../no-hardcoded-reality-audit';
import { discoverPlugins } from '../../plugin-system';
import { countPulseSourceFiles, currentPulseCoreAudit } from './no-hardcoded-reality.helpers';

describe('PULSE no-hardcoded-reality contracts — auditor', () => {
  it('fails fixed reality decision maps in core PULSE code', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-hardcoded-reality-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'bad.ts'),
      [
        "const FIXED_ROUTES = ['/checkout', '/billing/status'];",
        "const capabilityIds = ['checkout-capability'];",
        "const flowIds = ['payment-flow'];",
        "const MODULE_DECISIONS = ['Billing', 'Checkout'];",
        "const PRODUCT_CATALOG = ['checkout-basic', 'crm-suite'];",
        "const DOMAIN_PACKS = ['billing', 'marketing'];",
        "const SUPPORTED_PROVIDERS = ['stripe', 'mercado-pago'];",
        "const USER_ROLES = ['owner', 'supplier'];",
      ].join('\n'),
    );

    const result = auditPulseNoHardcodedReality(rootDir);

    expect(result.findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining([
        'hardcoded_const_declaration_risk',
        'fixed_product_route_collection',
        'fixed_capability_id_collection',
        'fixed_flow_id_collection',
        'fixed_module_decision_collection',
        'fixed_product_catalog_collection',
        'fixed_domain_catalog_collection',
        'fixed_provider_catalog_collection',
        'fixed_role_catalog_collection',
      ]),
    );
    expect(result.summary.byKind.hardcoded_const_declaration_risk).toBe(8);
    expect(result.summary.topFiles[0]).toEqual({
      filePath: 'scripts/pulse/bad.ts',
      findings: result.findings.filter((finding) => finding.filePath === 'scripts/pulse/bad.ts')
        .length,
    });
  });

  it('limits zero-hardcode reality audit to PULSE machine code, not product code', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-hardcoded-scope-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    const backendDir = path.join(rootDir, 'backend/src/products');
    const frontendDir = path.join(rootDir, 'frontend/src/app/checkout');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.mkdirSync(backendDir, { recursive: true });
    fs.mkdirSync(frontendDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'machine-decision.ts'),
      "const PRODUCT_CATALOG = ['pulse-should-report', 'pulse-other'];",
    );
    fs.writeFileSync(
      path.join(backendDir, 'product-catalog.ts'),
      "const PRODUCT_CATALOG = ['checkout-basic', 'crm-suite'];",
    );
    fs.writeFileSync(
      path.join(frontendDir, 'routes.tsx'),
      "const PRODUCT_ROUTES = ['/checkout', '/billing/status'];",
    );

    const result = auditPulseNoHardcodedReality(rootDir);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: 'scripts/pulse/machine-decision.ts',
          kind: 'hardcoded_const_declaration_risk',
          samples: ['PRODUCT_CATALOG'],
        }),
        expect.objectContaining({
          filePath: 'scripts/pulse/machine-decision.ts',
          kind: 'fixed_product_catalog_collection',
          samples: ['pulse-should-report', 'pulse-other'],
        }),
      ]),
    );
    expect(result.summary.topFiles[0]).toEqual({
      filePath: 'scripts/pulse/machine-decision.ts',
      findings: result.findings.filter(
        (finding) => finding.filePath === 'scripts/pulse/machine-decision.ts',
      ).length,
    });
  });

  it('does not scan arbitrary roots when scripts/pulse is absent', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-hardcoded-no-pulse-root-'));
    const backendDir = path.join(rootDir, 'backend/src/products');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.writeFileSync(
      path.join(backendDir, 'product-catalog.ts'),
      "const PRODUCT_CATALOG = ['checkout-basic', 'crm-suite'];",
    );

    expect(auditPulseNoHardcodedReality(rootDir)).toEqual({
      scannedFiles: 0,
      findings: [],
      predicates: [],
      summary: {
        totalFindings: 0,
        byKind: {},
        topFiles: [],
        totalPredicates: 0,
        byPredicateKind: {},
      },
    });
  });

  it('flags kernel grammar const collections as hardcode surface', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-hardcoded-grammar-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'grammar.ts'),
      [
        "const TRUTH_MODES = ['observed', 'inferred', 'aspirational'];",
        "const STRUCTURAL_ROLES = ['interface', 'persistence', 'side_effect'];",
        "const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];",
        "const ARTIFACT_FILES = ['PULSE_CERTIFICATE.json', 'PULSE_CLI_DIRECTIVE.json'];",
        "const HTTP_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];",
        "const SECURITY_PAYLOAD_CLASSES = ['sql-injection', 'xss-payload'];",
        "const PROVIDER_SCHEMA_KEYS = ['provider', 'status', 'source'];",
        "const KERNEL_ROLE_GRAMMAR = ['interface', 'persistence', 'side_effect'];",
      ].join('\n'),
    );

    const result = auditPulseNoHardcodedReality(rootDir);
    expect(result.findings.length).toBeGreaterThanOrEqual(8);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_const_declaration_risk',
          samples: ['TRUTH_MODES'],
        }),
        expect.objectContaining({
          kind: 'hardcoded_const_declaration_risk',
          samples: ['KERNEL_ROLE_GRAMMAR'],
        }),
      ]),
    );
  });

  it('fails fixed source root globs in new core PULSE code', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-hardcoded-source-roots-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'new-core-scanner.ts'),
      [
        "const SOURCE_GLOBS = ['backend/src/**/*.ts', 'frontend/src/**/*.tsx'];",
        "const SOURCE_DIRS = ['backend/src', 'worker/src'];",
      ].join('\n'),
    );

    expect(auditPulseNoHardcodedReality(rootDir).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'fixed_source_root_collection',
          context: 'SOURCE_GLOBS',
          samples: ['backend/src/**/*.ts', 'frontend/src/**/*.tsx'],
        }),
        expect.objectContaining({
          kind: 'fixed_source_root_collection',
          context: 'SOURCE_DIRS',
          samples: ['backend/src', 'worker/src'],
        }),
      ]),
    );
  });

  it('flags legacy compatibility const shims as hardcode surface', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-legacy-source-roots-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'source-root-detector.ts'),
      "const LEGACY_SOURCE_ROOTS = ['backend/src', 'frontend/src', 'worker/src'];",
    );

    const findings = auditPulseNoHardcodedReality(rootDir).findings;
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_const_declaration_risk',
          context: 'const.declaration',
          samples: ['LEGACY_SOURCE_ROOTS'],
        }),
        expect.objectContaining({
          kind: 'hardcoded_literal_surface_risk',
          samples: ['backend/src'],
        }),
      ]),
    );
  });

  it('does not let the no-hardcode auditor hide its own bootstrap allowlists as final truth', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-auditor-bootstrap-hardcode-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'no-hardcoded-reality-audit.ts'),
      [
        "const ALLOWED_CONTEXT_TOKENS = ['artifact', 'grammar'];",
        "const SKIPPED_PATH_SEGMENTS = ['__tests__', 'dist'];",
        "const INFRASTRUCTURE_ROUTES = new Set(['/health', '/diag-db']);",
      ].join('\n'),
    );

    expect(auditPulseNoHardcodedReality(rootDir).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_auditor_bootstrap_reality_risk',
          context: 'ALLOWED_CONTEXT_TOKENS',
          samples: ['artifact', 'grammar'],
        }),
        expect.objectContaining({
          kind: 'hardcoded_auditor_bootstrap_reality_risk',
          context: 'SKIPPED_PATH_SEGMENTS',
          samples: ['__tests__', 'dist'],
        }),
        expect.objectContaining({
          kind: 'hardcoded_auditor_bootstrap_reality_risk',
          context: 'INFRASTRUCTURE_ROUTES',
          samples: ['/health', '/diag-db'],
        }),
      ]),
    );
  });

  it('fails fixed critical domain catalogs by name in core PULSE code', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-critical-domain-names-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'criticality.ts'),
      "const CRITICAL_DOMAINS = ['checkout', 'billing', 'wallet'];",
    );

    expect(auditPulseNoHardcodedReality(rootDir).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_const_declaration_risk',
          context: 'const.declaration',
          samples: ['CRITICAL_DOMAINS'],
        }),
        expect.objectContaining({
          kind: 'fixed_domain_criticality_collection',
          context: 'CRITICAL_DOMAINS',
          samples: ['checkout', 'billing', 'wallet'],
        }),
      ]),
    );
  });

  it('classifies BreakType unions as hardcoded authority risk', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-breaktype-authority-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'types.break-types.ts'),
      "export type BreakType = 'CHECKOUT_FIXED' | 'BILLING_FIXED';",
    );

    expect(auditPulseNoHardcodedReality(rootDir).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_break_type_authority_risk',
          context: 'BreakType',
          samples: ['CHECKOUT_FIXED', 'BILLING_FIXED'],
        }),
      ]),
    );
  });

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

  it('still records structural grammar literals as hardcode surface', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-branch-grammar-'));
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'grammar-branches.ts'),
      [
        'export function parseSyntaxToken(input: { token: string }) {',
        '  switch (input.token) {',
        "    case 'identifier':",
        "      return 'name';",
        "    case 'literal':",
        "      return 'value';",
        '    default:',
        "      return 'unknown';",
        '  }',
        '}',
      ].join('\n'),
    );

    const findings = auditPulseNoHardcodedReality(rootDir).findings;
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_literal_surface_risk',
          samples: ['identifier'],
        }),
      ]),
    );
    expect(findings.some((finding) => finding.kind === 'hardcoded_decision_enum_risk')).toBe(false);
  });

  it('reports core PULSE hardcoded reality decision collection backlog', () => {
    const result = currentPulseCoreAudit;

    expect(result.scannedFiles).toBeGreaterThan(0);
    expect(result.scannedFiles).toBe(countPulseSourceFiles(process.cwd()));
    expect(result.summary.totalFindings).toBeGreaterThan(0);
    expect(result.summary.byKind.hardcoded_literal_surface_risk).toBeGreaterThan(0);
  });

  it('treats cert constants regex groups as Break.type kernel grammar, not decision authority', () => {
    const result = currentPulseCoreAudit;
    const certConstantFindings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/cert-constants.ts',
    );

    expect(certConstantFindings.length).toBeGreaterThan(0);
    expect(certConstantFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'hardcoded_const_declaration_risk',
          samples: ['SECURITY_BREAK_TYPE_KERNEL_GRAMMAR'],
        }),
        expect.objectContaining({
          kind: 'hardcoded_const_declaration_risk',
          samples: ['CHECKER_GAP_TYPES'],
        }),
      ]),
    );
  });

  it('does not seed built-in product domain packs from the core', () => {
    const plugins = discoverPlugins(path.join(process.cwd(), '__pulse_no_plugins__'));

    expect(plugins).toEqual([]);
  });
});
