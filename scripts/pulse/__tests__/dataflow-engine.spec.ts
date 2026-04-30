import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildDataflowState } from '../dataflow-engine';

function writeFixture(rootDir: string, relativePath: string, content: string): void {
  const fullPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

describe('PULSE dataflow engine evidence derivation', () => {
  it('uses schema and source evidence instead of fixed field/path/audit tokens as final truth', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dataflow-evidence-'));

    writeFixture(
      rootDir,
      'backend/prisma/schema.prisma',
      `
      model Account {
        id String @id
        invoices Invoice[]
        contacts Contact[]
      }

      model Invoice {
        id String @id
        workspaceId String
        account Account @relation(fields: [workspaceId], references: [id])
        amountCents BigInt
        customerEmail String // @pii
        status InvoiceStatus
        createdAt DateTime @default(now())
        updatedAt DateTime @updatedAt
      }

      model Contact {
        id String @id
        workspaceId String
        account Account @relation(fields: [workspaceId], references: [id])
      }

      model LooseRecord {
        id String @id
        workspaceId String
        amountCents BigInt
        customerEmail String
      }

      model WeakCommerceSignal {
        id String @id
        total String
        currency String
        customerEmail String
      }

      model PipelineRun {
        id String @id
        lifecycle PipelineRunLifecycle
        createdAt DateTime @default(now())
      }

      model LedgerAudit {
        id String @id
        action String
        entityId String
        createdAt DateTime @default(now())
      }

      model AuditLog {
        id String @id
        createdAt DateTime @default(now())
      }

      enum InvoiceStatus {
        OPEN
        PAID
      }

      enum PipelineRunLifecycle {
        QUEUED
        FINISHED
      }
      `,
    );

    writeFixture(
      rootDir,
      'backend/src/opaque-file.ts',
      `
      import { Injectable } from '@nestjs/common';

      type TxClient = {
        invoice: { create(input: unknown): Promise<{ id: string }> };
        ledgerAudit: { create(input: unknown): Promise<unknown> };
        looseRecord: { create(input: unknown): Promise<unknown> };
        auditLog: { create(input: unknown): Promise<unknown> };
      };

      @Injectable()
      export class InvoiceWriterService {
        async createInvoice(tx: TxClient) {
          const invoice = await tx.invoice.create({
            data: { workspaceId: 'acc_1', amountCents: 100n, customerEmail: 'a@b.test', status: 'OPEN' },
          });
          await tx.ledgerAudit.create({
            data: { action: 'invoice.created', entityId: invoice.id },
          });
          return invoice;
        }

        async createLoose(tx: TxClient) {
          return tx.looseRecord.create({
            data: { workspaceId: 'loose', amountCents: 100n, customerEmail: 'a@b.test' },
          });
        }

        async createTokenNamedAuditLog(tx: TxClient) {
          return tx.auditLog.create({ data: {} });
        }
      }
      `,
    );

    const state = buildDataflowState(rootDir);
    const invoice = state.entities.find((entity) => entity.model === 'Invoice');
    const loose = state.entities.find((entity) => entity.model === 'LooseRecord');
    const weakCommerceSignal = state.entities.find(
      (entity) => entity.model === 'WeakCommerceSignal',
    );
    const pipelineRun = state.entities.find((entity) => entity.model === 'PipelineRun');
    const tokenNamedAuditLog = state.entities.find((entity) => entity.model === 'AuditLog');

    expect(invoice).toMatchObject({
      financial: true,
      hasWorkspaceIsolation: true,
      hasAuditTrail: true,
      piiFields: ['customerEmail'],
    });
    expect(invoice?.createdBy[0]?.source).toBe(
      'source_construct:decorated_class:Injectable:InvoiceWriterService',
    );

    expect(loose).toMatchObject({
      financial: true,
      hasWorkspaceIsolation: false,
      hasAuditTrail: false,
      piiFields: [],
    });
    expect(loose?.rawSignals).toContainEqual(
      expect.objectContaining({
        detector: 'unclassified-schema-field',
        field: 'customerEmail',
        truthMode: 'weak_signal',
      }),
    );

    expect(weakCommerceSignal).toMatchObject({
      financial: false,
      critical: false,
      piiFields: [],
    });
    expect(weakCommerceSignal?.rawSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detector: 'unclassified-schema-field',
          field: 'total',
          truthMode: 'weak_signal',
        }),
        expect.objectContaining({
          detector: 'unclassified-schema-field',
          field: 'currency',
          truthMode: 'weak_signal',
        }),
        expect.objectContaining({
          detector: 'unclassified-schema-field',
          field: 'customerEmail',
          truthMode: 'weak_signal',
        }),
      ]),
    );

    expect(pipelineRun).toMatchObject({
      hasMutableState: true,
      hasVersionHistory: false,
    });
    expect(pipelineRun?.stateMachine?.[0]).toMatchObject({
      field: 'lifecycle',
      enumName: 'PipelineRunLifecycle',
      totalEnumMembers: 2,
    });

    expect(tokenNamedAuditLog).toMatchObject({
      hasAuditTrail: false,
    });
    expect(
      state.gaps.find((gap) => gap.model === 'LooseRecord' && gap.missing.includes('workspaceId')),
    ).toBeUndefined();
    expect(
      state.gaps.find(
        (gap) =>
          gap.model === 'LooseRecord' &&
          gap.missing.includes('schema-backed tenant relation evidence'),
      ),
    ).toBeDefined();
  });
});
