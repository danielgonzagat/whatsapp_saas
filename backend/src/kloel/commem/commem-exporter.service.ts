import { Injectable } from '@nestjs/common';
import type {
  AggregatedLedgerEntry,
  ExportedCapsule,
  MemoryProjection,
} from './commem.types';
import { simpleHash, workspaceFilter } from './commem.types';
import type { SpineEventRef } from '../mind/mind.types';
import { CommemLedgerService } from './ledger.service';
import { MemoryProjector } from './memory.projector';
import { ExporterService } from './exporter.service';
import { AttributionGuard } from './attribution.guard';

export interface ComMemExport {
  readonly workspaceId: string;
  readonly exportedAt: string;
  readonly formatVersion: number;
  readonly ledger: readonly AggregatedLedgerEntry[];
  readonly projections: readonly MemoryProjection[];
  readonly capsule: ExportedCapsule | null;
  readonly attestation: ExportAttestation;
}

export interface ExportAttestation {
  readonly workspaceIsolationVerified: boolean;
  readonly crossWorkspaceReferences: number;
  readonly checksum: string;
  readonly isAuditable: boolean;
}

const EXPORT_FORMAT_VERSION = 1;
const LEDGER_WINDOW_MS = 7 * 24 * 3600_000;
const LEDGER_SLICE_MS = 24 * 3600_000;

function escapeCsvField(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

@Injectable()
export class CommemExporterService {
  constructor(
    private readonly ledgerService: CommemLedgerService,
    private readonly projector: MemoryProjector,
    private readonly exporter: ExporterService,
    private readonly guard: AttributionGuard,
  ) {}

  public exportAggregated(
    workspaceId: string,
    events: readonly SpineEventRef[],
  ): ComMemExport {
    const scoped = workspaceFilter(events, workspaceId);
    const exportedAt = new Date().toISOString();

    const ledger = this.ledgerService.aggregateMultiWindow(
      scoped,
      workspaceId,
      LEDGER_SLICE_MS,
      LEDGER_WINDOW_MS,
    );

    const projections = this.projector.projectAll({
      events: scoped,
      workspaceId,
      dimensions: [],
    });

    const capsule =
      scoped.length > 0
        ? this.exporter.export(projections, workspaceId)
        : null;

    const guardResult = this.guard.validateProjections(projections, workspaceId);

    const contentForChecksum = JSON.stringify({
      workspaceId,
      exportedAt,
      eventCount: scoped.length,
      ledgerCount: ledger.length,
      projectionCount: projections.length,
    });

    const checksum = simpleHash(contentForChecksum);

    return {
      workspaceId,
      exportedAt,
      formatVersion: EXPORT_FORMAT_VERSION,
      ledger,
      projections,
      capsule,
      attestation: {
        workspaceIsolationVerified: guardResult.passed,
        crossWorkspaceReferences: guardResult.crossWorkspaceReferences,
        checksum,
        isAuditable: guardResult.passed && checksum.length >= 10,
      },
    };
  }

  public toJson(data: ComMemExport): string {
    const out: Record<string, unknown> = {
      workspaceId: data.workspaceId,
      exportedAt: data.exportedAt,
      formatVersion: data.formatVersion,
      attestation: {
        workspaceIsolationVerified: data.attestation.workspaceIsolationVerified,
        crossWorkspaceReferences: data.attestation.crossWorkspaceReferences,
        checksum: data.attestation.checksum,
        isAuditable: data.attestation.isAuditable,
      },
      ledger: data.ledger.map((entry) => ({
        sequence: entry.sequence,
        windowStartMs: entry.windowStartMs,
        windowEndMs: entry.windowEndMs,
        eventCount: entry.eventCount,
        domainBreakdown: entry.domainBreakdown,
        truthModeBreakdown: entry.truthModeBreakdown,
        events: entry.events.map((e) => ({
          eventId: e.eventId,
          eventName: e.eventName,
          occurredAt: e.occurredAt,
          truthMode: e.truthMode,
          entityType: e.entityRef?.entityType ?? null,
          entityId: e.entityRef?.entityId ?? null,
        })),
      })),
      projections: data.projections.map((p) => ({
        dimension: p.dimension,
        snapshotAtMs: p.snapshotAtMs,
        itemCount: p.itemCount,
        confidence: p.confidence,
        summary: p.summary,
        items: p.items.map((it) => ({
          id: it.id,
          sourceEventName: it.sourceEventName,
          occurredAt: it.occurredAt,
          dimension: it.dimension,
          weight: it.weight,
          tags: it.tags,
        })),
      })),
      capsule: data.capsule
        ? {
            capsuleId: data.capsule.capsuleId,
            version: data.capsule.version,
            checksum: data.capsule.checksum,
            isAuditable: data.capsule.isAuditable,
          }
        : null,
    };

    return JSON.stringify(out, null, 2);
  }

  public toCsv(data: ComMemExport): string {
    const header =
      'eventId,eventName,occurredAt,truthMode,entityType,entityId,workspaceId';
    const rows: string[] = [header];

    for (const entry of data.ledger) {
      for (const e of entry.events) {
        rows.push(
          [
            escapeCsvField(e.eventId),
            escapeCsvField(e.eventName),
            escapeCsvField(e.occurredAt),
            escapeCsvField(e.truthMode),
            escapeCsvField(e.entityRef?.entityType ?? ''),
            escapeCsvField(e.entityRef?.entityId ?? ''),
            escapeCsvField(data.workspaceId),
          ].join(','),
        );
      }
    }

    return rows.join('\n');
  }

  public batchExportAggregated(
    eventsByWorkspace: Readonly<
      Record<string, readonly SpineEventRef[]>
    >,
  ): readonly ComMemExport[] {
    return Object.entries(eventsByWorkspace).map(([wsId, evts]) =>
      this.exportAggregated(wsId, evts),
    );
  }

  public verifyIntegrity(data: ComMemExport): boolean {
    const contentForChecksum = JSON.stringify({
      workspaceId: data.workspaceId,
      exportedAt: data.exportedAt,
      eventCount: data.ledger.reduce((s, e) => s + e.eventCount, 0),
      ledgerCount: data.ledger.length,
      projectionCount: data.projections.length,
    });

    const expectedChecksum = simpleHash(contentForChecksum);
    return expectedChecksum === data.attestation.checksum;
  }
}
