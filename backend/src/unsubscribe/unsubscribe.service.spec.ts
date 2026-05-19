import { UnsubscribeService } from './unsubscribe.service';

jest.mock('../common/utils/unsubscribe-token.util', () => ({
  verifyUnsubscribeToken: jest.fn(),
}));

import { verifyUnsubscribeToken } from '../common/utils/unsubscribe-token.util';

describe('UnsubscribeService', () => {
  const findFirst = jest.fn();
  const findMany = jest.fn();
  const update = jest.fn();

  const prismaMock = {
    contact: { findFirst, findMany, update },
  };

  let service: UnsubscribeService;
  const verifyMock = verifyUnsubscribeToken as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UnsubscribeService(prismaMock as never);
  });

  it('flips optIn to false when token has workspaceId and contact is found', async () => {
    verifyMock.mockReturnValue({ email: 'a@b.com', workspaceId: 'ws-1' });
    findMany.mockResolvedValue([{ id: 'c-1', workspaceId: 'ws-1', optIn: true }]);
    update.mockResolvedValue({});

    const result = await service.processUnsubscribeToken('tok');

    expect(result).toEqual({
      success: true,
      email: 'a@b.com',
      workspaceId: 'ws-1',
      contactId: 'c-1',
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { email: { equals: 'a@b.com', mode: 'insensitive' }, workspaceId: 'ws-1' },
      select: { id: true, workspaceId: true, optIn: true },
      take: 1,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'c-1', workspaceId: 'ws-1' },
      data: expect.objectContaining({ optIn: false }),
    });
  });

  it('finds contact across workspaces when token has email only', async () => {
    verifyMock.mockReturnValue({ email: 'x@y.com' });
    findFirst.mockResolvedValue({ id: 'c-9', workspaceId: 'ws-from-row', optIn: true });
    update.mockResolvedValue({});

    const result = await service.processUnsubscribeToken('tok');

    expect(result).toEqual({
      success: true,
      email: 'x@y.com',
      workspaceId: 'ws-from-row',
      contactId: 'c-9',
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'x@y.com', mode: 'insensitive' } },
      select: { id: true, workspaceId: true, optIn: true },
    });
  });

  it('returns invalid_token error and does NOT touch prisma when token is invalid', async () => {
    verifyMock.mockReturnValue(null);

    const result = await service.processUnsubscribeToken('bad-token');

    expect(result).toEqual({ success: false, error: 'invalid_token' });
    expect(findFirst).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('returns contact_not_found when no contact row matches the workspace+email', async () => {
    verifyMock.mockReturnValue({ email: 'unknown@y.com', workspaceId: 'ws-empty' });
    findMany.mockResolvedValue([]);

    const result = await service.processUnsubscribeToken('tok');

    expect(result).toEqual({ success: false, error: 'contact_not_found' });
    expect(update).not.toHaveBeenCalled();
  });

  it('isolates contact lookup by workspaceId in findMany call', async () => {
    verifyMock.mockReturnValue({ email: 'iso@y.com', workspaceId: 'ws-isolated' });
    findMany.mockResolvedValue([]);

    await service.processUnsubscribeToken('tok');

    const callArgs = findMany.mock.calls[0][0];
    expect(callArgs.where.workspaceId).toBe('ws-isolated');
  });
});
