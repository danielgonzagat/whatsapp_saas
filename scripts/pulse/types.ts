// PULSE — Live Codebase Nervous System
// Shared type definitions across all modules

// ===== LAYER 1: UI Elements =====
export interface UIElement {
  file: string;
  line: number;
  type: 'button' | 'link' | 'toggle' | 'form' | 'input' | 'select' | 'clickable';
  label: string;
  handler: string | null;
  handlerType: 'real' | 'dead' | 'noop' | 'navigation';
  apiCalls: string[];
  component: string | null;
}

// ===== LAYER 2: API Calls =====
export interface APICall {
  file: string;
  line: number;
  endpoint: string;
  normalizedPath: string;
  method: string;
  callPattern: 'apiFetch' | 'useSWR' | 'fetch' | 'objectApi';
  isProxy: boolean;
  proxyTarget: string | null;
  callerFunction: string | null;
}

// ===== LAYER 3: Backend Routes =====
export interface BackendRoute {
  file: string;
  line: number;
  controllerPath: string;
  methodPath: string;
  fullPath: string;
  httpMethod: string;
  methodName: string;
  guards: string[];
  isPublic: boolean;
  serviceCalls: string[];
}

// ===== LAYER 4: Database Models =====
export interface PrismaModel {
  name: string;
  accessorName: string;
  line: number;
  fields: PrismaField[];
  relations: PrismaRelation[];
}

export interface PrismaField {
  name: string;
  type: string;
  line: number;
  isOptional: boolean;
  isArray: boolean;
  isId: boolean;
}

export interface PrismaRelation {
  fieldName: string;
  targetModel: string;
  type: 'one' | 'many';
  line: number;
}

// ===== Service Trace =====
export interface ServiceTrace {
  file: string;
  serviceName: string;
  methodName: string;
  line: number;
  prismaModels: string[];
}

// ===== Proxy Route =====
export interface ProxyRoute {
  file: string;
  line: number;
  frontendPath: string;
  httpMethod: string;
  backendPath: string;
}

// ===== Facade =====
export interface FacadeEntry {
  file: string;
  line: number;
  type: 'fake_save' | 'hardcoded_data' | 'random_data' | 'todo_stub' | 'noop_handler' | 'state_only_toggle' | 'silent_catch';
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  evidence: string;
}

