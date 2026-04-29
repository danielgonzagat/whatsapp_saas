export type FuzzTestCaseStatus =
  | 'planned'
  | 'not_executed'
  | 'passed'
  | 'failed'
  | 'security_issue'
  | 'blocked'
  | 'skipped';
export type AuthTestResult =
  | 'valid_auth'
  | 'missing_auth'
  | 'invalid_auth'
  | 'expired_token'
  | 'wrong_tenant'
  | 'wrong_role';
export type IdempotencyResult =
  | 'planned'
  | 'not_executed'
  | 'idempotent'
  | 'not_idempotent'
  | 'not_tested';

export interface APIEndpointProbe {
  endpointId: string;
  method: string;
  path: string;
  controller: string;
  filePath: string;
  requiresAuth: boolean;
  requiresTenant: boolean;
  rateLimit: { max: number; windowMs: number } | null;
  requestSchema: Record<string, unknown> | null;
  responseSchema: Record<string, unknown> | null;
  authTests: AuthTestCase[];
  schemaTests: SchemaTestCase[];
  idempotencyTests: IdempotencyTestCase[];
  rateLimitTests: RateLimitTestCase[];
  securityTests: SecurityTestCase[];
}

export interface AuthTestCase {
  testId: string;
  scenario: string;
  status: FuzzTestCaseStatus;
  expectedStatus: number;
  actualStatus: number | null;
  error: string | null;
}

export interface SchemaTestCase {
  testId: string;
  scenario: string;
  payload: unknown;
  expectedStatus: number;
  actualStatus: number | null;
  validationErrors: string[];
  status: FuzzTestCaseStatus;
}

export interface IdempotencyTestCase {
  testId: string;
  key: string;
  status: IdempotencyResult;
  requests: number;
  uniqueResults: number;
}

export interface RateLimitTestCase {
  testId: string;
  status: FuzzTestCaseStatus;
  requestsSent: number;
  rateLimited: boolean;
  rateLimitedAt: number;
  windowResetMs: number | null;
}

export interface SecurityTestCase {
  testId: string;
  vulnerabilityType: string; // 'sqli' | 'xss' | 'nosqli' | 'idor' | 'mass_assignment' | 'open_redirect'
  payload: unknown;
  expectedBlock: boolean;
  actuallyBlocked: boolean | null;
  status: FuzzTestCaseStatus;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface APIFuzzEvidence {
  generatedAt: string;
  summary: {
    totalEndpoints: number;
    plannedEndpoints: number;
    probedEndpoints: number;
    authPlannedEndpoints: number;
    authTestedEndpoints: number;
    schemaPlannedEndpoints: number;
    schemaTestedEndpoints: number;
    idempotencyPlannedEndpoints: number;
    idempotencyTestedEndpoints: number;
    rateLimitPlannedEndpoints: number;
    rateLimitTestedEndpoints: number;
    securityPlannedEndpoints: number;
    securityTestedEndpoints: number;
    endpointsWithIssues: number;
    endpointsWithPlannedSecurityIssues: number;
    criticalSecurityIssues: number;
    criticalSecurityPlans: number;
  };
  probes: APIEndpointProbe[];
}
