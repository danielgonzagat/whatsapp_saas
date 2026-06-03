import { UnauthorizedException } from '@nestjs/common';
import type { Agent } from '@prisma/client';
import type { AuthPartsDeps } from './auth-service.register-login';
import { issueTokens, type TokenIssuanceResult } from './auth-service.tokens';
import { assertAgentCanAuthenticate } from './auth-service.helpers';

const ACCOUNT_MFA_SCOPE = 'account_mfa_verify';
const MFA_LOGIN_EXPIRES_IN = '5m';

export interface AccountMfaRequiredResult {
  state: 'mfa_required';
  mfaToken: string;
  user: {
    email: string;
    name?: string | null;
  };
}

interface AccountMfaLoginPayload {
  sub: string;
  email: string;
  scope: typeof ACCOUNT_MFA_SCOPE;
}

type AgentWithMfa = Agent & {
  mfaSecret?: string | null;
  mfaEnabled?: boolean | null;
};

function isAccountMfaLoginPayload(value: unknown): value is AccountMfaLoginPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sub === 'string' &&
    typeof candidate.email === 'string' &&
    candidate.scope === ACCOUNT_MFA_SCOPE
  );
}

export async function maybeRequireAccountMfa(
  deps: AuthPartsDeps,
  agent: AgentWithMfa,
): Promise<AccountMfaRequiredResult | null> {
  if (!agent.mfaEnabled || !agent.mfaSecret) {
    return null;
  }
  const mfaToken = await deps.jwt.signAsync(
    { sub: agent.id, email: agent.email, scope: ACCOUNT_MFA_SCOPE },
    { expiresIn: MFA_LOGIN_EXPIRES_IN },
  );
  return {
    state: 'mfa_required',
    mfaToken,
    user: { email: agent.email, name: agent.name },
  };
}

export async function verifyAccountMfaLogin(
  deps: AuthPartsDeps,
  data: { mfaToken: string; code: string; ip?: string },
): Promise<TokenIssuanceResult> {
  let payload: unknown;
  try {
    payload = await deps.jwt.verifyAsync(data.mfaToken);
  } catch {
    throw new UnauthorizedException('Token 2FA invalido ou expirado.');
  }

  if (!isAccountMfaLoginPayload(payload)) {
    throw new UnauthorizedException('Token 2FA invalido ou expirado.');
  }

  await deps.rateLimitService.checkRateLimit(`mfa-login:${data.ip || 'ip-unknown'}:${payload.sub}`);

  const agent = await deps.prisma.agent.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      name: true,
      workspaceId: true,
      role: true,
      disabledAt: true,
      deletedAt: true,
      mfaSecret: true,
      mfaEnabled: true,
    },
  });

  if (!agent || agent.email !== payload.email) {
    throw new UnauthorizedException('Token 2FA invalido ou expirado.');
  }

  assertAgentCanAuthenticate(agent);

  if (!agent.mfaEnabled || !agent.mfaSecret) {
    throw new UnauthorizedException('2FA nao esta ativo para esta conta.');
  }

  deps.accountMfaService.verifyCode(agent.mfaSecret, data.code);
  return issueTokens(deps.prisma, deps.jwt, deps.logger, agent);
}
