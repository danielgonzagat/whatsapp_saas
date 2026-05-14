import { Injectable } from '@nestjs/common';
import {
  AuditEntry,
  CapabilityMaturity,
  CapabilityRecord,
  CapabilityRegistrySnapshot,
  InvocationOutcome,
  PromoteCriteria,
} from './capability-registry.types';

const EVIDENCE_PROMOTE_OPERATIONAL = 5;
const EVIDENCE_PROMOTE_PRODUCTION_READY = 20;
const CONSECUTIVE_FAILURES_CONSECUTIVE_THRESHOLD = 3;
const MIN_PULSE_CYCLES_FOR_OPERATIONAL = 3;
const MIN_NON_REGRESSIVE_CYCLES = 3;

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
      auditTrail: [],
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

  public promote(name: string, criteria: PromoteCriteria): CapabilityRecord {
    const record = this.get(name);

    if (record.maturity === 'developing') {
      const meetsEvidence = criteria.runtimeEvidencePct > 0;
      const meetsCycles = criteria.consecutivePulseGreenCycles >= MIN_PULSE_CYCLES_FOR_OPERATIONAL;

      if (meetsEvidence && meetsCycles) {
        const previous = record.maturity;
        record.maturity = 'operational';
        this.appendAudit(record, 'promoted', previous, record.maturity);
      }

      return record;
    }

    if (record.maturity === 'operational') {
      const thresholdReached = criteria.rCriterionThresholdReached === true;
      const nonRegressive = record.consecutiveFailures < CONSECUTIVE_FAILURES_CONSECUTIVE_THRESHOLD
        && criteria.consecutivePulseGreenCycles >= MIN_NON_REGRESSIVE_CYCLES;

      if (thresholdReached && nonRegressive) {
        const previous = record.maturity;
        record.maturity = 'productionReady';
        this.appendAudit(record, 'promoted', previous, record.maturity);
      }

      return record;
    }

    return record;
  }

  public demote(name: string, reason: string): CapabilityRecord {
    const record = this.get(name);
    const previous = record.maturity;

    if (record.maturity === 'productionReady') {
      record.maturity = 'operational';
    } else if (record.maturity === 'operational') {
      record.maturity = 'developing';
    }

    this.appendAudit(record, 'demoted', previous, record.maturity, reason);

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
      records.push({
        ...rec,
        auditTrail: rec.auditTrail.map((e) => ({ ...e })),
      });
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

  private appendAudit(
    record: CapabilityRecord,
    action: AuditEntry['action'],
    from: CapabilityMaturity,
    to: CapabilityMaturity,
    reason?: string,
  ): void {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      action,
      from,
      to,
    };
    if (reason !== undefined) {
      entry.reason = reason;
    }
    record.auditTrail.push(entry);
  }
}
