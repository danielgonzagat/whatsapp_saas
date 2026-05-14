import { Injectable } from '@nestjs/common';
import {
  CapabilityRecord,
  CapabilityRegistrySnapshot,
  InvocationOutcome,
} from './capability-registry.types';

const EVIDENCE_PROMOTE_OPERATIONAL = 5;
const EVIDENCE_PROMOTE_PRODUCTION_READY = 20;
const CONSECUTIVE_FAILURES_CONSECUTIVE_THRESHOLD = 3;

@Injectable()
export class CapabilityRegistryService {
  private readonly registry = new Map<string, CapabilityRecord>();

  public register(id: string): CapabilityRecord {
    const existing = this.registry.get(id);
    if (existing) {
      return existing;
    }
    const record: CapabilityRecord = {
      id,
      maturity: 'developing',
      runtimeEvidencePct: 0,
      lastInvokedAt: null,
      invokeCount: 0,
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    };
    this.registry.set(id, record);
    return record;
  }

  public recordInvocation(id: string, outcome: InvocationOutcome): CapabilityRecord {
    const record = this.get(id);
    const now = new Date().toISOString();

    record.lastInvokedAt = now;
    record.invokeCount += 1;

    if (outcome === 'success') {
      record.successCount += 1;
      record.consecutiveFailures = 0;
    } else {
      record.failureCount += 1;
      record.consecutiveFailures += 1;
    }

    record.runtimeEvidencePct = this.computeEvidencePct(record);

    return record;
  }

  public promoteIfReady(id: string): CapabilityRecord {
    const record = this.get(id);
    this.evaluatePromotion(record);
    return record;
  }

  public snapshot(): CapabilityRegistrySnapshot {
    const records: CapabilityRecord[] = [];
    for (const rec of this.registry.values()) {
      records.push({ ...rec });
    }
    return {
      records: Object.freeze(records),
      snapshotAt: new Date().toISOString(),
    };
  }

  public get(id: string): CapabilityRecord {
    const record = this.registry.get(id);
    if (!record) {
      throw new Error(`Capability "${id}" not registered`);
    }
    return record;
  }

  public has(id: string): boolean {
    return this.registry.has(id);
  }

  public size(): number {
    return this.registry.size;
  }

  public clear(): void {
    this.registry.clear();
  }

  private computeEvidencePct(record: CapabilityRecord): number {
    const raw = record.successCount + 0.5 * record.failureCount;
    return Math.min(100, raw);
  }

  private evaluatePromotion(record: CapabilityRecord): void {
    const evidence = record.runtimeEvidencePct;

    if (record.maturity === 'developing') {
      if (evidence >= EVIDENCE_PROMOTE_OPERATIONAL) {
        record.maturity = 'operational';
        return;
      }
      return;
    }

    if (record.maturity === 'operational') {
      const nonRegressive = record.consecutiveFailures < CONSECUTIVE_FAILURES_CONSECUTIVE_THRESHOLD;
      if (evidence >= EVIDENCE_PROMOTE_PRODUCTION_READY && nonRegressive) {
        record.maturity = 'productionReady';
      }
    }
  }
}
