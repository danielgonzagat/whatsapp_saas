// PULSE — Live Codebase Nervous System
// Shared type definitions across all modules

// ===== LAYER 1: UI Elements =====
export interface UIElement {
  /** File property. */
  file: string;
  /** Line property. */
  line: number;
  /** Type property. */
  type: 'button' | 'link' | 'toggle' | 'form' | 'input' | 'select' | 'clickable';
  /** Label property. */
  label: string;
  /** Handler property. */
  handler: string | null;
  /** Handler type property. */
  handlerType: 'real' | 'dead' | 'noop' | 'navigation';
  /** Api calls property. */
  apiCalls: string[];
  /** Component property. */
  component: string | null;
}

// ===== LAYER 2: API Calls =====
export interface APICall {
  /** File property. */
  file: string;
  /** Line property. */
  line: number;
  /** Endpoint property. */
  endpoint: string;
  /** Normalized path property. */
  normalizedPath: string;
  /** Method property. */
  method: string;
  /** Call pattern property. */
  callPattern: 'apiFetch' | 'useSWR' | 'fetch' | 'objectApi';
  /** Is proxy property. */
  isProxy: boolean;
  /** Proxy target property. */
  proxyTarget: string | null;
  /** Caller function property. */
  callerFunction: string | null;
}

// ===== LAYER 3: Backend Routes =====
export interface BackendRoute {
  /** File property. */
  file: string;
  /** Line property. */
  line: number;
  /** Controller path property. */
  controllerPath: string;
  /** Method path property. */
  methodPath: string;
  /** Full path property. */
  fullPath: string;
  /** Http method property. */
  httpMethod: string;
  /** Method name property. */
  methodName: string;
  /** Guards property. */
  guards: string[];
  /** Is public property. */
  isPublic: boolean;
  /** Service calls property. */
  serviceCalls: string[];
}

// ===== LAYER 4: Database Models =====
export interface PrismaModel {
  /** Name property. */
  name: string;
  /** Accessor name property. */
  accessorName: string;
  /** Line property. */
  line: number;
  /** Fields property. */
  fields: PrismaField[];
  /** Relations property. */
  relations: PrismaRelation[];
}

/** Prisma field shape. */
export interface PrismaField {
  /** Name property. */
  name: string;
  /** Type property. */
  type: string;
  /** Line property. */
  line: number;
  /** Is optional property. */
  isOptional: boolean;
  /** Is array property. */
  isArray: boolean;
  /** Is id property. */
  isId: boolean;
}

/** Prisma relation shape. */
export interface PrismaRelation {
  /** Field name property. */
  fieldName: string;
  /** Target model property. */
  targetModel: string;
  /** Type property. */
  type: 'one' | 'many';
  /** Line property. */
  line: number;
}

// ===== Service Trace =====
export interface ServiceTrace {
  /** File property. */
  file: string;
  /** Service name property. */
  serviceName: string;
  /** Method name property. */
  methodName: string;
  /** Line property. */
  line: number;
  /** Prisma models property. */
  prismaModels: string[];
}

// ===== Proxy Route =====
export interface ProxyRoute {
  /** File property. */
  file: string;
  /** Line property. */
  line: number;
  /** Frontend path property. */
  frontendPath: string;
  /** Http method property. */
  httpMethod: string;
  /** Backend path property. */
  backendPath: string;
}

// ===== Facade =====
export interface FacadeEntry {
  /** File property. */
  file: string;
  /** Line property. */
  line: number;
  /** Type property. */
  type:
    | 'fake_save'
    | 'hardcoded_data'
    | 'random_data'
    | 'todo_stub'
    | 'noop_handler'
    | 'state_only_toggle'
    | 'silent_catch';
  /** Description property. */
  description: string;
  /** Severity property. */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Evidence property. */
  evidence: string;
}

