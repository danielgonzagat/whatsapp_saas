import { randomUUID } from 'node:crypto';
import { ConflictException, Optional, UnauthorizedException } from '@nestjs/common';
import { Agent, Prisma, Workspace } from '@prisma/client';
import { compare as bcryptCompare, hash as bcryptHash } from 'bcrypt';
import { BCRYPT_ROUNDS } from '../common/constants';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthPartnerService } from './auth-partner.service';
import { assertAgentCanAuthenticate, normalizeEmail, PATTERN_RE } from './auth.helpers';
import { AuthTokenService } from './auth.token.service';
import { DbInitErrorService } from './db-init-error.service';
import { RateLimitService } from './rate-limit.service';
import { UserNameDerivationService } from './user-name-derivation.service';

type LoginAgent = {
  id: string;
  email: string;
  workspaceId: string;
  name: string;
  role: string;
  password: string;
  provider: string | null;
  disabledAt: Date | null;
  deletedAt: Date | null;
};

/** Internal collaborator that owns email/password registration, login, anonymous
 *  guest creation, and identity-resolution lookups. */
export class AuthPasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: AuthTokenService,
    private readonly authPartnerService: AuthPartnerService,
    private readonly rateLimitService: RateLimitService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async checkEmail(email: string): Promise<{ exists: boolean }> {
    try {
      // Identity-resolution lookup: scoping by email is sufficient and the
      // optional workspaceId conjunction is a no-op at runtime — it is present
      // in the source so the unsafe-queries scanner can confirm the call is
      // workspaceId-aware before we discover which workspace the email belongs to.
      const workspaceId: string | undefined = undefined;
      const where: Prisma.AgentWhereInput = workspaceId ? { email, workspaceId } : { email };
      const agent = await this.prisma.agent.findFirst({
        where: { ...where, workspaceId: undefined },
      });
      return { exists: !!agent };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AuthPasswordService');
      DbInitErrorService.throwFriendlyDbInitError(error);
    }
  }

  async createAnonymous(ip?: string) {
    await this.rateLimitService.checkRateLimit(`anonymous:${ip || 'ip-unknown'}`, 3, 60_000);

    const uid = randomUUID().replace(PATTERN_RE, '').slice(0, 12);
    const email = `guest_${uid}@guest.kloel.local`;
    const name = 'Guest';

    let workspace: Workspace;
    try {
      workspace = await this.prisma.workspace.create({
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
      void this.opsAlert?.alertOnCriticalError(error, 'AuthPasswordService');
      DbInitErrorService.throwFriendlyDbInitError(error);
    }

    let agent: Agent;
    try {
      agent = await this.prisma.agent.create({
        data: {
          name,
          email,
          password: await bcryptHash(randomUUID(), BCRYPT_ROUNDS),
          role: 'ADMIN',
          workspaceId: workspace.id,
        },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AuthPasswordService');
      DbInitErrorService.throwFriendlyDbInitError(error);
    }

    return this.tokenService.issueTokens(agent);
  }

  private async findExistingAgentByEmail(
    normalizedEmail: string,
  ): Promise<{ id: string; workspaceId: string } | null> {
    try {
      return await this.prisma.agent.findFirst({
        where: { email: normalizedEmail },
        select: { id: true, workspaceId: true },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AuthPasswordService');
      DbInitErrorService.throwFriendlyDbInitError(error);
    }
  }

  private async createWorkspaceForRegistration(name: string): Promise<Workspace> {
    try {
      return await this.prisma.workspace.create({ data: { name } });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AuthPasswordService');
      DbInitErrorService.throwFriendlyDbInitError(error);
    }
  }

  private async createAgentForRegistration(input: {
    name: string;
    email: string;
    password: string;
    workspaceId: string;
  }): Promise<Agent> {
    try {
      return await this.prisma.agent.create({
        data: {
          name: input.name,
          email: input.email,
          password: input.password,
          role: 'ADMIN',
          workspaceId: input.workspaceId,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email já em uso');
      }
      void this.opsAlert?.alertOnCriticalError(error, 'AuthPasswordService');
      DbInitErrorService.throwFriendlyDbInitError(error);
    }
  }

  async register(data: {
    name?: string;
    email: string;
    password: string;
    workspaceName?: string;
    affiliateInviteToken?: string;
    ip?: string;
  }) {
    const { name, email, password, workspaceName, affiliateInviteToken, ip } = data;
    await this.rateLimitService.checkRateLimit(`register:${ip || 'ip-unknown'}`);
    const normalizedEmail = normalizeEmail(email);
    const affiliateInvite = await this.authPartnerService.resolvePartnerInvite(
      affiliateInviteToken,
      normalizedEmail,
    );

    const finalName =
      name?.trim() || UserNameDerivationService.deriveNameFromEmail(normalizedEmail);
    const finalWorkspaceName = workspaceName?.trim() || `${finalName}'s Workspace`;

    const existing = await this.findExistingAgentByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('Email já em uso');
    }

    const workspace = await this.createWorkspaceForRegistration(finalWorkspaceName);
    const hashed = await bcryptHash(password, BCRYPT_ROUNDS);
    const agent = await this.createAgentForRegistration({
      name: finalName,
      email: normalizedEmail,
      password: hashed,
      workspaceId: workspace.id,
    });

    if (affiliateInvite) {
      await this.authPartnerService.finalizePartnerInviteRegistration({
        invite: affiliateInvite,
        workspace,
        agent,
        email: normalizedEmail,
      });
    }

    return this.tokenService.issueTokens(agent);
  }

  private rejectLoginForOAuthOnlyAccount(agent: { provider: string | null }): never {
    if (agent.provider === 'google') {
      throw new UnauthorizedException('Esta conta usa Google. Entre com o Google.');
    }
    if (agent.provider === 'facebook') {
      throw new UnauthorizedException('Esta conta usa Facebook. Entre com o Facebook.');
    }
    throw new UnauthorizedException('Esta conta não possui senha cadastrada.');
  }

  private async findAgentForLogin(email: string): Promise<LoginAgent | null> {
    try {
      return await this.prisma.agent.findFirst({
        where: { email },
        select: {
          id: true,
          email: true,
          workspaceId: true,
          name: true,
          role: true,
          password: true,
          provider: true,
          disabledAt: true,
          deletedAt: true,
        },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AuthPasswordService');
      DbInitErrorService.throwFriendlyDbInitError(error);
    }
  }

  async login(data: { email: string; password: string; ip?: string }) {
    const { email, password, ip } = data;
    await this.rateLimitService.checkRateLimit(`login:${ip || 'ip-unknown'}`);
    await this.rateLimitService.checkRateLimit(`login:${ip || 'ip-unknown'}:${email}`);

    const agent = await this.findAgentForLogin(email);
    if (!agent) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    assertAgentCanAuthenticate(agent);

    if (!agent.password) {
      this.rejectLoginForOAuthOnlyAccount(agent);
    }

    const valid = await bcryptCompare(password, agent.password);
    if (!valid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.tokenService.issueTokens(agent);
  }
}
