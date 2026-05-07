import { ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { GoogleVerifiedProfile } from '../../google-auth.service';
import { encryptString } from '../../../lib/crypto';
import { normalizeEmail } from './helpers';
import type { AuthPartsDeps } from './register-login';

export async function upsertSocialAccount(
  deps: Pick<AuthPartsDeps, 'config' | 'prisma'>,
  agentId: string,
  profile: GoogleVerifiedProfile,
  options?: { overwriteTokens?: boolean },
): Promise<unknown> {
  const encryptionKey =
    deps.config.get<string>('ENCRYPTION_KEY') ||
    deps.config.get<string>('PROVIDER_SECRET_KEY') ||
    deps.config.get<string>('JWT_SECRET');

  if (!encryptionKey) {
    throw new ServiceUnavailableException(
      'Serviço indisponível. Chave de criptografia ausente no servidor.',
    );
  }

  const encryptedAccessToken = profile.accessToken
    ? encryptString(profile.accessToken, encryptionKey)
    : undefined;
  const encryptedRefreshToken = profile.refreshToken
    ? encryptString(profile.refreshToken, encryptionKey)
    : undefined;

  const current = await deps.prisma.socialAccount.findUnique({
    where: {
      agentId_provider: {
        agentId,
        provider: profile.provider,
      },
    },
    select: {
      id: true,
      accessToken: true,
      refreshToken: true,
    },
  });

  const data: Prisma.SocialAccountUncheckedCreateInput = {
    agentId,
    provider: profile.provider,
    providerUserId: profile.providerId,
    email: normalizeEmail(profile.email),
    accessToken:
      encryptedAccessToken || (options?.overwriteTokens ? null : current?.accessToken) || null,
    refreshToken:
      encryptedRefreshToken || (options?.overwriteTokens ? null : current?.refreshToken) || null,
    tokenExpiresAt: profile.tokenExpiresAt || null,
    profileData: (profile.profileData as Prisma.InputJsonValue | null | undefined) || undefined,
    revokedAt: null,
    lastUsedAt: new Date(),
  };

  return deps.prisma.socialAccount.upsert({
    where: {
      agentId_provider: {
        agentId,
        provider: profile.provider,
      },
    },
    create: data,
    update: {
      providerUserId: data.providerUserId,
      email: data.email,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      tokenExpiresAt: data.tokenExpiresAt,
      profileData: data.profileData,
      revokedAt: null,
      lastUsedAt: new Date(),
    },
  });
}
