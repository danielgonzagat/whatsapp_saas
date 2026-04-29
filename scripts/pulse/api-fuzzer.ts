/**
 * PULSE API Contract & Fuzz Probe Engine
 *
 * Discovers all NestJS API endpoints, classifies risk, and generates
 * comprehensive test catalogs for auth, schema validation, idempotency,
 * rate limiting, and security vulnerabilities.
 *
 * This module does NOT execute HTTP requests — it produces the test plan
 * consumed by the execution harness.
 */
import * as path from 'path';
import { safeJoin } from './lib/safe-path';
import { ensureDir, pathExists, readTextFile, writeTextFile } from './safe-fs';
import { walkFiles } from './parsers/utils';
import type {
  APIEndpointProbe,
  APIFuzzEvidence,
  AuthTestCase,
  IdempotencyTestCase,
  RateLimitTestCase,
  SchemaTestCase,
  SecurityTestCase,
} from './types.api-fuzzer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete'] as const;

const DECORATOR_REGEX_BY_METHOD: Readonly<Record<(typeof HTTP_METHODS)[number], RegExp>> = {
  Get: /@Get\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/,
  Post: /@Post\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/,
  Put: /@Put\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/,
  Patch: /@Patch\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/,
  Delete: /@Delete\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/,
};

const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  '.git',
  'coverage',
  '__tests__',
  '__mocks__',
  '.turbo',
  '.vercel',
]);

const SQLI_PAYLOADS = [
  "' OR '1'='1",
  "' OR '1'='1' --",
  "'; DROP TABLE users--",
  "' UNION SELECT NULL--",
  "1' OR '1' = '1",
  '" OR "1"="1',
  '1; DROP TABLE users--',
  "' OR 1=1--",
  "' WAITFOR DELAY '0:0:5'--",
  "' OR 1=1#",
];

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '"><script>alert(1)</script>',
  '<body onload=alert(1)>',
  '<iframe src=javascript:alert(1)>',
  "'-alert(1)-'",
  'javascript:alert(1)',
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
  '<details open ontoggle=alert(1)>',
];

const NOSQLI_PAYLOADS = [
  { $gt: '' } as unknown,
  { $ne: null } as unknown,
  { $where: '1==1' } as unknown,
  { $regex: '.*' } as unknown,
  { username: { $exists: true } } as unknown,
];

const MASS_ASSIGNMENT_PAYLOADS = [
  { role: 'admin' },
  { isAdmin: true },
  { plan: 'enterprise', isSuperAdmin: true },
  { workspaceId: 'bypass', permissionLevel: 'owner' },
];

const OPEN_REDIRECT_PAYLOADS = [
  'https://evil.com',
  '//evil.com',
  '\\\\evil.com',
  'https://evil.com%23.mysite.com',
  'javascript:alert(1)',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFullPath(controllerPath: string, methodPath: string): string {
  const cp = controllerPath.replace(/^\/|\/$/g, '');
  const mp = (methodPath || '').replace(/^\/|\/$/g, '');
  const full = mp ? `/${cp}/${mp}` : `/${cp}`;
  return full.replace(/\/+/g, '/');
}

function uniqueId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Find all @Controller blocks in a file with their positions and associated
 * class-level decorators (@UseGuards, @Public, @Throttle).
 */
function findControllerBlocks(lines: string[]): Array<{
  path: string;
  startLine: number;
  endLine: number;
  classGuards: string[];
  isPublic: boolean;
  throttleConfig: { max: number; windowMs: number } | null;
}> {
  const blocks: Array<{
    path: string;
    startLine: number;
    endLine: number;
    classGuards: string[];
    isPublic: boolean;
    throttleConfig: { max: number; windowMs: number } | null;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/@Controller\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/);
    if (!match) {
      continue;
    }

    const classGuards: string[] = [];
    let isPublic = false;
    let throttleConfig: { max: number; windowMs: number } | null = null;

    const scanStart = Math.max(0, i - 5);
    const scanEnd = Math.min(lines.length - 1, i + 5);
    for (let j = scanStart; j <= scanEnd; j++) {
      const line = lines[j];
      const guardMatch = line.match(/@UseGuards\(([^)]+)\)/);
      if (guardMatch) {
        classGuards.push(...guardMatch[1].split(',').map((g) => g.trim()));
      }
      if (/@Public\(\s*\)/.test(line)) {
        isPublic = true;
      }
      const throttleMatch = line.match(
        /@Throttle\(\s*(?:{\s*default:\s*{\s*limit:\s*(\d+)\s*,\s*ttl:\s*(\d+)\s*}\s*})?\s*\)/,
      );
      if (throttleMatch) {
        throttleConfig = {
          max: throttleMatch[1] ? parseInt(throttleMatch[1], 10) : 30,
          windowMs: throttleMatch[2] ? parseInt(throttleMatch[2], 10) : 60000,
        };
      }
    }

    blocks.push({
      path: match[1] || '',
      startLine: i,
      endLine: lines.length,
      classGuards,
      isPublic,
      throttleConfig,
    });
  }

  for (let i = 0; i < blocks.length - 1; i++) {
    blocks[i].endLine = blocks[i + 1].startLine;
  }

  return blocks;
}