// ===== Break Types =====
export type BreakType =
  // Layer 1: Cross-layer connectivity (parsers 1-6)
  | 'API_NO_ROUTE' | 'ROUTE_NO_CALLER' | 'ROUTE_EMPTY'
  | 'MODEL_ORPHAN' | 'UI_DEAD_HANDLER' | 'FACADE' | 'PROXY_NO_UPSTREAM'
  // Certification foundation
  | 'CHECK_UNAVAILABLE' | 'MANIFEST_MISSING' | 'MANIFEST_INVALID' | 'UNKNOWN_SURFACE'
  // Parser 7: Dead Code
  | 'DEAD_EXPORT' | 'DEAD_COMPONENT' | 'UNUSED_IMPORT'
  // Parser 8: WebSocket
  | 'GATEWAY_NO_CONSUMER' | 'EMIT_NO_HANDLER'
  // Parser 9: BullMQ
  | 'QUEUE_NO_PROCESSOR' | 'PROCESSOR_NO_PRODUCER' | 'QUEUE_NAME_MISMATCH'
  // Parser 10: Guards
  | 'ROUTE_NO_AUTH' | 'MISSING_WORKSPACE_FILTER' | 'FINANCIAL_NO_RATE_LIMIT'
  // Parser 11: DTOs
  | 'ROUTE_NO_DTO' | 'DTO_NO_VALIDATION' | 'FINANCIAL_FIELD_NO_VALIDATION'
  // Parser 12: Env
  | 'ENV_NOT_DOCUMENTED' | 'ENV_NO_FALLBACK' | 'HARDCODED_SECRET'
  // Parser 13: Error Handling
  | 'EMPTY_CATCH' | 'FINANCIAL_ERROR_SWALLOWED' | 'UNHANDLED_PROMISE'
  // Parser 14: Type Contracts
  | 'TYPE_MISMATCH' | 'UNSAFE_ANY_CAST' | 'PRISMA_ANY_ACCESS'
  // Parser 15: Console
  | 'CONSOLE_IN_PRODUCTION' | 'UNRESOLVED_TODO'
  // Parser 16: Middleware
  | 'CORS_PERMISSIVE' | 'VALIDATION_PIPE_MISSING'
  // Parser 17: Prisma Safety
  | 'DANGEROUS_DELETE' | 'SQL_INJECTION_RISK'
  | 'FINANCIAL_NO_TRANSACTION' | 'MULTI_MUTATION_NO_TRANSACTION'
  | 'TRANSACTION_NO_ISOLATION' | 'RELATION_NO_CASCADE' | 'FINDMANY_NO_PAGINATION'
  // Parser 18: Performance
  | 'N_PLUS_ONE_QUERY' | 'UNBOUNDED_QUERY' | 'MEMORY_LEAK_RISK'
  // Parser 19: Circular
  | 'CIRCULAR_IMPORT' | 'CIRCULAR_MODULE_DEPENDENCY'
  // Parser 20: NestJS Modules
  | 'SERVICE_NOT_PROVIDED' | 'CONTROLLER_NOT_REGISTERED' | 'MODULE_EXPORT_MISSING'
  // Parser 21: Duplicates
  | 'DUPLICATE_ROUTE' | 'ROUTE_ORDER_CONFLICT'
  // Parser 22: Orphaned Files
  | 'ORPHANED_FILE' | 'PAGE_NO_NAVIGATION'
  // Parser 23: Cron
  | 'CRON_NO_HANDLER' | 'CRON_NO_ERROR_HANDLING'
  // Parser 24: Redis
  | 'REDIS_KEY_ORPHANED' | 'REDIS_KEY_MISSING' | 'REDIS_NO_TTL'
  // Parser 25: Frontend Protection
  | 'FRONTEND_ROUTE_UNPROTECTED' | 'CHECKOUT_NO_VALIDATION'
  // Parser 26: API Response
  | 'RESPONSE_INCONSISTENT' | 'WRONG_STATUS_CODE' | 'ERROR_FORMAT_INCONSISTENT'
  // Parser 27: Async
  | 'MISSING_AWAIT' | 'FLOATING_PROMISE'
  // Parser 28: Assets
  | 'MISSING_ASSET' | 'FONT_NOT_LOADED'
  // Parser 29: Financial Arithmetic
  | 'TOFIX_WITHOUT_PARSE' | 'DIVISION_BY_ZERO_RISK' | 'UNSAFE_FLOAT_COMPARISON' | 'CURRENCY_UNIT_MISMATCH'
  // Parser 30: Locale
  | 'LOCALE_INCONSISTENT' | 'DATE_NO_LOCALE'
  // Parser 31: JSON.parse
  | 'JSON_PARSE_UNSAFE' | 'STRINGIFY_CIRCULAR_RISK'
  // Parser 32: HTTP Timeout
  | 'FETCH_NO_TIMEOUT' | 'AXIOS_NO_TIMEOUT'
  // Parser 33: Cookie/CSRF
  | 'COOKIE_NOT_HTTPONLY' | 'COOKIE_NOT_SECURE' | 'COOKIE_NO_SAMESITE' | 'CSRF_UNPROTECTED'
  // Parser 34: Sensitive Data
  | 'SENSITIVE_DATA_IN_LOG' | 'INTERNAL_ERROR_EXPOSED' | 'REQUEST_BODY_LOGGED'
  // Parser 35: Next.js
  | 'NEXTJS_NO_IMAGE_COMPONENT' | 'NEXTJS_MISSING_USE_CLIENT' | 'NEXTJS_FETCH_NO_CACHE'
  | 'SSR_UNSAFE_ACCESS' | 'UPLOAD_NO_VALIDATION'
  // Parser 36: Interval Cleanup
  | 'INTERVAL_NO_CLEANUP' | 'TIMEOUT_NO_CLEANUP'
  // Parser 37: Hardcoded URLs
  | 'HARDCODED_INTERNAL_URL' | 'HARDCODED_PROD_URL'
  // Parser 38: Code Injection
  | 'EVAL_USAGE' | 'DYNAMIC_REQUIRE_RISK' | 'XSS_DANGEROUS_HTML' | 'DEPRECATED_EXEC_COMMAND'
  // Parser 39: Worker Resilience
  | 'JOB_NO_RETRY' | 'PROCESSOR_NO_ERROR_HANDLING' | 'JOB_SILENTLY_DISCARDED'
  | 'PUPPETEER_PAGE_LEAK' | 'PUPPETEER_NO_TIMEOUT' | 'PUPPETEER_NO_ERROR_RECOVERY'
  // Parser 40: Infra Config
  | 'DOCKER_NO_MULTISTAGE' | 'DOCKER_MISSING_IGNORE' | 'DOCKER_BUILD_FAILS' | 'PACKAGE_VERSION_CONFLICT'
  | 'NEXTJS_EXPERIMENTAL_RISK' | 'PRISMA_MISSING_INDEX'
  // Runtime parsers (41+) — future
  | 'BUILD_FRONTEND_FAILS' | 'BUILD_BACKEND_FAILS' | 'BUILD_WORKER_FAILS'
  | 'TEST_FAILURE' | 'LINT_VIOLATION'
  // Parser 74: Backup
  | 'BACKUP_MISSING'
  // Parser 75: Compliance
  | 'LGPD_NON_COMPLIANT'
  // Parser 76: Test Coverage
  | 'COVERAGE_FINANCIAL_LOW' | 'COVERAGE_CORE_LOW'
  // Parser 77: Test Quality
  | 'TEST_NO_ASSERTION'
  // Parser 78: E2E Coverage
  | 'E2E_FLOW_NOT_TESTED'
  // Parser 79: npm audit
  | 'DEPENDENCY_VULNERABLE'
  // Parser 80: License
  | 'LICENSE_INCOMPATIBLE' | 'LICENSE_UNKNOWN'
  // Parser 81: Chaos — Dependency Failure
  | 'CHAOS_REDIS_CRASH' | 'CHAOS_DB_CRASH' | 'CHAOS_JOB_LOST' | 'CHAOS_EXTERNAL_HANG'
  // Parser 82: Chaos — Third Party
  | 'CHAOS_ASAAS_NO_FALLBACK' | 'CHAOS_LLM_NO_FALLBACK' | 'CHAOS_WHATSAPP_MSG_LOST'
  // Parser 46: CRUD Tester
  | 'CRUD_BROKEN' | 'VALIDATION_BYPASSED'
  // Parser 59: Performance Query Profiler
  | 'SLOW_QUERY' | 'UNBOUNDED_RESULT'
  // Parser 60: Performance Memory
  | 'MEMORY_LEAK_DETECTED'
  // Parser 68: Hydration Tester
  | 'HYDRATION_MISMATCH'
  // Parser 70: Responsive Tester
  | 'RESPONSIVE_BROKEN'
  // Parser 69: Accessibility Tester
  | 'ACCESSIBILITY_VIOLATION'
  // Parser 65: AI Response Quality
  | 'AI_RESPONSE_INADEQUATE'
  // Parser 66: AI Guardrails
  | 'AI_GUARDRAIL_BROKEN'
  // Parser 83: State Machine
  | 'STATE_INVALID_TRANSITION' | 'STATE_PAYMENT_INVALID'
  // Parser 84: Concurrency
  | 'RACE_CONDITION_DATA_CORRUPTION' | 'RACE_CONDITION_FINANCIAL' | 'RACE_CONDITION_OVERWRITE'
  // Parser 85: Ordering / Timing
  | 'ORDERING_WEBHOOK_OOO' | 'CLOCK_SKEW_TOO_STRICT' | 'TIMEZONE_REPORT_MISMATCH'
  // Parser 86: Cache Invalidation
  | 'CACHE_STALE_AFTER_WRITE' | 'CACHE_REDIS_STALE'
  // Parser 87: Edge Cases
  | 'EDGE_CASE_PAGINATION' | 'EDGE_CASE_STRING' | 'EDGE_CASE_NUMBER'
  | 'EDGE_CASE_DATE' | 'EDGE_CASE_FILE' | 'EDGE_CASE_ARRAY'
  // Parser 88: Observability
  | 'OBSERVABILITY_NO_TRACING' | 'OBSERVABILITY_NO_ALERTING'
  // Parser 89: Audit Trail
  | 'AUDIT_FINANCIAL_NO_TRAIL' | 'AUDIT_DELETION_NO_LOG' | 'AUDIT_ADMIN_NO_LOG'
  // Parser 90: Deploy / Rollback
  | 'DEPLOY_NO_ROLLBACK' | 'MIGRATION_NO_ROLLBACK' | 'DEPLOY_NO_FEATURE_FLAGS'
  // Parser 91: Cost Limits
  | 'COST_LLM_NO_LIMIT' | 'COST_STORAGE_NO_LIMIT' | 'COST_NO_TRACKING'
  // Parser 92: Communication
  | 'EMAIL_NO_AUTH' | 'PUSH_NOT_IMPLEMENTED' | 'NOTIFICATION_SALE_MISSING'
  // Parser 93: Browser / Network
  | 'BROWSER_INCOMPATIBLE' | 'NETWORK_SLOW_UNUSABLE' | 'NETWORK_OFFLINE_DATA_LOST'
  // Parser 94: Idempotency
  | 'IDEMPOTENCY_MISSING' | 'IDEMPOTENCY_FINANCIAL' | 'IDEMPOTENCY_JOB'
  // Parser 95: Disaster Recovery
  | 'DR_BACKUP_INCOMPLETE' | 'DR_RPO_TOO_HIGH' | 'DR_NO_RUNBOOK' | 'DR_CANNOT_REBUILD'
  // Parser 96: Business Rules
  | 'BUSINESS_COMMISSION_MATH' | 'BUSINESS_COUPON_INVALID' | 'BUSINESS_BILLING_WRONG'
  | 'BUSINESS_PLAN_LIMIT_BYPASS' | 'BUSINESS_SPLIT_ROUNDING'
  // Parser 97: DB Internals
  | 'DB_DEADLOCK_POSSIBLE' | 'DB_POOL_EXHAUSTION_HANG' | 'DB_CONNECTION_LEAK'
  // Parser 98: Node.js Internals
  | 'NODEJS_EVENT_LOOP_BLOCKED' | 'NODEJS_BACKPRESSURE_MISSING' | 'NODEJS_NO_REJECTION_HANDLER'
  // Parser 99: Crypto
  | 'CRYPTO_WEAK_HASH' | 'CRYPTO_WEAK_RANDOM' | 'CRYPTO_SENSITIVE_PLAINTEXT' | 'CRYPTO_TIMING_ATTACK'
  // Parser 100: Supply Chain
  | 'SUPPLY_CHAIN_CONFUSION_RISK' | 'SUPPLY_CHAIN_NO_LOCKFILE'
  // Parser 101: Multi-tenancy Deep
  | 'TENANT_CACHE_SHARED' | 'TENANT_LOG_LEAKAGE' | 'TENANT_FILE_LEAKAGE'
  // Parser 102: API Versioning
  | 'API_BREAKING_CHANGE' | 'API_NOT_BACKWARD_COMPATIBLE'
  // Parser 103: Unicode Deep
  | 'UNICODE_NORMALIZATION_BUG' | 'UNICODE_EMOJI_TRUNCATION' | 'UNICODE_NUMBER_FORMAT'
  // Runtime parsers 44-67: Integration Testing (DEEP mode)
  | 'API_CONTRACT_VIOLATION' | 'API_ERROR_LEAKS'
  | 'AUTH_FLOW_BROKEN' | 'TOKEN_REFRESH_BROKEN' | 'WORKSPACE_ISOLATION_BROKEN'
  | 'AUTH_BYPASS_VULNERABLE'
  | 'SLOW_ENDPOINT' | 'VERY_SLOW_ENDPOINT'
  | 'PAGE_RENDER_BROKEN'
  | 'DATA_ORPHANED_RECORD' | 'DATA_WALLET_INCONSISTENT' | 'DATA_WORKSPACE_NO_OWNER'
  | 'DATA_PRODUCT_NO_PLAN' | 'DATA_ORDER_NO_PAYMENT'
  // Parser 53-62: Security Deep + Schema Drift (DEEP mode runtime probes)
  | 'CROSS_WORKSPACE_ACCESS' | 'INJECTION_VULNERABLE' | 'XSS_STORED_VULNERABLE'
  | 'BRUTE_FORCE_VULNERABLE' | 'RATE_LIMIT_MISSING'
  | 'SCHEMA_TABLE_MISSING' | 'SCHEMA_COLUMN_MISSING' | 'SCHEMA_TYPE_MISMATCH'
  // Parser 71: CI/CD Checker (static)
  | 'CICD_INCOMPLETE'
  // Parser 73: Monitoring Coverage (static)
  | 'MONITORING_MISSING'
  // Parser 64: AI Prompt Verifier (static)
  | 'AI_PROMPT_INCOMPLETE'
  // Parsers 47-52: E2E Flow Tests (DEEP mode)
  | 'WEBHOOK_ASAAS_BROKEN' | 'WEBHOOK_NOT_IDEMPOTENT' | 'WEBHOOK_NO_SIGNATURE_CHECK'
  | 'E2E_REGISTRATION_BROKEN'
  | 'E2E_PRODUCT_BROKEN'
  | 'E2E_PAYMENT_BROKEN'
  | 'E2E_AI_CONFIG_MISSING'
  | 'E2E_RACE_CONDITION_WITHDRAWAL';

