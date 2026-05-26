import { Injectable } from '@nestjs/common';
import type {
  MemoryDimension,
  MemoryProjection,
  ProjectedMemoryItem,
  ProjectionInput,
} from './commem.types';
import { workspaceFilter, clamp } from './commem.types';
import type { SpineEventRef } from '../mind/mind.types';

const DIMENSION_WEIGHTS: Readonly<Record<MemoryDimension, number>> = {
  working: 0.3,
  episodic: 0.5,
  consolidated: 0.7,
  procedural: 0.6,
  semantic: 0.8,
};

function determinDimension(event: SpineEventRef): MemoryDimension {
  const hoursSince = (Date.now() - new Date(event.occurredAt).getTime()) / 3600_000;
  if (hoursSince < 6) {return 'working';}
  if (hoursSince < 72) {return 'episodic';}
  if (event.truthMode === 'inferred' || event.truthMode === 'projected') {return 'semantic';}
  return 'consolidated';
}

function computeWeight(event: SpineEventRef, dim: MemoryDimension): number {
  const base = DIMENSION_WEIGHTS[dim];
  const ageFactor = Math.max(0.1, 1 - (Date.now() - new Date(event.occurredAt).getTime()) / (30 * 24 * 3600_000));
  return clamp(base * ageFactor, 0.05, 1);
}

function extractTags(event: SpineEventRef): readonly string[] {
  const tags: string[] = [event.truthMode];
  const parts = event.eventName.split('.');
  for (let i = 0; i < Math.min(3, parts.length); i++) {
    const part = parts[i];
    if (part !== undefined) {tags.push(part);}
  }
  if (event.entityRef) {
    tags.push(`entity:${event.entityRef.entityType}`);
  }
  return tags;
}

function dimensionSummary(dim: MemoryDimension, count: number): string {
  const map: Record<MemoryDimension, string> = {
    working: `${count} items in active working memory — recent operational signals`,
    episodic: `${count} items in episodic memory — short-term experiential records`,
    consolidated: `${count} items in consolidated memory — stabilized long-term knowledge`,
    procedural: `${count} items in procedural memory — inferred operational patterns`,
    semantic: `${count} items in semantic memory — abstracted conceptual structures`,
  };
  return map[dim] ?? `${count} items in ${dim} memory`;
}

@Injectable()
export class MemoryProjector {
  public project(input: ProjectionInput): readonly MemoryProjection[] {
    const scoped = workspaceFilter(input.events, input.workspaceId);
    const nowMs = Date.now();

    return input.dimensions.map((dim) => {
      const items: ProjectedMemoryItem[] = [];

      for (let i = 0; i < scoped.length; i++) {
        const ev = scoped[i];
        if (ev === undefined) {continue;}
        const evDim = determinDimension(ev);
        if (evDim !== dim) {continue;}

        items.push({
          id: `mem_${dim}_${i.toString(36)}_${ev.eventId.slice(-6)}`,
          sourceEventId: ev.eventId,
          sourceEventName: ev.eventName,
          occurredAt: ev.occurredAt,
          dimension: dim,
          weight: computeWeight(ev, dim),
          tags: extractTags(ev),
        });
      }

      const weightedSum = items.reduce((s, it) => s + it.weight, 0);
      const maxWeight = items.length;
      const confidence = maxWeight > 0 ? clamp(weightedSum / maxWeight, 0, 1) : 0;

      return {
        workspaceId: input.workspaceId,
        dimension: dim,
        snapshotAtMs: nowMs,
        itemCount: items.length,
        items: items.slice(0, 1000),
        summary: dimensionSummary(dim, items.length),
        confidence,
      };
    });
  }

  public projectAll(input: ProjectionInput): readonly MemoryProjection[] {
    const allDimensions: readonly MemoryDimension[] = [
      'working',
      'episodic',
      'consolidated',
      'procedural',
      'semantic',
    ];
    return this.project({ ...input, dimensions: allDimensions });
  }

  public promoteToWorking(
    projections: readonly MemoryProjection[],
    _workspaceId: string,
    threshold: number,
  ): readonly MemoryProjection[] {
    return projections.map((p) => {
      if (p.dimension !== 'episodic') {return p;}

      const promotedItems: ProjectedMemoryItem[] = p.items
        .filter((it) => it.weight >= threshold)
        .map((it, idx) => ({
          ...it,
          dimension: 'working' as MemoryDimension,
          id: `mem_working_promoted_${idx.toString(36)}_${it.sourceEventId.slice(-6)}`,
        }));

      return {
        ...p,
        dimension: 'working',
        itemCount: promotedItems.length,
        items: promotedItems,
        summary: `${promotedItems.length} items promoted from episodic to working memory`,
      };
    });
  }
}
