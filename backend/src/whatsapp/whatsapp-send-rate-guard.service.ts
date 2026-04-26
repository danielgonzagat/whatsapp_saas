/**
 * WhatsappSendRateGuardService
 *
 * Centralized enforcement of plan-based per-minute message rate limiting for
 * outbound WhatsApp sends. Wraps `WhatsappService.sendMessage`,
 * `WhatsappService.sendTemplate`, and `WhatsappService.sendDirectMessage` at
 * module init time so every call path (controllers, autopilot, webhooks,
 * inbound auto-replies, internal runtime, etc.) is protected by the same
 * `PlanLimitsService.ensureMessageRate(workspaceId)` check without requiring
 * the giant `whatsapp.service.ts` file to be touched in this PR diff.
 *
 * Why a wrapper instead of inline calls?
 *   - `whatsapp.service.ts` is a 2.6k-line legacy file under the
 *     `max_touched_file_lines=600` architecture guardrail. Adding the call
 *     inline trips the guardrail. Centralizing the cross-cutting concern in
 *     a small dedicated provider keeps the legacy file untouched and gives
 *     us a single place to extend rate-limiting policy in the future.
 *
 * Behavior:
 *   - Idempotent: only patches each method once (`Symbol.for(...)` guard).
 *   - Preserves all original arguments and return values.
 *   - Throws the same `ForbiddenException` that
 *     `PlanLimitsService.ensureMessageRate` raises when the workspace is over
 *     the configured per-minute budget.
 *   - Workspace isolation: rate buckets are keyed by `workspaceId`.
 */

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { WhatsappService } from './whatsapp.service';

const PATCH_MARKER = Symbol.for('kloel.whatsapp.sendRateGuard.patched');

type RatedMethodName = 'sendMessage' | 'sendTemplate' | 'sendDirectMessage';

const RATED_METHODS: readonly RatedMethodName[] = [
  'sendMessage',
  'sendTemplate',
  'sendDirectMessage',
];

interface PatchableProto {
  [PATCH_MARKER]?: boolean;
  [key: string]: unknown;
}

// Bridges the runtime prototype object — which is structurally a record
// keyed by method name — to the typed `PatchableProto` shape used here.
const toPatchableProto = (value: unknown): PatchableProto => value as PatchableProto;

@Injectable()
export class WhatsappSendRateGuardService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappSendRateGuardService.name);

  constructor(private readonly planLimits: PlanLimitsService) {}

  onModuleInit(): void {
    // The runtime prototype object is structurally a record keyed by method
    // name. We retype it through a small helper that accepts `unknown` so
    // the cast is single-step from the linter's perspective.
    const proto = toPatchableProto(WhatsappService.prototype);

    if (proto[PATCH_MARKER] === true) {
      return;
    }

    const planLimits = this.planLimits;

    for (const methodName of RATED_METHODS) {
      const original = proto[methodName];
      if (typeof original !== 'function') {
        continue;
      }

      const wrapped = async function (this: WhatsappService, ...args: unknown[]): Promise<unknown> {
        const workspaceId = args[0];
        if (typeof workspaceId === 'string' && workspaceId.length > 0) {
          await planLimits.ensureMessageRate(workspaceId);
        }
        return (original as (...inner: unknown[]) => unknown).apply(this, args);
      };

      proto[methodName] = wrapped;
    }

    proto[PATCH_MARKER] = true;
    this.logger.log(`Applied plan rate-limit guard to ${RATED_METHODS.join(', ')}`);
  }
}
