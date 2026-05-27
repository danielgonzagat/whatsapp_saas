import { Injectable } from '@nestjs/common';
import type { AbiValence } from '../abi/abi-schema';
import { defaultValenceFor, isTerminalEvent, SpineEventRef } from './mind.types';

/**
 * UTP-MIND-VALENCE-001 — Automatic valence tagger for terminal events.
 *
 * Implements PCI.5 §3 + B7. Pure: input event → tagged event (or unchanged
 * event when not terminal or already tagged).
 */
@Injectable()
export class ValenceTaggerService {
  public tag(event: SpineEventRef): SpineEventRef {
    if (event.valence) {return event;}
    if (!isTerminalEvent(event.eventName)) {return event;}
    const inferred = defaultValenceFor(event.eventName);
    if (!inferred) {return event;}
    return { ...event, valence: inferred };
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
}