/**
 * Extract DTO type hint from a method parameter decorated with @Body().
 * E.g. `@Body() dto: CreateProductDto` → `'CreateProductDto'`
 */
function extractBodyDtoType(
  lines: string[],
  methodLine: number,
  blockEndLine: number,
): string | null {
  for (let j = methodLine; j < Math.min(methodLine + 20, blockEndLine); j++) {
    const line = lines[j]?.trim() || '';
    if (
      line.startsWith('@') &&
      !line.startsWith('@Body') &&
      !line.startsWith('@Req') &&
      !line.startsWith('@Res') &&
      !line.startsWith('@Param') &&
      !line.startsWith('@Query') &&
      !line.startsWith('@Headers') &&
      line !== ''
    ) {
      continue;
    }
    const bodyMatch = line.match(/@Body\(\s*\)\s*\w+\s*:\s*(\w+)/);
    if (bodyMatch) {
      return bodyMatch[1];
    }
    const bodyNamedMatch = line.match(/@Body\(['"]\w*['"]\)\s*\w+\s*:\s*(\w+)/);
    if (bodyNamedMatch) {
      return bodyNamedMatch[1];
    }
  }
  return null;
}

/**
 * Find method name and line after a decorator line.
 */
function findMethodName(
  lines: string[],
  decoratorLine: number,
  blockEndLine: number,
): { line: number; name: string } {
  for (let j = decoratorLine + 1; j < Math.min(decoratorLine + 14, blockEndLine); j++) {
    const trimmed = lines[j]?.trim() || '';
    if (!trimmed || trimmed.startsWith('@')) {
      continue;
    }
    const nameMatch = trimmed.match(
      /^(?:public|private|protected)?\s*(?:async\s+)?([A-Za-z_]\w*)\s*\(/,
    );
    if (nameMatch) {
      return { line: j, name: nameMatch[1] };
    }
  }
  return { line: decoratorLine, name: 'unknown' };
}

// ---------------------------------------------------------------------------
// Endpoint Discovery
// ---------------------------------------------------------------------------

/**
 * Discover all API endpoints in the NestJS backend.
 *
 * Scans `backend/src` for controller files decorated with `@Controller()`,
 * extracts routes, auth guards, throttle config, DTO types, and metadata.
 */
export function discoverAPIEndpoints(rootDir: string): APIEndpointProbe[] {
  const probes: APIEndpointProbe[] = [];
  const backendDir = safeJoin(rootDir, 'backend', 'src');

  if (!pathExists(backendDir)) {
    process.stderr.write('  [api-fuzzer] Backend directory not found\n');
    return probes;
  }

  const files = walkFiles(backendDir, ['.ts']).filter(
    (f) => f.endsWith('.controller.ts') && !/\.(spec|test)\.ts$/.test(f),
  );

  for (const file of files) {
    try {
      const content = readTextFile(file, 'utf8');
      const lines = content.split('\n');
      const relFile = path.relative(rootDir, file);
      const controllerBlocks = findControllerBlocks(lines);

      if (controllerBlocks.length === 0) {
        continue;
      }

      for (const block of controllerBlocks) {
        const controllerPath = block.path;
        const hasJwtGuard =
          block.classGuards.some((g) => /JwtAuthGuard/i.test(g)) ||
          block.classGuards.some((g) => /AuthGuard/i.test(g));
        const hasWorkspaceGuard = block.classGuards.some((g) => /WorkspaceGuard/i.test(g));

        for (let i = block.startLine; i < block.endLine; i++) {
          const line = lines[i].trim();

          for (const method of HTTP_METHODS) {
            const decoratorRe = DECORATOR_REGEX_BY_METHOD[method];
            const match = line.match(decoratorRe);
            if (!match) {
              continue;
            }

            const methodPath = match[1] || '';
            const fullPath = buildFullPath(controllerPath, methodPath);

            let methodPublic = false;
            let methodGuards = [...block.classGuards];
            let methodThrottle = block.throttleConfig;

            for (let j = Math.max(block.startLine, i - 8); j < i; j++) {
              const above = lines[j].trim();
              if (/@Public\(\s*\)/.test(above)) {
                methodPublic = true;
              }
              const guardMatch = above.match(/@UseGuards\(([^)]+)\)/);
              if (guardMatch) {
                methodGuards.push(...guardMatch[1].split(',').map((g) => g.trim()));
              }
              const throttleMatch = above.match(
                /@Throttle\(\s*(?:{\s*default:\s*{\s*limit:\s*(\d+)\s*,\s*ttl:\s*(\d+)\s*}\s*})?\s*\)/,
              );
              if (throttleMatch) {
                methodThrottle = {
                  max: throttleMatch[1] ? parseInt(throttleMatch[1], 10) : 30,
                  windowMs: throttleMatch[2] ? parseInt(throttleMatch[2], 10) : 60000,
                };
              }
            }

            for (let j = i + 1; j < Math.min(i + 5, block.endLine); j++) {
              const below = lines[j].trim();
              if (/@Public\(\s*\)/.test(below)) {
                methodPublic = true;
              }
              const guardMatch = below.match(/@UseGuards\(([^)]+)\)/);
              if (guardMatch) {
                methodGuards.push(...guardMatch[1].split(',').map((g) => g.trim()));
              }
              const throttleMatch = below.match(
                /@Throttle\(\s*(?:{\s*default:\s*{\s*limit:\s*(\d+)\s*,\s*ttl:\s*(\d+)\s*}\s*})?\s*\)/,
              );
              if (throttleMatch) {
                methodThrottle = {
                  max: throttleMatch[1] ? parseInt(throttleMatch[1], 10) : 30,
                  windowMs: throttleMatch[2] ? parseInt(throttleMatch[2], 10) : 60000,
                };
              }
            }

            const requiresAuth = !methodPublic && methodGuards.length > 0;
            const requiresTenant = methodGuards.some((g) => /WorkspaceGuard/i.test(g));

            const methodInfo = findMethodName(lines, i, block.endLine);
            const dtoType = extractBodyDtoType(lines, methodInfo.line, block.endLine);

            const requestSchema: Record<string, unknown> | null = dtoType
              ? { dtoType, source: 'inferred' }
              : null;

            const endpointId = `${method.toUpperCase()}:${fullPath}:${methodInfo.name}:${relFile}:${i + 1}`;

            probes.push({
              endpointId,
              method: method.toUpperCase(),
              path: fullPath,
              controller: relFile,
              filePath: relFile,
              requiresAuth,
              requiresTenant,
              rateLimit: methodThrottle,
              requestSchema,
              responseSchema: null,
              authTests: [],
              schemaTests: [],
              idempotencyTests: [],
              rateLimitTests: [],
              securityTests: [],
            });
          }
        }
      }
    } catch (e) {
      process.stderr.write(`  [api-fuzzer] Could not parse ${file}: ${(e as Error).message}\n`);
    }
  }

  return probes;
}

// ---------------------------------------------------------------------------
// Test Generators
// ---------------------------------------------------------------------------

/**
 * Generate auth test cases for an endpoint.
 *
 * @param endpoint The endpoint probe to generate auth tests for.
 * @returns Array of auth test cases.
 */
export function generateAuthTests(endpoint: APIEndpointProbe): AuthTestCase[] {
  if (!endpoint.requiresAuth) {
    return [
      {
        testId: `${endpoint.endpointId}-auth-no-auth-required`,
        scenario: 'Public endpoint auth probe plan',
        status: 'planned',
        expectedStatus: 200,
        actualStatus: null,
        error: null,
      },
    ];
  }

  const tests: AuthTestCase[] = [];

  if (endpoint.requiresAuth) {
    tests.push({
      testId: `${endpoint.endpointId}-auth-missing`,
      scenario: 'No auth token → expect 401',
      status: 'planned',
      expectedStatus: 401,
      actualStatus: null,
      error: null,
    });

    tests.push({
      testId: `${endpoint.endpointId}-auth-invalid`,
      scenario: 'Invalid/malformed token → expect 401',
      status: 'planned',
      expectedStatus: 401,
      actualStatus: null,
      error: null,
    });

    tests.push({
      testId: `${endpoint.endpointId}-auth-expired`,
      scenario: 'Expired token → expect 401',
      status: 'planned',
      expectedStatus: 401,
      actualStatus: null,
      error: null,
    });
  }

  if (endpoint.requiresTenant) {
    tests.push({
      testId: `${endpoint.endpointId}-auth-wrong-tenant`,
      scenario: 'Valid token, wrong tenant/workspace → expect 403',
      status: 'planned',
      expectedStatus: 403,
      actualStatus: null,
      error: null,
    });

    tests.push({
      testId: `${endpoint.endpointId}-auth-wrong-role`,
      scenario: 'Valid token, insufficient role → expect 403',
      status: 'planned',
      expectedStatus: 403,
      actualStatus: null,
      error: null,
    });
  }

  return tests;
}

/**
 * Convert PascalCase to kebab-case for DTO filename matching.
 */
function pascalToKebab(name: string): string {
  return name
    .replace(/Dto$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Class-validator → primitive type mapping.
 */
const VALIDATOR_TYPE_MAP: Record<string, string> = {
  IsString: 'string',
  IsNumber: 'number',
  IsInt: 'number',
  IsBoolean: 'boolean',
  IsArray: 'array',
  IsEmail: 'string',
  IsUUID: 'string',
  IsDate: 'string',
  IsDateString: 'string',
  IsEnum: 'string',
  IsNotEmpty: 'string',
  IsISO8601: 'string',
  IsUrl: 'string',
  IsJSON: 'string',
};

/**
 * Validate DTO decorator patterns from source code to infer schema shape.
 *
 * Scans all .dto.ts files in backend/src for the target class name. Uses
 * kebab-case filename matching first, then falls back to full content search.
 * Accumulates class-validator decorators across lines to correctly detect
 * optional/required fields even when decorators precede the field declaration.
 */
/**
 * Check whether a kebab-candidate file actually contains the target class.
 */
function fileHasClass(filePath: string, dtoType: string): boolean {
  try {
    const content = readTextFile(filePath, 'utf8');
    return content.includes(`class ${dtoType}`) || content.includes(`class ${dtoType} `);
  } catch {
    return false;
  }
}

function parseDtoSchema(
  dtoType: string,
  rootDir: string,
): Record<string, { type: string; required: boolean }> | null {
  const backendDir = safeJoin(rootDir, 'backend', 'src');
  if (!pathExists(backendDir)) {
    return null;
  }

  const allFiles = walkFiles(backendDir, ['.ts']);
  const kebab = pascalToKebab(dtoType);

  let dtoFile: string | null = null;

  for (const f of allFiles) {
    if (f.includes('.dto.ts') && f.includes(kebab) && fileHasClass(f, dtoType)) {
      dtoFile = f;
      break;
    }
  }

  if (!dtoFile) {
    for (const f of allFiles) {
      if (!f.includes('.dto.ts')) continue;
      if (fileHasClass(f, dtoType)) {
        dtoFile = f;
        break;
      }
    }
  }

  if (!dtoFile) {
    return null;
  }

  const schema: Record<string, { type: string; required: boolean }> = {};

  try {
    const content = readTextFile(dtoFile, 'utf8');
    const lines = content.split('\n');

    let inClass = false;
    let pendingIsOptional = false;
    let pendingType: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.includes(`class ${dtoType}`)) {
        inClass = true;
        continue;
      }
      if (inClass && trimmed === '}' && !/export\s+class/.test(trimmed)) {
        break;
      }
      if (!inClass) {
        continue;
      }

      if (/^@IsOptional\(\)/.test(trimmed)) {
        pendingIsOptional = true;
        continue;
      }

      const decoratorTypeMatch = trimmed.match(/^@(Is\w+)\(\s*(?:\{[^}]*\})?\s*\)/);
      if (decoratorTypeMatch) {
        const mapped = VALIDATOR_TYPE_MAP[decoratorTypeMatch[1]];
        if (mapped) {
          pendingType = mapped;
        }
        continue;
      }

      const fieldMatch = trimmed.match(/^(\w+)([?!])?\s*:\s*(.+?);?\s*$/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const optionalMarker = fieldMatch[2];
        const tsType = fieldMatch[3];

        let inferredType = pendingType || tsType.replace(/\[\]$/, '');
        if (inferredType === 'array') {
          inferredType = tsType.includes('[]') ? tsType.replace(/\[\]$/, '') : 'unknown';
        }
        if (inferredType.includes('<') || inferredType.includes('{')) {
          inferredType = 'object';
        }

        const isOptional = pendingIsOptional || optionalMarker === '?';

        schema[fieldName] = {
          type: inferredType,
          required: !isOptional,
        };

        pendingIsOptional = false;
        pendingType = null;
      }
    }
  } catch {
    return null;
  }

  return Object.keys(schema).length > 0 ? schema : null;
}

/**
 * Generate schema validation test cases for an endpoint.
 *
 * @param endpoint The endpoint probe to generate schema tests for.
 * @param rootDir  Repo root directory for DTO file discovery.
 * @returns Array of schema test cases.
 */
export function generateSchemaTests(endpoint: APIEndpointProbe, rootDir: string): SchemaTestCase[] {
  const tests: SchemaTestCase[] = [];
  const methodsWithBody = ['POST', 'PUT', 'PATCH'];

  if (!methodsWithBody.includes(endpoint.method) || !endpoint.requestSchema) {
    return tests;
  }

  const dtoType = endpoint.requestSchema.dtoType as string;
  const schema = parseDtoSchema(dtoType, rootDir);

  if (schema) {
    const requiredFields = Object.entries(schema)
      .filter(([, def]) => def.required)
      .map(([name]) => name);

    const fields = Object.keys(schema);

    if (fields.length > 0) {
      const validPayload: Record<string, unknown> = {};
      for (const field of fields) {
        const def = schema[field];
        switch (def.type) {
          case 'string':
          case 'String':
            validPayload[field] = 'test-value';
            break;
          case 'number':
          case 'Number':
            validPayload[field] = 42;
            break;
          case 'boolean':
          case 'Boolean':
            validPayload[field] = true;
            break;
          case 'string[]':
            validPayload[field] = ['item1'];
            break;
          case 'number[]':
            validPayload[field] = [1, 2];
            break;
          default:
            validPayload[field] = {};
        }
      }

      tests.push({
        testId: `${endpoint.endpointId}-schema-valid`,
        scenario: `Valid ${dtoType} payload`,
        payload: validPayload,
        expectedStatus: 201,
        actualStatus: null,
        validationErrors: [],
        status: 'planned',
      });
    }

    if (requiredFields.length > 0) {
      const missingPayload = {
        ...Object.fromEntries(
          Object.entries(
            fields.reduce(
              (acc, f) => {
                if (!requiredFields.includes(f)) {
                  (acc as Record<string, unknown>)[f] = 'test';
                }
                return acc;
              },
              {} as Record<string, unknown>,
            ),
          ),
        ),
      };

      for (const reqField of requiredFields) {
        const fieldPayload = { ...missingPayload };
        const fieldDef = schema[reqField];

        tests.push({
          testId: `${endpoint.endpointId}-schema-missing-${reqField}`,
          scenario: `Missing required field "${reqField}"`,
          payload: fieldPayload,
          expectedStatus: 400,
          actualStatus: null,
          validationErrors: [`${reqField} is required`],
          status: 'planned',
        });

        if (fieldDef) {
          let wrongTypePayload: unknown;
          switch (fieldDef.type) {
            case 'string':
            case 'String':
              wrongTypePayload = { ...missingPayload, [reqField]: 12345 };
              break;
            case 'number':
            case 'Number':
              wrongTypePayload = { ...missingPayload, [reqField]: 'not-a-number' };
              break;
            case 'boolean':
            case 'Boolean':
              wrongTypePayload = { ...missingPayload, [reqField]: 'not-bool' };
              break;
            default:
              wrongTypePayload = { ...missingPayload, [reqField]: null };
          }

          tests.push({
            testId: `${endpoint.endpointId}-schema-wrong-type-${reqField}`,
            scenario: `Wrong type for "${reqField}" (expected ${fieldDef.type})`,
            payload: wrongTypePayload,
            expectedStatus: 400,
            actualStatus: null,
            validationErrors: [`${reqField} has wrong type`],
            status: 'planned',
          });
        }
      }
    }

    tests.push({
      testId: `${endpoint.endpointId}-schema-empty-body`,
      scenario: 'Empty request body',
      payload: {},
      expectedStatus: 400,
      actualStatus: null,
      validationErrors: ['Body cannot be empty'],
      status: 'planned',
    });

    tests.push({
      testId: `${endpoint.endpointId}-schema-extra-fields`,
      scenario: 'Extra/unknown fields in payload',
      payload: { unexpectedExtraField: 'should-be-rejected' },
      expectedStatus: 400,
      actualStatus: null,
      validationErrors: ['Unexpected fields'],
      status: 'planned',
    });

    tests.push({
      testId: `${endpoint.endpointId}-schema-boundary-null`,
      scenario: 'null for required field',
      payload: { ...requiredFields.reduce((acc, f) => ({ ...acc, [f]: null }), {}) },
      expectedStatus: 400,
      actualStatus: null,
      validationErrors: ['Null value for required field'],
      status: 'planned',
    });
  }

  return tests;
}

/**
 * Generate idempotency test cases for POST/PUT endpoints.
 *
 * @param endpoint The endpoint probe to generate idempotency tests for.
 * @returns Array of idempotency test cases.
 */
export function generateIdempotencyTests(endpoint: APIEndpointProbe): IdempotencyTestCase[] {
  const idempotencyMethods = ['POST', 'PUT'];

  if (!idempotencyMethods.includes(endpoint.method)) {
    return [];
  }

  return [
    {
      testId: `${endpoint.endpointId}-idempotency-duplicate`,
      key: `idem-${uniqueId()}`,
      status: 'planned',
      requests: 2,
      uniqueResults: 0,
    },
  ];
}

/**
 * Generate rate limit test cases for an endpoint.
 *
 * @param endpoint The endpoint probe to generate rate limit tests for.
 * @returns Array of rate limit test cases.
 */
export function generateRateLimitTests(endpoint: APIEndpointProbe): RateLimitTestCase[] {
  if (!endpoint.rateLimit) {
    return [];
  }

  const { max } = endpoint.rateLimit;

  return [
    {
      testId: `${endpoint.endpointId}-ratelimit-over-limit`,
      status: 'planned',
      requestsSent: max + 5,
      rateLimited: false,
      rateLimitedAt: 0,
      windowResetMs: null,
    },
  ];
}

/**
 * Generate security test payloads for a given vulnerability type.
 *
 * @param vulnerabilityType The type of vulnerability to generate payloads for.
 * @returns Array of payloads to test.
 */
export function generateSecurityPayloads(vulnerabilityType: string): unknown[] {
  switch (vulnerabilityType) {
    case 'sqli':
      return SQLI_PAYLOADS;
    case 'xss':
      return XSS_PAYLOADS;
    case 'nosqli':
      return NOSQLI_PAYLOADS;
    case 'mass_assignment':
      return MASS_ASSIGNMENT_PAYLOADS;
    case 'open_redirect':
      return OPEN_REDIRECT_PAYLOADS;
    case 'idor':
      return ['other-user-id', '00000000-0000-0000-0000-000000000000', '1', '0'];
    default:
      return [];
  }
}

/**
 * Generate security test cases for an endpoint.
 *
 * Tests SQL injection, XSS, NoSQL injection, mass assignment for create/update
 * endpoints, IDOR for parameterized endpoints, and open redirect.
 *
 * @param endpoint The endpoint probe to generate security tests for.
 * @returns Array of security test cases.
 */
export function generateSecurityTests(endpoint: APIEndpointProbe): SecurityTestCase[] {
  const tests: SecurityTestCase[] = [];

  // SQL injection — applicable to all endpoints that accept input
  SQLI_PAYLOADS.forEach((payload, idx) => {
    tests.push({
      testId: `${endpoint.endpointId}-sec-sqli-${idx}`,
      vulnerabilityType: 'sqli',
      payload,
      expectedBlock: true,
      actuallyBlocked: null,
      status: 'planned',
      severity: 'high',
    });
  });

  // XSS — applicable to all endpoints that accept input
  XSS_PAYLOADS.slice(0, 3).forEach((payload, idx) => {
    tests.push({
      testId: `${endpoint.endpointId}-sec-xss-${idx}`,
      vulnerabilityType: 'xss',
      payload,
      expectedBlock: true,
      actuallyBlocked: null,
      status: 'planned',
      severity: 'medium',
    });
  });

  // NoSQL injection — applicable to endpoints with JSON body (POST/PUT/PATCH)
  if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
    NOSQLI_PAYLOADS.slice(0, 2).forEach((payload, idx) => {
      tests.push({
        testId: `${endpoint.endpointId}-sec-nosqli-${idx}`,
        vulnerabilityType: 'nosqli',
        payload,
        expectedBlock: true,
        actuallyBlocked: null,
        status: 'planned',
        severity: 'high',
      });
    });
  }

  // Mass assignment — applicable to create/update endpoints
  if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
    MASS_ASSIGNMENT_PAYLOADS.slice(0, 2).forEach((payload, idx) => {
      tests.push({
        testId: `${endpoint.endpointId}-sec-mass-assignment-${idx}`,
        vulnerabilityType: 'mass_assignment',
        payload,
        expectedBlock: true,
        actuallyBlocked: null,
        status: 'planned',
        severity: 'high',
      });
    });
  }

  // IDOR — applicable to endpoints with path parameters (e.g. /resource/:id)
  if (/\/:/.test(endpoint.path) || /\{\w+\}/.test(endpoint.path)) {
    tests.push({
      testId: `${endpoint.endpointId}-sec-idor-0`,
      vulnerabilityType: 'idor',
      payload: { resourceId: 'other-user-id' },
      expectedBlock: true,
      actuallyBlocked: null,
      status: 'planned',
      severity: 'high',
    });
  }

  // Open redirect — applicable to endpoints that accept URLs or redirect params
  if (/\bredirect\b|\breturnUrl\b|\bcallback\b|\bnext\b/.test(endpoint.path)) {
    OPEN_REDIRECT_PAYLOADS.slice(0, 2).forEach((payload, idx) => {
      tests.push({
        testId: `${endpoint.endpointId}-sec-open-redirect-${idx}`,
        vulnerabilityType: 'open_redirect',
        payload,
        expectedBlock: true,
        actuallyBlocked: null,
        status: 'planned',
        severity: 'medium',
      });
    });
  }

  return tests;
}

