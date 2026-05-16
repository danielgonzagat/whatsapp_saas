import { actionHandleObjection } from './unified-agent-actions-sales.helpers';

type ActionDeps = Parameters<typeof actionHandleObjection>[0];
type MemoryRow = { id: string; key: string; value: unknown };
type AutopilotCreateArg = {
  data: {
    workspaceId: string;
    contactId: string;
    intent: string;
    action: string;
    status: string;
  };
};

describe('actionHandleObjection helper', () => {
  const workspaceId = 'ws-1';
  const contactId = 'contact-1';
  const phone = '5511999999999';

  function buildHarness(overrides: Partial<ActionDeps> = {}) {
    const findMany = jest.fn<Promise<MemoryRow[]>, [unknown?]>().mockResolvedValue([]);
    const create = jest.fn<Promise<{ id: string }>, [unknown]>().mockResolvedValue({ id: 'evt-1' });
    const actionSendMessage = jest
      .fn<Promise<{ success: boolean }>, [string, string, { message: string }, unknown?]>()
      .mockResolvedValue({ success: true });
    const loggerError = jest.fn<void, [string]>();
    const deps: ActionDeps = {
      workspaceId,
      contactId,
      phone,
      args: { objectionType: 'price' },
      context: { source: 'spec' },
      prisma: {
        kloelMemory: {
          findMany,
        },
        autopilotEvent: {
          create,
        },
      } as ActionDeps['prisma'],
      messaging: {
        actionSendMessage,
      },
      logger: {
        error: loggerError,
      },
      ...overrides,
    };
    return { deps, findMany, create, actionSendMessage, loggerError };
  }

  it('uses a custom objection response from persisted memory', async () => {
    const { deps, findMany, create, actionSendMessage } = buildHarness();
    findMany.mockResolvedValue([
      {
        id: 'mem-1',
        key: 'obj-price',
        value: JSON.stringify({ type: 'price', response: 'Vamos focar no ROI deste plano.' }),
      },
    ]);

    const result = await actionHandleObjection(deps);

    expect(result).toMatchObject({
      success: true,
      objectionType: 'price',
      technique: 'value_focus',
      messageSent: true,
    });
    expect(actionSendMessage).toHaveBeenCalledWith(
      workspaceId,
      phone,
      { message: 'Vamos focar no ROI deste plano.' },
      { source: 'spec' },
    );
    const createArg = create.mock.calls.at(0)?.[0] as AutopilotCreateArg | undefined;
    expect(createArg?.data).toMatchObject({
      workspaceId,
      contactId,
      intent: 'OBJECTION',
      action: 'OBJECTION_HANDLED',
      status: 'executed',
    });
  });

  it('ignores malformed memory rows and still sends the canonical fallback', async () => {
    const { deps, findMany, actionSendMessage, loggerError } = buildHarness();
    findMany.mockResolvedValue([
      { id: 'bad-json', key: 'broken', value: '{"type":"price"' },
      { id: 'other', key: 'obj-time', value: { type: 'time', response: 'Tempo resolvido.' } },
    ]);

    const result = await actionHandleObjection(deps);

    expect(result).toMatchObject({ success: true, objectionType: 'price' });
    const sentPayload = actionSendMessage.mock.calls.at(0)?.[2];
    expect(sentPayload?.message).toContain('preocupação com o valor');
    expect(loggerError).not.toHaveBeenCalled();
  });
});
