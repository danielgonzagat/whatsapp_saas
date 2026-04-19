import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController session endpoints', () => {
  const auth = {
    listSessions: jest.fn(),
    revokeCurrentSession: jest.fn(),
    revokeOtherSessions: jest.fn(),
    revokeSession: jest.fn(),
  } as any;

  const controller = new AuthController(auth);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects session revocation when the request is unauthenticated', async () => {
    await expect(
      controller.revokeSession({ user: undefined } as any, { sessionId: 'session-1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('forwards the current jwt session id when listing active sessions', async () => {
    auth.listSessions.mockResolvedValue({
      sessions: [{ id: 'session-1', isCurrent: true }],
    });

    const result = await controller.listSessions(
      { user: { sub: 'agent-1', sessionId: 'session-1' } } as any,
    );

    expect(auth.listSessions).toHaveBeenCalledWith('agent-1', 'session-1');
    expect(result).toEqual({
      sessions: [{ id: 'session-1', isCurrent: true }],
    });
  });
});
