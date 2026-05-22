import { AssetGrowthTrackerService } from './asset-growth.tracker.service';

describe('AssetGrowthTrackerService', () => {
  let service: AssetGrowthTrackerService;

  beforeEach(() => {
    service = new AssetGrowthTrackerService();
  });

  function iso(daysAgo: number): string {
    return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  }

  function isoFromBase(baseMs: number, daysOffset: number): string {
    return new Date(baseMs + daysOffset * 24 * 60 * 60 * 1000).toISOString();
  }

  // ─── Scenario 1: registerAsset creates an asset ─────────────────────

  it('rejects cross-workspace snapshots, growth reads, and snapshot reads', () => {
    const asset = service.registerAsset('wks_a', {
      kind: 'owned_audience',
      name: 'Email List',
      valueIndicator: 1000,
    });
    if (!asset) {
      throw new Error('expected asset to be registered');
    }

    expect(service.recordSnapshot('wks_b', asset.assetId, 1200, iso(1))).toBeUndefined();
    expect(service.getAsset('wks_b', asset.assetId)).toBeUndefined();
    expect(service.getSnapshots('wks_b', asset.assetId)).toHaveLength(0);

    const growth = service.computeGrowth('wks_b', asset.assetId, 30);
    expect(growth.currentSize).toBe(0);
    expect(growth.sizeXDaysAgo).toBe(0);
    expect(growth.growthRate).toBe(0);
    expect(growth.growthAbsolute).toBe(0);
    expect(growth.isAccumulating).toBe(false);
  });

  it('keeps portfolio defensibility scores isolated by workspace', () => {
    const base = Date.now();
    const workspaceAAsset = service.registerAsset('wks_a', {
      kind: 'owned_audience',
      name: 'Email List',
      valueIndicator: 1000,
    });
    const workspaceBAsset = service.registerAsset('wks_b', {
      kind: 'owned_audience',
      name: 'Email List',
      valueIndicator: 1000,
    });
    if (!workspaceAAsset || !workspaceBAsset) {
      throw new Error('expected assets to be registered');
    }

    service.recordSnapshot('wks_a', workspaceAAsset.assetId, 100, isoFromBase(base, -40));
    service.recordSnapshot('wks_a', workspaceAAsset.assetId, 300, isoFromBase(base, -5));
    service.recordSnapshot('wks_b', workspaceBAsset.assetId, 1000, isoFromBase(base, -40));
    service.recordSnapshot('wks_b', workspaceBAsset.assetId, 300, isoFromBase(base, -5));

    expect(service.computePortfolioDefensibilityScore('wks_a')).toBeGreaterThan(0.5);
    expect(service.computePortfolioDefensibilityScore('wks_b')).toBeLessThan(0.5);
    expect(service.getSnapshots('wks_a', workspaceBAsset.assetId)).toHaveLength(0);
    expect(service.getSnapshots('wks_b', workspaceAAsset.assetId)).toHaveLength(0);
  });

  // ─── Scenario 21: computePortfolioDefensibilityScore with single-asset no snapshots

  it('computePortfolioDefensibilityScore returns < 0.5 for assets with insufficient snapshots', () => {
    service.registerAsset('wks_a', {
      kind: 'switching_cost',
      name: 'Lock-in',
      valueIndicator: 0.4,
    });

    const score = service.computePortfolioDefensibilityScore('wks_a');

    expect(score).toBe(0);
  });
});
