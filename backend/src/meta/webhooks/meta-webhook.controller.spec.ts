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

  it('routes instagram webhooks using instagramAccountId when the entry id is not a page id', async () => {
    const processInstagramWebhook = jest.fn().mockResolvedValue(undefined);

    const controller = new MetaWebhookController(
      {} as never,
      { process: jest.fn() } as never,
      { handleIncomingMessage: jest.fn(), processInstagramWebhook } as never,
      {
        metaConnection: {
          findFirst: jest.fn().mockResolvedValue({ workspaceId: 'ws-ig-1' }),
        },
      } as never,
      { captureRealtimePageLeadgen: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await controller.handleWebhook(
      {
        object: 'instagram',
        entry: [{ id: '17841425688764914' }],
      },
      '',
    );

    expect(processInstagramWebhook).toHaveBeenCalledWith('ws-ig-1', {
      entry: [{ id: '17841425688764914' }],
    });
  });
});