// ===== Graph =====
export interface Break {
  type: BreakType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line: number;
  description: string;
  detail: string;
  source?: string;
  surface?: string;
}

export interface PulseHealth {
  score: number;
  totalNodes: number;
  breaks: Break[];
  stats: {
    uiElements: number;
    uiDeadHandlers: number;
    apiCalls: number;
    apiNoRoute: number;
    backendRoutes: number;
    backendEmpty: number;
    prismaModels: number;
    modelOrphans: number;
    facades: number;
    facadesBySeverity: { high: number; medium: number; low: number };
    proxyRoutes: number;
    proxyNoUpstream: number;
    // Extended stats from new parsers
    securityIssues: number;
    dataSafetyIssues: number;
    qualityIssues: number;
    unavailableChecks: number;
    unknownSurfaces: number;
    // Functional map stats (populated when --fmap is used)
    functionalMap?: {
      totalInteractions: number;
      byStatus: Record<string, number>;
      functionalScore: number;
    };
  };
  timestamp: string;
}

// ===== Config =====
export interface PulseConfig {
  rootDir: string;
  frontendDir: string;
  backendDir: string;
  workerDir: string;
  schemaPath: string;
  globalPrefix: string;
}

// ===== Certification =====
export type PulseModuleState =
  | 'READY'
  | 'PARTIAL'
  | 'SHELL_ONLY'
  | 'MOCKED'
  | 'BROKEN'
  | 'INTERNAL';

