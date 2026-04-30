import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { checkCookieSecurity } from '../parsers/cookie-csrf-checker';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-cookie-csrf-'));
  const backendDir = path.join(rootDir, 'backend', 'src');
  const frontendDir = path.join(rootDir, 'frontend', 'src');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend', 'prisma', 'schema.prisma');

  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });

  return { rootDir, backendDir, frontendDir, workerDir, schemaPath, globalPrefix: '' };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const file = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('cookie csrf checker dynamic evidence', () => {
  it('accepts secure cookie options and discovered csrf evidence', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'backend/src/auth.controller.ts',
      `
      export class AuthController {
        issue(response: { cookie: (name: string, value: string, options: unknown) => void }) {
          const csrfProtection = true;
          response.cookie('session', 'token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
          });
          return csrfProtection;
        }
      }
      `,
    );

    expect(checkCookieSecurity(config)).toEqual([]);
  });

  it('emits operational cookie and csrf findings from AST evidence', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'backend/src/session.controller.ts',
      `
      export class SessionController {
        issue(response: { cookie: (name: string, value: string, options: unknown) => void }) {
          response.cookie('session', 'token', { secure: false });
        }
      }
      `,
    );

    expect(checkCookieSecurity(config).map((entry) => entry.type)).toEqual([
      'COOKIE_NOT_HTTPONLY',
      'COOKIE_NOT_SECURE',
      'COOKIE_NO_SAMESITE',
      'CSRF_UNPROTECTED',
    ]);
  });
});
