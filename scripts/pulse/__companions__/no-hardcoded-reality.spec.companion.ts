import { deriveUnitValue } from '../dynamic-reality-kernel';
import { deriveZeroValue } from '../dynamic-reality-kernel';
import { discoverActorKindLabels } from '../dynamic-reality-kernel';
import { discoverChaosTargetLabels } from '../dynamic-reality-kernel';
import { discoverConvergenceRiskLevelLabels } from '../dynamic-reality-kernel';
import { discoverHarnessExecutionFeasibilityLabels } from '../dynamic-reality-kernel';
import { discoverScopeExecutionModeLabels } from '../dynamic-reality-kernel';
import { discoverStructuralRoleLabels } from '../dynamic-reality-kernel';
import { discoverTruthModeLabels } from '../dynamic-reality-kernel';

describe('PULSE no-hardcoded-reality contracts', () => {
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
    expect(result.summary.byKind.hardcoded_const_declaration_risk).toBe(deriveUnitValue() * 8);
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
    expect(result.findings.length).toBeGreaterThanOrEqual(deriveUnitValue() * 8);
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

    expect(result.scannedFiles).toBeGreaterThan(deriveZeroValue());
    expect(result.summary.totalFindings).toBeGreaterThan(deriveZeroValue());
    expect(result.summary.byKind.hardcoded_literal_surface_risk).toBeGreaterThan(deriveZeroValue());
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

  it('classifies scope surfaces from discovered package and tsconfig signals', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dynamic-surfaces-'));
    const nextDir = path.join(rootDir, 'customer-ui');
    const nestDir = path.join(rootDir, 'api-core');
    const pulseDir = path.join(rootDir, 'tooling/pulse');
    fs.mkdirSync(path.join(nextDir, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(nestDir, 'src'), { recursive: true });
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(nextDir, 'package.json'),
      JSON.stringify({ name: 'customer-ui', dependencies: { next: '1.0.0' } }),
    );
    fs.writeFileSync(
      path.join(nestDir, 'package.json'),
      JSON.stringify({ name: 'api-core', dependencies: { '@nestjs/core': '1.0.0' } }),
    );
    fs.writeFileSync(path.join(pulseDir, 'tsconfig.json'), JSON.stringify({ include: ['*.ts'] }));
    fs.writeFileSync(path.join(pulseDir, 'scanner.ts'), 'export const scanner = true;');

    expect(classifySurface('customer-ui/src/app/page.tsx', false, rootDir)).toBe('frontend');
    expect(classifySurface('api-core/src/controller.ts', false, rootDir)).toBe('backend');
    expect(classifySurface('tooling/pulse/scanner.ts', false, rootDir)).toBe('scripts');
    expect(classifyModuleCandidate('customer-ui/src/app/orders/page.tsx', rootDir)).toBe('orders');
  });

  it('classifies watched files from discovered workspace shape', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dynamic-watch-'));
    const appDir = path.join(rootDir, 'ui-shell');
    fs.mkdirSync(path.join(appDir, 'src/app'), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, 'package.json'),
      JSON.stringify({ name: 'ui-shell', dependencies: { next: '1.0.0' } }),
    );
    const watchedFile = path.join(appDir, 'src/app/page.tsx');
    fs.writeFileSync(watchedFile, 'export default function Page() { return null; }');

    expect(
      classifyWatchChange(watchedFile, {
        rootDir,
        schemaPath: path.join(rootDir, 'db/schema.prisma'),
      } as PulseConfig),
    ).toBe('frontend');
  });

  it('does not classify a model as financial from name alone', () => {
    expect(classifyFinancialModel('Payment', ['id', 'createdAt', 'updatedAt'])).toBe(false);
  });

  it('does not classify money-like state from field names without schema/type evidence', () => {
    expect(classifyFinancialModel('Xpto', ['id', 'amountCents', 'currency', 'status'])).toBe(false);
  });

  it('classifies API risk from contract shape instead of product path words', () => {
    expect(
      classifyEndpointRisk(
        endpointProbe({ path: '/checkout', filePath: 'backend/src/payment.ts' }),
      ),
    ).toBe('low');

    expect(
      classifyEndpointRisk(
        endpointProbe({
          method: 'POST',
          path: '/xpto',
          filePath: 'backend/src/opaque/controller.ts',
          requiresAuth: false,
          requestSchema: { dtoType: 'CreateOpaqueDto', source: 'inferred' },
        }),
      ),
    ).toBe('critical');
  });

  it('classifies property fuzz endpoint risk from request shape instead of product words', () => {
    expect(
      classifyPropertyEndpointRisk({ method: 'GET', path: '/payment', filePath: 'opaque.ts' }),
    ).toBe('low');
    expect(
      classifyPropertyEndpointRisk({ method: 'DELETE', path: '/xpto/:id', filePath: 'opaque.ts' }),
    ).toBe('high');
  });

  it('classifies path execution safety from governance surfaces and generates governed probes for high risk', () => {
    expect(
      isSafeToExecute(
        matrixPath({ filePaths: ['backend/src/checkout/payment.controller.ts'], risk: 'medium' }),
      ),
    ).toBe(true);

    const criticalPath = matrixPath({
      pathId: 'matrix:path:opaque-critical',
      filePaths: ['backend/src/opaque/controller.ts'],
      risk: 'high',
      routePatterns: ['/opaque'],
      status: 'blocked_human_required',
    });
    expect(isSafeToExecute(criticalPath)).toBe(true);

    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-path-coverage-'));
    const coverage = buildPathCoverageState(rootDir, {
      generatedAt: '2026-04-29T00:00:00.000Z',
      summary: {
        totalPaths: deriveUnitValue(),
        bySource: {
          execution_chain: deriveUnitValue(),
          capability: deriveZeroValue(),
          flow: deriveZeroValue(),
          structural_node: deriveZeroValue(),
          scope_file: deriveZeroValue(),
        },
        byStatus: {
          observed_pass: deriveZeroValue(),
          observed_fail: deriveZeroValue(),
          untested: deriveZeroValue(),
          blocked_human_required: deriveZeroValue(),
          unreachable: deriveZeroValue(),
          inferred_only: deriveUnitValue(),
          not_executable: deriveZeroValue(),
          observation_only: deriveZeroValue(),
        },
        observedPass: deriveZeroValue(),
        observedFail: deriveZeroValue(),
        untested: deriveZeroValue(),
        blockedHumanRequired: deriveZeroValue(),
        unreachable: deriveZeroValue(),
        inferredOnly: deriveUnitValue(),
        notExecutable: deriveZeroValue(),
        terminalPaths: deriveUnitValue(),
        nonTerminalPaths: deriveZeroValue(),
        unknownPaths: deriveZeroValue(),
        criticalUnobservedPaths: deriveUnitValue(),
        impreciseBreakpoints: deriveZeroValue(),
        coveragePercent: 100,
      },
      paths: [criticalPath],
    });
    const generatedPath = coverage.paths[0];

    expect(generatedPath.safeToExecute).toBe(true);
    expect(generatedPath.classification).toBe('probe_blueprint_generated');
    expect(generatedPath.evidenceMode).toBe('blueprint');
    expect(generatedPath.probeExecutionMode).toBe('governed_validation');
    expect(generatedPath.terminalReason).toContain('governed_validation probe blueprint');
    expect(generatedPath.validationCommand).toBe('node scripts/pulse/run.js --guidance');
    expect(generatedPath.expectedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'runtime',
          required: true,
        }),
      ]),
    );
    expect(generatedPath.structuralSafetyClassification).toEqual(
      expect.objectContaining({
        risk: 'high',
        executionMode: 'governed_validation',
        safeToExecute: true,
        protectedSurface: false,
      }),
    );
    expect(generatedPath.artifactLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactPath: '.pulse/current/PULSE_EXECUTION_MATRIX.json',
          relationship: 'source_matrix',
        }),
        expect.objectContaining({
          artifactPath: '.pulse/current/PULSE_PATH_COVERAGE.json',
          relationship: 'coverage_state',
        }),
      ]),
    );
    expect(generatedPath.testFilePath).toMatch(/\.pulse\/frontier\/.*\.probe\.json/);
    expect(coverage.summary.criticalUnobserved).toBe(deriveZeroValue());
    expect(coverage.summary.observedPass + coverage.summary.observedFail).toBe(deriveZeroValue());

    if (!generatedPath.testFilePath) {
      throw new Error('Expected path coverage to generate a probe blueprint file');
    }
    const probeBlueprint = JSON.parse(
      fs.readFileSync(path.join(rootDir, generatedPath.testFilePath), 'utf8'),
    ) as {
      matrixStatus: string;
      coverageCountsAsObserved: boolean;
      expectedEvidence: Array<{ kind: string; required: boolean }>;
      structuralSafetyClassification: { executionMode: string; safeToExecute: boolean };
      artifactLinks: Array<{ artifactPath: string; relationship: string }>;
    };

    expect(JSON.stringify(probeBlueprint)).not.toContain('human_required');
    expect(probeBlueprint.matrixStatus).toBe('governed_validation_required');
    expect(probeBlueprint.coverageCountsAsObserved).toBe(false);
    expect(probeBlueprint.expectedEvidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'runtime', required: true })]),
    );
    expect(probeBlueprint.structuralSafetyClassification).toEqual(
      expect.objectContaining({
        executionMode: 'governed_validation',
        safeToExecute: true,
      }),
    );
    expect(probeBlueprint.artifactLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactPath: generatedPath.testFilePath,
          relationship: 'probe_blueprint',
        }),
      ]),
    );

    expect(
      isSafeToExecute(
        matrixPath({ filePaths: ['scripts/ops/check-governance-boundary.mjs'], risk: 'medium' }),
      ),
    ).toBe(false);
  });

  it('promotes replay sessions from observed impact instead of URL words', () => {
    expect(classifyReplaySession(replaySession({ url: '/checkout' }))).toBe('temporary');

    expect(
      classifyReplaySession(
        replaySession({
          url: '/opaque',
          events: [
            {
              type: 'error',
              timestamp: '2026-04-29T00:00:01.000Z',
              detail: { severity: 9 },
            },
          ],
        }),
      ),
    ).toBe('permanent');
  });

  it('does not assign crawler roles from product route names', () => {
    expect(classifyRoleFromRoute('/checkout')).toBe('customer');
    expect(classifyRoleFromRoute('/payments')).toBe('customer');
    expect(classifyRoleFromRoute('/admin')).toBe('admin');
    expect(classifyRoleFromRoute('/operator/queue')).toBe('operator');
  });

  it('does not mark product-named source paths as protected governance', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-scope-'));
    const governanceDir = path.join(rootDir, 'ops');
    fs.mkdirSync(governanceDir, { recursive: true });
    fs.writeFileSync(
      path.join(governanceDir, 'protected-governance-files.json'),
      JSON.stringify({
        protectedExact: [],
        protectedPrefixes: ['scripts/ops/'],
      }),
    );
    const productNamedDir = path.join(rootDir, 'backend/src/auth');
    fs.mkdirSync(productNamedDir, { recursive: true });
    const productNamedFile = path.join(productNamedDir, 'opaque.ts');
    fs.writeFileSync(productNamedFile, 'export function opaque() { return true; }');

    const protectedDir = path.join(rootDir, 'scripts/ops');
    fs.mkdirSync(protectedDir, { recursive: true });
    const protectedFile = path.join(protectedDir, 'guard.mjs');
    fs.writeFileSync(protectedFile, 'export default true;');

    expect(detectNewFile(rootDir, productNamedFile)?.isProtected).toBe(false);
    expect(detectNewFile(rootDir, productNamedFile)?.executionMode).toBe('ai_safe');
    expect(detectNewFile(rootDir, protectedFile)?.isProtected).toBe(true);
    expect(detectNewFile(rootDir, protectedFile)?.executionMode).toBe('human_required');
  });

  it('does not classify sandbox destructive actions from product path names alone', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-sandbox-'));
    const productNamedDir = path.join(rootDir, 'backend/src/payments');
    fs.mkdirSync(productNamedDir, { recursive: true });
    fs.writeFileSync(path.join(productNamedDir, 'opaque.ts'), 'export const opaque = true;');

    const mutatingDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(mutatingDir, { recursive: true });
    fs.writeFileSync(
      path.join(mutatingDir, 'mutating.ts'),
      'export async function run(client: { post(input: string): Promise<void> }) { await client.post("/opaque"); }',
    );

    const actions = classifyDestructiveActions(rootDir);

    expect(actions.some((action) => action.targetFile?.endsWith('payments/opaque.ts'))).toBe(false);
    expect(actions.some((action) => action.kind === 'external_state_mutation')).toBe(true);
  });

  it('classifies harness criticality from execution shape instead of target names', () => {
    expect(
      isCriticalHarnessTarget(
        harnessTarget({
          targetId: 'endpoint:get:payment',
          name: 'PaymentController.index',
          routePattern: '/payment',
        }),
      ),
    ).toBe(false);

    expect(
      isCriticalHarnessTarget(
        harnessTarget({
          targetId: 'endpoint:post:opaque',
          name: 'OpaqueController.create',
          routePattern: '/opaque',
          httpMethod: 'POST',
        }),
      ),
    ).toBe(true);
  });

  it('classifies harness staging from executable source shape instead of provider names', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-harness-shape-'));
    const backendDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(backendDir, { recursive: true });

    const namedOnlyFile = path.join(backendDir, 'opaque-label.service.ts');
    fs.writeFileSync(namedOnlyFile, 'export class OpaqueLabel { run() { return true; } }');

    const outboundFile = path.join(backendDir, 'outbound.service.ts');
    fs.writeFileSync(
      outboundFile,
      'export class Outbound { async run() { return fetch("https://example.test/probe"); } }',
    );

    expect(
      classifyExecutionFeasibility(
        harnessTarget({
          kind: 'service',
          name: 'OpaqueLabel.run',
          filePath: path.relative(rootDir, namedOnlyFile),
          methodName: 'run',
        }),
        new Map(),
        rootDir,
      ).feasibility,
    ).toBe('executable');

    expect(
      classifyExecutionFeasibility(
        harnessTarget({
          kind: 'service',
          name: 'Opaque.run',
          filePath: path.relative(rootDir, outboundFile),
          methodName: 'run',
        }),
        new Map(),
        rootDir,
      ).feasibility,
    ).toBe('needs_staging');
  });

  it('builds behavior graph external calls from import and call shape instead of provider catalogs', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-behavior-dynamic-'));
    const backendDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(backendDir, { recursive: true });

    fs.writeFileSync(
      path.join(backendDir, 'provider-name-only.service.ts'),
      ['export class StripeOpenAiWhatsappLabel {', '  run() { return true; }', '}'].join('\n'),
    );
    fs.writeFileSync(
      path.join(backendDir, 'dynamic-external.service.ts'),
      [
        "import OpaqueClient from 'opaque-sdk';",
        'export class DynamicExternalService {',
        '  async run() { return OpaqueClient.create({ amountCents: 100, currency: "USD" }); }',
        '}',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(backendDir, 'dynamic-payment-chain.service.ts'),
      [
        "import OpaqueClient from 'opaque-sdk';",
        'export class DynamicPaymentChainService {',
        '  async run() { return OpaqueClient.checkout.sessions.create({ total: 100 }); }',
        '}',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(backendDir, 'semantic-payment-action.service.ts'),
      [
        'export class SemanticPaymentActionService {',
        '  async run() { return processPayment({ amountCents: 100, currency: "USD" }); }',
        '}',
      ].join('\n'),
    );

    const graph = buildBehaviorGraph(rootDir);
    const namedOnly = graph.nodes.find((node) =>
      node.filePath.endsWith('provider-name-only.service.ts'),
    );
    const dynamicExternal = graph.nodes.find((node) =>
      node.filePath.endsWith('dynamic-external.service.ts'),
    );
    const dynamicPaymentChain = graph.nodes.find((node) =>
      node.filePath.endsWith('dynamic-payment-chain.service.ts'),
    );
    const semanticPaymentAction = graph.nodes.find((node) =>
      node.filePath.endsWith('semantic-payment-action.service.ts'),
    );

    expect(namedOnly?.externalCalls).toEqual([]);
    expect(namedOnly?.risk).toBe('low');
    expect(dynamicExternal?.externalCalls.map((call) => call.provider)).toEqual(['OpaqueClient']);
    expect(dynamicExternal?.risk).toBe('high');
    expect(dynamicPaymentChain?.externalCalls).toEqual([
      expect.objectContaining({ provider: 'OpaqueClient', operation: 'create' }),
    ]);
    expect(dynamicPaymentChain?.risk).toBe('high');
    expect(semanticPaymentAction?.externalCalls).toEqual([]);
    expect(semanticPaymentAction?.risk).toBe('high');
  });

  it('builds structural side effects from arbitrary external SDK usage instead of fixed SDK names', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-side-effect-dynamic-'));
    const backendDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(backendDir, { recursive: true });

    fs.writeFileSync(
      path.join(backendDir, 'named-only.ts'),
      'export const stripeOpenAiWhatsapp = "label-only";',
    );
    fs.writeFileSync(
      path.join(backendDir, 'external-sdk.ts'),
      [
        "import OpaqueProvider from 'opaque-provider-sdk';",
        'export async function run() {',
        '  return OpaqueProvider.send({ ok: true });',
        '}',
      ].join('\n'),
    );

    const nodes = buildSideEffectSignals(
      rootDir,
      ['backend/src/opaque/named-only.ts', 'backend/src/opaque/external-sdk.ts'],
      new Map(),
      'observed',
    );

    expect(
      nodes.some(
        (node) =>
          node.file?.endsWith('named-only.ts') && node.metadata.signal === 'external_sdk_call',
      ),
    ).toBe(false);
    expect(
      nodes.some(
        (node) =>
          node.file?.endsWith('external-sdk.ts') && node.metadata.signal === 'external_sdk_call',
      ),
    ).toBe(true);
  });

  it('classifies internal endpoints by URL structure instead of known product prefixes', () => {
    expect(isInternalEndpoint('/xpto')).toBe(true);
    expect(isInternalEndpoint('/payment')).toBe(true);
    expect(isInternalEndpoint('https://api.example.test/payment')).toBe(false);
  });

  it('discovers contract providers from observed URL hosts instead of a provider catalog', () => {
    expect(providerFromUrl('https://api.opaque-provider.test/v1/events')).toBe(
      'api.opaque-provider.test',
    );
    expect(providerFromUrl('/api/internal/events')).toBeNull();
  });

  it('classifies chaos targets from dependency behavior instead of provider names', () => {
    expect([
      ...classifyTargetsFromSource('await opaqueNamedService.create({ amount: 100 })'),
    ]).toEqual([]);

    expect([
      ...classifyTargetsFromSource('await billingClient.post("/opaque", payload)'),
    ]).toContain('external_http');

    expect([
      ...classifyTargetsFromSource(
        '@Post("/opaque/webhook") handle(@Headers("x-signature") sig: string) {}',
      ),
    ]).toContain('webhook_receiver');
  });

  it('discovers chaos dependencies from code and artifacts without a provider catalog', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-chaos-deps-'));
    const backendDir = path.join(rootDir, 'backend/src/opaque');
    const pulseDir = path.join(rootDir, '.pulse/current');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.mkdirSync(pulseDir, { recursive: true });

    const externalFile = path.join(backendDir, 'outbound.service.ts');
    fs.writeFileSync(
      externalFile,
      [
        'import { OpaqueClient } from "@vendor/opaque-sdk";',
        'export async function send() {',
        '  const endpoint = process.env.OPAQUE_ENDPOINT_URL;',
        '  return fetch("https://api.opaque-provider.test/v1/events");',
        '}',
      ].join('\n'),
    );

    const signalFile = path.join(backendDir, 'signal.service.ts');
    fs.writeFileSync(
      signalFile,
      'export async function probe() { return opaqueHttpClient.post("/events", {}); }',
    );

    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_BEHAVIOR_GRAPH.json'),
      JSON.stringify({
        nodes: [
          {
            filePath: path.relative(rootDir, signalFile),
            externalCalls: [{ provider: 'observed-opaque-runtime' }],
          },
        ],
      }),
    );

    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_STRUCTURAL_GRAPH.json'),
      JSON.stringify({
        nodes: [
          {
            kind: 'side_effect_signal',
            metadata: { filePath: path.relative(rootDir, signalFile) },
          },
        ],
      }),
    );

    const dependencies = detectProviders(rootDir);
    expect([...dependencies.keys()]).toEqual(
      expect.arrayContaining([
        'host:api-opaque-provider-test',
        'env:opaque-endpoint',
        'package:vendor-opaque-sdk',
        'behavior:observed-opaque-runtime',
        'client:opaquehttpclient',
      ]),
    );

    const scenarios = generateProviderScenarios(rootDir, dependencies, []);
    expect(
      scenarios.some((scenario) => scenario.id.includes('host:api-opaque-provider-test')),
    ).toBe(true);
    expect(scenarios.map((scenario) => scenario.description).join('\n')).not.toMatch(
      /stripe|openai|meta|resend/i,
    );
  });

  it('derives GitNexus impact labels structurally instead of a product domain catalog', () => {
    expect(filePathToCapability('backend/src/checkout/orders.controller.ts')).toBe('Checkout');
    expect(filePathToCapability('backend/src/xpto/orders.controller.ts')).toBe('Xpto');
    expect(filePathToFlow('backend/src/xpto/orders.controller.ts')).toBe('xpto-controller');

    expect(isCriticalPath('backend/src/payments/opaque.service.ts')).toBe(false);
    expect(isCriticalPath('backend/prisma/schema.prisma')).toBe(true);
    expect(isCriticalPath('backend/prisma/migrations/20260429120000_init/migration.sql')).toBe(
      true,
    );
  });

  it('classifies DoD risk from structural evidence instead of capability names', () => {
    expect(determineRiskLevel(pulseCapability({ name: 'Payment Wallet Checkout Auth' }))).toBe(
      'low',
    );

    expect(
      determineRiskLevel(
        pulseCapability({
          name: 'Xpto',
          rolesPresent: ['interface', 'persistence', 'side_effect'],
        }),
      ),
    ).toBe('critical');

    expect(
      determineRiskLevel(
        pulseCapability({
          name: 'Opaque',
          routePatterns: ['post-opaque-id'],
        }),
      ),
    ).toBe('high');
  });

  it('does not treat product route names as codebase-truth control tokens', () => {
    expect(ROUTE_NOISE_TOKENS.has('checkout')).toBe(false);
    expect(ROUTE_NOISE_TOKENS.has('auth')).toBe(false);
    expect(isUserFacingGroup('checkout')).toBe(false);
    expect(isUserFacingGroup('public')).toBe(true);
  });

  it('detects likely UI mutations from method and generic verbs instead of product words', () => {
    expect(
      isLikelyMutation(
        interactionChain({
          elementLabel: 'Pay now',
          apiCall: { endpoint: '/checkout', method: 'GET', file: 'api.ts', line: 1 },
        }),
      ),
    ).toBe(false);

    expect(
      isLikelyMutation(
        interactionChain({
          elementLabel: 'Submit',
          apiCall: { endpoint: '/opaque', method: 'GET', file: 'api.ts', line: 1 },
        }),
      ),
    ).toBe(true);

    expect(
      isLikelyMutation(
        interactionChain({
          elementLabel: 'Open',
          apiCall: { endpoint: '/opaque', method: 'POST', file: 'api.ts', line: 1 },
        }),
      ),
    ).toBe(true);
  });

  it('builds scenario catalog from arbitrary product graph surfaces instead of fixed domains', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-scenario-dynamic-'));
    const pulseDir = path.join(rootDir, '.pulse', 'current');
    fs.mkdirSync(pulseDir, { recursive: true });

    const graph: PulseProductGraph = {
      surfaces: [
        {
          id: 'xpto',
          name: 'Xpto',
          description: 'Opaque discovered surface',
          artifactIds: [],
          capabilities: ['cap-xpto'],
          completeness: 0.5,
          truthMode: 'observed',
        },
      ],
      capabilities: [
        {
          id: 'cap-xpto',
          name: 'Opaque Capability',
          surfaceId: 'xpto',
          artifactIds: [],
          flowIds: ['flow-xpto'],
          maturityScore: 0.5,
          truthMode: 'observed',
          criticality: 'must_have',
          blockers: [],
        },
      ],
      flows: [
        {
          id: 'flow-xpto',
          name: 'Opaque Flow',
          entryCapability: 'cap-xpto',
          capabilities: ['cap-xpto'],
          completeness: 0.5,
          truthMode: 'observed',
          blockers: [],
        },
      ],
      orphanedArtifactIds: [],
      phantomCapabilities: [],
      latentCapabilities: [],
    };

    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_PRODUCT_GRAPH.json'),
      JSON.stringify(graph, null, 2),
    );
    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_BEHAVIOR_GRAPH.json'),
      JSON.stringify({
        generatedAt: '2026-04-29T00:00:00.000Z',
        summary: {
          totalNodes: 1,
          handlerNodes: 0,
          apiEndpointNodes: 1,
          queueNodes: 0,
          cronNodes: 0,
          webhookNodes: 0,
          dbNodes: 0,
          externalCallNodes: 0,
          aiSafeNodes: 1,
          humanRequiredNodes: 0,
          nodesWithErrorHandler: 0,
          nodesWithLogging: 0,
          nodesWithMetrics: 0,
          criticalRiskNodes: 0,
        },
        nodes: [
          {
            id: 'node:xpto',
            kind: 'api_endpoint',
            name: 'XptoController.create',
            filePath: 'backend/src/xpto/xpto.controller.ts',
            line: 1,
            parentFunctionId: null,
            inputs: [
              {
                kind: 'body',
                name: 'opaqueField',
                type: 'string',
                required: true,
                validated: true,
                source: 'dto',
              },
            ],
            outputs: [{ kind: 'db_write', target: 'Opaque', type: 'create', conditional: false }],
            stateAccess: [],
            externalCalls: [],
            risk: 'medium',
            executionMode: 'ai_safe',
            calledBy: [],
            calls: [],
            isAsync: false,
            hasErrorHandler: false,
            hasLogging: false,
            hasMetrics: false,
            hasTracing: false,
            decorators: ['Post'],
            docComment: null,
          },
        ],
        orphanNodes: [],
        unreachableNodes: [],
      }),
    );

    const state = buildScenarioCatalog(rootDir);

    expect(state.scenarios).toHaveLength(1);
    expect(state.scenarios[0].id).toBe('flow-xpto');
    expect(state.scenarios[0].flowId).toBe('xpto/flow-xpto');
    expect(state.scenarios[0].role).toBe('anonymous');
    expect(state.scenarios[0].steps.map((step) => step.kind)).toContain('api_call');
    expect(state.scenarios[0].steps.some((step) => step.target.includes('opaqueField'))).toBe(true);
  });
});