// ---------------------------------------------------------------------------
// Risk Classification
// ---------------------------------------------------------------------------

/**
 * Classify the risk level of an API endpoint from contract shape.
 *
 * The classifier avoids product/domain path lists. Risk is derived from
 * executable properties: whether the endpoint mutates state, accepts external
 * input, requires tenant/auth context, exposes rate limiting, or deletes data.
 *
 * @param endpoint The endpoint probe to classify.
 * @returns Risk classification.
 */
export function classifyEndpointRisk(
  endpoint: APIEndpointProbe,
): 'critical' | 'high' | 'medium' | 'low' {
  const mutatesState = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(endpoint.method);
  const deletesState = endpoint.method === 'DELETE';
  const acceptsStructuredInput = endpoint.requestSchema !== null;
  const hasBoundaryProtection = endpoint.requiresAuth || endpoint.requiresTenant;
  const hasOperationalBrake = endpoint.rateLimit !== null;

  if (deletesState) return 'critical';
  if (mutatesState && !hasBoundaryProtection) return 'critical';
  if (mutatesState && endpoint.requiresTenant) return 'high';
  if (mutatesState && acceptsStructuredInput && !hasOperationalBrake) return 'high';
  if (mutatesState) return 'medium';
  if (endpoint.requiresAuth || endpoint.requiresTenant) return 'medium';

  if (!endpoint.requiresAuth && endpoint.method === 'GET') {
    return 'low';
  }

  return 'medium';
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Build the complete API fuzz catalog.
 *
 * Discovers all NestJS endpoints in `backend/src`, classifies risk, and
 * generates comprehensive test catalogs for auth, schema validation,
 * idempotency, rate limiting, and security vulnerabilities.
 *
 * The resulting evidence is written to `.pulse/current/PULSE_API_FUZZ_EVIDENCE.json`
 * and returned in memory.
 *
 * @param rootDir The repository root directory.
 * @returns The complete API fuzz evidence object.
 */
export function buildAPIFuzzCatalog(rootDir: string): APIFuzzEvidence {
  const endpoints = discoverAPIEndpoints(rootDir);

  for (const endpoint of endpoints) {
    endpoint.authTests = generateAuthTests(endpoint);
    endpoint.schemaTests = generateSchemaTests(endpoint, rootDir);
    endpoint.idempotencyTests = generateIdempotencyTests(endpoint);
    endpoint.rateLimitTests = generateRateLimitTests(endpoint);
    endpoint.securityTests = generateSecurityTests(endpoint);
  }

  const endpointsWithPlannedSecurityIssues = endpoints.filter((e) =>
    e.securityTests.some((t) => t.status === 'planned' && t.expectedBlock),
  );
  const endpointsWithIssues = endpoints.filter((e) =>
    e.securityTests.some((t) => t.status === 'failed' || t.status === 'security_issue'),
  );

  const evidence: APIFuzzEvidence = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalEndpoints: endpoints.length,
      plannedEndpoints: endpoints.length,
      probedEndpoints: 0,
      authPlannedEndpoints: endpoints.filter((e) => e.authTests.some((t) => t.status === 'planned'))
        .length,
      authTestedEndpoints: endpoints.filter((e) =>
        e.authTests.some((t) => t.status === 'passed' || t.status === 'failed'),
      ).length,
      schemaPlannedEndpoints: endpoints.filter((e) =>
        e.schemaTests.some((t) => t.status === 'planned'),
      ).length,
      schemaTestedEndpoints: endpoints.filter((e) =>
        e.schemaTests.some((t) => t.status === 'passed' || t.status === 'failed'),
      ).length,
      idempotencyPlannedEndpoints: endpoints.filter((e) =>
        e.idempotencyTests.some((t) => t.status === 'planned'),
      ).length,
      idempotencyTestedEndpoints: endpoints.filter((e) =>
        e.idempotencyTests.some((t) => t.status === 'idempotent' || t.status === 'not_idempotent'),
      ).length,
      rateLimitPlannedEndpoints: endpoints.filter((e) =>
        e.rateLimitTests.some((t) => t.status === 'planned'),
      ).length,
      rateLimitTestedEndpoints: endpoints.filter((e) =>
        e.rateLimitTests.some((t) => t.status === 'passed' || t.status === 'failed'),
      ).length,
      securityPlannedEndpoints: endpoints.filter((e) =>
        e.securityTests.some((t) => t.status === 'planned'),
      ).length,
      securityTestedEndpoints: endpoints.filter((e) =>
        e.securityTests.some((t) => t.status === 'passed' || t.status === 'failed'),
      ).length,
      endpointsWithIssues: endpointsWithIssues.length,
      endpointsWithPlannedSecurityIssues: endpointsWithPlannedSecurityIssues.length,
      criticalSecurityIssues: endpoints.filter(
        (e) =>
          classifyEndpointRisk(e) === 'critical' &&
          e.securityTests.some((t) => t.status === 'failed' || t.status === 'security_issue'),
      ).length,
      criticalSecurityPlans: endpoints.filter(
        (e) =>
          classifyEndpointRisk(e) === 'critical' &&
          e.securityTests.some((t) => t.status === 'planned'),
      ).length,
    },
    probes: endpoints,
  };

  const pulseDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(pulseDir, { recursive: true });
  const outputPath = safeJoin(pulseDir, 'PULSE_API_FUZZ_EVIDENCE.json');
  writeTextFile(outputPath, JSON.stringify(evidence, null, 2));

  return evidence;
}
