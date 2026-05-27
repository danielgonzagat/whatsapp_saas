/**
 * @deprecated Use {@link ../kloel/mind/observability/mind-spine-audit.service.ts MindSpineAudit}
 * (re-exported from `backend/src/kloel/mind/observability/`). This file remains
 * during the ADR-0013 Wave M3 alias window (4 weeks) and will be removed once
 * `scripts/ops/check-canonical-services.mjs --strict` reports 0 callers of
 * `BrainSpineAuditService`.
 *
 * @cluster Mind/Observability
 * @canonical backend/src/kloel/mind/observability/mind-spine-audit.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface SpineRow {
  capability: string;
  action: string;
  traceId: string;
  at: string;
  requestId: string;
}

interface CapabilityAudit {
  name: string;
  invocations: number;
  spineEvents: number;
  missing: number;
  samples: Array<{ traceId: string; at: string }>;
}

export interface SpineAuditResult {
  capabilities: CapabilityAudit[];
  totalMismatch: number;
  windowFrom: string;
  windowTo: string;
}

@Injectable()
export class BrainSpineAuditService {
  private readonly logger = new Logger(BrainSpineAuditService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.debug?.(`BrainSpineAuditService initialized`);
  }

  async audit(sinceIso: string): Promise<SpineAuditResult> {
    const windowFrom = sinceIso;
    const windowTo = new Date().toISOString();

    const rows: SpineRow[] = await this.prisma.$queryRawUnsafe<SpineRow[]>(
      `
      SELECT
        COALESCE(
          NULLIF(meta->'action'->>'tool', ''),
          intent
        ) as capability,
        action,
        id::text as "traceId",
        "createdAt"::text as at,
        COALESCE(meta->>'requestId', '') as "requestId"
      FROM "RAC_AutopilotEvent"
      WHERE action IN ('brain.capability.invoked', 'capability.executed', 'capability.failed')
        AND "createdAt" >= $1::timestamptz
      ORDER BY "createdAt" DESC
      `,
      windowFrom,
    );

    const capabilityMap = new Map<
      string,
      {
        invoked: number;
        executed: number;
        failed: number;
        samples: Array<{ traceId: string; at: string }>;
      }
    >();

    for (const row of rows) {
      if (!row.capability) {
        continue;
      }

      let entry = capabilityMap.get(row.capability);
      if (!entry) {
        entry = { invoked: 0, executed: 0, failed: 0, samples: [] };
        capabilityMap.set(row.capability, entry);
      }

      if (row.action === 'brain.capability.invoked') {
        entry.invoked += 1;
      } else if (row.action === 'capability.executed') {
        entry.executed += 1;
      } else if (row.action === 'capability.failed') {
        entry.failed += 1;
      }

      if (entry.samples.length < 5) {
        entry.samples.push({ traceId: row.traceId, at: row.at });
      }
    }

    const capabilities: CapabilityAudit[] = [];
    let totalMismatch = 0;

    for (const [name, entry] of capabilityMap.entries()) {
      const invocations = entry.executed + entry.failed;
      const missing = Math.max(0, invocations - entry.invoked);
      totalMismatch += missing;

      capabilities.push({
        name,
        invocations,
        spineEvents: entry.invoked,
        missing,
        samples: entry.samples,
      });
    }

    capabilities.sort((a, b) => b.missing - a.missing || b.invocations - a.invocations);

    return { capabilities, totalMismatch, windowFrom, windowTo };
  }
}
