import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { checkAuditTrail } from '../parsers/audit-trail-checker';
import type { Break, PulseConfig } from '../types';

type AuditTrailBreak = Break & {
  truthMode?: string;
};

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-audit-trail-'));
  const backendDir = path.join(rootDir, 'backend');
  const frontendDir = path.join(rootDir, 'frontend');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend', 'prisma', 'schema.prisma');

  fs.mkdirSync(path.join(backendDir, 'src'), { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });

  fs.writeFileSync(schemaPath, 'model AuditLog { id String @id }\n', 'utf8');

  return {
    rootDir,
    backendDir,
    frontendDir,
    workerDir,
    schemaPath,
    globalPrefix: '',
  };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const file = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('audit trail checker diagnostics', () => {
  it('emits evidence diagnostics instead of fixed audit labels for regex-only signals', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/billing.service.ts',
      `
      export class BillingService {
        async processPayment() {
          return this.prisma.payment.create({ data: { amountCents: 1200 } });
        }
      }
      `,
    );

    const findings = checkAuditTrail(config) as AuditTrailBreak[];
    const finding = findings.find((entry) =>
      entry.type.includes('financial-mutation-signal+audit-write-not-observed'),
    );

    expect(finding).toMatchObject({
      type: 'diagnostic:audit-trail-checker:financial-mutation-signal+audit-write-not-observed',
      severity: 'critical',
      source:
        'regex-heuristic:audit-trail-checker;truthMode=weak_signal;predicates=financial_mutation_signal,audit_write_not_observed',
      surface: 'audit-trail',
      truthMode: 'weak_signal',
    });
    expect(findings.every((entry) => entry.type.startsWith('diagnostic:'))).toBe(true);
  });

  it('marks schema absence as confirmed static evidence with neutral diagnostic identity', () => {
    const config = makeConfig();
    fs.writeFileSync(config.schemaPath, 'model User { id String @id }\n', 'utf8');

    expect(checkAuditTrail(config)).toContainEqual(
      expect.objectContaining({
        type: 'diagnostic:audit-trail-checker:audit-log-model-not-observed',
        source:
          'schema-static:audit-trail-checker;truthMode=confirmed_static;predicates=audit_log_model_not_observed',
        surface: 'audit-trail',
        truthMode: 'confirmed_static',
      }),
    );
  });

  it('keeps permission join-table cleanup out of sensitive deletion signals', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/access.service.ts',
      `
      export class AccessService {
        async cleanupPermission(roleId: string) {
          await this.prisma.rolePermission.deleteMany({ where: { roleId } });
        }
      }
      `,
    );

    expect(checkAuditTrail(config).map((entry) => entry.type)).not.toContain(
      'diagnostic:audit-trail-checker:sensitive-deletion-signal+audit-write-not-observed',
    );
  });
});
