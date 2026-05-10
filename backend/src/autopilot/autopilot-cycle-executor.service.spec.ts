import { AutopilotCycleExecutorService } from './autopilot-cycle-executor.service';

describe('AutopilotCycleExecutorService', () => {
  const buildConfig = () => ({ get: jest.fn().mockReturnValue('') });
  const buildService = (mindPolicy?: { choose: jest.Mock }) =>
    new AutopilotCycleExecutorService(
      {} as never,
      buildConfig() as never,
      {} as never,
      undefined,
      mindPolicy as never,
    );

  const conversation = {
    id: 'conversation-1',
    workspaceId: 'workspace-1',
    contact: { id: 'contact-1', phone: '+5511999999999' },
    messages: [{ direction: 'INBOUND', content: 'quanto custa?', createdAt: new Date(0) }],
  };

  it('delega a decisao de action para o MIND mantendo baseline legado auditavel', async () => {
    const mindPolicy = {
      choose: jest.fn().mockResolvedValue({ chosen: 'send_price', decision: {} }),
    };
    const service = buildService(mindPolicy);

    const result = await service.decideAction(
      { intent: 'question_price', sentiment: 'neutral', buyingSignal: false, stage: 'new' },
      conversation,
      true,
    );

    expect(result).toBe('send_price');
    expect(mindPolicy.choose).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        subject: 'contact:contact-1',
        decisionType: 'autopilot_action',
        baselineActionQuiet: 'send_price',
        outcomeKey: 'autopilot_action:workspace-1:conversation-1:1970-01-01T00:00:00.000Z',
      }),
    );
    expect(
      mindPolicy.choose.mock.calls[0][0].options.map((option: { action: string }) => option.action),
    ).toContain('handover_human');
  });

  it('usa o baseline legado quando o MIND falha', async () => {
    const mindPolicy = {
      choose: jest.fn().mockRejectedValue(new Error('mind unavailable')),
    };
    const service = buildService(mindPolicy);

    const result = await service.decideAction(
      { intent: 'complaint', sentiment: 'negative', buyingSignal: false, stage: 'support' },
      conversation,
      false,
    );

    expect(result).toBe('handover_human');
  });
});
