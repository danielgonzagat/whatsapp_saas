import { GmailSyncService } from './sync.service';
import type { GmailMailboxRecord, GmailListResponse, GmailMessageResponse } from './types';

type MailboxUpdateMetadata = {
  syncedMessageIds?: string[];
};

type MailboxUpdateArgs = {
  where: { id: string };
  data: {
    lastSyncAt?: Date;
    lastErrorAt?: null;
    lastError?: null;
    metadata?: MailboxUpdateMetadata;
  };
};

jest.mock('../../observability/metrics', () => ({
  Metrics: {
    mailbox: {
      syncCompleted: jest.fn(),
      syncFailed: jest.fn(),
    },
  },
}));

function buildConnection(overrides: Partial<GmailMailboxRecord> = {}): GmailMailboxRecord {
  return {
    id: 'mb-1',
    workspaceId: 'ws-1',
    email: 'owner@example.com',
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    metadata: null,
    ...overrides,
  };
}

function buildListResponse(ids: string[]): GmailListResponse {
  return { messages: ids.map((id) => ({ id })) };
}

function buildMessageResponse(
  id: string,
  from: { name: string; email: string },
  subject: string,
  bodyText: string,
): GmailMessageResponse {
  const textData = Buffer.from(bodyText).toString('base64url');
  return {
    id,
    threadId: `thread-${id}`,
    historyId: '100',
    snippet: bodyText.slice(0, 20),
    payload: {
      headers: [
        { name: 'From', value: `${from.name} <${from.email}>` },
        { name: 'Subject', value: subject },
      ],
      mimeType: 'text/plain',
      body: { data: textData },
    },
  };
}

