import { ValenceTaggerService } from '../mind/valence-tagger.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import {
  CampaignEventEmitterService,
  type CampaignAudienceReachedInput,
  type CampaignClickedInput,
  type CampaignConversionAssociatedInput,
  type CampaignCreativeSwappedInput,
  type CampaignPerformanceDropDetectedInput,
} from './campaign-event-emitter.service';

function buildSpine(opts: { ringCapacity?: number } = {}) {
  return new SpineEmitterService(new ValenceTaggerService(), opts);
}

describe('CampaignEventEmitterService', () => {
  const baseWorkspaceId = 'wks_camp_spec';

  function build(collected: ReturnType<typeof buildSpine> = buildSpine()) {
    return new CampaignEventEmitterService(collected);
  }

  describe('commerce.campaign.clicked', () => {
    it('emits event with correct eventName, workspaceId, entityRef, truthMode, provenance', () => {
      const spine = buildSpine();
      const emitter = build(spine);
      const input: CampaignClickedInput = {
        workspaceId: baseWorkspaceId,
        campaignId: 'camp_01',
        creativeId: 'cr_42',
        utm: { source: 'instagram', medium: 'social' },
      };
      emitter.emitClicked(input);
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const e = events[0]!;
      expect(e.eventName).toBe('commerce.campaign.clicked');
      expect(e.workspaceId).toBe(baseWorkspaceId);
      expect(e.entityRef).toEqual({ entityType: 'campaign', entityId: 'camp_01' });
      expect(e.truthMode).toBe('observed');
      expect(e.provenance.source).toBe('production');
      expect(e.provenance.processor).toBe('campaign-event-emitter');
      expect(e.payload).toEqual({
        campaignId: 'camp_01',
        creativeId: 'cr_42',
        utm: { source: 'instagram', medium: 'social' },
      });
    });
  });

  describe('commerce.campaign.conversion_associated', () => {
    it('emits event with correct fields and attributionModel', () => {
      const spine = buildSpine();
      const emitter = build(spine);
      const input: CampaignConversionAssociatedInput = {
        workspaceId: baseWorkspaceId,
        campaignId: 'camp_02',
        conversionId: 'conv_77',
        attributionModel: 'last-click',
      };
      emitter.emitConversionAssociated(input);
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const e = events[0]!;
      expect(e.eventName).toBe('commerce.campaign.conversion_associated');
      expect(e.workspaceId).toBe(baseWorkspaceId);
      expect(e.truthMode).toBe('observed');
      expect(e.provenance.source).toBe('production');
      expect(e.payload).toEqual({
        campaignId: 'camp_02',
        conversionId: 'conv_77',
        attributionModel: 'last-click',
      });
    });
  });

  describe('commerce.campaign.audience_reached', () => {
    it('emits event with metric and value in payload', () => {
      const spine = buildSpine();
      const emitter = build(spine);
      const input: CampaignAudienceReachedInput = {
        workspaceId: baseWorkspaceId,
        campaignId: 'camp_03',
        metric: 'impressions',
        value: 15000,
      };
      emitter.emitAudienceReached(input);
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const e = events[0]!;
      expect(e.eventName).toBe('commerce.campaign.audience_reached');
      expect(e.workspaceId).toBe(baseWorkspaceId);
      expect(e.truthMode).toBe('observed');
      expect(e.provenance.source).toBe('production');
      expect(e.payload).toEqual({
        campaignId: 'camp_03',
        metric: 'impressions',
        value: 15000,
      });
    });
  });

  describe('commerce.campaign.creative_swapped', () => {
    it('emits event with from/to creative IDs', () => {
      const spine = buildSpine();
      const emitter = build(spine);
      const input: CampaignCreativeSwappedInput = {
        workspaceId: baseWorkspaceId,
        campaignId: 'camp_04',
        fromCreativeId: 'cr_v1',
        toCreativeId: 'cr_v2',
        swappedBy: 'darwin',
      };
      emitter.emitCreativeSwapped(input);
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const e = events[0]!;
      expect(e.eventName).toBe('commerce.campaign.creative_swapped');
      expect(e.workspaceId).toBe(baseWorkspaceId);
      expect(e.truthMode).toBe('observed');
      expect(e.provenance.source).toBe('production');
      expect(e.payload).toEqual({
        campaignId: 'camp_04',
        fromCreativeId: 'cr_v1',
        toCreativeId: 'cr_v2',
        swappedBy: 'darwin',
      });
    });
  });

  describe('commerce.campaign.performance_drop_detected', () => {
    it('emits event with truthMode inferred and drop metrics', () => {
      const spine = buildSpine();
      const emitter = build(spine);
      const input: CampaignPerformanceDropDetectedInput = {
        workspaceId: baseWorkspaceId,
        campaignId: 'camp_05',
        dropPct: 42,
        threshold: 20,
      };
      emitter.emitPerformanceDropDetected(input);
      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const e = events[0]!;
      expect(e.eventName).toBe('commerce.campaign.performance_drop_detected');
      expect(e.workspaceId).toBe(baseWorkspaceId);
      expect(e.truthMode).toBe('inferred');
      expect(e.provenance.source).toBe('production');
      expect(e.payload).toEqual({
        campaignId: 'camp_05',
        dropPct: 42,
        threshold: 20,
      });
    });
  });

  it('does NOT throw when the spine ring buffer is full and overflows oldest', () => {
    const spine = buildSpine({ ringCapacity: 64 });
    const emitter = build(spine);
    for (let i = 0; i < 100; i += 1) {
      expect(() =>
        emitter.emitAudienceReached({
          workspaceId: baseWorkspaceId,
          campaignId: `camp_${i}`,
          metric: 'impressions',
          value: i,
        }),
      ).not.toThrow();
    }
    const recent = spine.recentEvents();
    expect(recent).toHaveLength(64);
    expect(recent[0]?.payload?.value).toBe(36);
    expect(recent[63]?.payload?.value).toBe(99);
  });

  it('does NOT throw when payload is malformed (null/undefined fields) — logs and returns', () => {
    const spine = buildSpine();
    const emitter = build(spine);
    expect(() =>
      emitter.emitClicked({
        workspaceId: baseWorkspaceId,
        campaignId: 'camp_malformed',
      }),
    ).not.toThrow();
    const events = spine.recentEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.eventName).toBe('commerce.campaign.clicked');
  });

  it('spine auto-tags terminal events via ValenceTaggerService', () => {
    const spine = buildSpine();
    const emitter = build(spine);
    emitter.emitAudienceReached({
      workspaceId: baseWorkspaceId,
      campaignId: 'camp_term_test',
      metric: 'unique_reach',
      value: 500,
    });
    const events = spine.recentEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.valence).toBeUndefined();
  });

  it('two consecutive emissions with different correlationIds produce two distinct events', () => {
    const spine = buildSpine();
    const emitter = build(spine);
    emitter.emitAudienceReached({
      workspaceId: baseWorkspaceId,
      campaignId: 'camp_c1',
      metric: 'impressions',
      value: 100,
    });
    emitter.emitAudienceReached({
      workspaceId: baseWorkspaceId,
      campaignId: 'camp_c2',
      metric: 'unique_reach',
      value: 200,
    });
    const events = spine.recentEvents();
    expect(events).toHaveLength(2);
    expect(events[0]?.eventId).not.toBe(events[1]?.eventId);
    expect(events[0]?.payload?.campaignId).toBe('camp_c1');
    expect(events[1]?.payload?.campaignId).toBe('camp_c2');
  });

  it('all five canonical campaign events can be emitted in sequence', () => {
    const spine = buildSpine();
    const emitter = build(spine);
    emitter.emitClicked({ workspaceId: baseWorkspaceId, campaignId: 'c', creativeId: 'cr' });
    emitter.emitConversionAssociated({
      workspaceId: baseWorkspaceId,
      campaignId: 'c',
      conversionId: 'conv',
      attributionModel: 'last-click',
    });
    emitter.emitAudienceReached({
      workspaceId: baseWorkspaceId,
      campaignId: 'c',
      metric: 'impressions',
      value: 1000,
    });
    emitter.emitCreativeSwapped({
      workspaceId: baseWorkspaceId,
      campaignId: 'c',
      fromCreativeId: 'a',
      toCreativeId: 'b',
      swappedBy: 'darwin',
    });
    emitter.emitPerformanceDropDetected({
      workspaceId: baseWorkspaceId,
      campaignId: 'c',
      dropPct: 30,
      threshold: 20,
    });
    const events = spine.recentEvents();
    expect(events).toHaveLength(5);
    expect(events.map((e) => e.eventName)).toEqual([
      'commerce.campaign.clicked',
      'commerce.campaign.conversion_associated',
      'commerce.campaign.audience_reached',
      'commerce.campaign.creative_swapped',
      'commerce.campaign.performance_drop_detected',
    ]);
  });
});