// ===== Break Types =====
export type BreakType =
  // Layer 1: Cross-layer connectivity (parsers 1-6)
  | 'API_NO_ROUTE'
  | 'ROUTE_NO_CALLER'
  | 'ROUTE_EMPTY'
  | 'MODEL_ORPHAN'
  | 'UI_DEAD_HANDLER'
  | 'FACADE'
  | 'PROXY_NO_UPSTREAM'
  // Certification foundation
  | 'CHECK_UNAVAILABLE'
  | 'MANIFEST_MISSING'
  | 'MANIFEST_INVALID'
  | 'UNKNOWN_SURFACE'
  // Parser 7: Dead Code
  | 'DEAD_EXPORT'
  | 'DEAD_COMPONENT'
  | 'UNUSED_IMPORT'
  // Parser 8: WebSocket
  | 'GATEWAY_NO_CONSUMER'
  | 'EMIT_NO_HANDLER'
  // Parser 9: BullMQ
  | 'QUEUE_NO_PROCESSOR'
  | 'PROCESSOR_NO_PRODUCER'
  | 'QUEUE_NAME_MISMATCH'
  // Parser 10: Guards
  | 'ROUTE_NO_AUTH'
  | 'MISSING_WORKSPACE_FILTER'
  | 'FINANCIAL_NO_RATE_LIMIT'
  // Parser 11: DTOs
  | 'ROUTE_NO_DTO'
  | 'DTO_NO_VALIDATION'
  | 'FINANCIAL_FIELD_NO_VALIDATION'
  // Parser 12: Env
  | 'ENV_NOT_DOCUMENTED'
  | 'ENV_NO_FALLBACK'
  | 'HARDCODED_SECRET'
  // Parser 13: Error Handling
  | 'EMPTY_CATCH'
  | 'FINANCIAL_ERROR_SWALLOWED'
  | 'UNHANDLED_PROMISE'
  // Parser 14: Type Contracts
  | 'TYPE_MISMATCH'
  | 'UNSAFE_ANY_CAST'
  | 'PRISMA_ANY_ACCESS'
  // Parser 15: Console
  | 'CONSOLE_IN_PRODUCTION'
  | 'UNRESOLVED_TODO'
  // Parser 16: Middleware
  | 'CORS_PERMISSIVE'
  | 'VALIDATION_PIPE_MISSING'
  // Parser 17: Prisma Safety
  | 'DANGEROUS_DELETE'
  | 'SQL_INJECTION_RISK'
  | 'FINANCIAL_NO_TRANSACTION'
  | 'MULTI_MUTATION_NO_TRANSACTION'
  | 'TRANSACTION_NO_ISOLATION'
  | 'RELATION_NO_CASCADE'
  | 'FINDMANY_NO_PAGINATION'
  // Parser 18: Performance
  | 'N_PLUS_ONE_QUERY'
  | 'UNBOUNDED_QUERY'
  | 'MEMORY_LEAK_RISK'
  // Parser 19: Circular
  | 'CIRCULAR_IMPORT'
  | 'CIRCULAR_MODULE_DEPENDENCY'
  // Parser 20: NestJS Modules
  | 'SERVICE_NOT_PROVIDED'
  | 'CONTROLLER_NOT_REGISTERED'
  | 'MODULE_EXPORT_MISSING'
  // Parser 21: Duplicates
  | 'DUPLICATE_ROUTE'
  | 'ROUTE_ORDER_CONFLICT'
  // Parser 22: Orphaned Files
  | 'ORPHANED_FILE'
  | 'PAGE_NO_NAVIGATION'
  // Parser 23: Cron
  | 'CRON_NO_HANDLER'
  | 'CRON_NO_ERROR_HANDLING'
  // Parser 24: Redis
  | 'REDIS_KEY_ORPHANED'
  | 'REDIS_KEY_MISSING'
  | 'REDIS_NO_TTL'
  // Parser 25: Frontend Protection
  | 'FRONTEND_ROUTE_UNPROTECTED'
  | 'CHECKOUT_NO_VALIDATION'
  // Parser 26: API Response
  | 'RESPONSE_INCONSISTENT'
  | 'WRONG_STATUS_CODE'
  | 'ERROR_FORMAT_INCONSISTENT'
  // Parser 27: Async
  | 'MISSING_AWAIT'
  | 'FLOATING_PROMISE'
  // Parser 28: Assets
  | 'MISSING_ASSET'
  | 'FONT_NOT_LOADED'
  // Parser 29: Financial Arithmetic
  | 'TOFIX_WITHOUT_PARSE'
  | 'DIVISION_BY_ZERO_RISK'
  | 'UNSAFE_FLOAT_COMPARISON'
  | 'CURRENCY_UNIT_MISMATCH'
  // Parser 30: Locale
  | 'LOCALE_INCONSISTENT'
  | 'DATE_NO_LOCALE'
  // Parser 31: JSON.parse
  | 'JSON_PARSE_UNSAFE'
  | 'STRINGIFY_CIRCULAR_RISK'
  // Parser 32: HTTP Timeout
  | 'FETCH_NO_TIMEOUT'
  | 'AXIOS_NO_TIMEOUT'
  // Parser 33: Cookie/CSRF
  | 'COOKIE_NOT_HTTPONLY'
  | 'COOKIE_NOT_SECURE'
  | 'COOKIE_NO_SAMESITE'
  | 'CSRF_UNPROTECTED'
  // Parser 34: Sensitive Data
  | 'SENSITIVE_DATA_IN_LOG'
  | 'INTERNAL_ERROR_EXPOSED'
  | 'REQUEST_BODY_LOGGED'
  // Parser 35: Next.js
  | 'NEXTJS_NO_IMAGE_COMPONENT'
  | 'NEXTJS_MISSING_USE_CLIENT'
  | 'NEXTJS_FETCH_NO_CACHE'
  | 'SSR_UNSAFE_ACCESS'
  | 'UPLOAD_NO_VALIDATION'
  // Parser 36: Interval Cleanup
  | 'INTERVAL_NO_CLEANUP'
  | 'TIMEOUT_NO_CLEANUP'
  // Parser 37: Hardcoded URLs
  | 'HARDCODED_INTERNAL_URL'
  | 'HARDCODED_PROD_URL'
  // Parser 38: Code Injection
  | 'EVAL_USAGE'
  | 'DYNAMIC_REQUIRE_RISK'
  | 'XSS_DANGEROUS_HTML'
  | 'DEPRECATED_EXEC_COMMAND'
  // Parser 39: Worker Resilience
  | 'JOB_NO_RETRY'
  | 'PROCESSOR_NO_ERROR_HANDLING'
  | 'JOB_SILENTLY_DISCARDED'
  | 'PUPPETEER_PAGE_LEAK'
  | 'PUPPETEER_NO_TIMEOUT'
  | 'PUPPETEER_NO_ERROR_RECOVERY'
  // Parser 40: Infra Config
  | 'DOCKER_NO_MULTISTAGE'
  | 'DOCKER_MISSING_IGNORE'
  | 'DOCKER_BUILD_FAILS'
  | 'PACKAGE_VERSION_CONFLICT'
  | 'NEXTJS_EXPERIMENTAL_RISK'
  | 'PRISMA_MISSING_INDEX'
  // Runtime parsers (41+) — future
  | 'BUILD_FRONTEND_FAILS'
  | 'BUILD_BACKEND_FAILS'
  | 'BUILD_WORKER_FAILS'
  | 'TEST_FAILURE'
  | 'LINT_VIOLATION'
  // Parser 74: Backup
  | 'BACKUP_MISSING'
  // Parser 75: Compliance
  | 'LGPD_NON_COMPLIANT'
  // Parser 76: Test Coverage
  | 'COVERAGE_FINANCIAL_LOW'
  | 'COVERAGE_CORE_LOW'
  // Parser 77: Test Quality
  | 'TEST_NO_ASSERTION'
  // Parser 78: E2E Coverage
  | 'E2E_FLOW_NOT_TESTED'
  // Parser 79: npm audit
  | 'DEPENDENCY_VULNERABLE'
  // Parser 80: License
  | 'LICENSE_INCOMPATIBLE'
  | 'LICENSE_UNKNOWN'
  // Parser 81: Chaos — Dependency Failure
  | 'CHAOS_REDIS_CRASH'
  | 'CHAOS_DB_CRASH'
  | 'CHAOS_JOB_LOST'
  | 'CHAOS_EXTERNAL_HANG'
  // Parser 82: Chaos — Third Party
  | 'CHAOS_STRIPE_NO_FALLBACK'
  | 'CHAOS_LLM_NO_FALLBACK'
  | 'CHAOS_WHATSAPP_MSG_LOST'
  // Parser 46: CRUD Tester
  | 'CRUD_BROKEN'
  | 'VALIDATION_BYPASSED'
  // Parser 59: Performance Query Profiler
  | 'SLOW_QUERY'
  | 'UNBOUNDED_RESULT'
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
  | 'STATE_INVALID_TRANSITION'
  | 'STATE_PAYMENT_INVALID'
  // Parser 84: Concurrency
  | 'RACE_CONDITION_DATA_CORRUPTION'
  | 'RACE_CONDITION_FINANCIAL'
  | 'RACE_CONDITION_OVERWRITE'
  // Parser 85: Ordering / Timing
  | 'ORDERING_WEBHOOK_OOO'
  | 'CLOCK_SKEW_TOO_STRICT'
  | 'TIMEZONE_REPORT_MISMATCH'
  // Parser 86: Cache Invalidation
  | 'CACHE_STALE_AFTER_WRITE'
  | 'CACHE_REDIS_STALE'
  // Parser 87: Edge Cases
  | 'EDGE_CASE_PAGINATION'
  | 'EDGE_CASE_STRING'
  | 'EDGE_CASE_NUMBER'
  | 'EDGE_CASE_DATE'
  | 'EDGE_CASE_FILE'
  | 'EDGE_CASE_ARRAY'
  // Parser 88: Observability
  | 'OBSERVABILITY_NO_TRACING'
  | 'OBSERVABILITY_NO_ALERTING'
  // Parser 89: Audit Trail
  | 'AUDIT_FINANCIAL_NO_TRAIL'
  | 'AUDIT_DELETION_NO_LOG'
  | 'AUDIT_ADMIN_NO_LOG'
  // Parser 90: Deploy / Rollback
  | 'DEPLOY_NO_ROLLBACK'
  | 'MIGRATION_NO_ROLLBACK'
  | 'DEPLOY_NO_FEATURE_FLAGS'
  // Parser 91: Cost Limits
  | 'COST_LLM_NO_LIMIT'
  | 'COST_STORAGE_NO_LIMIT'
  | 'COST_NO_TRACKING'
  // Parser 92: Communication
  | 'EMAIL_NO_AUTH'
  | 'PUSH_NOT_IMPLEMENTED'
  | 'NOTIFICATION_SALE_MISSING'
  // Parser 93: Browser / Network
  | 'BROWSER_INCOMPATIBLE'
  | 'NETWORK_SLOW_UNUSABLE'
  | 'NETWORK_OFFLINE_DATA_LOST'
  // Parser 94: Idempotency
  | 'IDEMPOTENCY_MISSING'
  | 'IDEMPOTENCY_FINANCIAL'
  | 'IDEMPOTENCY_JOB'
  // Parser 95: Disaster Recovery
  | 'DR_BACKUP_INCOMPLETE'
  | 'DR_RPO_TOO_HIGH'
  | 'DR_NO_RUNBOOK'
  | 'DR_CANNOT_REBUILD'
  // Parser 96: Business Rules
  | 'BUSINESS_COMMISSION_MATH'
  | 'BUSINESS_COUPON_INVALID'
  | 'BUSINESS_BILLING_WRONG'
  | 'BUSINESS_PLAN_LIMIT_BYPASS'
  | 'BUSINESS_SPLIT_ROUNDING'
  // Parser 97: DB Internals
  | 'DB_DEADLOCK_POSSIBLE'
  | 'DB_POOL_EXHAUSTION_HANG'
  | 'DB_CONNECTION_LEAK'
  // Parser 98: Node.js Internals
  | 'NODEJS_EVENT_LOOP_BLOCKED'
  | 'NODEJS_BACKPRESSURE_MISSING'
  | 'NODEJS_NO_REJECTION_HANDLER'
  // Parser 99: Crypto
  | 'CRYPTO_WEAK_HASH'
  | 'CRYPTO_WEAK_RANDOM'
  | 'CRYPTO_SENSITIVE_PLAINTEXT'
  | 'CRYPTO_TIMING_ATTACK'
  // Parser 100: Supply Chain
  | 'SUPPLY_CHAIN_CONFUSION_RISK'
  | 'SUPPLY_CHAIN_NO_LOCKFILE'
  // Parser 101: Multi-tenancy Deep
  | 'TENANT_CACHE_SHARED'
  | 'TENANT_LOG_LEAKAGE'
  | 'TENANT_FILE_LEAKAGE'
  // Parser 102: API Versioning
  | 'API_BREAKING_CHANGE'
  | 'API_NOT_BACKWARD_COMPATIBLE'
  // Parser 103: Unicode Deep
  | 'UNICODE_NORMALIZATION_BUG'
  | 'UNICODE_EMOJI_TRUNCATION'
  | 'UNICODE_NUMBER_FORMAT'
  // Runtime parsers 44-67: Integration Testing (DEEP mode)
  | 'API_CONTRACT_VIOLATION'
  | 'API_ERROR_LEAKS'
  | 'AUTH_FLOW_BROKEN'
  | 'TOKEN_REFRESH_BROKEN'
  | 'WORKSPACE_ISOLATION_BROKEN'
  | 'AUTH_BYPASS_VULNERABLE'
  | 'SLOW_ENDPOINT'
  | 'VERY_SLOW_ENDPOINT'
  | 'PAGE_RENDER_BROKEN'
  | 'DATA_ORPHANED_RECORD'
  | 'DATA_WALLET_INCONSISTENT'
  | 'DATA_WORKSPACE_NO_OWNER'
  | 'DATA_PRODUCT_NO_PLAN'
  | 'DATA_ORDER_NO_PAYMENT'
  // Parser 53-62: Security Deep + Schema Drift (DEEP mode runtime probes)
  | 'CROSS_WORKSPACE_ACCESS'
  | 'INJECTION_VULNERABLE'
  | 'XSS_STORED_VULNERABLE'
  | 'BRUTE_FORCE_VULNERABLE'
  | 'RATE_LIMIT_MISSING'
  | 'SCHEMA_TABLE_MISSING'
  | 'SCHEMA_COLUMN_MISSING'
  | 'SCHEMA_TYPE_MISMATCH'
  // Parser 71: CI/CD Checker (static)
  | 'CICD_INCOMPLETE'
  // Parser 73: Monitoring Coverage (static)
  | 'MONITORING_MISSING'
  // Parser 64: AI Prompt Verifier (static)
  | 'AI_PROMPT_INCOMPLETE'
  // Parser 104: Anti-Hardcode Contract
  | 'AI_PSEUDO_THINKING_HARDCODED'
  // Parser 105: Visual Design Contract
  | 'VISUAL_CONTRACT_FONT_BELOW_MIN'
  | 'VISUAL_CONTRACT_HEX_OUTSIDE_TOKENS'
  | 'VISUAL_CONTRACT_EMOJI_UI'
  | 'VISUAL_CONTRACT_GENERIC_SPINNER'
  // Parsers 47-52: E2E Flow Tests (DEEP mode)
  | 'WEBHOOK_STRIPE_BROKEN'
  | 'WEBHOOK_NOT_IDEMPOTENT'
  | 'WEBHOOK_NO_SIGNATURE_CHECK'
  | 'E2E_REGISTRATION_BROKEN'
  | 'E2E_PRODUCT_BROKEN'
  | 'E2E_PAYMENT_BROKEN'
  | 'E2E_AI_CONFIG_MISSING'
  | 'E2E_RACE_CONDITION_WITHDRAWAL';

