/**
 * UTP-WOW-001 — Cold-Start Ingestion Service.
 *
 * Rapidly ingests any history available at workspace activation.
 * Accepts SpineEventRef arrays (from the spine ring buffer or
 * a Prisma-backed replay source in later UTPs) and produces a
 * structured HistoryIngestion containing all events within the
 * observation window.
 *
 * Implements B0.5: admit absence of data, operate in no-history mode
 * when no events are available.
 */

import { Injectable } from '@nestjs/common';
import type { SpineEventRef } from '../mind/mind.types';
import { DEFAULT_INGESTION_WINDOW_DAYS, type HistoryIngestion } from './wow.types';

const MS_PER_DAY = 86_400_000;

@Injectable()
export class ColdStartIngestionService {
  /**
   * Ingest available spine events for a workspace within the
   * observation window. Returns an ingestion regardless —
   * empty events list is valid (no-history mode).
   */
  public ingest(input: {
    readonly events: readonly SpineEventRef[];
    readonly workspaceId: string;
    readonly nowMs?: number;
    readonly windowDays?: number;
  }): HistoryIngestion {
    const nowMs = input.nowMs ?? Date.now();
    const windowDays = input.windowDays ?? DEFAULT_INGESTION_WINDOW_DAYS;
    const cutoffMs = nowMs - windowDays * MS_PER_DAY;

    const filtered = input.events.filter((e) => {
      if (e.workspaceId !== undefined && e.workspaceId !== input.workspaceId) {
        return false;
      }
      const ms = Date.parse(e.occurredAt);
      return !Number.isNaN(ms) && ms >= cutoffMs;
    });

    const eventKinds = [...new Set(filtered.map((e) => e.eventName))];

    return {
      workspaceId: input.workspaceId,
      events: filtered,
      ingestedAt: new Date(nowMs).toISOString(),
      totalEventCount: filtered.length,
      eventKinds,
    };
  }
}
