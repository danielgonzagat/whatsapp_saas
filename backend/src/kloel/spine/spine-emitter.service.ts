import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ValenceTaggerService } from '../mind/valence-tagger.service';
import type { SpineEventRef } from '../mind/mind.types';
import type { SpineEventEnvelope, SpineEventInput } from './spine-event.types';

/**
 * SpineEmitterService — the single in-process spine for cognitive events.
 *
 * Implements PCI.1 + B17. Every surface emitter calls .emit() AFTER the
 * business effect succeeds. The spine stamps the universal envelope
 * (eventId, timestamp, occurredAt, environment) and runs the
 * ValenceTaggerService to auto-tag terminal valence (B7).
 *
 * Storage: in-memory ring buffer (default 5000). Emission never throws —
 * the business path is sacred; surface emitters wrap .emit() in
 * try/catch with no business consequence on failure.
 */

const DEFAULT_RING_CAPACITY = 5000;

function detectEnvironment(): 'dev' | 'staging' | 'prod' {
  const env = (process.env['NODE_ENV'] ?? 'development').toLowerCase();
  if (env === 'production' || env === 'prod') return 'prod';
  if (env === 'staging') return 'staging';
  return 'dev';
}

@Injectable()
export class SpineEmitterService {
  private readonly logger = new Logger(SpineEmitterService.name);
  private readonly ring: SpineEventEnvelope[] = [];
  private readonly ringCapacity: number;
  private readonly valenceTagger: ValenceTaggerService;
  private readonly environment = detectEnvironment();
  private readonly subscribers: Array<(e: SpineEventEnvelope) => void> = [];

  public constructor(
    @Optional() valenceTagger?: ValenceTaggerService,
    @Optional() @Inject('SPINE_EMITTER_OPTS') opts?: { readonly ringCapacity?: number },
  ) {
    this.valenceTagger = valenceTagger ?? new ValenceTaggerService();
    this.ringCapacity = Math.max(1, opts?.ringCapacity ?? DEFAULT_RING_CAPACITY);
  }

  public async emit(input: SpineEventInput): Promise<SpineEventEnvelope> {
    const now = new Date();
    const eventId = `evt_${randomUUID()}`;
    const timestamp = now.toISOString();
    const occurredAt = input.occurredAt ?? timestamp;

    const base: SpineEventEnvelope = {
      eventId,
      eventName: input.eventName,
      timestamp,
      occurredAt,
      ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
      ...(input.entityRef !== undefined ? { entityRef: input.entityRef } : {}),
      truthMode: input.truthMode,
      provenance: { ...input.provenance, environment: this.environment },
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
      ...(input.causedBy !== undefined ? { causedBy: input.causedBy } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    };

    const envelope: SpineEventEnvelope = input.valence !== undefined
      ? { ...base, valence: input.valence }
      : this.applyAutoValence(base);

    this.ring.push(envelope);
    if (this.ring.length > this.ringCapacity) this.ring.shift();

    for (const sub of this.subscribers) {
      try {
        sub(envelope);
      } catch (subErr) {
        this.logger.warn(
          `subscriber threw on ${envelope.eventName}: ${(subErr as Error).message}`,
        );
      }
    }
    return envelope;
  }

  public recentEvents(limit?: number): readonly SpineEventEnvelope[] {
    if (typeof limit === 'number') {
      if (limit <= 0) return [];
      if (limit < this.ring.length) return this.ring.slice(-limit);
    }
    return this.ring.slice();
  }

  /**
   * Adapter for MIND consumers (SpineEventRef shape — subset of envelope).
   */
  public recentEventsAsRef(limit?: number): readonly SpineEventRef[] {
    return this.recentEvents(limit).map((e) => this.envelopeToRef(e));
  }

  public ringSize(): number {
    return this.ring.length;
  }

  public stats(): {
    readonly buffered: number;
    readonly capacity: number;
    readonly subscribers: number;
  } {
    return {
      buffered: this.ring.length,
      capacity: this.ringCapacity,
      subscribers: this.subscribers.length,
    };
  }

  public subscribe(handler: (e: SpineEventEnvelope) => void): () => void {
    this.subscribers.push(handler);
    return () => {
      const idx = this.subscribers.indexOf(handler);
      if (idx >= 0) this.subscribers.splice(idx, 1);
    };
  }

  private applyAutoValence(envelope: SpineEventEnvelope): SpineEventEnvelope {
    const tagged = this.valenceTagger.tag(this.envelopeToRef(envelope));
    if (tagged.valence !== undefined) {
      return { ...envelope, valence: tagged.valence };
    }
    return envelope;
  }

  private envelopeToRef(envelope: SpineEventEnvelope): SpineEventRef {
    const ref: SpineEventRef = {
      eventId: envelope.eventId,
      eventName: envelope.eventName,
      ...(envelope.workspaceId !== undefined
        ? { workspaceId: envelope.workspaceId }
        : {}),
      ...(envelope.entityRef !== undefined
        ? { entityRef: envelope.entityRef }
        : {}),
      occurredAt: envelope.occurredAt,
      truthMode: envelope.truthMode,
      ...(envelope.valence !== undefined ? { valence: envelope.valence } : {}),
      ...(envelope.payload !== undefined ? { payload: envelope.payload } : {}),
      ...(envelope.correlationId !== undefined
        ? { correlationId: envelope.correlationId }
        : {}),
    };
    return ref;
  }
}
