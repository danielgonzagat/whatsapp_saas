/**
 * UTP-RECOVERY-004 — Error Non-Repeat Guard.
 *
 * Registers error fingerprints in an in-memory ledger and blocks
 * repeat actions when a matching fingerprint exists within the
 * cooldown window. Implements the guard of non-repetition from
 * B0.2 — error converts trust when it is not repeated.
 *
 * Service class (stateful: maintains fingerprint ledger).
 */

import { Injectable } from '@nestjs/common';
import type { DetectedError, ErrorFingerprint } from './recovery.types';

const DEFAULT_COOLDOWN_HOURS = 24;

interface FingerprintEntry {
  readonly fingerprint: ErrorFingerprint;
  blockedUntil: number;
}

@Injectable()
export class ErrorNonRepeatGuard {
  private readonly ledger = new Map<string, FingerprintEntry>();

  public register(error: DetectedError): ErrorFingerprint {
    const key = this.fingerprintKey(error);
    const existing = this.ledger.get(key);

    if (existing) {
      const updated: ErrorFingerprint = {
        ...existing.fingerprint,
        repeatCount: existing.fingerprint.repeatCount + 1,
        lastSeenAt: error.detectedAt,
      };
      existing.blockedUntil =
        Date.now() + DEFAULT_COOLDOWN_HOURS * 60 * 60 * 1000;
      this.ledger.set(key, {
        fingerprint: updated,
        blockedUntil: existing.blockedUntil,
      });
      return updated;
    }

    const entry: FingerprintEntry = {
      fingerprint: error.fingerprint,
      blockedUntil: Date.now() + DEFAULT_COOLDOWN_HOURS * 60 * 60 * 1000,
    };
    this.ledger.set(key, entry);
    return error.fingerprint;
  }

  public isBlocked(error: DetectedError): boolean {
    const key = this.fingerprintKey(error);
    const entry = this.ledger.get(key);
    if (!entry) {return false;}
    return Date.now() < entry.blockedUntil;
  }

  public cooldownRemainingMs(error: DetectedError): number {
    const key = this.fingerprintKey(error);
    const entry = this.ledger.get(key);
    if (!entry) {return 0;}
    return Math.max(0, entry.blockedUntil - Date.now());
  }

  public repeatCount(error: DetectedError): number {
    const key = this.fingerprintKey(error);
    const entry = this.ledger.get(key);
    return entry?.fingerprint.repeatCount ?? 0;
  }

  public ledgerSize(): number {
    return this.ledger.size;
  }

  public clear(): void {
    this.ledger.clear();
  }

  private fingerprintKey(error: DetectedError): string {
    return `${error.workspaceId}:${error.category}:${error.fingerprint.eventPatternHash}`;
  }
}