describe('GmailSyncService', () => {
  let prismaMock: {
    mailboxConnection: { update: jest.Mock<Promise<{ id: string }>, [MailboxUpdateArgs]> };
  };
  let omnichannelMock: { handleIncomingMessage: jest.Mock<Promise<void>, [unknown]> };
  let gmailClientMock: {
    resolveAccessToken: jest.Mock<Promise<string>, [GmailMailboxRecord]>;
    listMessages: jest.Mock<Promise<GmailListResponse>, [string, number]>;
    getMessage: jest.Mock<Promise<GmailMessageResponse>, [string, string]>;
  };
  let service: GmailSyncService;

  beforeEach(() => {
    jest.clearAllMocks();

    prismaMock = {
      mailboxConnection: {
        update: jest.fn<Promise<{ id: string }>, [MailboxUpdateArgs]>().mockResolvedValue({
          id: 'mb-1',
        }),
      },
    };
    omnichannelMock = {
      handleIncomingMessage: jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined),
    };
    gmailClientMock = {
      resolveAccessToken: jest
        .fn<Promise<string>, [GmailMailboxRecord]>()
        .mockResolvedValue('fake-access-token'),
      listMessages: jest.fn<Promise<GmailListResponse>, [string, number]>(),
      getMessage: jest.fn<Promise<GmailMessageResponse>, [string, string]>(),
    };

    service = new GmailSyncService(
      prismaMock as never,
      omnichannelMock as never,
      gmailClientMock as never,
    );
  });

  describe('syncLatestInbox', () => {
    it('syncs new messages and updates metadata', async () => {
      const connection = buildConnection();
      gmailClientMock.listMessages.mockResolvedValue(buildListResponse(['msg-1', 'msg-2']));
      gmailClientMock.getMessage.mockResolvedValue(
        buildMessageResponse(
          'msg-1',
          { name: 'Sender', email: 'sender@example.com' },
          'Hello',
          'Message body one',
        ),
      );

      const result = await service.syncLatestInbox(connection);

      expect(gmailClientMock.resolveAccessToken).toHaveBeenCalledWith(connection);
      expect(gmailClientMock.listMessages).toHaveBeenCalledWith('fake-access-token', 10);
      expect(gmailClientMock.getMessage).toHaveBeenCalledTimes(2);
      expect(omnichannelMock.handleIncomingMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          channel: 'EMAIL',
          from: 'sender@example.com',
        }),
      );
      const [updateCall] = prismaMock.mailboxConnection.update.mock.calls[0]!;
      expect(updateCall.where).toEqual({ id: 'mb-1' });
      expect(updateCall.data.lastSyncAt).toBeInstanceOf(Date);
      expect(updateCall.data.metadata?.syncedMessageIds).toEqual(
        expect.arrayContaining(['msg-1', 'msg-2']),
      );
      expect(result).toEqual({
        provider: 'gmail',
        status: 'synced',
        email: 'owner@example.com',
        imported: 2,
        seen: 2,
      });
    });

    it('deduplicates already-synced message IDs', async () => {
      const connection = buildConnection({
        metadata: { syncedMessageIds: ['msg-1', 'msg-2'] },
      });
      gmailClientMock.listMessages.mockResolvedValue(
        buildListResponse(['msg-1', 'msg-2', 'msg-3']),
      );
      gmailClientMock.getMessage.mockResolvedValue(
        buildMessageResponse(
          'msg-3',
          { name: 'Sender', email: 'sender@example.com' },
          'Subject',
          'Body',
        ),
      );

      await service.syncLatestInbox(connection);

      expect(gmailClientMock.getMessage).toHaveBeenCalledTimes(1);
      expect(gmailClientMock.getMessage).toHaveBeenCalledWith('fake-access-token', 'msg-3');
      expect(omnichannelMock.handleIncomingMessage).toHaveBeenCalledTimes(1);
    });

    it('skips messages without content or from own mailbox', async () => {
      const connection = buildConnection({ email: 'owner@example.com' });
      gmailClientMock.listMessages.mockResolvedValue(buildListResponse(['msg-1', 'msg-2']));
      gmailClientMock.getMessage
        .mockResolvedValueOnce(
          buildMessageResponse(
            'msg-1',
            { name: 'Owner', email: 'owner@example.com' },
            'Re: Hello',
            'Echo body',
          ),
        )
        .mockResolvedValueOnce({
          id: 'msg-2',
          snippet: '',
          payload: {
            headers: [{ name: 'From', value: 'Someone <someone@example.com>' }],
          },
        });

      await service.syncLatestInbox(connection);

      expect(omnichannelMock.handleIncomingMessage).not.toHaveBeenCalled();
      const [updateCall] = prismaMock.mailboxConnection.update.mock.calls[0]!;
      expect(updateCall.where).toEqual({ id: 'mb-1' });
      expect(updateCall.data.metadata?.syncedMessageIds).toEqual(
        expect.arrayContaining(['msg-1', 'msg-2']),
      );
    });

    it('throws when connection is null (current behavior: TypeError in catch — real bug to fix in service)', async () => {
      gmailClientMock.resolveAccessToken.mockRejectedValue(new Error('No mailbox record'));

      // BUG: service catch block reads connection.workspaceId before checking
      // connection is non-null, so caller gets a TypeError instead of the
      // upstream error. This test documents the current behavior; service
      // should null-check connection before referencing workspaceId.
      await expect(service.syncLatestInbox(null as GmailMailboxRecord)).rejects.toThrow(TypeError);

      expect(gmailClientMock.listMessages).not.toHaveBeenCalled();
      expect(omnichannelMock.handleIncomingMessage).not.toHaveBeenCalled();
      expect(prismaMock.mailboxConnection.update).not.toHaveBeenCalled();
    });

    it('throws on gmail list error without partial state writes', async () => {
      const connection = buildConnection();
      gmailClientMock.listMessages.mockRejectedValue(new Error('Gmail API error'));

      await expect(service.syncLatestInbox(connection)).rejects.toThrow('Gmail API error');

      expect(omnichannelMock.handleIncomingMessage).not.toHaveBeenCalled();
      expect(prismaMock.mailboxConnection.update).not.toHaveBeenCalled();
    });

    it('passes workspaceId from the mailbox row to omnichannel', async () => {
      const connection = buildConnection({ workspaceId: 'ws-tenant-99' });
      gmailClientMock.listMessages.mockResolvedValue(buildListResponse(['msg-1']));
      gmailClientMock.getMessage.mockResolvedValue(
        buildMessageResponse(
          'msg-1',
          { name: 'Sender', email: 'sender@example.com' },
          'Subject',
          'Body text',
        ),
      );

      await service.syncLatestInbox(connection);

      expect(omnichannelMock.handleIncomingMessage).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-tenant-99' }),
      );
    });

    it('respects requestedLimit parameter', async () => {
      const connection = buildConnection();
      gmailClientMock.listMessages.mockResolvedValue(buildListResponse(['msg-1']));
      gmailClientMock.getMessage.mockResolvedValue(
        buildMessageResponse('msg-1', { name: 'S', email: 's@e.com' }, 'S', 'B'),
      );

      await service.syncLatestInbox(connection, 5);

      expect(gmailClientMock.listMessages).toHaveBeenCalledWith('fake-access-token', 5);
    });

    it('caps limit at 25', async () => {
      const connection = buildConnection();
      gmailClientMock.listMessages.mockResolvedValue(buildListResponse(['msg-1']));
      gmailClientMock.getMessage.mockResolvedValue(
        buildMessageResponse('msg-1', { name: 'S', email: 's@e.com' }, 'S', 'B'),
      );

      await service.syncLatestInbox(connection, 100);

      expect(gmailClientMock.listMessages).toHaveBeenCalledWith('fake-access-token', 25);
    });

    it('defaults limit to 10 when requestedLimit is 0', async () => {
      const connection = buildConnection();
      gmailClientMock.listMessages.mockResolvedValue(buildListResponse(['msg-1']));
      gmailClientMock.getMessage.mockResolvedValue(
        buildMessageResponse('msg-1', { name: 'S', email: 's@e.com' }, 'S', 'B'),
      );

      await service.syncLatestInbox(connection, 0);

      expect(gmailClientMock.listMessages).toHaveBeenCalledWith('fake-access-token', 10);
    });
  });
});