export interface PulseManifestModule {
  name: string;
  state: PulseModuleState;
  notes: string;
  critical?: boolean;
}

export type PulseEnvironment = 'scan' | 'deep' | 'total';
export type PulseFlowRunner = 'runtime-e2e' | 'browser-stress' | 'hybrid';
export type PulseFlowOracle =
  | 'auth-session'
  | 'entity-persisted'
  | 'payment-lifecycle'
  | 'wallet-ledger'
  | 'conversation-persisted';

export type PulseActorKind = 'customer' | 'operator' | 'admin' | 'system';
export type PulseScenarioKind =
  | 'single-session'
  | 'multi-session'
  | 'multi-actor'
  | 'long-lived'
  | 'async-reconciled';
export type PulseScenarioRunner = 'playwright-spec' | 'derived';
export type PulseScenarioExecutionMode = 'real' | 'derived' | 'mapping';
export type PulseProviderMode = 'replay' | 'sandbox' | 'real_smoke' | 'hybrid';
export type PulseTimeWindowMode = 'total' | 'shift' | 'soak';

export interface PulseActorProfile {
  id: string;
  kind: PulseActorKind;
  description: string;
  moduleFocus: string[];
  defaultTimeWindowModes: PulseTimeWindowMode[];
}

export interface PulseManifestScenarioSpec {
  id: string;
  actorKind: PulseActorKind;
  scenarioKind: PulseScenarioKind;
  critical: boolean;
  moduleKeys: string[];
  routePatterns: string[];
  flowSpecs: string[];
  flowGroups: string[];
  playwrightSpecs: string[];
  runtimeProbes: string[];
  requiresBrowser: boolean;
  requiresPersistence: boolean;
  asyncExpectations: string[];
  providerMode: PulseProviderMode;
  timeWindowModes: PulseTimeWindowMode[];
  runner: PulseScenarioRunner;
  executionMode: PulseScenarioExecutionMode;
  worldStateKeys: string[];
  requiredArtifacts: string[];
  notes: string;
}

