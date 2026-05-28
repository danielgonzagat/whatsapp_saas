import { Injectable, Optional } from '@nestjs/common';
import type { AbiValence } from '../abi/abi-schema';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import { defaultValenceFor, isTerminalEvent, SpineEventRef } from './mind.types';

/**
 * A chat reply outcome event that the valence tagger processes into a
 * spine emission so the ValenceAggregator sees emotional evolution per
 * workspace (PI-K16-D).
 */
export interface ChatOutcomeEvent {
  readonly eventName: 'chat.replied';
  readonly workspaceId: string;
  readonly payload: {
    readonly surface: string;
    readonly success: boolean;
    readonly degraded: boolean;
  };
}

/**
 * UTP-MIND-VALENCE-001 — Automatic valence tagger for terminal events.
 *
 * Implements PCI.5 §3 + B7. Pure: input event → tagged event (or unchanged
 * event when not terminal or already tagged).
 *
 * Also exposes a fire-and-forget \`tag(ChatOutcomeEvent): void\` entry point
 * for chat reply surfaces (PI-K16-D).
 */
@Injectable()
export class ValenceTaggerService {
  public constructor(@Optional() private readonly spine?: SpineEmitterService) {}

  public tag(event: SpineEventRef): SpineEventRef;
  public tag(event: ChatOutcomeEvent): void;
  public tag(event: SpineEventRef | ChatOutcomeEvent): SpineEventRef | void {
    if (this.isChatOutcome(event)) {
      return this.handleChatOutcome(event);
    }
    return this.tagSpineEvent(event);
  }

  public tagBatch(events: readonly SpineEventRef[]): readonly SpineEventRef[] {
    return events.map((e) => this.tag(e));
  }

  public requiresValence(eventName: string): boolean {
    return isTerminalEvent(eventName);
  }

  public coverage(events: readonly SpineEventRef[]): {
    readonly terminalCount: number;
    readonly taggedCount: number;
    readonly coveragePct: number;
  } {
    const terminal = events.filter((e) => isTerminalEvent(e.eventName));
    const tagged = terminal.filter((e): e is SpineEventRef & { valence: AbiValence } =>
      Boolean(e.valence),
    );
    const terminalCount = terminal.length;
    const taggedCount = tagged.length;
    return {
      terminalCount,
      taggedCount,
      coveragePct: terminalCount === 0 ? 100 : (taggedCount / terminalCount) * 100,
    };
  }

  // ─── private helpers ───────────────────────────────────────────────

  private isChatOutcome(event: SpineEventRef | ChatOutcomeEvent): event is ChatOutcomeEvent {
    return (
      event.eventName === 'chat.replied' &&
      'payload' in event &&
      event.payload !== undefined &&
      typeof event.payload === 'object' &&
      event.payload !== null &&
      'success' in event.payload
    );
  }

  private tagSpineEvent(event: SpineEventRef): SpineEventRef {
    if (event.valence) {
      return event;
    }
    if (!isTerminalEvent(event.eventName)) {
      return event;
    }
    const inferred = defaultValenceFor(event.eventName);
    if (!inferred) {
      return event;
    }
    return { ...event, valence: inferred };
  }

  private handleChatOutcome(event: ChatOutcomeEvent): void {
    if (!this.spine) {
      return;
    }

    const valence: AbiValence = event.payload.success ? 'positive' : 'negative';

    void this.spine
      .emit({
        eventName: event.eventName,
        workspaceId: event.workspaceId,
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: 'ValenceTaggerService',
          processorVersion: '1.0.0',
          schemaVersion: '1.0.0',
        },
        valence,
        payload: event.payload as Readonly<Record<string, unknown>>,
      })
      .catch(() => {
        // fire-and-forget — emission failure is silent
      });
  }
}
