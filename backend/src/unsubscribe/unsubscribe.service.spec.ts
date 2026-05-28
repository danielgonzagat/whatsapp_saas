import { UnsubscribeService } from './unsubscribe.service';

jest.mock('../common/utils/unsubscribe-token.util', () => ({
  verifyUnsubscribeToken: jest.fn(),
}));

import { verifyUnsubscribeToken } from '../common/utils/unsubscribe-token.util';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

describe('UnsubscribeService', () => {
  let prismaMock: ReturnType<typeof createPartialPrismaMock>;

  let service: UnsubscribeService;
  const verifyMock = verifyUnsubscribeToken as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock = createPartialPrismaMock({ contact: ['findFirst', 'findMany', 'update'] });
    service = new UnsubscribeService(prismaMock as never);
  });

  it('flips optIn to false when token has workspaceId and contact is found', async () => {
    verifyMock.mockReturnValue({ email: 'a@b.com', workspaceId: 'ws-1' });
    prismaMock.contact.findMany.mockResolvedValue([
      { id: 'c-1', workspaceId: 'ws-1', optIn: true },
    ]);
    prismaMock.contact.update.mockResolvedValue({});

    const result = await service.processUnsubscribeToken('tok');

    expect(result).toEqual({
      success: true,
      email: 'a@b.com',
      workspaceId: 'ws-1',
      contactId: 'c-1',
    });
    expect(prismaMock.contact.findMany).toHaveBeenCalledWith({
      where: { email: { equals: 'a@b.com', mode: 'insensitive' }, workspaceId: 'ws-1' },
      select: { id: true, workspaceId: true, optIn: true },
      take: 1,
    });
    expect(prismaMock.contact.update).toHaveBeenCalledWith({
      where: { id: 'c-1', workspaceId: 'ws-1' },
      data: expect.objectContaining({ optIn: false }),
    });
  });

  it('finds contact across workspaces when token has email only', async () => {
    verifyMock.mockReturnValue({ email: 'x@y.com' });
    prismaMock.contact.findFirst.mockResolvedValue({
      id: 'c-9',
      workspaceId: 'ws-from-row',
      optIn: true,
    });
    prismaMock.contact.update.mockResolvedValue({});

    const result = await service.processUnsubscribeToken('tok');

    expect(result).toEqual({
      success: true,
      email: 'x@y.com',
      workspaceId: 'ws-from-row',
      contactId: 'c-9',
    });
    expect(prismaMock.contact.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'x@y.com', mode: 'insensitive' } },
      select: { id: true, workspaceId: true, optIn: true },
    });
  });

  it('returns invalid_token error and does NOT touch prisma when token is invalid', async () => {
    verifyMock.mockReturnValue(null);

    const result = await service.processUnsubscribeToken('bad-token');

    expect(result).toEqual({ success: false, error: 'invalid_token' });
    expect(prismaMock.contact.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.contact.findMany).not.toHaveBeenCalled();
    expect(prismaMock.contact.update).not.toHaveBeenCalled();
  });

  it('returns contact_not_found when no contact row matches the workspace+email', async () => {
    verifyMock.mockReturnValue({ email: 'unknown@y.com', workspaceId: 'ws-empty' });
    prismaMock.contact.findMany.mockResolvedValue([]);

    const result = await service.processUnsubscribeToken('tok');

    expect(result).toEqual({ success: false, error: 'contact_not_found' });
    expect(prismaMock.contact.update).not.toHaveBeenCalled();
  });

  it('isolates contact lookup by workspaceId in findMany call', async () => {
    verifyMock.mockReturnValue({ email: 'iso@y.com', workspaceId: 'ws-isolated' });
    prismaMock.contact.findMany.mockResolvedValue([]);

    await service.processUnsubscribeToken('tok');

    const callArgs = prismaMock.contact.findMany.mock.calls[0][0];
    expect(callArgs.where.workspaceId).toBe('ws-isolated');
  });
});
