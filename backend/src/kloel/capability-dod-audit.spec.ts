import { ModulesContainer } from '@nestjs/core';
import { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import { CAPABILITY_DEFINITIONS } from './capability-registry-v2/capability-registry-v2.const';
import type { CapabilityDefinition } from './capability-registry-v2/capability-registry-v2.types';
import {
  buildCanonicalReceipt,
  deriveIdempotencyKey,
  hashReceiptPayload,
  IDEMPOTENCY_WINDOW_MS,
} from './kloel-tool-dispatcher.receipt.helpers';

/**
 * Wave7 L7 — per-capability Definition-of-Done (Y-2) audit.
 *
 * For every capability registered in CapabilityRegistryV2 this suite asserts the
 * canonical contract:
 *   1. Registry shape — id, title, schema (array), permissions (array),
 *      domainService ref, emits (array), valid category/tier.
 *   2. Confirmation gate — MUTATION_SENSITIVE caps MUST require confirmation.
 *   3. Receipt completeness — buildCanonicalReceipt populates every Y-2 field
 *      (capabilityId/toolName, title/intent, actorId, workspaceId,
 *      inputs-redacted, outputs, domainEvents, auditLogId, evidenceUrl when
 *      applicable, idempotencyKey) and never leaks sensitive input keys.
 *   4. Idempotency derivation — actorId + intent + payloadHash + 60s bucket.
 *
 * The registry partitions are owned by other lanes; this spec is read-only over
 * them and only exercises the receipt builders in the L7 fence.
 */

/** Required ExecutionReceipt fields per Y-2 DoD. */
const REQUIRED_RECEIPT_FIELDS = [
  'capabilityId',
  'title',
  'workspaceId',
  'actorId',
  'inputs',
  'outputs',
  'domainEvents',
  'auditLogId',
  'idempotencyKey',
  'timestamp',
  'durationMs',
  'success',
] as const;

const VALID_CATEGORIES = new Set([
  'SELF_AWARENESS',
  'MUTATION_SENSITIVE',
  'MUTATION_SAFE',
  'QUERY',
  'COMMUNICATION',
  'CONFIGURATION',
  'META',
]);

function buildRegistry(): CapabilityRegistryV2Service {
  // Empty container is sufficient: this audit never calls listGaps().
  const emptyContainer = new Map() as unknown as ModulesContainer;
  return new CapabilityRegistryV2Service(emptyContainer);
}

describe('Capability DoD audit (Y-2) — every registered capability', () => {
  const registry = buildRegistry();
  const caps = CAPABILITY_DEFINITIONS;

  it('registry is non-empty', () => {
    expect(caps.length).toBeGreaterThan(0);
  });

  it('has no duplicate capability ids', () => {
    const seen = new Map<string, number>();
    for (const cap of caps) {
      seen.set(cap.id, (seen.get(cap.id) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    expect(dupes).toEqual([]);
  });

  describe.each(caps.map((cap): [string, CapabilityDefinition] => [cap.id, cap]))(
    'capability %s',
    (_id, cap) => {
      it('has a non-empty title', () => {
        expect(typeof cap.title).toBe('string');
        expect(cap.title.trim().length).toBeGreaterThan(0);
      });

      it('declares an input schema array', () => {
        expect(Array.isArray(cap.inputSchema)).toBe(true);
      });

      it('declares a required-permissions array', () => {
        expect(Array.isArray(cap.requiredPermissions)).toBe(true);
      });

      it('declares an emitted-events array', () => {
        expect(Array.isArray(cap.emits)).toBe(true);
      });

      it('references a domain service', () => {
        expect(typeof cap.domainService).toBe('string');
        expect(cap.domainService.length).toBeGreaterThan(0);
      });

      it('has a valid category', () => {
        expect(VALID_CATEGORIES.has(cap.category)).toBe(true);
      });

      it('has a numeric tier', () => {
        expect(typeof cap.tier).toBe('number');
        expect(Number.isFinite(cap.tier)).toBe(true);
      });

      it('requires confirmation when MUTATION_SENSITIVE', () => {
        if (cap.category === 'MUTATION_SENSITIVE') {
          expect(cap.requiresConfirmation).toBe(true);
        } else {
          expect(typeof cap.requiresConfirmation).toBe('boolean');
        }
      });

      it('produces a fully-populated canonical receipt', () => {
        const startedAt = Date.now() - 7;
        const result = buildCanonicalReceipt(
          registry,
          cap.id,
          'ws_audit',
          { productId: 'p_audit', password: 'should-be-redacted', cpf: '00000000000' },
          { success: true, product: { id: 'p_audit', name: 'audit' } },
          'user_audit',
          startedAt,
        ) as Record<string, unknown> & { receipt?: Record<string, unknown> };

        const receipt = result.receipt;
        expect(receipt).toBeDefined();
        const rec = receipt;
        for (const field of REQUIRED_RECEIPT_FIELDS) {
          expect(rec[field]).toBeDefined();
        }
        expect(rec.capabilityId).toBe(cap.id);
        expect(rec.title).toBe(cap.title);
        expect(rec.actorId).toBe('user_audit');
        expect(rec.workspaceId).toBe('ws_audit');
        expect(rec.success).toBe(true);
        // domainEvents on success must mirror the cap's declared emits.
        expect(rec.domainEvents).toEqual(cap.emits);
      });

      it('redacts sensitive input keys in the receipt', () => {
        const result = buildCanonicalReceipt(
          registry,
          cap.id,
          'ws_audit',
          { password: 'secret', token: 'tok', cpf: '123', card: '4111', safe: 'ok' },
          { success: true },
          'user_audit',
          Date.now(),
        ) as { receipt?: { inputs?: Record<string, unknown> } };

        const inputs = result.receipt?.inputs ?? {};
        expect('password' in inputs).toBe(false);
        expect('token' in inputs).toBe(false);
        expect('cpf' in inputs).toBe(false);
        expect('card' in inputs).toBe(false);
        expect(inputs.safe).toBe('ok');
      });

      it('derives a 60s-bucketed idempotency key (actorId+intent+payloadHash+bucket)', () => {
        // Align to a 60s bucket boundary so the +59s probe stays in-window.
        const now = Math.floor(1_700_000_000_000 / IDEMPOTENCY_WINDOW_MS) * IDEMPOTENCY_WINDOW_MS;
        const inputs = { productId: 'p_audit', amount: 100 };
        const key = deriveIdempotencyKey(cap.id, 'user_audit', inputs, now);
        const parts = key.split(':');
        expect(parts).toHaveLength(4);
        // actorId, intent(capabilityId-sanitized), payloadHash, bucket
        expect(parts[0]).toBe('user_audit');
        expect(parts[1]).toBe(cap.id.replace(/[^a-zA-Z0-9._-]/g, '_'));
        expect(parts[2]).toBe(hashReceiptPayload(inputs));
        expect(parts[3]).toBe(String(Math.floor(now / IDEMPOTENCY_WINDOW_MS)));

        // Same actor/intent/payload within the same 60s window → same key.
        const sameWindow = deriveIdempotencyKey(cap.id, 'user_audit', inputs, now + 59_000);
        expect(sameWindow).toBe(key);

        // Next minute → distinct key (not an idempotent replay).
        const nextWindow = deriveIdempotencyKey(cap.id, 'user_audit', inputs, now + 61_000);
        expect(nextWindow).not.toBe(key);
      });
    },
  );
});

describe('Capability DoD audit — aggregate failure report', () => {
  it('reports zero DoD violations across the whole registry', () => {
    const registry = buildRegistry();
    const failures: string[] = [];

    for (const cap of CAPABILITY_DEFINITIONS) {
      if (!cap.title?.trim()) {
        failures.push(`${cap.id}: missing title`);
      }
      if (!Array.isArray(cap.inputSchema)) {
        failures.push(`${cap.id}: missing inputSchema`);
      }
      if (!Array.isArray(cap.requiredPermissions)) {
        failures.push(`${cap.id}: missing requiredPermissions`);
      }
      if (!cap.domainService) {
        failures.push(`${cap.id}: missing domainService`);
      }
      if (!Array.isArray(cap.emits)) {
        failures.push(`${cap.id}: missing emits`);
      }
      if (cap.category === 'MUTATION_SENSITIVE' && cap.requiresConfirmation !== true) {
        failures.push(`${cap.id}: MUTATION_SENSITIVE without requiresConfirmation`);
      }

      const result = buildCanonicalReceipt(
        registry,
        cap.id,
        'ws_audit',
        { productId: 'p', password: 'x' },
        { success: true, product: { id: 'p', name: 'n' } },
        'user_audit',
        Date.now(),
      ) as { receipt?: Record<string, unknown> };
      const rec = result.receipt;
      if (!rec) {
        failures.push(`${cap.id}: no receipt produced`);
      } else {
        for (const field of REQUIRED_RECEIPT_FIELDS) {
          if (rec[field] === undefined) {
            failures.push(`${cap.id}: receipt missing ${field}`);
          }
        }
        const inputs = rec.inputs as Record<string, unknown> | undefined;
        if (inputs && 'password' in inputs) {
          failures.push(`${cap.id}: receipt inputs not redacted`);
        }
      }
    }

    // If this fails, the message lists every offending capability for follow-up.
    expect(failures).toEqual([]);
  });
});
