import { MetaWebhookController } from './meta-webhook.controller';

describe('MetaWebhookController', () => {
  it('routes page leadgen events to the leadgen service for the resolved workspace', async () => {
    const metaLeadgen = {
      captureRealtimePageLeadgen: jest.fn().mockResolvedValue(undefined),
    };

    const controller = new MetaWebhookController(
      {} as never,
      { process: jest.fn() } as never,
      { handleIncomingMessage: jest.fn(), processInstagramWebhook: jest.fn() } as never,
      {
        metaConnection: {
          findFirst: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
        },
      } as never,
      metaLeadgen as never,
    );

    await controller.handleWebhook(
      {
        object: 'page',
        entry: [
          {
            id: 'page-1',
            changes: [{ field: 'leadgen', value: { leadgen_id: 'lead-1', form_id: 'form-1' } }],
          },
        ],
      },
      '',
    );

    expect(metaLeadgen.captureRealtimePageLeadgen).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'page-1',
      }),
      'ws-1',
    );
  });
});
