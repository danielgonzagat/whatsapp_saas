import { TIER_12_MARKETING_CAPABILITIES } from './tier-12-marketing';
import { KLOEL_CHAT_TOOLS_MARKETING } from '../../kloel-chat-tools.definition-marketing';
import { ChannelMessageDispatchService } from '../../../marketing/channel-message-dispatch.service';
import { CampaignsService } from '../../../campaigns/campaigns.service';

/**
 * Wave7 L5 — marketing / channel SEND capability registration proofs.
 *
 * Proves the 8 capabilities are registered with the canonical shape (sends are
 * MUTATION_SENSITIVE + confirmation), route to resolvable domain services, the
 * tool-schema partition mirrors them 1:1, and the resolver-shaped aliases
 * delegate to the canonical dispatch / launch surfaces with honest blocked
 * results (no fake success).
 */

const byId = new Map(TIER_12_MARKETING_CAPABILITIES.map((c) => [c.id, c]));

const SEND_CAPS = [
  'whatsapp.send_message',
  'whatsapp.send_campaign',
  'instagram.send_dm',
  'facebook.create_ad_draft',
  'tiktok.create_ad_draft',
  'email.send',
  'email.send_campaign',
];

const ALL_CAPS = [...SEND_CAPS, 'whatsapp.get_chat_status'];

describe('Tier-12 marketing capabilities — registration', () => {
  it('registers all 8 Wave7 L5 capabilities', () => {
    for (const id of ALL_CAPS) {
      expect(byId.has(id)).toBe(true);
    }
    expect(TIER_12_MARKETING_CAPABILITIES).toHaveLength(8);
  });

  it('marks every send as MUTATION_SENSITIVE with confirmation required', () => {
    for (const id of SEND_CAPS) {
      const cap = byId.get(id);
      expect(cap.category).toBe('MUTATION_SENSITIVE');
      expect(cap.requiresConfirmation).toBe(true);
      expect(cap.tier).toBe(12);
    }
  });

  it('keeps get_chat_status as a read-only QUERY without confirmation', () => {
    const cap = byId.get('whatsapp.get_chat_status');
    expect(cap.category).toBe('QUERY');
    expect(cap.requiresConfirmation).toBe(false);
  });

  it('routes message/dm/email sends through the canonical dispatch façade', () => {
    for (const id of ['whatsapp.send_message', 'instagram.send_dm', 'email.send']) {
      expect(byId.get(id).domainService).toBe('ChannelMessageDispatch.dispatchTool');
      expect(byId.get(id).emits).toContain('channel.message_sent');
    }
  });

  it('routes campaigns through the canonical campaign launch alias', () => {
    for (const id of ['whatsapp.send_campaign', 'email.send_campaign']) {
      expect(byId.get(id).domainService).toBe('CampaignService.launchTool');
    }
  });

  it('routes ad drafts to the honest setup-required surface and marks blocked', () => {
    for (const id of ['facebook.create_ad_draft', 'tiktok.create_ad_draft']) {
      const cap = byId.get(id);
      expect(cap.domainService).toBe('ChannelMessageDispatch.createAdDraftTool');
      expect(cap.maturity).toBe('blocked');
      expect(cap.emits).toEqual([]);
    }
  });

  it('declares required permissions for every send', () => {
    for (const id of SEND_CAPS) {
      expect(byId.get(id).requiredPermissions.length).toBeGreaterThan(0);
    }
  });
});

describe('Tier-12 marketing tool-schema partition', () => {
  it('mirrors the capability ids 1:1 as ChatCompletionTool function names', () => {
    const toolNames = KLOEL_CHAT_TOOLS_MARKETING.map((t) =>
      t.type === 'function' ? t.function.name : '',
    );
    for (const id of ALL_CAPS) {
      expect(toolNames).toContain(id);
    }
    expect(KLOEL_CHAT_TOOLS_MARKETING).toHaveLength(ALL_CAPS.length);
  });

  it('declares object parameter schemas for every tool', () => {
    for (const tool of KLOEL_CHAT_TOOLS_MARKETING) {
      expect(tool.type).toBe('function');
      if (tool.type === 'function') {
        expect(tool.function.parameters).toBeDefined();
      }
    }
  });
});

describe('ChannelMessageDispatchService — resolver-shaped aliases', () => {
  function makeService(dispatch = jest.fn()) {
    const svc = Object.create(
      ChannelMessageDispatchService.prototype,
    ) as ChannelMessageDispatchService;
    (svc as unknown as { dispatch: unknown }).dispatch = dispatch;
    return { svc, dispatch };
  }

  it('dispatchTool delegates to dispatch with unpacked channel/to/message', async () => {
    const dispatch = jest.fn().mockResolvedValue({ success: true });
    const { svc } = makeService(dispatch);

    await svc.dispatchTool('ws-1', {
      channel: 'whatsapp',
      to: '5511999999999',
      message: 'oi',
      mediaUrl: 'https://x/y.png',
    });

    const calls = dispatch.mock.calls as Array<[string, string, string, string, object]>;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('ws-1');
    expect(calls[0]?.[1]).toBe('whatsapp');
    expect(calls[0]?.[2]).toBe('5511999999999');
    expect(calls[0]?.[3]).toBe('oi');
    expect(calls[0]?.[4]).toEqual({ mediaUrl: 'https://x/y.png' });
  });

  it('dispatchTool returns honest blocked result when channel missing (no fake success)', async () => {
    const dispatch = jest.fn();
    const { svc } = makeService(dispatch);

    const res = await svc.dispatchTool('ws-1', { to: 'x', message: 'y' });

    expect(res.success).toBe(false);
    expect(res.blocked).toBe(true);
    expect(res.blockedReason).toBe('channel_required');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatchTool returns honest blocked result when recipient missing', async () => {
    const dispatch = jest.fn();
    const { svc } = makeService(dispatch);

    const res = await svc.dispatchTool('ws-1', { channel: 'email', message: 'y' });

    expect(res.success).toBe(false);
    expect(res.blockedReason).toBe('recipient_required');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('createAdDraftTool returns honest setup-required (never fake success)', () => {
    const { svc } = makeService();

    const res = svc.createAdDraftTool('ws-1', { platform: 'facebook' });

    expect(res.success).toBe(false);
    expect(res.blocked).toBe(true);
    expect(res.blockedReason).toBe('ads_integration_setup_required');
    expect(res.provider).toBe('facebook');
  });
});

describe('CampaignsService.launchTool — resolver-shaped alias', () => {
  function makeService(launch = jest.fn()) {
    const svc = Object.create(CampaignsService.prototype) as CampaignsService;
    (svc as unknown as { launch: unknown }).launch = launch;
    return { svc, launch };
  }

  it('delegates to launch with unpacked campaignId + smart-time flag', async () => {
    const launch = jest.fn().mockResolvedValue({ campaignId: 'c-1', scheduledAt: 'NOW' });
    const { svc } = makeService(launch);

    const res = await svc.launchTool('ws-1', { campaignId: 'c-1', useSmartTime: true });

    const calls = launch.mock.calls as Array<[string, string, boolean]>;
    expect(calls[0]).toEqual(['ws-1', 'c-1', true]);
    expect(res).toMatchObject({ success: true, campaignId: 'c-1' });
  });

  it('returns honest error when campaign id missing', async () => {
    const launch = jest.fn();
    const { svc } = makeService(launch);

    const res = await svc.launchTool('ws-1', {});

    expect(res).toEqual({ success: false, error: 'campaign_id_required' });
    expect(launch).not.toHaveBeenCalled();
  });
});
