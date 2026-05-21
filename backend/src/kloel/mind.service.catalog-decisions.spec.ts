import { MindService } from './mind.service';

function buildService(policy: unknown): MindService {
  return new MindService(
    { since: jest.fn().mockResolvedValue([]) } as never,
    { sweepExpired: jest.fn().mockResolvedValue(0) } as never,
    { list: jest.fn() } as never,
    policy as never,
    {
      recordFailure: jest.fn(),
      recordSuccess: jest.fn(),
      tryAcquireTickLease: jest.fn().mockResolvedValue(true),
      releaseTickLease: jest.fn().mockResolvedValue(undefined),
      watermark: jest.fn(async (_workspaceId: string, fallback: Date) => fallback),
    } as never,
    { process: jest.fn() } as never,
    { similar: jest.fn().mockResolvedValue([]) } as never,
  );
}

function policyFor(chosen: string, beliefMean = 0.7) {
  return {
    choose: jest.fn().mockResolvedValue({
      chosen,
      decision: { candidates: [{ action: chosen, beliefMean }], fallbackActive: false },
    }),
    harness: jest.fn(),
  };
}

describe('MindService catalog decision delegation', () => {
  it('delegates human_transfer with handoff options and context', async () => {
    const policy = policyFor('continue_ai', 0.75);

    const result = await buildService(policy).resolveHumanTransfer(
      'ws-1',
      'whatsapp',
      'price_objection',
      0.3,
      { escalationInProgress: true, humanAvailable: true },
    );

    expect(policy.choose).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        decisionType: 'human_transfer',
        baseline: 'continue_ai',
        context: expect.objectContaining({
          escalationInProgress: true,
          humanAvailable: true,
        }),
        options: expect.arrayContaining([
          expect.objectContaining({ action: 'continue_ai' }),
          expect.objectContaining({ action: 'transfer_now' }),
          expect.objectContaining({ action: 'transfer_after_next_reply' }),
          expect.objectContaining({ action: 'pause_wait' }),
        ]),
      }),
    );
    expect(result).toEqual({ action: 'continue_ai', confidence: 0.75, fallback: false });
  });

  it('delegates channel_choice with dynamic channel options', async () => {
    const policy = policyFor('whatsapp', 0.82);

    const result = await buildService(policy).resolveChannelChoice(
      'ws-1',
      ['whatsapp', 'email'],
      'premium',
      14,
      'sale',
    );

    expect(policy.choose).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        decisionType: 'channel_choice',
        baseline: 'whatsapp',
        context: expect.objectContaining({ segment: 'premium', hour: 14, concept: 'sale' }),
        options: expect.arrayContaining([
          expect.objectContaining({ action: 'whatsapp' }),
          expect.objectContaining({ action: 'email' }),
        ]),
      }),
    );
    expect(result).toEqual({ channel: 'whatsapp', confidence: 0.82, fallback: false });
  });

  it('delegates product_offer with product strategy options', async () => {
    const policy = policyFor('top_seller', 0.78);

    const result = await buildService(policy).resolveProductOffer(
      'ws-1',
      'new_lead',
      'hot_lead',
      'under_100',
      'A1B2C3',
    );

    expect(policy.choose).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        decisionType: 'product_offer',
        baseline: 'entry_product',
        context: expect.objectContaining({ lastPurchase: 'A1B2C3' }),
        options: expect.arrayContaining([
          expect.objectContaining({ action: 'top_seller' }),
          expect.objectContaining({ action: 'highest_margin' }),
          expect.objectContaining({ action: 'entry_product' }),
          expect.objectContaining({ action: 'premium_product' }),
          expect.objectContaining({ action: 'upsell' }),
        ]),
      }),
    );
    expect(result).toEqual({ offer: 'top_seller', confidence: 0.78, fallback: false });
  });

  it('delegates broadcast_window and includes pause when fatigue is high', async () => {
    const policy = policyFor('pause', 0.9);

    const result = await buildService(policy).resolveBroadcastWindow(
      'ws-1',
      'instagram',
      'cold',
      'friday',
      0.85,
    );

    expect(policy.choose).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        decisionType: 'broadcast_window',
        baseline: 'pause',
        options: expect.arrayContaining([expect.objectContaining({ action: 'pause' })]),
      }),
    );
    expect(result).toEqual({ window: 'pause', confidence: 0.9, fallback: false });
  });

  it('delegates ad_alert_action with campaign context', async () => {
    const policy = policyFor('alert_only', 0.72);

    const result = await buildService(policy).resolveAdAlertAction(
      'ws-1',
      'roas',
      24,
      'normal',
      'camp-summer',
    );

    expect(policy.choose).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        decisionType: 'ad_alert_action',
        baseline: 'alert_only',
        context: expect.objectContaining({ campaign: 'camp-summer' }),
        options: expect.arrayContaining([
          expect.objectContaining({ action: 'alert_only' }),
          expect.objectContaining({ action: 'suggest_pause' }),
          expect.objectContaining({ action: 'suggest_budget_down' }),
          expect.objectContaining({ action: 'suggest_creative' }),
          expect.objectContaining({ action: 'ignore' }),
        ]),
      }),
    );
    expect(result).toEqual({ action: 'alert_only', confidence: 0.72, fallback: false });
  });
});
