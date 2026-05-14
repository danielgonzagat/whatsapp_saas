import { Injectable } from '@nestjs/common';
import type {
  MemoryDimension,
  MemoryProjection,
  TimeMachineQuery,
  TimeMachineResult,
} from './commem.types';
import { workspaceFilter } from './commem.types';
import type { SpineEventRef } from '../mind/mind.types';
import { MemoryProjector } from './memory.projector';

@Injectable()
export class TimeMachineService {
  private readonly projector = new MemoryProjector();

  public query(
    allEvents: readonly SpineEventRef[],
    query: TimeMachineQuery,
  ): TimeMachineResult {
    const scoped = workspaceFilter(allEvents, query.workspaceId);

    const pastEvents = scoped.filter(
      (e) => new Date(e.occurredAt).getTime() <= query.targetTimestampMs,
    );

    const pastCount = pastEvents.length;

    const projections = this.projector.project({
      events: pastEvents,
      workspaceId: query.workspaceId,
      dimensions: query.dimensions,
    });

    return {
      workspaceId: query.workspaceId,
      queryTimestampMs: Date.now(),
      targetTimestampMs: query.targetTimestampMs,
      projections,
      reconstructedFrom: pastCount,
    };
  }

  public diff(
    before: TimeMachineResult,
    after: TimeMachineResult,
  ): readonly MemoryDiffEntry[] {
    const diffs: MemoryDiffEntry[] = [];

    const allDimensions = new Set<MemoryDimension>();
    for (const p of before.projections) allDimensions.add(p.dimension);
    for (const p of after.projections) allDimensions.add(p.dimension);

    for (const dim of allDimensions) {
      const b = before.projections.find((p) => p.dimension === dim);
      const a = after.projections.find((p) => p.dimension === dim);

      diffs.push({
        dimension: dim,
        beforeCount: b?.itemCount ?? 0,
        afterCount: a?.itemCount ?? 0,
        delta: (a?.itemCount ?? 0) - (b?.itemCount ?? 0),
        beforeConfidence: b?.confidence ?? 0,
        afterConfidence: a?.confidence ?? 0,
      });
    }

    return diffs;
  }

  public snapshotAt(
    events: readonly SpineEventRef[],
    workspaceId: string,
    timestampMs: number,
  ): TimeMachineResult {
    return this.query(events, {
      workspaceId,
      targetTimestampMs: timestampMs,
      dimensions: ['working', 'episodic', 'consolidated', 'procedural', 'semantic'],
    });
  }
}

export interface MemoryDiffEntry {
  readonly dimension: MemoryDimension;
  readonly beforeCount: number;
  readonly afterCount: number;
  readonly delta: number;
  readonly beforeConfidence: number;
  readonly afterConfidence: number;
}