export interface PulseManifestFlowSpec {
  id: string;
  surface: string;
  runner: PulseFlowRunner;
  oracle: PulseFlowOracle;
  providerMode: PulseProviderMode;
  smokeRequired: boolean;
  critical: boolean;
  preconditions: string[];
  environments: PulseEnvironment[];
  notes: string;
}

export type PulseInvariantSource = 'static' | 'runtime' | 'hybrid';
export type PulseInvariantEvaluator =
  | 'workspace-isolation'
  | 'financial-audit-trail'
  | 'payment-idempotency'
  | 'wallet-balance-consistency';

export interface PulseManifestInvariantSpec {
  id: string;
  surface: string;
  source: PulseInvariantSource;
  evaluator: PulseInvariantEvaluator;
  critical: boolean;
  dependsOn: string[];
  environments: PulseEnvironment[];
  notes: string;
}

export type PulseTemporaryAcceptanceTargetType =
  | 'gate'
  | 'break_type'
  | 'surface'
  | 'flow'
  | 'invariant';

export interface PulseTemporaryAcceptance {
  id: string;
  targetType: PulseTemporaryAcceptanceTargetType;
  target: string;
  reason: string;
  expiresAt: string;
}

export interface PulseManifestOverrides {
  excludedModules?: string[];
  criticalModules?: string[];
  internalModules?: string[];
  moduleAliases?: Record<string, string>;
  flowAliases?: Record<string, string>;
  excludedFlowCandidates?: string[];
}

export interface PulseManifestCertificationTier {
  id: number;
  name: string;
  gates: PulseGateName[];
  requireNoAcceptedFlows?: boolean;
  requireNoAcceptedScenarios?: boolean;
  requireWorldStateConvergence?: boolean;
}

export interface PulseManifestFinalReadinessCriteria {
  requireAllTiersPass: boolean;
  requireNoAcceptedCriticalFlows: boolean;
  requireNoAcceptedCriticalScenarios: boolean;
  requireWorldStateConvergence: boolean;
}

export interface PulseManifest {
  version: number;
  projectId: string;
  projectName: string;
  systemType: string;
  supportedStacks: string[];
  surfaces: string[];
  criticalDomains: string[];
  modules: PulseManifestModule[];
  legacyModules?: PulseManifestModule[];
  actorProfiles: PulseActorProfile[];
  scenarioSpecs: PulseManifestScenarioSpec[];
  externalIntegrations: string[];
  jobs: string[];
  webhooks: string[];
  stateMachines: string[];
  criticalFlows: string[];
  invariants: string[];
  flowSpecs: PulseManifestFlowSpec[];
  invariantSpecs: PulseManifestInvariantSpec[];
  temporaryAcceptances: PulseTemporaryAcceptance[];
  certificationTiers: PulseManifestCertificationTier[];
  finalReadinessCriteria: PulseManifestFinalReadinessCriteria;
  slos: Record<string, number | string>;
  securityRequirements: string[];
  recoveryRequirements: string[];
  excludedSurfaces: string[];
  environments: PulseEnvironment[];
  evidenceTtlHours?: number;
  adapterConfig?: Record<string, unknown>;
  overrides?: PulseManifestOverrides;
}

export type PulseShellComplexity = 'light' | 'medium' | 'rich';

export interface PulseTruthPageSummary {
  route: string;
  group: string;
  moduleKey: string;
  moduleName: string;
  shellComplexity: PulseShellComplexity;
  totalInteractions: number;
  functioningInteractions: number;
  facadeInteractions: number;
  brokenInteractions: number;
  incompleteInteractions: number;
  absentInteractions: number;
  apiBoundInteractions: number;
  backendBoundInteractions: number;
  persistedInteractions: number;
  totalDataSources: number;
  backedDataSources: number;
}

export interface PulseDiscoveredModule {
  key: string;
  name: string;
  routeRoots: string[];
  groups: string[];
  userFacing: boolean;
  shellComplexity: PulseShellComplexity;
  pageCount: number;
  totalInteractions: number;
  functioningInteractions: number;
  facadeInteractions: number;
  brokenInteractions: number;
  incompleteInteractions: number;
  absentInteractions: number;
  apiBoundInteractions: number;
  backendBoundInteractions: number;
  persistedInteractions: number;
  totalDataSources: number;
  backedDataSources: number;
  state: PulseModuleState;
  declaredModule: string | null;
  notes: string;
}

