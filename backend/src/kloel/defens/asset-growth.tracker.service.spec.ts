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

  it('registerAsset creates an asset and returns its record', () => {
    const record = service.registerAsset('wks_a', {
      kind: 'owned_audience',
      name: 'Email List',
      valueIndicator: 1000,
    });

    expect(record).toBeDefined();
    expect(record?.workspaceId).toBe('wks_a');
    expect(record?.kind).toBe('owned_audience');
    expect(record?.name).toBe('Email List');
    expect(record?.valueIndicator).toBe(1000);
    expect(record?.assetId).toContain('wks_a');
    expect(record?.assetId).toContain('owned_audience');
    expect(record?.registeredAt).toBeDefined();
  });

  // ─── Scenario 2: registerAsset rejects empty workspaceId ─────────────

  it('registerAsset returns undefined for empty workspaceId', () => {
    const record = service.registerAsset('', {
      kind: 'social_proof',
      name: 'Test',
      valueIndicator: 1,
    });

    expect(record).toBeUndefined();
  });

  // ─── Scenario 3: registerAsset rejects empty name ────────────────────

  it('registerAsset returns undefined for empty name', () => {
    const record = service.registerAsset('wks_a', {
      kind: 'social_proof',
      name: '',
      valueIndicator: 1,
    });

    expect(record).toBeUndefined();
  });

  // ─── Scenario 4: registerAsset prevents duplicate registration ──────

  it('registerAsset returns undefined for duplicate asset', () => {
    service.registerAsset('wks_a', { kind: 'case_library', name: 'Case X', valueIndicator: 5 });

    const duplicate = service.registerAsset('wks_a', {
      kind: 'case_library',
      name: 'Case X',
      valueIndicator: 10,
    });

    expect(duplicate).toBeUndefined();
  });

  // ─── Scenario 5: recordSnapshot stores a snapshot ────────────────────

  it('recordSnapshot stores and returns a snapshot', () => {
    const asset = service.registerAsset('wks_a', {
      kind: 'owned_audience',
      name: 'Email List',
      valueIndicator: 1000,
    });
    if (!asset) {
      throw new Error('expected asset to be registered');
    }

    const snap = service.recordSnapshot('wks_a', asset.assetId, 1200, iso(1));

    expect(snap).toBeDefined();
    expect(snap?.workspaceId).toBe('wks_a');
    expect(snap?.assetId).toBe(asset.assetId);
    expect(snap?.observedSize).toBe(1200);
  });

  // ─── Scenario 6: recordSnapshot rejects unknown asset ────────────────

  it('recordSnapshot returns undefined for unknown asset', () => {
    const snap = service.recordSnapshot('wks_a', 'fake_id', 100, iso(1));

    expect(snap).toBeUndefined();
  });

  // ─── Scenario 7: recordSnapshot rejects invalid date ─────────────────

  it('recordSnapshot returns undefined for invalid observedAt', () => {
    const asset = service.registerAsset('wks_a', {
      kind: 'brand_trust',
      name: 'Trust',
      valueIndicator: 0.5,
    });

    const snap = service.recordSnapshot('wks_a', asset!.assetId, 100, 'not-a-date');

    expect(snap).toBeUndefined();
  });

  // ─── Scenario 8: computeGrowth with one snapshot returns flat ────────

  it('computeGrowth returns zero growth with a single snapshot', () => {
    const asset = service.registerAsset('wks_a', {
      kind: 'owned_audience',
      name: 'Email List',
      valueIndicator: 1000,
    });

    service.recordSnapshot('wks_a', asset!.assetId, 1000, iso(5));

    const growth = service.computeGrowth('wks_a', asset!.assetId, 30);

    expect(growth.currentSize).toBe(1000);
    expect(growth.sizeXDaysAgo).toBe(1000);
    expect(growth.growthRate).toBe(0);
    expect(growth.growthAbsolute).toBe(0);
    expect(growth.isAccumulating).toBe(false);
  });

  // ─── Scenario 9: computeGrowth with no snapshots returns zero ────────

  it('computeGrowth returns zero for asset with no snapshots', () => {
    const growth = service.computeGrowth('wks_a', 'nonexistent', 30);

    expect(growth.currentSize).toBe(0);
    expect(growth.sizeXDaysAgo).toBe(0);
    expect(growth.growthRate).toBe(0);
    expect(growth.growthAbsolute).toBe(0);
    expect(growth.isAccumulating).toBe(false);
  });

  // ─── Scenario 10: computeGrowth detects accumulation ─────────────────

  it('computeGrowth detects accumulating growth', () => {
    const base = Date.now();
    const asset = service.registerAsset('wks_a', {
      kind: 'case_library',
      name: 'Success Cases',
      valueIndicator: 5,
    });

    service.recordSnapshot('wks_a', asset!.assetId, 100, isoFromBase(base, -40));
    service.recordSnapshot('wks_a', asset!.assetId, 200, isoFromBase(base, -10));

    const growth = service.computeGrowth('wks_a', asset!.assetId, 30);

    expect(growth.currentSize).toBe(200);
    expect(growth.sizeXDaysAgo).toBe(100);
    expect(growth.growthRate).toBe(1);
    expect(growth.growthAbsolute).toBe(100);
    expect(growth.isAccumulating).toBe(true);
  });

  // ─── Scenario 11: computeGrowth detects decline ──────────────────────

  it('computeGrowth detects declining asset', () => {
    const base = Date.now();
    const asset = service.registerAsset('wks_a', {
      kind: 'community',
      name: 'Community Members',
      valueIndicator: 500,
    });

    service.recordSnapshot('wks_a', asset!.assetId, 1000, isoFromBase(base, -40));
    service.recordSnapshot('wks_a', asset!.assetId, 600, isoFromBase(base, -5));

    const growth = service.computeGrowth('wks_a', asset!.assetId, 30);

    expect(growth.currentSize).toBe(600);
    expect(growth.sizeXDaysAgo).toBe(1000);
    expect(growth.growthRate).toBeLessThan(0);
    expect(growth.growthAbsolute).toBeLessThan(0);
    expect(growth.isAccumulating).toBe(false);
  });

  // ─── Scenario 12: computeGrowth handles zero historical size ─────────

  it('computeGrowth returns zero rate when historical size is zero', () => {
    const base = Date.now();
    const asset = service.registerAsset('wks_a', {
      kind: 'data_asset',
      name: 'Dataset',
      valueIndicator: 0,
    });

    service.recordSnapshot('wks_a', asset!.assetId, 0, isoFromBase(base, -40));
    service.recordSnapshot('wks_a', asset!.assetId, 500, isoFromBase(base, -5));

    const growth = service.computeGrowth('wks_a', asset!.assetId, 30);

    expect(growth.currentSize).toBe(500);
    expect(growth.growthRate).toBe(0);
    expect(growth.growthAbsolute).toBe(500);
    expect(growth.isAccumulating).toBe(true);
  });

  // ─── Scenario 13: computeGrowth uses snapshot closest to periodDays ──

  it('computeGrowth finds the closest snapshot to the period target', () => {
    const base = Date.now();
    const asset = service.registerAsset('wks_a', {
      kind: 'authority',
      name: 'Blog Posts',
      valueIndicator: 20,
    });

    service.recordSnapshot('wks_a', asset!.assetId, 50, isoFromBase(base, -55));
    service.recordSnapshot('wks_a', asset!.assetId, 80, isoFromBase(base, -35));
    service.recordSnapshot('wks_a', asset!.assetId, 100, isoFromBase(base, -5));

    const growth = service.computeGrowth('wks_a', asset!.assetId, 30);

    expect(growth.currentSize).toBe(100);
    expect(growth.sizeXDaysAgo).toBe(80);
  });

  // ─── Scenario 14: computePortfolioDefensibilityScore empty workspace ─

  it('computePortfolioDefensibilityScore returns 0 for empty workspace', () => {
    const score = service.computePortfolioDefensibilityScore('wks_empty');

    expect(score).toBe(0);
  });

  // ─── Scenario 15: computePortfolioDefensibilityScore growing assets ───

  it('computePortfolioDefensibilityScore is positive for growing portfolio', () => {
    const base = Date.now();
    const a1 = service.registerAsset('wks_a', {
      kind: 'owned_audience',
      name: 'Email List',
      valueIndicator: 1000,
    });
    const a2 = service.registerAsset('wks_a', {
      kind: 'case_library',
      name: 'Success Cases',
      valueIndicator: 10,
    });

    service.recordSnapshot('wks_a', a1!.assetId, 100, isoFromBase(base, -40));
    service.recordSnapshot('wks_a', a1!.assetId, 300, isoFromBase(base, -5));

    service.recordSnapshot('wks_a', a2!.assetId, 50, isoFromBase(base, -40));
    service.recordSnapshot('wks_a', a2!.assetId, 80, isoFromBase(base, -5));

    const score = service.computePortfolioDefensibilityScore('wks_a');

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  // ─── Scenario 16: computePortfolioDefensibilityScore penalizes decline

  it('computePortfolioDefensibilityScore penalizes declining assets', () => {
    const base = Date.now();
    const a1 = service.registerAsset('wks_a', {
      kind: 'community',
      name: 'Community',
      valueIndicator: 100,
    });
    const a2 = service.registerAsset('wks_a', {
      kind: 'owned_audience',
      name: 'Email',
      valueIndicator: 500,
    });

    service.recordSnapshot('wks_a', a1!.assetId, 1000, isoFromBase(base, -40));
    service.recordSnapshot('wks_a', a1!.assetId, 300, isoFromBase(base, -5));

    service.recordSnapshot('wks_a', a2!.assetId, 100, isoFromBase(base, -40));
    service.recordSnapshot('wks_a', a2!.assetId, 150, isoFromBase(base, -5));

    const score = service.computePortfolioDefensibilityScore('wks_a');

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.5);
  });

  // ─── Scenario 17: registerAsset respects explicit nowMs ──────────────

  it('registerAsset uses explicit nowMs for registeredAt timestamp', () => {
    const explicitMs = new Date('2024-06-15T12:00:00Z').getTime();

    const record = service.registerAsset(
      'wks_a',
      { kind: 'process_moat', name: 'Pipeline', valueIndicator: 3 },
      explicitMs,
    );

    expect(record?.registeredAt).toBe('2024-06-15T12:00:00.000Z');
  });

  // ─── Scenario 18: listAssets returns all assets for workspace ────────

  it('listAssets returns all registered assets for a workspace', () => {
    service.registerAsset('wks_a', { kind: 'owned_audience', name: 'Email', valueIndicator: 1000 });
    service.registerAsset('wks_a', { kind: 'social_proof', name: 'Reviews', valueIndicator: 25 });

    const assets = service.listAssets('wks_a');

    expect(assets).toHaveLength(2);
    expect(assets.map((a) => a.name)).toContain('Email');
    expect(assets.map((a) => a.name)).toContain('Reviews');
  });

  // ─── Scenario 19: getAsset retrieves a specific asset ────────────────

  it('getAsset retrieves a registered asset by id', () => {
    const record = service.registerAsset('wks_a', {
      kind: 'brand_trust',
      name: 'Brand Trust',
      valueIndicator: 0.8,
    });

    const found = service.getAsset('wks_a', record!.assetId);

    expect(found?.name).toBe('Brand Trust');
  });

  // ─── Scenario 20: workspace isolation for assets ─────────────────────

  it('isolates assets across workspaces', () => {
    service.registerAsset('wks_a', { kind: 'community', name: 'Community A', valueIndicator: 100 });
    service.registerAsset('wks_b', { kind: 'community', name: 'Community B', valueIndicator: 200 });

    expect(service.listAssets('wks_a')).toHaveLength(1);
    expect(service.listAssets('wks_b')).toHaveLength(1);
    expect(service.listAssets('wks_c')).toHaveLength(0);
  });
