import { resolveCartRecoveryDecision } from './mind-recovery-decision-resolvers';
import { partialMatch, stringMatch } from '../../../../test/helpers/match-instance';
import { castMock } from '../../../../test/helpers/cast-mock';

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
      partialMatch({
        subject: 'order:order-1',
        outcomeKey: stringMatch(/^cart_recovery:ws-1:order-1:\d+$/),
      }),
    );
    expect(policy.choose).toHaveBeenNthCalledWith(
      2,
      partialMatch({
        subject: 'order:order-1',
        outcomeKey: stringMatch(/^cart_recovery:ws-1:order-1:\d+$/),
      }),
    );
    expect(castMock<[{ outcomeKey: unknown }]>(policy.choose.mock.calls[0])[0].outcomeKey).not.toBe(
      castMock<[{ outcomeKey: unknown }]>(policy.choose.mock.calls[1])[0].outcomeKey,
    );
  });

  it('surfaces the chosen baseline and the decision outcomeKey to the caller', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_762_000_000_003);
    const policy = {
      choose: jest.fn().mockResolvedValue({
        chosen: 'discount',
        decision: {
          candidates: [{ action: 'discount', beliefMean: 0.6 }],
          fallbackActive: false,
          reasonInternal: 'test',
        },
      }),
    };

    const result = await resolveCartRecoveryDecision(
      policy,
      undefined,
      undefined,
      'ws-1',
      'order-1',
      'Produto',
      'under_100',
      45,
    );

    // The outcomeKey returned is byte-identical to the one passed into choose,
    // so the caller can persist it and later close the same decision row.
    expect(result.outcomeKey).toBe('cart_recovery:ws-1:order-1:1762000000003');
    expect(castMock<[{ outcomeKey: unknown }]>(policy.choose.mock.calls[0])[0].outcomeKey).toBe(
      result.outcomeKey,
    );
    // With no memory/bandit input the baseline is the 'help' default.
    expect(result.baseline).toBe('help');
  });
});