export interface PulseDiscoveredFlowCandidate {
  id: string;
  moduleKey: string;
  moduleName: string;
  pageRoute: string;
  elementLabel: string;
  httpMethod: string;
  endpoint: string;
  backendRoute: string | null;
  connected: boolean;
  persistent: boolean;
  declaredFlow: string | null;
}

export interface PulseTruthDivergence {
  declaredNotDiscovered: string[];
  discoveredNotDeclared: string[];
  declaredButInternal: string[];
  frontendSurfaceWithoutBackendSupport: string[];
  backendCapabilityWithoutFrontendSurface: string[];
  shellWithoutPersistence: string[];
  flowCandidatesWithoutOracle: string[];
  blockerCount: number;
  warningCount: number;
}

export interface PulseCodebaseTruthSummary {
  totalPages: number;
  userFacingPages: number;
  discoveredModules: number;
  discoveredFlows: number;
  blockerCount: number;
  warningCount: number;
}

export interface PulseCodebaseTruth {
  generatedAt: string;
  summary: PulseCodebaseTruthSummary;
  pages: PulseTruthPageSummary[];
  discoveredModules: PulseDiscoveredModule[];
  discoveredFlows: PulseDiscoveredFlowCandidate[];
  divergence: PulseTruthDivergence;
}

export type PulseResolvedModuleResolution = 'matched' | 'derived' | 'excluded';
export type PulseResolvedModuleKind = 'user_facing' | 'internal' | 'shared' | 'legacy';

export interface PulseResolvedModule {
  key: string;
  name: string;
  canonicalName: string;
  aliases: string[];
  routeRoots: string[];
  groups: string[];
  moduleKind: PulseResolvedModuleKind;
  userFacing: boolean;
  shellComplexity: PulseShellComplexity;
  state: PulseModuleState;
  critical: boolean;
  resolution: PulseResolvedModuleResolution;
  sourceModule: string | null;
  legacySource: string | null;
  pageCount: number;
  totalInteractions: number;
  backendBoundInteractions: number;
  persistedInteractions: number;
  backedDataSources: number;
  notes: string;
}

export type PulseResolvedFlowResolution = 'matched' | 'accepted' | 'grouped' | 'candidate' | 'excluded';
export type PulseResolvedFlowKind = 'feature_flow' | 'shared_capability' | 'ops_internal' | 'legacy_noise';

export interface PulseResolvedFlowGroup {
  id: string;
  canonicalName: string;
  aliases: string[];
  flowKind: PulseResolvedFlowKind;
  moduleKey: string;
  moduleName: string;
  moduleKeys: string[];
  moduleNames: string[];
  pageRoutes: string[];
  actions: string[];
  endpoints: string[];
  backendRoutes: string[];
  connected: boolean;
  persistent: boolean;
  memberCount: number;
  critical: boolean;
  resolution: PulseResolvedFlowResolution;
  matchedFlowSpec: string | null;
  notes: string;
}

export interface PulseResolvedManifestDiagnostics {
  unresolvedModules: string[];
  orphanManualModules: string[];
  unresolvedFlowGroups: string[];
  orphanFlowSpecs: string[];
  excludedModules: string[];
  excludedFlowGroups: string[];
  legacyManualModules: string[];
  groupedFlowGroups: string[];
  sharedCapabilityGroups: string[];
  opsInternalFlowGroups: string[];
  legacyNoiseFlowGroups: string[];
  blockerCount: number;
  warningCount: number;
}

export interface PulseResolvedManifestSummary {
  totalModules: number;
  resolvedModules: number;
  unresolvedModules: number;
  totalFlowGroups: number;
  resolvedFlowGroups: number;
  unresolvedFlowGroups: number;
  orphanManualModules: number;
  orphanFlowSpecs: number;
  excludedModules: number;
  excludedFlowGroups: number;
  groupedFlowGroups: number;
  sharedCapabilityGroups: number;
  opsInternalFlowGroups: number;
  legacyNoiseFlowGroups: number;
  legacyManualModules: number;
}

export interface PulseResolvedManifest {
  generatedAt: string;
  sourceManifestPath: string | null;
  projectId: string;
  projectName: string;
  systemType: string;
  supportedStacks: string[];
  surfaces: string[];
  criticalDomains: string[];
  modules: PulseResolvedModule[];
  flowGroups: PulseResolvedFlowGroup[];
  actorProfiles: PulseActorProfile[];
  scenarioSpecs: PulseManifestScenarioSpec[];
  flowSpecs: PulseManifestFlowSpec[];
  invariantSpecs: PulseManifestInvariantSpec[];
  temporaryAcceptances: PulseTemporaryAcceptance[];
  certificationTiers: PulseManifestCertificationTier[];
  finalReadinessCriteria: PulseManifestFinalReadinessCriteria;
  securityRequirements: string[];
  recoveryRequirements: string[];
  slos: Record<string, number | string>;
  summary: PulseResolvedManifestSummary;
  diagnostics: PulseResolvedManifestDiagnostics;
}

