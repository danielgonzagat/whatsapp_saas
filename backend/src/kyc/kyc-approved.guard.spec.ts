import { ForbiddenException } from '@nestjs/common';
import { KycApprovedGuard } from './kyc-approved.guard';

type AgentRow = { kycStatus: string } | null;

function buildGuard(options: { kycRequired: boolean; agent?: AgentRow; user?: { sub?: string } }) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(options.kycRequired),
  };
  const findUnique = jest.fn().mockResolvedValue(options.agent ?? null);
  const prisma = {
    agent: { findUnique },
  };
  const guard = new KycApprovedGuard(reflector as never, prisma as never);
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ('user' in options ? { user: options.user } : {}),
    }),
  };
  return { guard, context, findUnique };
}

describe('KycApprovedGuard', () => {
  it('allows the request when KYC is not required (decorator absent)', async () => {
    const { guard, context, findUnique } = buildGuard({ kycRequired: false });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('fails CLOSED (denies) when the request has no authenticated user', async () => {
    const { guard, context, findUnique } = buildGuard({ kycRequired: true, user: undefined });

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(ForbiddenException);
    // A KYC-gated route must never be reachable without an identity.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('fails CLOSED (denies) when no agent record is found for the user', async () => {
    const { guard, context } = buildGuard({
      kycRequired: true,
      user: { sub: 'agent_ghost' },
      agent: null,
    });

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies when the agent KYC status is not approved', async () => {
    const { guard, context } = buildGuard({
      kycRequired: true,
      user: { sub: 'agent_1' },
      agent: { kycStatus: 'submitted' },
    });

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows when the agent KYC status is approved', async () => {
    const { guard, context } = buildGuard({
      kycRequired: true,
      user: { sub: 'agent_1' },
      agent: { kycStatus: 'approved' },
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });
});