// ===== Graph =====
export interface Break {
  /** Type property. */
  type: BreakType;
  /** Severity property. */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** File property. */
  file: string;
  /** Line property. */
  line: number;
  /** Description property. */
  description: string;
  /** Detail property. */
  detail: string;
  /** Source property. */
  source?: string;
  /** Surface property. */
  surface?: string;
}

/** Pulse health shape. */
export interface PulseHealth {
  /** Score property. */
  score: number;
  /** Total nodes property. */
  totalNodes: number;
  /** Breaks property. */
  breaks: Break[];
  /** Stats property. */
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
  /** Timestamp property. */
  timestamp: string;
}

// ===== Config =====
export interface PulseConfig {
  /** Root dir property. */
  rootDir: string;
  /** Frontend dir property. */
  frontendDir: string;
  /** Backend dir property. */
  backendDir: string;
  /** Worker dir property. */
  workerDir: string;
  /** Schema path property. */
  schemaPath: string;
  /** Global prefix property. */
  globalPrefix: string;
  /** Certification profile property. */
  certificationProfile?: PulseCertificationProfile | null;
}

// ===== Certification =====
export type PulseModuleState =
  | 'READY'
  | 'PARTIAL'
  | 'SHELL_ONLY'
  | 'MOCKED'
  | 'BROKEN'
  | 'INTERNAL';

/** Pulse manifest module shape. */
export interface PulseManifestModule {
  /** Name property. */
  name: string;
  /** State property. */
  state: PulseModuleState;
  /** Notes property. */
  notes: string;
  /** Critical property. */
  critical?: boolean;
}

/** Pulse environment type. */
export type PulseEnvironment = 'scan' | 'deep' | 'total';
/** Pulse certification profile type. */
export type PulseCertificationProfile = 'core-critical' | 'full-product';
/** Pulse flow runner type. */
export type PulseFlowRunner = 'runtime-e2e' | 'browser-stress' | 'hybrid';
/** Pulse flow oracle type. */
export type PulseFlowOracle =
  | 'auth-session'
  | 'entity-persisted'
  | 'payment-lifecycle'
  | 'wallet-ledger'
  | 'conversation-persisted';

/** Pulse actor kind type. */
export type PulseActorKind = 'customer' | 'operator' | 'admin' | 'system';
/** Pulse scenario kind type. */
export type PulseScenarioKind =
  | 'single-session'
  | 'multi-session'
  | 'multi-actor'
  | 'long-lived'
  | 'async-reconciled';
/** Pulse scenario runner type. */
export type PulseScenarioRunner = 'playwright-spec' | 'derived';
/** Pulse scenario execution mode type. */
export type PulseScenarioExecutionMode = 'real' | 'derived' | 'mapping';
/** Pulse provider mode type. */
export type PulseProviderMode = 'replay' | 'sandbox' | 'real_smoke' | 'hybrid';
/** Pulse time window mode type. */
export type PulseTimeWindowMode = 'total' | 'shift' | 'soak';

