import { Injectable, Logger } from '@nestjs/common';
import { ValenceTaggerService } from '../mind/valence-tagger.service';
import type { SpineEventRef } from '../mind/mind.types';
import type { SpineEventEnvelope, SpineEventInput } from './spine-event.types';

/**
 * SpineEmitterService — the single in-process spine for cognitive events.
 *
 * Implements PCI.1 + B17. Every B17 surface emitter calls .emit() AFTER
 * the business effect succeeds. The spine stamps the universal envelope
 * (eventId, timestamp, occurredAt, environment) and runs the
 * ValenceTaggerService to auto-tag terminal valence (B7).
 *
 * Storage: in-memory ring buffer (default 5000) — sufficient for the MIND
 * substrate, GOAL detectors, LOCAL-IDENT and other consumers in Onda 1+2.
 * A Prisma-backed repository is a later UTP (when the spine becomes the
 * authoritative event store, not just the working buffer).
 *
 * Emission NEVER throws. The business path is sacred — surface emitters
 * call .emit() inside try/catch with no business consequence on failure.
 */
@Injectable()
export class SpineEmitterService {
  private readonly logger = new Logger(SpineEmitterService.name);
  private readonly ringCapacity: number;
  private readonly ring: SpineEventEnvelope[] = [];
  private head = 0;
  private size = 0;
  private readonly subscribers: Array<(e: SpineEventEnvelope) => void> = [];

  public constructor(
    private readonly valenceTagger: ValenceTaggerService,
    opts: { readonly ringCapacity?: number } = {},
  ) {
    this.ringCapacity = Math.max(64, opts.ringCapacity ?? 5000);
  }

  public emit(input: SpineEventInput): SpineEventEnvelope {
    const envelope = this.compose(input);
    this.ring[this.head] = envelope;
    this.head = (this.head + 1) % this.ringCapacity;
    if (this.size < this.ringCapacity) this.size += 1;
    for (const s of this.subscribers) {
      try {
        s(envelope);
      } catch (subErr) {
        this.logger.warn(
          `subscriber threw on event ${envelope.eventName} — ${(subErr as Error).message}`,
        );
      }
    }
    return envelope;
  }

  public recentEvents(limit?: number): readonly SpineEventEnvelope[] {
    if (this.size === 0) return [];
    const out: SpineEventEnvelope[] = [];
    const start = (this.head - this.size + this.ringCapacity) % this.ringCapacity;
    for (let i = 0; i < this.size; i += 1) {
      const idx = (start + i) % this.ringCapacity;
      const ev = this.ring[idx];
      if (ev) out.push(ev);
    }
    if (typeof limit === 'number' && limit > 0 && limit < out.length) {
      return out.slice(out.length - limit);
    }
    return out;
  }

  /**
   * Adapter — converts envelopes into SpineEventRef (the shape MIND
   * services consume). Drops fields MIND doesn't need to keep RAM low.
   */
  public recentEventsAsRef(limit?: number): readonly SpineEventRef[] {
    return this.recentEvents(limit).map((e) => {
      const ref: SpineEventRef = {
        eventId: e.eventId,
        eventName: e.eventName,
        ...(e.workspaceId !== undefined ? { workspaceId: e.workspaceId } : {}),
        ...(e.entityRef !== undefined ? { entityRef: e.entityRef } : {}),
        occurredAt: e.occurredAt,
        truthMode: e.truthMode,
        ...(e.valence !== undefined ? { valence: e.valence } : {}),
        ...(e.payload !== undefined ? { payload: e.payload } : {}),
        ...(e.correlationId !== undefined ? { correlationId: e.correlationId } : {}),
      };
      return ref;
    });
  }

  public subscribe(handler: (e: SpineEventEnvelope) => void): () => void {
    this.subscribers.push(handler);
    return () => {
      const idx = this.subscribers.indexOf(handler);
      if (idx >= 0) this.subscribers.splice(idx, 1);
    };
  }

  public stats(): {
    readonly buffered: number;
    readonly capacity: number;
    readonly subscribers: number;
  } {
    return {
      buffered: this.size,
      capacity: this.ringCapacity,
      subscribers: this.subscribers.length,
    };
  }

  private compose(input: SpineEventInput): SpineEventEnvelope {
    const now = new Date();
    const envelope: SpineEventEnvelope = {
      eventId: SpineEmitterService.generateEventId(now),
      eventName: input.eventName,
      timestamp: now.toISOString(),
      occurredAt: input.occurredAt ?? now.toISOString(),
      ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
      ...(input.entityRef !== undefined ? { entityRef: input.entityRef } : {}),
      truthMode: input.truthMode,
      provenance: {
        ...input.provenance,
        environment: SpineEmitterService.resolveEnvironment(),
      },
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
      ...(input.causedBy !== undefined ? { causedBy: input.causedBy } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    };
    if (input.valence !== undefined) {
      return { ...envelope, valence: input.valence };
    }
    const tagged = this.valenceTagger.tag({
      eventId: envelope.eventId,
      eventName: envelope.eventName,
      occurredAt: envelope.occurredAt,
      truthMode: envelope.truthMode,
    });
    if (tagged.valence !== undefined) {
      return { ...envelope, valence: tagged.valence };
    }
    return envelope;
  }

  private static resolveEnvironment(): 'dev' | 'staging' | 'prod' {
    const env = process.env['NODE_ENV'];
    if (env === 'production') return 'prod';
    if (env === 'staging') return 'staging';
    return 'dev';
  }

  private static generateEventId(now: Date): string {
    const ms = now.getTime().toString(16).padStart(12, '0');
    const rand = Math.random().toString(16).slice(2, 14).padStart(12, '0');
    return `evt_${ms}_${rand}`;
  }
}