export interface PulseManifestLoadResult {
  manifest: PulseManifest | null;
  manifestPath: string | null;
  issues: Break[];
  unknownSurfaces: string[];
  unsupportedStacks: string[];
}

export interface PulseParserUnavailable {
  name: string;
  file: string;
  reason: string;
}

export interface PulseParserDefinition {
  name: string;
  file: string;
  fn: (config: PulseConfig) => Break[] | Promise<Break[]>;
}

export interface PulseParserInventory {
  discoveredChecks: string[];
  loadedChecks: PulseParserDefinition[];
  unavailableChecks: PulseParserUnavailable[];
  helperFilesSkipped: string[];
}

export type PulseGateName =
  | 'scopeClosed'
  | 'adapterSupported'
  | 'specComplete'
  | 'truthExtractionPass'
  | 'staticPass'
  | 'runtimePass'
  | 'browserPass'
  | 'flowPass'
  | 'invariantPass'
  | 'securityPass'
  | 'isolationPass'
  | 'recoveryPass'
  | 'performancePass'
  | 'observabilityPass'
  | 'customerPass'
  | 'operatorPass'
  | 'adminPass'
  | 'soakPass'
  | 'syntheticCoveragePass'
  | 'evidenceFresh'
  | 'pulseSelfTrustPass';

export type PulseGateFailureClass = 'product_failure' | 'missing_evidence' | 'checker_gap';

export interface PulseEvidenceRecord {
  kind: 'runtime' | 'browser' | 'flow' | 'invariant' | 'artifact' | 'truth' | 'actor' | 'coverage';
  executed: boolean;
  summary: string;
  artifactPaths: string[];
  metrics?: Record<string, string | number | boolean>;
}

export type PulseRuntimeProbeStatus = 'passed' | 'failed' | 'missing_evidence' | 'skipped';

export interface PulseRuntimeProbe {
  probeId: string;
  target: string;
  required: boolean;
  executed: boolean;
  status: PulseRuntimeProbeStatus;
  failureClass?: PulseGateFailureClass;
  summary: string;
  latencyMs?: number;
  artifactPaths: string[];
  metrics?: Record<string, string | number | boolean>;
}

export interface PulseRuntimeEvidence {
  executed: boolean;
  executedChecks: string[];
  blockingBreakTypes: string[];
  artifactPaths: string[];
  summary: string;
  backendUrl?: string;
  frontendUrl?: string;
  resolutionSource?: string;
  probes: PulseRuntimeProbe[];
}

export interface PulseObservabilityEvidence {
  executed: boolean;
  artifactPaths: string[];
  summary: string;
  signals: {
    tracingHeadersDetected: boolean;
    requestIdMiddlewareDetected: boolean;
    structuredLoggingDetected: boolean;
    sentryDetected: boolean;
    alertingIntegrationDetected: boolean;
    healthEndpointsDetected: boolean;
    auditTrailDetected: boolean;
  };
}

export interface PulseRecoveryEvidence {
  executed: boolean;
  artifactPaths: string[];
  summary: string;
  signals: {
    backupManifestPresent: boolean;
    backupPolicyPresent: boolean;
    backupValidationPresent: boolean;
    restoreRunbookPresent: boolean;
    disasterRecoveryRunbookPresent: boolean;
    disasterRecoveryTestPresent: boolean;
    seedScriptPresent: boolean;
  };
}

export type PulseBrowserFailureCode =
  | 'ok'
  | 'playwright_missing'
  | 'chromium_launch_blocked'
  | 'frontend_unreachable'
  | 'backend_auth_unreachable';

export interface PulseBrowserPreflight {
  status: PulseBrowserFailureCode;
  detail: string;
  checkedAt: string;
}

export interface PulseFlowResult {
  flowId: string;
  status: 'passed' | 'failed' | 'accepted' | 'missing_evidence' | 'skipped';
  executed: boolean;
  accepted: boolean;
  providerModeUsed?: PulseProviderMode;
  smokeExecuted?: boolean;
  replayExecuted?: boolean;
  failureClass?: PulseGateFailureClass;
  summary: string;
  artifactPaths: string[];
  metrics?: Record<string, string | number | boolean>;
}

export interface PulseInvariantResult {
  invariantId: string;
  status: 'passed' | 'failed' | 'accepted' | 'missing_evidence' | 'skipped';
  evaluated: boolean;
  accepted: boolean;
  failureClass?: PulseGateFailureClass;
  summary: string;
  artifactPaths: string[];
  metrics?: Record<string, string | number | boolean>;
}

export interface PulseBrowserEvidence {
  attempted: boolean;
  executed: boolean;
  artifactPaths: string[];
  summary: string;
  failureCode?: PulseBrowserFailureCode;
  preflight?: PulseBrowserPreflight;
  totalPages?: number;
  totalTested?: number;
  passRate?: number;
  blockingInteractions?: number;
}

export interface PulseFlowEvidence {
  declared: string[];
  executed: string[];
  missing: string[];
  passed: string[];
  failed: string[];
  accepted: string[];
  artifactPaths: string[];
  summary: string;
  results: PulseFlowResult[];
}