/** Pulse actor profile shape. */
export interface PulseActorProfile {
  /** Id property. */
  id: string;
  /** Kind property. */
  kind: PulseActorKind;
  /** Description property. */
  description: string;
  /** Module focus property. */
  moduleFocus: string[];
  /** Default time window modes property. */
  defaultTimeWindowModes: PulseTimeWindowMode[];
}

/** Pulse manifest scenario spec shape. */
export interface PulseManifestScenarioSpec {
  /** Id property. */
  id: string;
  /** Actor kind property. */
  actorKind: PulseActorKind;
  /** Scenario kind property. */
  scenarioKind: PulseScenarioKind;
  /** Critical property. */
  critical: boolean;
  /** Module keys property. */
  moduleKeys: string[];
  /** Route patterns property. */
  routePatterns: string[];
  /** Flow specs property. */
  flowSpecs: string[];
  /** Flow groups property. */
  flowGroups: string[];
  /** Playwright specs property. */
  playwrightSpecs: string[];
  /** Runtime probes property. */
  runtimeProbes: string[];
  /** Requires browser property. */
  requiresBrowser: boolean;
  /** Requires persistence property. */
  requiresPersistence: boolean;
  /** Async expectations property. */
  asyncExpectations: string[];
  /** Provider mode property. */
  providerMode: PulseProviderMode;
  /** Time window modes property. */
  timeWindowModes: PulseTimeWindowMode[];
  /** Runner property. */
  runner: PulseScenarioRunner;
  /** Execution mode property. */
  executionMode: PulseScenarioExecutionMode;
  /** World state keys property. */
  worldStateKeys: string[];
  /** Required artifacts property. */
  requiredArtifacts: string[];
  /** Notes property. */
  notes: string;
}

/** Pulse manifest flow spec shape. */
export interface PulseManifestFlowSpec {
  /** Id property. */
  id: string;
  /** Surface property. */
  surface: string;
  /** Runner property. */
  runner: PulseFlowRunner;
  /** Oracle property. */
  oracle: PulseFlowOracle;
  /** Provider mode property. */
  providerMode: PulseProviderMode;
  /** Smoke required property. */
  smokeRequired: boolean;
  /** Critical property. */
  critical: boolean;
  /** Preconditions property. */
  preconditions: string[];
  /** Environments property. */
  environments: PulseEnvironment[];
  /** Notes property. */
  notes: string;
}

/** Pulse invariant source type. */
export type PulseInvariantSource = 'static' | 'runtime' | 'hybrid';
/** Pulse invariant evaluator type. */
export type PulseInvariantEvaluator =
  | 'workspace-isolation'
  | 'financial-audit-trail'
  | 'payment-idempotency'
  | 'wallet-balance-consistency';

/** Pulse manifest invariant spec shape. */
export interface PulseManifestInvariantSpec {
  /** Id property. */
  id: string;
  /** Surface property. */
  surface: string;
  /** Source property. */
  source: PulseInvariantSource;
  /** Evaluator property. */
  evaluator: PulseInvariantEvaluator;
  /** Critical property. */
  critical: boolean;
  /** Depends on property. */
  dependsOn: string[];
  /** Environments property. */
  environments: PulseEnvironment[];
  /** Notes property. */
  notes: string;
}

/** Pulse temporary acceptance target type type. */
export type PulseTemporaryAcceptanceTargetType =
  | 'gate'
  | 'break_type'
  | 'surface'
  | 'flow'
  | 'invariant';

/** Pulse temporary acceptance shape. */
export interface PulseTemporaryAcceptance {
  /** Id property. */
  id: string;
  /** Target type property. */
  targetType: PulseTemporaryAcceptanceTargetType;
  /** Target property. */
  target: string;
  /** Reason property. */
  reason: string;
  /** Expires at property. */
  expiresAt: string;
}

/** Pulse manifest overrides shape. */
export interface PulseManifestOverrides {
  /** Excluded modules property. */
  excludedModules?: string[];
  /** Critical modules property. */
  criticalModules?: string[];
  /** Internal modules property. */
  internalModules?: string[];
  /** Module aliases property. */
  moduleAliases?: Record<string, string>;
  /** Flow aliases property. */
  flowAliases?: Record<string, string>;
  /** Excluded flow candidates property. */
  excludedFlowCandidates?: string[];
}

/** Pulse manifest certification tier shape. */
export interface PulseManifestCertificationTier {
  /** Id property. */
  id: number;
  /** Name property. */
  name: string;
  /** Gates property. */
  gates: PulseGateName[];
  /** Require no accepted flows property. */
  requireNoAcceptedFlows?: boolean;
  /** Require no accepted scenarios property. */
  requireNoAcceptedScenarios?: boolean;
  /** Require world state convergence property. */
  requireWorldStateConvergence?: boolean;
}

/** Pulse manifest final readiness criteria shape. */
export interface PulseManifestFinalReadinessCriteria {
  /** Require all tiers pass property. */
  requireAllTiersPass: boolean;
  /** Require no accepted critical flows property. */
  requireNoAcceptedCriticalFlows: boolean;
  /** Require no accepted critical scenarios property. */
  requireNoAcceptedCriticalScenarios: boolean;
  /** Require world state convergence property. */
  requireWorldStateConvergence: boolean;
}

/** Pulse manifest shape. */
export interface PulseManifest {
  /** Version property. */
  version: number;
  /** Project id property. */
  projectId: string;
  /** Project name property. */
  projectName: string;
  /** System type property. */
  systemType: string;
  /** Supported stacks property. */
  supportedStacks: string[];
  /** Surfaces property. */
  surfaces: string[];
  /** Critical domains property. */
  criticalDomains: string[];
  /** Modules property. */
  modules: PulseManifestModule[];
  /** Legacy modules property. */
  legacyModules?: PulseManifestModule[];
  /** Actor profiles property. */
  actorProfiles: PulseActorProfile[];
  /** Scenario specs property. */
  scenarioSpecs: PulseManifestScenarioSpec[];
  /** External integrations property. */
  externalIntegrations: string[];
  /** Jobs property. */
  jobs: string[];
  /** Webhooks property. */
  webhooks: string[];
  /** State machines property. */
  stateMachines: string[];
  /** Critical flows property. */
  criticalFlows: string[];
  /** Invariants property. */
  invariants: string[];
  /** Flow specs property. */
  flowSpecs: PulseManifestFlowSpec[];
  /** Invariant specs property. */
  invariantSpecs: PulseManifestInvariantSpec[];
  /** Temporary acceptances property. */
  temporaryAcceptances: PulseTemporaryAcceptance[];
  /** Certification tiers property. */
  certificationTiers: PulseManifestCertificationTier[];
  /** Final readiness criteria property. */
  finalReadinessCriteria: PulseManifestFinalReadinessCriteria;
  /** Slos property. */
  slos: Record<string, number | string>;
  /** Security requirements property. */
  securityRequirements: string[];
  /** Recovery requirements property. */
  recoveryRequirements: string[];
  /** Excluded surfaces property. */
  excludedSurfaces: string[];
  /** Environments property. */
  environments: PulseEnvironment[];
  /** Evidence ttl hours property. */
  evidenceTtlHours?: number;
  /** Adapter config property. */
  adapterConfig?: Record<string, unknown>;
  /** Overrides property. */
  overrides?: PulseManifestOverrides;
}

/** Pulse shell complexity type. */
export type PulseShellComplexity = 'light' | 'medium' | 'rich';

