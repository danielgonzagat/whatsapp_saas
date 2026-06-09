import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PartnershipsController } from './partnerships.controller';
import type { PartnershipsService } from './partnerships.service';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

/**
 * Cross-tenant convergence regression test.
 *
 * The controller's private workspace resolver was converged onto the canonical,
 * cross-tenant-safe `resolveWorkspaceId` (auth/workspace-access). These tests
 * prove that:
 *  1. The token's workspaceId is the one passed to the service (happy path).
 *  2. A forged `x-workspace-id` request header can NO LONGER select another
 *     tenant's workspace — the header is ignored entirely.
 *  3. A request-supplied `workspaceId` (params/body/query) that mismatches the
 *     token is rejected with Forbidden instead of leaking cross-tenant data.
 */
describe('PartnershipsController workspace resolution (cross-tenant safe)', () => {
  const originalAuthOptional = process.env.AUTH_OPTIONAL;
  const originalNodeEnv = process.env.NODE_ENV;

  let listCollaborators: jest.Mock;
  let controller: PartnershipsController;

  beforeEach(() => {
    // Ensure production AUTH_OPTIONAL guard does not interfere and dev-optional
    // fallback is disabled — the resolver must rely purely on the token.
    delete process.env.AUTH_OPTIONAL;
    process.env.NODE_ENV = 'test';

    listCollaborators = jest.fn().mockResolvedValue([]);
    const service = { listCollaborators } as unknown as PartnershipsService;
    controller = new PartnershipsController(service);
  });

  afterEach(() => {
    process.env.AUTH_OPTIONAL = originalAuthOptional;
    process.env.NODE_ENV = originalNodeEnv;
  });

  function makeReq(overrides: Partial<AuthenticatedRequest>): AuthenticatedRequest {
    return {
      user: { workspaceId: 'ws-owner', sub: 'u1', email: 'a@b.c' },
      headers: {},
      params: {},
      body: {},
      query: {},
      ...overrides,
    } as unknown as AuthenticatedRequest;
  }

  it('uses the token workspaceId (happy path)', async () => {
    const req = makeReq({});

    await controller.listCollaborators(req);

    expect(listCollaborators).toHaveBeenCalledWith('ws-owner');
  });

  it('ignores a forged x-workspace-id header (no cross-tenant leak via header)', async () => {
    const req = makeReq({
      headers: { 'x-workspace-id': 'ws-victim' },
    });

    await controller.listCollaborators(req);

    // The attacker-supplied header is NOT honored: the token workspace wins.
    expect(listCollaborators).toHaveBeenCalledWith('ws-owner');
    expect(listCollaborators).not.toHaveBeenCalledWith('ws-victim');
  });

  it('rejects a body workspaceId that mismatches the token (Forbidden)', () => {
    const req = makeReq({
      body: { workspaceId: 'ws-victim' },
    });

    // The mismatch is detected synchronously in the workspace resolver, before
    // any service call — so it throws rather than returning a rejected promise.
    expect(() => controller.listCollaborators(req)).toThrow(ForbiddenException);
    expect(listCollaborators).not.toHaveBeenCalled();
  });

  it('rejects a query workspaceId that mismatches the token (Forbidden)', () => {
    const req = makeReq({
      query: { workspaceId: 'ws-victim' },
    });

    expect(() => controller.listCollaborators(req)).toThrow(ForbiddenException);
    expect(listCollaborators).not.toHaveBeenCalled();
  });

  it('throws Unauthorized when the token carries no workspace (no silent empty-string)', () => {
    const req = makeReq({
      user: { sub: 'u1', email: 'a@b.c' } as AuthenticatedRequest['user'],
    });

    expect(() => controller.listCollaborators(req)).toThrow(UnauthorizedException);
    expect(listCollaborators).not.toHaveBeenCalled();
  });
});
