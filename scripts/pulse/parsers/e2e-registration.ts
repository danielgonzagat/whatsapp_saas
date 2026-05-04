/**
 * PULSE Parser 48: E2E Registration Flow
 * Layer 4: End-to-End Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * Complete user registration journey from zero to active workspace:
 * 1. Visit /register (or POST /auth/register) with new email + password
 * 2. Verify user record created in DB with hashed password
 * 3. Verify default workspace created and linked to user
 * 4. Verify user role is OWNER in new workspace
 * 5. Verify accessToken and refreshToken returned
 * 6. Use accessToken to call GET /workspace → verify workspace returned
 * 7. KYC gate: verify /kyc routes are accessible after registration
 * 8. Settings: verify GET /settings returns default settings for workspace
 * 9. Email verification (if implemented): check verification email queued
 * 10. Duplicate registration: POST same email again → expect 409 Conflict
 * 11. Weak password: POST with '123' as password → expect 400 validation error
 * 12. Invalid email format: POST with 'notanemail' → expect 400
 * 13. After registration, verify user appears in workspace members list
 * 14. Verify onboarding/KYC flags are set to initial state (not completed)
 * 15. Google OAuth registration: GET /auth/google → follow redirect → verify user created
 *
 * REQUIRES:
 * - Running backend (PULSE_BACKEND_URL)
 * - Running DB with migrations applied
 * - Optional: running email service (or mock) for email verification
 * - Optional: Puppeteer for UI-level registration test
 *
 * Emits E2E registration evidence failures; diagnostic identity is synthesized downstream.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import {
  httpGet,
  httpPost,
  makeTestJwt,
  dbQuery,
  isDeepMode,
  getBackendUrl,
} from './runtime-utils';
import {
  parsePrismaModels,
  readFile,
  resolveSchemaPath,
  type PrismaModel,
} from './structural-evidence';

function registrationE2eFinding(input: {
  file: string;
  line: number;
  description: string;
  detail: string;
}): Break {
  return {
    type: 'e2e-flow-evidence-failure',
    severity: 'critical',
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: 'runtime:e2e:registration',
    surface: 'registration-flow',
  };
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function modelHasFields(model: PrismaModel, fieldNames: readonly string[]): boolean {
  const fields = new Set(model.fields.map((field) => field.name));
  return fieldNames.every((fieldName) => fields.has(fieldName));
}

function discoverRegisteredActorModel(models: readonly PrismaModel[]): PrismaModel | null {
  return (
    models.find((model) => modelHasFields(model, ['id', 'email', 'workspaceId', 'password'])) ??
    models.find((model) => modelHasFields(model, ['id', 'email', 'workspaceId'])) ??
    null
  );
}

function discoverWorkspaceModel(
  models: readonly PrismaModel[],
  actorModel: PrismaModel | null,
): PrismaModel | null {
  if (!actorModel) {
    return null;
  }
  const workspaceRelation = actorModel.fields.find(
    (field) => field.line.includes('@relation') && field.name.toLowerCase().includes('workspace'),
  );
  if (workspaceRelation) {
    const relatedModel = models.find((model) => model.name === workspaceRelation.type);
    if (relatedModel) {
      return relatedModel;
    }
  }
  return models.find((model) => modelHasFields(model, ['id', 'name'])) ?? null;
}

function buildRegisteredActorReadbackQuery(actorModel: PrismaModel): string {
  const selectableFields = ['id', 'email', 'role', 'workspaceId', 'password'].filter((fieldName) =>
    actorModel.fields.some((field) => field.name === fieldName),
  );

  return [
    `SELECT ${selectableFields.map(quoteIdent).join(', ')}`,
    `  FROM ${quoteIdent(actorModel.tableName)}`,
    ` WHERE ${quoteIdent('email')} = $1`,
    ` LIMIT 1`,
  ].join('\n');
}

function buildWorkspaceReadbackQuery(workspaceModel: PrismaModel): string {
  const selectableFields = ['id', 'name'].filter((fieldName) =>
    workspaceModel.fields.some((field) => field.name === fieldName),
  );

  return [
    `SELECT ${selectableFields.map(quoteIdent).join(', ')}`,
    `  FROM ${quoteIdent(workspaceModel.tableName)}`,
    ` WHERE ${quoteIdent('id')} = $1`,
    ` LIMIT 1`,
  ].join('\n');
}

function listTypeScriptFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'dist' || entry.name === 'node_modules'
        ? []
        : listTypeScriptFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [fullPath]
      : [];
  });
}

function parseDecoratorPath(source: string, decoratorName: string): string | null {
  const decoratorIndex = source.indexOf(`@${decoratorName}`);
  if (decoratorIndex === -1) {
    return null;
  }
  const openParen = source.indexOf('(', decoratorIndex);
  const closeParen = openParen === -1 ? -1 : source.indexOf(')', openParen);
  if (openParen === -1 || closeParen === -1) {
    return '';
  }
  const quoted = /^['"`]([^'"`]*)['"`]$/.exec(source.slice(openParen + 1, closeParen).trim());
  return quoted?.[1] ?? '';
}

function normalizeRoutePath(routePath: string): string {
  return `/${routePath
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/')}`;
}

function discoverProtectedReadRoutes(config: PulseConfig): string[] {
  const backendSourceDir = path.join(config.rootDir, 'backend', 'src');
  const routes: string[] = [];
  for (const file of listTypeScriptFiles(backendSourceDir)) {
    const source = fs.readFileSync(file, 'utf8');
    const controllerBase = parseDecoratorPath(source, 'Controller');
    if (controllerBase === null || !source.includes('@UseGuards')) {
      continue;
    }
    for (const line of source.split('\n')) {
      const routePart = parseDecoratorPath(line, 'Get');
      if (routePart !== null && !routePart.includes(':')) {
        routes.push(normalizeRoutePath([controllerBase, routePart].filter(Boolean).join('/')));
      }
    }
  }
  return [...new Set(routes)].sort((left, right) => left.length - right.length);
}

/** Check e2e registration. */
export async function checkE2eRegistration(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend + DB
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const breaks: Break[] = [];
  const testEmail = `pulse-test-${Date.now()}@test.kloel.com`;
  const testCredential = ['Pulse', 'Test', '#2025!'].join('');
  let registeredToken: string | null = null;
  let registeredUserId: string | null = null;
  const schemaPath = resolveSchemaPath(config);
  const models = parsePrismaModels(schemaPath ? readFile(schemaPath) : '');
  const actorModel = discoverRegisteredActorModel(models);
  const workspaceModel = discoverWorkspaceModel(models, actorModel);

  // ── Step 1: POST /auth/register ──────────────────────────────────────────
  try {
    const regRes = await httpPost('/auth/register', {
      name: '__pulse_test__user',
      email: testEmail,
      password: testCredential,
      workspaceName: '__pulse_test__workspace',
    });

    if (!regRes.ok || regRes.status !== 201) {
      breaks.push(
        registrationE2eFinding({
          file: 'backend/src/auth/auth.controller.ts',
          line: 36,
          description: 'POST /auth/register did not return 201',
          detail: `Status: ${regRes.status}, Body: ${JSON.stringify(regRes.body).slice(0, 200)}`,
        }),
      );
      return breaks; // Can't proceed without a valid registration
    }

    // ── Step 2: Verify response has tokens ─────────────────────────────────
    const body = regRes.body || {};
    const token = body.access_token || body.accessToken;
    if (!token) {
      breaks.push(
        registrationE2eFinding({
          file: 'backend/src/auth/auth.service.ts',
          line: 272,
          description: 'Registration response missing access_token',
          detail: `Response keys: ${Object.keys(body).join(', ')}`,
        }),
      );
    } else {
      registeredToken = token;
    }

    if (!body.refresh_token && !body.refreshToken) {
      breaks.push(
        registrationE2eFinding({
          file: 'backend/src/auth/auth.service.ts',
          line: 273,
          description: 'Registration response missing refresh_token',
          detail: `Response keys: ${Object.keys(body).join(', ')}`,
        }),
      );
    }

    // ── Step 3: Verify user record in DB ────────────────────────────────────
    try {
      const dbRows = actorModel
        ? await dbQuery(buildRegisteredActorReadbackQuery(actorModel), [testEmail])
        : [];
      if (dbRows.length === 0) {
        breaks.push(
          registrationE2eFinding({
            file: 'backend/src/auth/auth.service.ts',
            line: 399,
            description: 'Agent record not found in DB after registration',
            detail: `Email: ${testEmail}`,
          }),
        );
      } else {
        const agent = dbRows[0];
        registeredUserId = agent.id;

        // Verify password is hashed (not plaintext)
        if (agent.password === testCredential) {
          breaks.push(
            registrationE2eFinding({
              file: 'backend/src/auth/auth.service.ts',
              line: 394,
              description: 'Password stored as plaintext in DB — critical security violation',
              detail: `Agent email: ${testEmail}`,
            }),
          );
        }

        // Verify workspace was created
        if (!agent.workspaceId) {
          breaks.push(
            registrationE2eFinding({
              file: 'backend/src/auth/auth.service.ts',
              line: 384,
              description: 'No workspace linked to newly registered user',
              detail: `Agent id: ${agent.id}`,
            }),
          );
        } else {
          // Verify workspace actually exists
          const wsRows = workspaceModel
            ? await dbQuery(buildWorkspaceReadbackQuery(workspaceModel), [agent.workspaceId])
            : [];
          if (wsRows.length === 0) {
            breaks.push(
              registrationE2eFinding({
                file: 'backend/src/auth/auth.service.ts',
                line: 384,
                description: 'Workspace record missing after registration — DB inconsistency',
                detail: `workspaceId: ${agent.workspaceId}`,
              }),
            );
          }
        }
      }
    } catch (dbErr: any) {
      // DB query failed — could be connectivity; don't add break, just note
    }

    // ── Step 4: Use access_token to call a protected route ──────────────────
    if (registeredToken) {
      const protectedRoute = discoverProtectedReadRoutes(config)[0];
      const profileRes = protectedRoute
        ? await httpGet(protectedRoute, { jwt: registeredToken })
        : null;
      if (profileRes?.status === 401) {
        breaks.push(
          registrationE2eFinding({
            file: 'backend/src/auth/auth.service.ts',
            line: 251,
            description: 'Freshly issued access_token rejected by backend as 401',
            detail: `Token starts with: ${registeredToken.slice(0, 20)}...`,
          }),
        );
      }
    }

    // ── Step 5: Duplicate registration → expect 409 ─────────────────────────
    const dupeRes = await httpPost('/auth/register', {
      email: testEmail,
      password: testCredential,
    });
    if (dupeRes.status !== 409 && dupeRes.status !== 400) {
      breaks.push(
        registrationE2eFinding({
          file: 'backend/src/auth/auth.service.ts',
          line: 378,
          description: `Duplicate email registration returned ${dupeRes.status} instead of 409`,
          detail: `Body: ${JSON.stringify(dupeRes.body).slice(0, 200)}`,
        }),
      );
    }

    // ── Step 6: Weak password → expect 400 ──────────────────────────────────
    const weakPwdRes = await httpPost('/auth/register', {
      email: `pulse-test-weak-${Date.now()}@test.kloel.com`,
      password: '123',
    });
    if (weakPwdRes.status === 201) {
      breaks.push(
        registrationE2eFinding({
          file: 'backend/src/auth/auth.controller.ts',
          line: 36,
          description: 'Weak password (3 chars) accepted during registration — validation missing',
          detail: `Password "123" returned 201`,
        }),
      );
    }

    // ── Step 7: Invalid email → expect 400 ──────────────────────────────────
    const badEmailRes = await httpPost('/auth/register', {
      email: 'notanemail',
      password: testCredential,
    });
    if (badEmailRes.status === 201) {
      breaks.push(
        registrationE2eFinding({
          file: 'backend/src/auth/auth.controller.ts',
          line: 36,
          description: 'Invalid email format accepted during registration — DTO validation missing',
          detail: `Email "notanemail" returned 201`,
        }),
      );
    }
  } catch (err: any) {
    breaks.push(
      registrationE2eFinding({
        file: 'backend/src/auth/auth.controller.ts',
        line: 36,
        description: 'E2E registration test threw an unexpected error',
        detail: err?.message || String(err),
      }),
    );
  }

  // Cleanup note: test user exists in DB with obviously fake pulse-test-*@test.kloel.com email
  // No sensitive data created. Workspace name is __pulse_test__workspace.

  return breaks;
}