/** Pulse truth page summary shape. */
export interface PulseTruthPageSummary {
  /** Route property. */
  route: string;
  /** Group property. */
  group: string;
  /** Module key property. */
  moduleKey: string;
  /** Module name property. */
  moduleName: string;
  /** Shell complexity property. */
  shellComplexity: PulseShellComplexity;
  /** Total interactions property. */
  totalInteractions: number;
  /** Functioning interactions property. */
  functioningInteractions: number;
  /** Facade interactions property. */
  facadeInteractions: number;
  /** Broken interactions property. */
  brokenInteractions: number;
  /** Incomplete interactions property. */
  incompleteInteractions: number;
  /** Absent interactions property. */
  absentInteractions: number;
  /** Api bound interactions property. */
  apiBoundInteractions: number;
  /** Backend bound interactions property. */
  backendBoundInteractions: number;
  /** Persisted interactions property. */
  persistedInteractions: number;
  /** Total data sources property. */
  totalDataSources: number;
  /** Backed data sources property. */
  backedDataSources: number;
}

/** Pulse discovered module shape. */
export interface PulseDiscoveredModule {
  /** Key property. */
  key: string;
  /** Name property. */
  name: string;
  /** Route roots property. */
  routeRoots: string[];
  /** Groups property. */
  groups: string[];
  /** User facing property. */
  userFacing: boolean;
  /** Shell complexity property. */
  shellComplexity: PulseShellComplexity;
  /** Page count property. */
  pageCount: number;
  /** Total interactions property. */
  totalInteractions: number;
  /** Functioning interactions property. */
  functioningInteractions: number;
  /** Facade interactions property. */
  facadeInteractions: number;
  /** Broken interactions property. */
  brokenInteractions: number;
  /** Incomplete interactions property. */
  incompleteInteractions: number;
  /** Absent interactions property. */
  absentInteractions: number;
  /** Api bound interactions property. */
  apiBoundInteractions: number;
  /** Backend bound interactions property. */
  backendBoundInteractions: number;
  /** Persisted interactions property. */
  persistedInteractions: number;
  /** Total data sources property. */
  totalDataSources: number;
  /** Backed data sources property. */
  backedDataSources: number;
  /** State property. */
  state: PulseModuleState;
  /** Declared module property. */
  declaredModule: string | null;
  /** Notes property. */
  notes: string;
}

/** Pulse discovered flow candidate shape. */
export interface PulseDiscoveredFlowCandidate {
  /** Id property. */
  id: string;
  /** Module key property. */
  moduleKey: string;
  /** Module name property. */
  moduleName: string;
  /** Page route property. */
  pageRoute: string;
  /** Element label property. */
  elementLabel: string;
  /** Http method property. */
  httpMethod: string;
  /** Endpoint property. */
  endpoint: string;
  /** Backend route property. */
  backendRoute: string | null;
  /** Connected property. */
  connected: boolean;
  /** Persistent property. */
  persistent: boolean;
  /** Declared flow property. */
  declaredFlow: string | null;
}

/** Pulse truth divergence shape. */
export interface PulseTruthDivergence {
  /** Declared not discovered property. */
  declaredNotDiscovered: string[];
  /** Discovered not declared property. */
  discoveredNotDeclared: string[];
  /** Declared but internal property. */
  declaredButInternal: string[];
  /** Frontend surface without backend support property. */
  frontendSurfaceWithoutBackendSupport: string[];
  /** Backend capability without frontend surface property. */
  backendCapabilityWithoutFrontendSurface: string[];
  /** Shell without persistence property. */
  shellWithoutPersistence: string[];
  /** Flow candidates without oracle property. */
  flowCandidatesWithoutOracle: string[];
  /** Blocker count property. */
  blockerCount: number;
  /** Warning count property. */
  warningCount: number;
}

/** Pulse codebase truth summary shape. */
export interface PulseCodebaseTruthSummary {
  /** Total pages property. */
  totalPages: number;
  /** User facing pages property. */
  userFacingPages: number;
  /** Discovered modules property. */
  discoveredModules: number;
  /** Discovered flows property. */
  discoveredFlows: number;
  /** Blocker count property. */
  blockerCount: number;
  /** Warning count property. */
  warningCount: number;
}

/** Pulse codebase truth shape. */
export interface PulseCodebaseTruth {
  /** Generated at property. */
  generatedAt: string;
  /** Summary property. */
  summary: PulseCodebaseTruthSummary;
  /** Pages property. */
  pages: PulseTruthPageSummary[];
  /** Discovered modules property. */
  discoveredModules: PulseDiscoveredModule[];
  /** Discovered flows property. */
  discoveredFlows: PulseDiscoveredFlowCandidate[];
  /** Divergence property. */
  divergence: PulseTruthDivergence;
}

/** Pulse resolved module resolution type. */
export type PulseResolvedModuleResolution = 'matched' | 'derived' | 'excluded';
/** Pulse resolved module kind type. */
export type PulseResolvedModuleKind = 'user_facing' | 'internal' | 'shared' | 'legacy';

/** Pulse resolved module shape. */
export interface PulseResolvedModule {
  /** Key property. */
  key: string;
  /** Name property. */
  name: string;
  /** Canonical name property. */
  canonicalName: string;
  /** Aliases property. */
  aliases: string[];
  /** Route roots property. */
  routeRoots: string[];
  /** Groups property. */
  groups: string[];
  /** Module kind property. */
  moduleKind: PulseResolvedModuleKind;
  /** User facing property. */
  userFacing: boolean;
  /** Shell complexity property. */
  shellComplexity: PulseShellComplexity;
  /** State property. */
  state: PulseModuleState;
  /** Critical property. */
  critical: boolean;
  /** Resolution property. */
  resolution: PulseResolvedModuleResolution;
  /** Source module property. */
  sourceModule: string | null;
  /** Legacy source property. */
  legacySource: string | null;
  /** Page count property. */
  pageCount: number;
  /** Total interactions property. */
  totalInteractions: number;
  /** Backend bound interactions property. */
  backendBoundInteractions: number;
  /** Persisted interactions property. */
  persistedInteractions: number;
  /** Backed data sources property. */
  backedDataSources: number;
  /** Notes property. */
  notes: string;
}

/** Pulse resolved flow resolution type. */
export type PulseResolvedFlowResolution =
  | 'matched'
  | 'accepted'
  | 'grouped'
  | 'candidate'
  | 'excluded';
/** Pulse resolved flow kind type. */
export type PulseResolvedFlowKind =
  | 'feature_flow'
  | 'shared_capability'
  | 'ops_internal'
  | 'legacy_noise';

/** Pulse resolved flow group shape. */
export interface PulseResolvedFlowGroup {
  /** Id property. */
  id: string;
  /** Canonical name property. */
  canonicalName: string;
  /** Aliases property. */
  aliases: string[];
  /** Flow kind property. */
  flowKind: PulseResolvedFlowKind;
  /** Module key property. */
  moduleKey: string;
  /** Module name property. */
  moduleName: string;
  /** Module keys property. */
  moduleKeys: string[];
  /** Module names property. */
  moduleNames: string[];
  /** Page routes property. */
  pageRoutes: string[];
  /** Actions property. */
  actions: string[];
  /** Endpoints property. */
  endpoints: string[];
  /** Backend routes property. */
  backendRoutes: string[];
  /** Connected property. */
  connected: boolean;
  /** Persistent property. */
  persistent: boolean;
  /** Member count property. */
  memberCount: number;
  /** Critical property. */
  critical: boolean;
  /** Resolution property. */
  resolution: PulseResolvedFlowResolution;
  /** Matched flow spec property. */
  matchedFlowSpec: string | null;
  /** Notes property. */
  notes: string;
}

