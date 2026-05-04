import { randomUUID } from 'node:crypto';

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Agent, Workspace } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { compare as bcryptCompare, hash as bcryptHash } from 'bcrypt';
import type { Redis } from 'ioredis';
import { BCRYPT_ROUNDS } from '../../../common/constants';
import type { AuditService } from '../../../audit/audit.service';
import type { ConnectService } from '../../../payments/connect/connect.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { EmailService } from '../../email.service';
import type { FacebookAuthService } from '../../facebook-auth.service';
import type { GoogleAuthService } from '../../google-auth.service';
import type { TikTokAuthService } from '../../tiktok-auth.service';
import type { RateLimitService } from '../../rate-limit.service';
import { DbInitErrorService } from '../../db-init-error.service';
import { UserNameDerivationService } from '../../user-name-derivation.service';
import { normalizeEmail, assertAgentCanAuthenticate } from './helpers';
import { resolvePartnerInvite, finalizePartnerInviteRegistration } from './partner-invite';
import { issueTokens, type TokenIssuanceResult } from './tokens';
import type { Logger } from '@nestjs/common';

export interface AuthPartsDeps {
  prisma: PrismaService;
  jwt: JwtService;
  emailService: EmailService;
  config: ConfigService;
  googleAuthService: GoogleAuthService;
  facebookAuthService: FacebookAuthService;
  tikTokAuthService: TikTokAuthService;
  connectService: ConnectService;
  rateLimitService: RateLimitService;
  redis?: Redis;
  auditService?: AuditService;
  logger: Logger;
}

export async function checkEmail(
  prisma: PrismaService,
  email: string,
): Promise<{ exists: boolean }> {
  try {
    const agent = await prisma.agent.findFirst({
      where: { email },
    });
    return { exists: !!agent };
  } catch (error: unknown) {
    DbInitErrorService.throwFriendlyDbInitError(error);
  }
}

export async function createAnonymous(
  deps: AuthPartsDeps,
  ip?: string,
): Promise<TokenIssuanceResult> {
  await deps.rateLimitService.checkRateLimit(`anonymous:${ip || 'ip-unknown'}`, 3, 60_000);

  const PATTERN_RE = /-/g;
  const uid = randomUUID().replace(PATTERN_RE, '').slice(0, 12);
  const email = `guest_${uid}@guest.kloel.local`;
  const name = 'Guest';

  let workspace: Workspace;
  try {
    workspace = await deps.prisma.workspace.create({
      data: {
        name: 'Guest Workspace',
        providerSettings: {
          guestMode: true,
          authMode: 'anonymous',
          autopilot: { enabled: false },
          whatsappLifecycle: {
            watchdogEnabled: false,
            catchupEnabled: false,
            autoReconnect: false,
          },
        },
      },
    });
  } catch (error: unknown) {
    DbInitErrorService.throwFriendlyDbInitError(error);
  }

  let agent: Agent;
  try {
    agent = await deps.prisma.agent.create({
      data: {
        name,
        email,
        password: await bcryptHash(randomUUID(), BCRYPT_ROUNDS),
        role: 'ADMIN',
        workspaceId: workspace.id,
      },
    });
  } catch (error: unknown) {
    DbInitErrorService.throwFriendlyDbInitError(error);
  }

  return issueTokens(deps.prisma, deps.jwt, deps.logger, agent);
}

export async function register(
  deps: AuthPartsDeps,
  data: {
    name?: string;
    email: string;
    password: string;
    workspaceName?: string;
    affiliateInviteToken?: string;
    ip?: string;
  },
): Promise<TokenIssuanceResult> {
  const { name, email, password, workspaceName, affiliateInviteToken, ip } = data;
  await deps.rateLimitService.checkRateLimit(`register:${ip || 'ip-unknown'}`);
  const normalizedEmail = normalizeEmail(email);
  const affiliateInvite = await resolvePartnerInvite(
    deps.prisma,
    affiliateInviteToken,
    normalizedEmail,
  );

  const finalName = name?.trim() || UserNameDerivationService.deriveNameFromEmail(normalizedEmail);
  const finalWorkspaceName = workspaceName?.trim() || `${finalName}'s Workspace`;

  let existing: Agent | null;
  try {
    existing = await deps.prisma.agent.findFirst({
      where: { email: normalizedEmail },
    });
  } catch (error: unknown) {
    DbInitErrorService.throwFriendlyDbInitError(error);
  }

  if (existing) {
    throw new ConflictException('Email já em uso');
  }

  let workspace: Workspace;
  try {
    workspace = await deps.prisma.workspace.create({
      data: {
        name: finalWorkspaceName,
      },
    });
  } catch (error: unknown) {
    DbInitErrorService.throwFriendlyDbInitError(error);
  }

  const hashed = await bcryptHash(password, BCRYPT_ROUNDS);

  let agent: Agent;
  try {
    agent = await deps.prisma.agent.create({
      data: {
        name: finalName,
        email: normalizedEmail,
        password: hashed,
        role: 'ADMIN',
        workspaceId: workspace.id,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Email já em uso');
    }
    DbInitErrorService.throwFriendlyDbInitError(error);
  }

  if (affiliateInvite) {
    await finalizePartnerInviteRegistration(deps.connectService, deps.prisma, {
      invite: affiliateInvite,
      workspace,
      agent,
      email: normalizedEmail,
    });
  }

  return issueTokens(deps.prisma, deps.jwt, deps.logger, agent);
}

export async function login(
  deps: AuthPartsDeps,
  data: { email: string; password: string; ip?: string },
): Promise<TokenIssuanceResult> {
  const { email, password, ip } = data;
  await deps.rateLimitService.checkRateLimit(`login:${ip || 'ip-unknown'}`);
  await deps.rateLimitService.checkRateLimit(`login:${ip || 'ip-unknown'}:${email}`);

  let agent: Agent | null;
  try {
    agent = await deps.prisma.agent.findFirst({
      where: { email },
    });
  } catch (error: unknown) {
    DbInitErrorService.throwFriendlyDbInitError(error);
  }

  if (!agent) {
    throw new UnauthorizedException('Credenciais inválidas');
  }

  assertAgentCanAuthenticate(agent);

  if (!agent.password) {
    if (agent.provider === 'google') {
      throw new UnauthorizedException('Esta conta usa Google. Entre com o Google.');
    }
    if (agent.provider === 'facebook') {
      throw new UnauthorizedException('Esta conta usa Facebook. Entre com o Facebook.');
    }
    throw new UnauthorizedException('Esta conta não possui senha cadastrada.');
  }

  const valid = await bcryptCompare(password, agent.password);
  if (!valid) {
    throw new UnauthorizedException('Credenciais inválidas');
  }

  return issueTokens(deps.prisma, deps.jwt, deps.logger, agent);
}
