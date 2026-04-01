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
  | 'TYPE_MISMATCH' | 'UNSAFE_ANY_CAST'
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
  | 'DOCKER_NO_MULTISTAGE' | 'DOCKER_MISSING_IGNORE' | 'PACKAGE_VERSION_CONFLICT'
  | 'NEXTJS_EXPERIMENTAL_RISK' | 'PRISMA_MISSING_INDEX'
  // Runtime parsers (41+) — future
  | 'BUILD_FRONTEND_FAILS' | 'BUILD_BACKEND_FAILS' | 'BUILD_WORKER_FAILS'
  | 'TEST_FAILURE' | 'LINT_VIOLATION';

// ===== Graph =====
export interface Break {
  type: BreakType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line: number;
  description: string;
  detail: string;
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