/** Pulse resolved manifest diagnostics shape. */
export interface PulseResolvedManifestDiagnostics {
  /** Unresolved modules property. */
  unresolvedModules: string[];
  /** Orphan manual modules property. */
  orphanManualModules: string[];
  /** Unresolved flow groups property. */
  unresolvedFlowGroups: string[];
  /** Orphan flow specs property. */
  orphanFlowSpecs: string[];
  /** Excluded modules property. */
  excludedModules: string[];
  /** Excluded flow groups property. */
  excludedFlowGroups: string[];
  /** Legacy manual modules property. */
  legacyManualModules: string[];
  /** Grouped flow groups property. */
  groupedFlowGroups: string[];
  /** Shared capability groups property. */
  sharedCapabilityGroups: string[];
  /** Ops internal flow groups property. */
  opsInternalFlowGroups: string[];
  /** Legacy noise flow groups property. */
  legacyNoiseFlowGroups: string[];
  /** Blocker count property. */
  blockerCount: number;
  /** Warning count property. */
  warningCount: number;
}

/** Pulse resolved manifest summary shape. */
export interface PulseResolvedManifestSummary {
  /** Total modules property. */
  totalModules: number;
  /** Resolved modules property. */
  resolvedModules: number;
  /** Unresolved modules property. */
  unresolvedModules: number;
  /** Total flow groups property. */
  totalFlowGroups: number;
  /** Resolved flow groups property. */
  resolvedFlowGroups: number;
  /** Unresolved flow groups property. */
  unresolvedFlowGroups: number;
  /** Orphan manual modules property. */
  orphanManualModules: number;
  /** Orphan flow specs property. */
  orphanFlowSpecs: number;
  /** Excluded modules property. */
  excludedModules: number;
  /** Excluded flow groups property. */
  excludedFlowGroups: number;
  /** Grouped flow groups property. */
  groupedFlowGroups: number;
  /** Shared capability groups property. */
  sharedCapabilityGroups: number;
  /** Ops internal flow groups property. */
  opsInternalFlowGroups: number;
  /** Legacy noise flow groups property. */
  legacyNoiseFlowGroups: number;
  /** Legacy manual modules property. */
  legacyManualModules: number;
}

/** Pulse resolved manifest shape. */
export interface PulseResolvedManifest {
  /** Generated at property. */
  generatedAt: string;
  /** Source manifest path property. */
  sourceManifestPath: string | null;
  /** Project id property. */
  projectId: string;
  /** Project name property. */
  projectName: string;
  /** System type property. */
  systemType: string;
  /** Supported stacks property. */
  supportedStacks: string[];
  /** Surfaces property. */
  surfaces: string[];
  /** Critical domains property. */
  criticalDomains: string[];
  /** Modules property. */
  modules: PulseResolvedModule[];
  /** Flow groups property. */
  flowGroups: PulseResolvedFlowGroup[];
  /** Actor profiles property. */
  actorProfiles: PulseActorProfile[];
  /** Scenario specs property. */
  scenarioSpecs: PulseManifestScenarioSpec[];
  /** Flow specs property. */
  flowSpecs: PulseManifestFlowSpec[];
  /** Invariant specs property. */
  invariantSpecs: PulseManifestInvariantSpec[];
  /** Temporary acceptances property. */
  temporaryAcceptances: PulseTemporaryAcceptance[];
  /** Certification tiers property. */
  certificationTiers: PulseManifestCertificationTier[];
  /** Final readiness criteria property. */
  finalReadinessCriteria: PulseManifestFinalReadinessCriteria;
  /** Security requirements property. */
  securityRequirements: string[];
  /** Recovery requirements property. */
  recoveryRequirements: string[];
  /** Slos property. */
  slos: Record<string, number | string>;
  /** Summary property. */
  summary: PulseResolvedManifestSummary;
  /** Diagnostics property. */
  diagnostics: PulseResolvedManifestDiagnostics;
}

/** Pulse manifest load result shape. */
export interface PulseManifestLoadResult {
  /** Manifest property. */
  manifest: PulseManifest | null;
  /** Manifest path property. */
  manifestPath: string | null;
  /** Issues property. */
  issues: Break[];
  /** Unknown surfaces property. */
  unknownSurfaces: string[];
  /** Unsupported stacks property. */
  unsupportedStacks: string[];
}

/** Pulse parser unavailable shape. */
export interface PulseParserUnavailable {
  /** Name property. */
  name: string;
  /** File property. */
  file: string;
  /** Reason property. */
  reason: string;
}

/** Pulse parser definition shape. */
export interface PulseParserDefinition {
  /** Name property. */
  name: string;
  /** File property. */
  file: string;
  /** Fn property. */
  fn: (config: PulseConfig) => Break[] | Promise<Break[]>;
}

/** Pulse parser inventory shape. */
export interface PulseParserInventory {
  /** Discovered checks property. */
  discoveredChecks: string[];
  /** Loaded checks property. */
  loadedChecks: PulseParserDefinition[];
  /** Unavailable checks property. */
  unavailableChecks: PulseParserUnavailable[];
  /** Helper files skipped property. */
  helperFilesSkipped: string[];
}

/** Pulse execution phase status type. */
export type PulseExecutionPhaseStatus = 'running' | 'passed' | 'failed' | 'timed_out' | 'skipped';

/** Pulse execution phase shape. */
export interface PulseExecutionPhase {
  /** Phase property. */
  phase: string;
  /** Phase status property. */
  phaseStatus: PulseExecutionPhaseStatus;
  /** Started at property. */
  startedAt: string;
  /** Finished at property. */
  finishedAt?: string;
  /** Duration ms property. */
  durationMs?: number;
  /** Error summary property. */
  errorSummary?: string;
  /** Metadata property. */
  metadata?: Record<string, string | number | boolean>;
}

/** Pulse execution trace shape. */
export interface PulseExecutionTrace {
  /** Run id property. */
  runId: string;
  /** Generated at property. */
  generatedAt: string;
  /** Updated at property. */
  updatedAt: string;
  /** Environment property. */
  environment?: PulseEnvironment;
  /** Certification target property. */
  certificationTarget?: PulseCertificationTarget;
  /** Phases property. */
  phases: PulseExecutionPhase[];
  /** Summary property. */
  summary: string;
  /** Artifact paths property. */
  artifactPaths: string[];
}

/** Pulse gate name type. */
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

/** Pulse gate failure class type. */
export type PulseGateFailureClass = 'product_failure' | 'missing_evidence' | 'checker_gap';

/** Pulse convergence unit priority type. */
export type PulseConvergenceUnitPriority = 'P0' | 'P1' | 'P2' | 'P3';
/** Pulse convergence unit kind type. */
export type PulseConvergenceUnitKind = 'scenario' | 'security' | 'static' | 'gate';
/** Pulse convergence unit status type. */
export type PulseConvergenceUnitStatus = 'open' | 'watch';
/** Pulse convergence owner lane type. */
export type PulseConvergenceOwnerLane =
  | 'customer'
  | 'operator-admin'
  | 'security'
  | 'reliability'
  | 'platform';

/** Pulse convergence unit shape. */
export interface PulseConvergenceUnit {
  /** Id property. */
  id: string;
  /** Order property. */
  order: number;
  /** Priority property. */
  priority: PulseConvergenceUnitPriority;
  /** Kind property. */
  kind: PulseConvergenceUnitKind;
  /** Status property. */
  status: PulseConvergenceUnitStatus;
  /** Owner lane property. */
  ownerLane: PulseConvergenceOwnerLane;
  /** Title property. */
  title: string;
  /** Summary property. */
  summary: string;
  /** Target state property. */
  targetState: string;
  /** Failure class property. */
  failureClass: PulseGateFailureClass | 'mixed' | 'unknown';
  /** Actor kinds property. */
  actorKinds: string[];
  /** Gate names property. */
  gateNames: PulseGateName[];
  /** Scenario ids property. */
  scenarioIds: string[];
  /** Module keys property. */
  moduleKeys: string[];
  /** Route patterns property. */
  routePatterns: string[];
  /** Flow ids property. */
  flowIds: string[];
  /** Async expectations property. */
  asyncExpectations: string[];
  /** Break types property. */
  breakTypes: string[];
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Related files property. */
  relatedFiles: string[];
  /** Validation artifacts property. */
  validationArtifacts: string[];
  /** Exit criteria property. */
  exitCriteria: string[];
}

