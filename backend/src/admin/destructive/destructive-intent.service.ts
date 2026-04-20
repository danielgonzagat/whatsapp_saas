import { Injectable, Logger } from '@nestjs/common';
import { DestructiveIntentKind, DestructiveIntentStatus, type Prisma } from '@prisma/client';
import { randomBytes, randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { sha256Hex } from '../common/admin-crypto';
import { adminErrors } from '../common/admin-api-errors';
import { DestructiveIntentRegistry, UnsupportedUndoError } from './destructive-handler.registry';
import type { DestructiveIntentRecord, DestructiveIntentView } from './destructive-intent.types';
import { toDestructiveIntentView } from './destructive-intent.types';

const DEFAULT_TTL_SECONDS = 300; // 5 min — I-ADMIN-D2
const MAX_TTL_SECONDS = 900;
const CHALLENGE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/l
const CHALLENGE_LENGTH = 6;
const UNDO_TOKEN_BYTES = 24;

export interface CreateDestructiveIntentInput {
  adminUserId: string;
  kind: DestructiveIntentKind;
  targetType: string;
  targetId: string;
  reason: string;
  ip: string;
  userAgent: string;
  ttlSeconds?: number;
}

export interface ConfirmDestructiveIntentInput {
  intentId: string;
  adminUserId: string;
  challenge: string;
  ip: string;
  userAgent: string;
}

export interface UndoDestructiveIntentInput {
  intentId: string;
  adminUserId: string;
  undoToken: string;
  ip: string;
  userAgent: string;
}

function clampTtl(requested: number | undefined): number {
  if (requested === undefined) {
    return DEFAULT_TTL_SECONDS;
  }
  if (requested < 30) {
    return 30;
  }
  if (requested > MAX_TTL_SECONDS) {
    return MAX_TTL_SECONDS;
  }
  return Math.floor(requested);
}

function generateChallenge(): string {
  // Use crypto.randomInt for guaranteed unbiased index selection.
  // Reading a byte and applying `% alphabetLen` would bias the
  // distribution unless alphabetLen divides 256 evenly — CodeQL's
  // js/biased-cryptographic-random can't prove that at build time
  // and flags the pattern, so we use the explicit unbiased helper.
  let out = '';
  for (let i = 0; i < CHALLENGE_LENGTH; i += 1) {
    out += CHALLENGE_ALPHABET.charAt(randomInt(0, CHALLENGE_ALPHABET.length));
  }
  return out;
}

function generateUndoToken(): string {
  return randomBytes(UNDO_TOKEN_BYTES).toString('base64url');
}

/**
 * DestructiveIntentService is the single authorised entry point for
 * creating and executing destructive admin actions. See SP-8 design
 * doc (docs/superpowers/specs/2026-04-15-adm-kloel-sp8-destructive-ops-design.md)
 * for the invariants (I-ADMIN-D1..D6).
 */
@Injectable()
export class DestructiveIntentService {
  private readonly logger = new Logger(DestructiveIntentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DestructiveIntentRegistry,
  ) {}

  async create(input: CreateDestructiveIntentInput): Promise<DestructiveIntentView> {
    const handler = this.registry.resolve(input.kind);
    if (!handler) {
      throw adminErrors.destructiveHandlerMissing(input.kind);
    }

    const ttl = clampTtl(input.ttlSeconds);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000);
    const challenge = generateChallenge();

    const created = await this.prisma.destructiveIntent.create({
      data: {
        createdByAdminUserId: input.adminUserId,
        kind: input.kind,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        challenge,
        requiresOtp: handler.requiresOtp,
        reversible: handler.reversible,
        status: DestructiveIntentStatus.PENDING,
        expiresAt,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });

    return toDestructiveIntentView(created);
  }

  async confirm(input: ConfirmDestructiveIntentInput): Promise<DestructiveIntentView> {
    const intent = await this.loadIntent(input.intentId);

    // Idempotency (I-ADMIN-D4): if already executed, return the cached
    // snapshot instead of replaying.
    if (
      intent.status === DestructiveIntentStatus.EXECUTED ||
      intent.status === DestructiveIntentStatus.FAILED
    ) {
      return toDestructiveIntentView(intent);
    }

    this.assertNotExpired(intent);
    this.assertConfirmInvariants(intent, input);

    const confirmed = await this.prisma.destructiveIntent.update({
      where: { id: intent.id },
      data: {
        status: DestructiveIntentStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
    });

    const executed = await this.executeIntent(confirmed, input.adminUserId);
    return toDestructiveIntentView(executed);
  }

  async get(intentId: string): Promise<DestructiveIntentView> {
    const intent = await this.loadIntent(intentId);
    return toDestructiveIntentView(intent);
  }

  async undo(input: UndoDestructiveIntentInput): Promise<DestructiveIntentView> {
    const intent = await this.loadIntent(input.intentId);

    if (intent.status !== DestructiveIntentStatus.EXECUTED) {
      throw adminErrors.destructiveInvalidState(
        intent.id,
        `Intent is ${intent.status}, cannot undo`,
      );
    }
    if (!intent.reversible) {
      throw adminErrors.destructiveInvalidState(intent.id, 'Intent is not reversible');
    }
    if (!intent.undoTokenHash || !intent.undoExpiresAt) {
      throw adminErrors.destructiveInvalidState(intent.id, 'Intent has no undo token');
    }
    if (intent.undoExpiresAt.getTime() < Date.now()) {
      throw adminErrors.destructiveExpired(intent.id);
    }
    if (sha256Hex(input.undoToken) !== intent.undoTokenHash) {
      throw adminErrors.destructiveUndoTokenInvalid();
    }

    const handler = this.registry.resolve(intent.kind);
    if (!handler) {
      throw adminErrors.destructiveHandlerMissing(intent.kind);
    }

    try {
      const result = await handler.undo(intent);
      const patched = await this.prisma.destructiveIntent.update({
        where: { id: intent.id },
        data: {
          status: DestructiveIntentStatus.UNDONE,
          undoAt: new Date(),
          resultSnapshot: {
            ...(intent.resultSnapshot as Prisma.JsonObject | null),
            undo: result.snapshot,
          } as Prisma.InputJsonValue,
        },
      });
      return toDestructiveIntentView(patched);
    } catch (error) {
      if (error instanceof UnsupportedUndoError) {
        throw adminErrors.destructiveInvalidState(intent.id, error.message);
      }
      throw error;
    }
  }

  // ---- internals ----------------------------------------------------------

  private async loadIntent(id: string): Promise<DestructiveIntentRecord> {
    const intent = await this.prisma.destructiveIntent.findUnique({ where: { id } });
    if (!intent) {
      throw adminErrors.destructiveNotFound(id);
    }
    return intent;
  }

  private assertNotExpired(intent: DestructiveIntentRecord): void {
    if (intent.status === DestructiveIntentStatus.EXPIRED) {
      throw adminErrors.destructiveExpired(intent.id);
    }
    if (intent.expiresAt.getTime() < Date.now()) {
      // Transition to EXPIRED lazily on access.
      void this.prisma.destructiveIntent
        .update({
          where: { id: intent.id },
          data: { status: DestructiveIntentStatus.EXPIRED },
        })
        .catch((err) => {
          this.logger.warn(`Failed to mark intent ${intent.id} expired: ${String(err)}`);
        });
      throw adminErrors.destructiveExpired(intent.id);
    }
  }

  private assertConfirmInvariants(
    intent: DestructiveIntentRecord,
    input: ConfirmDestructiveIntentInput,
  ): void {
    if (intent.createdByAdminUserId !== input.adminUserId) {
      throw adminErrors.forbidden();
    }
    if (intent.status !== DestructiveIntentStatus.PENDING) {
      throw adminErrors.destructiveInvalidState(
        intent.id,
        `Intent is ${intent.status}, expected PENDING`,
      );
    }
    if (intent.challenge !== input.challenge) {
      throw adminErrors.destructiveChallengeMismatch();
    }
  }

  private async executeIntent(
    intent: DestructiveIntentRecord,
    adminUserId: string,
  ): Promise<DestructiveIntentRecord> {
    const handler = this.registry.resolve(intent.kind);
    if (!handler) {
      return this.prisma.destructiveIntent.update({
        where: { id: intent.id },
        data: {
          status: DestructiveIntentStatus.FAILED,
          executedAt: new Date(),
          executedByAdminUserId: adminUserId,
          failureMessage: `No handler registered for ${intent.kind}`,
        },
      });
    }

    const executing = await this.prisma.destructiveIntent.update({
      where: { id: intent.id },
      data: { status: DestructiveIntentStatus.EXECUTING },
    });

    try {
      const result = await handler.execute(executing);
      const undoToken = handler.reversible ? generateUndoToken() : null;
      const undoExpiresAt = handler.reversible ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
      const patched = await this.prisma.destructiveIntent.update({
        where: { id: intent.id },
        data: {
          status: result.ok ? DestructiveIntentStatus.EXECUTED : DestructiveIntentStatus.FAILED,
          executedAt: new Date(),
          executedByAdminUserId: adminUserId,
          failureMessage: result.ok ? null : 'handler returned ok=false',
          resultSnapshot: {
            ...result.snapshot,
            ...(undoToken ? { undoToken } : {}),
          } as Prisma.InputJsonValue,
          undoTokenHash: undoToken ? sha256Hex(undoToken) : null,
          undoExpiresAt,
        },
      });
      return patched;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.prisma.destructiveIntent.update({
        where: { id: intent.id },
        data: {
          status: DestructiveIntentStatus.FAILED,
          executedAt: new Date(),
          executedByAdminUserId: adminUserId,
          failureMessage: message,
        },
      });
    }
  }
}
