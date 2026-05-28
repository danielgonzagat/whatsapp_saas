import { resolveCartRecoveryDecision } from './mind-recovery-decision-resolvers';

describe('mind recovery decision resolvers', () => {
  it('keeps cart recovery subject stable while creating attempt-specific outcome keys', async () => {
    jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1_762_000_000_001)
      .mockReturnValueOnce(1_762_000_000_002);
    const policy = {
      choose: jest.fn().mockResolvedValue({
        chosen: 'help',
        decision: {
          candidates: [{ action: 'help', beliefMean: 0.7 }],
          fallbackActive: false,
          reasonInternal: 'test',
        },
      }),
    };

    await resolveCartRecoveryDecision(
      policy,
      undefined,
      undefined,
      'ws-1',
      'order-1',
      'Produto',
      'under_100',
      45,
    );
    await resolveCartRecoveryDecision(
      policy,
      undefined,
      undefined,
      'ws-1',
      'order-1',
      'Produto',
      'under_100',
      60,
    );

    expect(policy.choose).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        subject: 'order:order-1',
        outcomeKey: expect.stringMatching(/^cart_recovery:ws-1:order-1:\d+$/),
      }),
    );
    expect(policy.choose).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        subject: 'order:order-1',
        outcomeKey: expect.stringMatching(/^cart_recovery:ws-1:order-1:\d+$/),
      }),
    );
    expect(policy.choose.mock.calls[0][0].outcomeKey).not.toBe(
      policy.choose.mock.calls[1][0].outcomeKey,
    );
  });
});