/** Pulse convergence plan summary shape. */
export interface PulseConvergencePlanSummary {
  /** Total units property. */
  totalUnits: number;
  /** Scenario units property. */
  scenarioUnits: number;
  /** Security units property. */
  securityUnits: number;
  /** Static units property. */
  staticUnits: number;
  /** Gate units property. */
  gateUnits: number;
  /** Priorities property. */
  priorities: Record<PulseConvergenceUnitPriority, number>;
  /** Failing gates property. */
  failingGates: PulseGateName[];
  /** Pending async expectations property. */
  pendingAsyncExpectations: string[];
}

/** Pulse convergence plan shape. */
export interface PulseConvergencePlan {
  /** Generated at property. */
  generatedAt: string;
  /** Commit sha property. */
  commitSha: string;
  /** Status property. */
  status: 'CERTIFIED' | 'PARTIAL' | 'NOT_CERTIFIED';
  /** Human replacement status property. */
  humanReplacementStatus: 'READY' | 'NOT_READY';
  /** Blocking tier property. */
  blockingTier: number | null;
  /** Summary property. */
  summary: PulseConvergencePlanSummary;
  /** Queue property. */
  queue: PulseConvergenceUnit[];
}

/** Pulse evidence record shape. */
export interface PulseEvidenceRecord {
  /** Kind property. */
  kind: 'runtime' | 'browser' | 'flow' | 'invariant' | 'artifact' | 'truth' | 'actor' | 'coverage';
  /** Executed property. */
  executed: boolean;
  /** Summary property. */
  summary: string;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Metrics property. */
  metrics?: Record<string, string | number | boolean>;
}

/** Pulse runtime probe status type. */
export type PulseRuntimeProbeStatus = 'passed' | 'failed' | 'missing_evidence' | 'skipped';

/** Pulse runtime probe shape. */
export interface PulseRuntimeProbe {
  /** Probe id property. */
  probeId: string;
  /** Target property. */
  target: string;
  /** Required property. */
  required: boolean;
  /** Executed property. */
  executed: boolean;
  /** Status property. */
  status: PulseRuntimeProbeStatus;
  /** Failure class property. */
  failureClass?: PulseGateFailureClass;
  /** Summary property. */
  summary: string;
  /** Latency ms property. */
  latencyMs?: number;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Metrics property. */
  metrics?: Record<string, string | number | boolean>;
}

/** Pulse runtime evidence shape. */
export interface PulseRuntimeEvidence {
  /** Executed property. */
  executed: boolean;
  /** Executed checks property. */
  executedChecks: string[];
  /** Blocking break types property. */
  blockingBreakTypes: string[];
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Backend url property. */
  backendUrl?: string;
  /** Frontend url property. */
  frontendUrl?: string;
  /** Resolution source property. */
  resolutionSource?: string;
  /** Probes property. */
  probes: PulseRuntimeProbe[];
}

