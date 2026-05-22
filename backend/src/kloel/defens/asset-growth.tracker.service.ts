import { Injectable } from '@nestjs/common';

interface AssetRegistration {
  readonly kind: string;
  readonly name: string;
  readonly valueIndicator: number;
}

interface AssetRecord {
  readonly workspaceId: string;
  readonly assetId: string;
  readonly kind: string;
  readonly name: string;
  readonly valueIndicator: number;
  readonly registeredAt: string;
}

interface SnapshotRecord {
  readonly workspaceId: string;
  readonly assetId: string;
  readonly observedSize: number;
  readonly observedAt: string;
  readonly observedAtMs: number;
}

interface GrowthResult {
  readonly currentSize: number;
  readonly sizeXDaysAgo: number;
  readonly growthRate: number;
  readonly growthAbsolute: number;
  readonly isAccumulating: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SNAPSHOT_SEARCH_WINDOW_MS = 12 * 60 * 60 * 1000;

function makeAssetId(workspaceId: string, kind: string, name: string): string {
  return `${workspaceId}:${kind}:${name.toLowerCase().replace(/\s+/g, '_')}`;
}

@Injectable()
export class AssetGrowthTrackerService {
  private readonly assets = new Map<string, Map<string, AssetRecord>>();
  private readonly snapshots = new Map<string, Map<string, SnapshotRecord[]>>();

  registerAsset(
    workspaceId: string,
    asset: AssetRegistration,
    nowMs?: number,
  ): AssetRecord | undefined {
    if (!workspaceId || !asset.name) {
      return undefined;
    }

    const now = nowMs ?? Date.now();
    const assetId = makeAssetId(workspaceId, asset.kind, asset.name);
    const record: AssetRecord = {
      workspaceId,
      assetId,
      kind: asset.kind,
      name: asset.name,
      valueIndicator: asset.valueIndicator,
      registeredAt: new Date(now).toISOString(),
    };

    let ws = this.assets.get(workspaceId);
    if (!ws) {
      ws = new Map();
      this.assets.set(workspaceId, ws);
    }

    if (ws.has(assetId)) {
      return undefined;
    }

    ws.set(assetId, record);
    return record;
  }

  recordSnapshot(
    workspaceId: string,
    assetId: string,
    observedSize: number,
    observedAt: string,
  ): SnapshotRecord | undefined {
    const ws = this.assets.get(workspaceId);
    if (!ws || !ws.has(assetId)) {
      return undefined;
    }

    const observedAtMs = new Date(observedAt).getTime();
    if (Number.isNaN(observedAtMs)) {
      return undefined;
    }

    const snapshot: SnapshotRecord = {
      workspaceId,
      assetId,
      observedSize,
      observedAt,
      observedAtMs,
    };

    const wsSnapshots = this.ensureWorkspaceSnapshots(workspaceId);
    const assetSnapshots = wsSnapshots.get(assetId) ?? [];
    assetSnapshots.push(snapshot);
    assetSnapshots.sort((a, b) => a.observedAtMs - b.observedAtMs);
    wsSnapshots.set(assetId, assetSnapshots);

    return snapshot;
  }

  computeGrowth(workspaceId: string, assetId: string, periodDays: number): GrowthResult {
    if (!this.assets.get(workspaceId)?.has(assetId)) {
      return zeroGrowth();
    }

    const snapshots = this.snapshots.get(workspaceId)?.get(assetId) ?? [];

    if (snapshots.length === 0) {
      return zeroGrowth();
    }

    const latest = snapshots[snapshots.length - 1];
    if (latest === undefined) {
      return zeroGrowth();
    }
    const currentSize = latest.observedSize;

    const targetMs = latest.observedAtMs - periodDays * MS_PER_DAY;

    let historicalSize = currentSize;
    const historySnapshot = this.findClosestSnapshot(snapshots, targetMs);
    if (historySnapshot) {
      historicalSize = historySnapshot.observedSize;
    }

    const growthAbsolute = currentSize - historicalSize;
    const growthRate = historicalSize > 0 ? growthAbsolute / historicalSize : 0;
    const isAccumulating = currentSize > historicalSize;

    return {
      currentSize,
      sizeXDaysAgo: historicalSize,
      growthRate: Math.round(growthRate * 10000) / 10000,
      growthAbsolute,
      isAccumulating,
    };
  }

  computePortfolioDefensibilityScore(workspaceId: string): number {
    const ws = this.assets.get(workspaceId);
    if (!ws || ws.size === 0) {
      return 0;
    }

    const assetIds = [...ws.keys()];
    let total = 0;
    let count = 0;

    for (const assetId of assetIds) {
      const snapshots = this.snapshots.get(workspaceId)?.get(assetId);
      if (!snapshots || snapshots.length < 2) {
        count++;
        continue;
      }

      const growth = this.computeGrowth(workspaceId, assetId, 30);
      const clampedRate = Math.max(-1, Math.min(1, growth.growthRate));
      const contribution = (clampedRate + 1) / 2;
      total += contribution;
      count++;
    }

    return count > 0 ? Math.round((total / count) * 100) / 100 : 0;
  }

  getAsset(workspaceId: string, assetId: string): AssetRecord | undefined {
    return this.assets.get(workspaceId)?.get(assetId);
  }

  listAssets(workspaceId: string): readonly AssetRecord[] {
    const ws = this.assets.get(workspaceId);
    if (!ws) return [];
    return [...ws.values()];
  }

  getSnapshots(workspaceId: string, assetId: string): readonly SnapshotRecord[] {
    if (!this.assets.get(workspaceId)?.has(assetId)) {
      return [];
    }
    return [...(this.snapshots.get(workspaceId)?.get(assetId) ?? [])];
  }

  private findClosestSnapshot(
    snapshots: readonly SnapshotRecord[],
    targetMs: number,
  ): SnapshotRecord | undefined {
    let best: SnapshotRecord | undefined;

    for (const snap of snapshots) {
      const diff = Math.abs(snap.observedAtMs - targetMs);
      if (diff <= SNAPSHOT_SEARCH_WINDOW_MS) {
        return snap;
      }
      if (!best || diff < Math.abs(best.observedAtMs - targetMs)) {
        best = snap;
      }
    }

    return best;
  }

  private ensureWorkspaceSnapshots(workspaceId: string): Map<string, SnapshotRecord[]> {
    let wsSnapshots = this.snapshots.get(workspaceId);
    if (!wsSnapshots) {
      wsSnapshots = new Map();
      this.snapshots.set(workspaceId, wsSnapshots);
    }
    return wsSnapshots;
  }
}

function zeroGrowth(): GrowthResult {
  return {
    currentSize: 0,
    sizeXDaysAgo: 0,
    growthRate: 0,
    growthAbsolute: 0,
    isAccumulating: false,
  };
}