export interface PulseInvariantEvidence {
  declared: string[];
  evaluated: string[];
  missing: string[];
  passed: string[];
  failed: string[];
  accepted: string[];
  artifactPaths: string[];
  summary: string;
  results: PulseInvariantResult[];
}

export interface PulseScenarioResult {
  scenarioId: string;
  actorKind: PulseActorKind;
  scenarioKind: PulseScenarioKind;
  critical: boolean;
  requested: boolean;
  runner: PulseScenarioRunner;
  status: 'passed' | 'failed' | 'missing_evidence' | 'checker_gap' | 'skipped';
  executed: boolean;
  providerModeUsed?: PulseProviderMode;
  smokeExecuted?: boolean;
  replayExecuted?: boolean;
  worldStateConverged?: boolean;
  failureClass?: PulseGateFailureClass;
  summary: string;
  artifactPaths: string[];
  specsExecuted: string[];
  durationMs: number;
  worldStateTouches: string[];
  metrics?: Record<string, string | number | boolean>;
  moduleKeys: string[];
  routePatterns: string[];
}

export interface PulseActorEvidence {
  actorKind: 'customer' | 'operator' | 'admin' | 'soak';
  declared: string[];
  executed: string[];
  missing: string[];
  passed: string[];
  failed: string[];
  artifactPaths: string[];
  summary: string;
  results: PulseScenarioResult[];
}

export type PulseSurfaceClassification =
  | 'certified_interaction'
  | 'shared_capability'
  | 'ops_only'
  | 'legacy_shell'
  | 'decorative_only';

export interface PulseSurfaceCoverageEntry {
  route: string;
  group: string;
  moduleKey: string;
  moduleName: string;
  classification: PulseSurfaceClassification;
  covered: boolean;
  actorKinds: PulseActorKind[];
  scenarioIds: string[];
  totalInteractions: number;
  persistedInteractions: number;
}

export interface PulseSyntheticCoverageEvidence {
  executed: boolean;
  artifactPaths: string[];
  summary: string;
  totalPages: number;
  userFacingPages: number;
  coveredPages: number;
  uncoveredPages: string[];
  results: PulseSurfaceCoverageEntry[];
}

export interface PulseWorldStateSession {
  kind: PulseActorKind;
  declaredScenarios: number;
  executedScenarios: number;
  passedScenarios: number;
}

export interface PulseWorldState {
  generatedAt: string;
  backendUrl?: string;
  frontendUrl?: string;
  actorProfiles: string[];
  executedScenarios: string[];
  pendingAsyncExpectations: string[];
  entities: Record<string, string[]>;
  asyncExpectationsStatus: Array<{
    scenarioId: string;
    expectation: string;
    status: 'pending' | 'satisfied';
  }>;
  artifactsByScenario: Record<string, string[]>;
  sessions: PulseWorldStateSession[];
}

export interface PulseExecutionEvidence {
  runtime: PulseRuntimeEvidence;
  browser: PulseBrowserEvidence;
  flows: PulseFlowEvidence;
  invariants: PulseInvariantEvidence;
  observability: PulseObservabilityEvidence;
  recovery: PulseRecoveryEvidence;
  customer: PulseActorEvidence;
  operator: PulseActorEvidence;
  admin: PulseActorEvidence;
  soak: PulseActorEvidence;
  syntheticCoverage: PulseSyntheticCoverageEvidence;
  worldState: PulseWorldState;
}

export interface PulseGateResult {
  status: 'pass' | 'fail';
  reason: string;
  failureClass?: PulseGateFailureClass;
}

export interface PulseCertificationTierStatus {
  id: number;
  name: string;
  status: 'pass' | 'fail';
  gates: PulseGateName[];
  blockingGates: PulseGateName[];
  reason: string;
}

export interface PulseCertificationTarget {
  tier: number | null;
  final: boolean;
}

export interface PulseCertification {
  version: string;
  status: 'CERTIFIED' | 'PARTIAL' | 'NOT_CERTIFIED';
  humanReplacementStatus: 'READY' | 'NOT_READY';
  rawScore: number;
  score: number;
  commitSha: string;
  environment: PulseEnvironment;
  timestamp: string;
  manifestPath: string | null;
  unknownSurfaces: string[];
  unavailableChecks: string[];
  unsupportedStacks: string[];
  criticalFailures: string[];
  gates: Record<PulseGateName, PulseGateResult>;
  truthSummary: PulseCodebaseTruthSummary;
  truthDivergence: PulseTruthDivergence;
  resolvedManifestSummary: PulseResolvedManifestSummary;
  unresolvedModules: string[];
  unresolvedFlows: string[];
  certificationTarget: PulseCertificationTarget;
  tierStatus: PulseCertificationTierStatus[];
  blockingTier: number | null;
  acceptedFlowsRemaining: string[];
  pendingCriticalScenarios: string[];
  finalReadinessCriteria: PulseManifestFinalReadinessCriteria | null;
  evidenceSummary: PulseExecutionEvidence;
  gateEvidence: Partial<Record<PulseGateName, PulseEvidenceRecord[]>>;
}