/** Pulse observability evidence shape. */
export interface PulseObservabilityEvidence {
  /** Executed property. */
  executed: boolean;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Signals property. */
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

/** Pulse recovery evidence shape. */
export interface PulseRecoveryEvidence {
  /** Executed property. */
  executed: boolean;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Signals property. */
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

/** Pulse browser failure code type. */
export type PulseBrowserFailureCode =
  | 'ok'
  | 'playwright_missing'
  | 'chromium_launch_blocked'
  | 'frontend_unreachable'
  | 'backend_auth_unreachable';

/** Pulse browser preflight shape. */
export interface PulseBrowserPreflight {
  /** Status property. */
  status: PulseBrowserFailureCode;
  /** Detail property. */
  detail: string;
  /** Checked at property. */
  checkedAt: string;
}

/** Pulse flow result shape. */
export interface PulseFlowResult {
  /** Flow id property. */
  flowId: string;
  /** Status property. */
  status: 'passed' | 'failed' | 'accepted' | 'missing_evidence' | 'skipped';
  /** Executed property. */
  executed: boolean;
  /** Accepted property. */
  accepted: boolean;
  /** Provider mode used property. */
  providerModeUsed?: PulseProviderMode;
  /** Smoke executed property. */
  smokeExecuted?: boolean;
  /** Replay executed property. */
  replayExecuted?: boolean;
  /** Failure class property. */
  failureClass?: PulseGateFailureClass;
  /** Summary property. */
  summary: string;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Metrics property. */
  metrics?: Record<string, string | number | boolean>;
}

/** Pulse invariant result shape. */
export interface PulseInvariantResult {
  /** Invariant id property. */
  invariantId: string;
  /** Status property. */
  status: 'passed' | 'failed' | 'accepted' | 'missing_evidence' | 'skipped';
  /** Evaluated property. */
  evaluated: boolean;
  /** Accepted property. */
  accepted: boolean;
  /** Failure class property. */
  failureClass?: PulseGateFailureClass;
  /** Summary property. */
  summary: string;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Metrics property. */
  metrics?: Record<string, string | number | boolean>;
}

/** Pulse browser evidence shape. */
export interface PulseBrowserEvidence {
  /** Attempted property. */
  attempted: boolean;
  /** Executed property. */
  executed: boolean;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Failure code property. */
  failureCode?: PulseBrowserFailureCode;
  /** Preflight property. */
  preflight?: PulseBrowserPreflight;
  /** Total pages property. */
  totalPages?: number;
  /** Total tested property. */
  totalTested?: number;
  /** Pass rate property. */
  passRate?: number;
  /** Blocking interactions property. */
  blockingInteractions?: number;
}

/** Pulse flow evidence shape. */
export interface PulseFlowEvidence {
  /** Declared property. */
  declared: string[];
  /** Executed property. */
  executed: string[];
  /** Missing property. */
  missing: string[];
  /** Passed property. */
  passed: string[];
  /** Failed property. */
  failed: string[];
  /** Accepted property. */
  accepted: string[];
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Results property. */
  results: PulseFlowResult[];
}

/** Pulse invariant evidence shape. */
export interface PulseInvariantEvidence {
  /** Declared property. */
  declared: string[];
  /** Evaluated property. */
  evaluated: string[];
  /** Missing property. */
  missing: string[];
  /** Passed property. */
  passed: string[];
  /** Failed property. */
  failed: string[];
  /** Accepted property. */
  accepted: string[];
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Results property. */
  results: PulseInvariantResult[];
}

/** Pulse scenario result shape. */
export interface PulseScenarioResult {
  /** Scenario id property. */
  scenarioId: string;
  /** Actor kind property. */
  actorKind: PulseActorKind;
  /** Scenario kind property. */
  scenarioKind: PulseScenarioKind;
  /** Critical property. */
  critical: boolean;
  /** Requested property. */
  requested: boolean;
  /** Runner property. */
  runner: PulseScenarioRunner;
  /** Status property. */
  status: 'passed' | 'failed' | 'missing_evidence' | 'checker_gap' | 'skipped';
  /** Executed property. */
  executed: boolean;
  /** Provider mode used property. */
  providerModeUsed?: PulseProviderMode;
  /** Smoke executed property. */
  smokeExecuted?: boolean;
  /** Replay executed property. */
  replayExecuted?: boolean;
  /** World state converged property. */
  worldStateConverged?: boolean;
  /** Failure class property. */
  failureClass?: PulseGateFailureClass;
  /** Summary property. */
  summary: string;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Specs executed property. */
  specsExecuted: string[];
  /** Duration ms property. */
  durationMs: number;
  /** World state touches property. */
  worldStateTouches: string[];
  /** Metrics property. */
  metrics?: Record<string, string | number | boolean>;
  /** Module keys property. */
  moduleKeys: string[];
  /** Route patterns property. */
  routePatterns: string[];
}

/** Pulse actor evidence shape. */
export interface PulseActorEvidence {
  /** Actor kind property. */
  actorKind: 'customer' | 'operator' | 'admin' | 'soak';
  /** Declared property. */
  declared: string[];
  /** Executed property. */
  executed: string[];
  /** Missing property. */
  missing: string[];
  /** Passed property. */
  passed: string[];
  /** Failed property. */
  failed: string[];
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Results property. */
  results: PulseScenarioResult[];
}

/** Pulse surface classification type. */
export type PulseSurfaceClassification =
  | 'certified_interaction'
  | 'shared_capability'
  | 'ops_only'
  | 'legacy_shell'
  | 'decorative_only';

/** Pulse surface coverage entry shape. */
export interface PulseSurfaceCoverageEntry {
  /** Route property. */
  route: string;
  /** Group property. */
  group: string;
  /** Module key property. */
  moduleKey: string;
  /** Module name property. */
  moduleName: string;
  /** Classification property. */
  classification: PulseSurfaceClassification;
  /** Covered property. */
  covered: boolean;
  /** Actor kinds property. */
  actorKinds: PulseActorKind[];
  /** Scenario ids property. */
  scenarioIds: string[];
  /** Total interactions property. */
  totalInteractions: number;
  /** Persisted interactions property. */
  persistedInteractions: number;
}

/** Pulse synthetic coverage evidence shape. */
export interface PulseSyntheticCoverageEvidence {
  /** Executed property. */
  executed: boolean;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Total pages property. */
  totalPages: number;
  /** User facing pages property. */
  userFacingPages: number;
  /** Covered pages property. */
  coveredPages: number;
  /** Uncovered pages property. */
  uncoveredPages: string[];
  /** Results property. */
  results: PulseSurfaceCoverageEntry[];
}

/** Pulse world state session shape. */
export interface PulseWorldStateSession {
  /** Kind property. */
  kind: PulseActorKind;
  /** Declared scenarios property. */
  declaredScenarios: number;
  /** Executed scenarios property. */
  executedScenarios: number;
  /** Passed scenarios property. */
  passedScenarios: number;
}

/** Pulse world state shape. */
export interface PulseWorldState {
  /** Generated at property. */
  generatedAt: string;
  /** Backend url property. */
  backendUrl?: string;
  /** Frontend url property. */
  frontendUrl?: string;
  /** Actor profiles property. */
  actorProfiles: string[];
  /** Executed scenarios property. */
  executedScenarios: string[];
  /** Pending async expectations property. */
  pendingAsyncExpectations: string[];
  /** Entities property. */
  entities: Record<string, string[]>;
  /** Async expectations status property. */
  asyncExpectationsStatus: Array<{
    scenarioId: string;
    expectation: string;
    status: 'pending' | 'satisfied' | 'failed' | 'timed_out' | 'missing_evidence' | 'not_executed';
  }>;
  /** Artifacts by scenario property. */
  artifactsByScenario: Record<string, string[]>;
  /** Sessions property. */
  sessions: PulseWorldStateSession[];
}

/** Pulse execution evidence shape. */
export interface PulseExecutionEvidence {
  /** Runtime property. */
  runtime: PulseRuntimeEvidence;
  /** Browser property. */
  browser: PulseBrowserEvidence;
  /** Flows property. */
  flows: PulseFlowEvidence;
  /** Invariants property. */
  invariants: PulseInvariantEvidence;
  /** Observability property. */
  observability: PulseObservabilityEvidence;
  /** Recovery property. */
  recovery: PulseRecoveryEvidence;
  /** Customer property. */
  customer: PulseActorEvidence;
  /** Operator property. */
  operator: PulseActorEvidence;
  /** Admin property. */
  admin: PulseActorEvidence;
  /** Soak property. */
  soak: PulseActorEvidence;
  /** Synthetic coverage property. */
  syntheticCoverage: PulseSyntheticCoverageEvidence;
  /** World state property. */
  worldState: PulseWorldState;
  /** Execution trace property. */
  executionTrace: PulseExecutionTrace;
}

/** Pulse gate result shape. */
export interface PulseGateResult {
  /** Status property. */
  status: 'pass' | 'fail';
  /** Reason property. */
  reason: string;
  /** Failure class property. */
  failureClass?: PulseGateFailureClass;
}

/** Pulse certification tier status shape. */
export interface PulseCertificationTierStatus {
  /** Id property. */
  id: number;
  /** Name property. */
  name: string;
  /** Status property. */
  status: 'pass' | 'fail';
  /** Gates property. */
  gates: PulseGateName[];
  /** Blocking gates property. */
  blockingGates: PulseGateName[];
  /** Reason property. */
  reason: string;
}

/** Pulse certification target shape. */
export interface PulseCertificationTarget {
  /** Tier property. */
  tier: number | null;
  /** Final property. */
  final: boolean;
  /** Profile property. */
  profile?: PulseCertificationProfile | null;
}

/** Pulse certification shape. */
export interface PulseCertification {
  /** Version property. */
  version: string;
  /** Status property. */
  status: 'CERTIFIED' | 'PARTIAL' | 'NOT_CERTIFIED';
  /** Human replacement status property. */
  humanReplacementStatus: 'READY' | 'NOT_READY';
  /** Raw score property. */
  rawScore: number;
  /** Score property. */
  score: number;
  /** Commit sha property. */
  commitSha: string;
  /** Environment property. */
  environment: PulseEnvironment;
  /** Timestamp property. */
  timestamp: string;
  /** Manifest path property. */
  manifestPath: string | null;
  /** Unknown surfaces property. */
  unknownSurfaces: string[];
  /** Unavailable checks property. */
  unavailableChecks: string[];
  /** Unsupported stacks property. */
  unsupportedStacks: string[];
  /** Critical failures property. */
  criticalFailures: string[];
  /** Gates property. */
  gates: Record<PulseGateName, PulseGateResult>;
  /** Truth summary property. */
  truthSummary: PulseCodebaseTruthSummary;
  /** Truth divergence property. */
  truthDivergence: PulseTruthDivergence;
  /** Resolved manifest summary property. */
  resolvedManifestSummary: PulseResolvedManifestSummary;
  /** Unresolved modules property. */
  unresolvedModules: string[];
  /** Unresolved flows property. */
  unresolvedFlows: string[];
  /** Certification target property. */
  certificationTarget: PulseCertificationTarget;
  /** Tier status property. */
  tierStatus: PulseCertificationTierStatus[];
  /** Blocking tier property. */
  blockingTier: number | null;
  /** Accepted flows remaining property. */
  acceptedFlowsRemaining: string[];
  /** Pending critical scenarios property. */
  pendingCriticalScenarios: string[];
  /** Final readiness criteria property. */
  finalReadinessCriteria: PulseManifestFinalReadinessCriteria | null;
  /** Evidence summary property. */
  evidenceSummary: PulseExecutionEvidence;
  /** Gate evidence property. */
  gateEvidence: Partial<Record<PulseGateName, PulseEvidenceRecord[]>>;
}
