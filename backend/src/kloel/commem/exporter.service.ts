import { Injectable } from '@nestjs/common';
import type { ExportedCapsule, MemoryProjection } from './commem.types';
import { simpleHash } from './commem.types';

@Injectable()
export class ExporterService {
  private capsuleVersion = 0;

  public export(
    projections: readonly MemoryProjection[],
    workspaceId: string,
  ): ExportedCapsule {
    this.capsuleVersion++;
    const exportedAt = new Date().toISOString();

    const sorted = [...projections].sort((a, b) =>
      a.dimension.localeCompare(b.dimension),
    );

    const contentForHash = sorted
      .map((p) => `${p.dimension}:${p.itemCount}:${p.confidence.toFixed(4)}`)
      .join('|');

    const checksum = simpleHash(`${workspaceId}:${exportedAt}:${this.capsuleVersion}:${contentForHash}`);

    const capsuleId = `caps_${workspaceId.slice(-8)}_v${this.capsuleVersion}_${checksum.slice(2, 10)}`;

    return {
      capsuleId,
      workspaceId,
      exportedAt,
      version: this.capsuleVersion,
      projections: sorted,
      checksum,
      isAuditable: checksum.length >= 10 && sorted.length > 0,
    };
  }

  public batchExport(
    projectionsByWorkspace: Readonly<Record<string, readonly MemoryProjection[]>>,
  ): readonly ExportedCapsule[] {
    return Object.entries(projectionsByWorkspace).map(([wsId, projs]) =>
      this.export(projs, wsId),
    );
  }

  public verifyCapsule(capsule: ExportedCapsule): boolean {
    const sorted = [...capsule.projections].sort((a, b) =>
      a.dimension.localeCompare(b.dimension),
    );

    const contentForHash = sorted
      .map((p) => `${p.dimension}:${p.itemCount}:${p.confidence.toFixed(4)}`)
      .join('|');

    const expectedChecksum = simpleHash(
      `${capsule.workspaceId}:${capsule.exportedAt}:${capsule.version}:${contentForHash}`,
    );

    return expectedChecksum === capsule.checksum;
  }
}
