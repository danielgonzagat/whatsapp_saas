import type { Agent, Workspace } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthPasswordService } from './auth.password.service';
import type { AuthTokenService } from './auth.token.service';
import type { AuthPartnerService } from './auth-partner.service';
import type { RateLimitService } from './rate-limit.service';
import type { PrismaService } from '../prisma/prisma.service';

export const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

export interface PrismaMock {
  agent: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  workspace: {
    create: jest.Mock;
    findFirst: jest.Mock;
  };
}

export interface TokenServiceMock {
  issueTokens: jest.Mock;
}

export interface AuthPartnerServiceMock {
  resolvePartnerInvite: jest.Mock;
}

export interface RateLimitServiceMock {
  checkRateLimit: jest.Mock;
}

export function createPrismaMock(): PrismaMock {
  return {
    agent: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    workspace: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };
}

export const mockAgent = {
  id: 'agent-123',
  email: 'test@example.com',
  workspaceId: 'workspace-123',
  name: 'Test User',
  role: 'ADMIN',
  password: 'hashedPassword123',
  provider: null,
  disabledAt: null,
  deletedAt: null,
} as never as Agent;

export const mockWorkspace = {
  id: 'workspace-123',
  name: 'Test Workspace',
  createdAt: new Date(),
  updatedAt: new Date(),
} as never as Workspace;

export interface AuthPasswordSpecContext {
  service: AuthPasswordService;
  prismaMock: PrismaMock;
  tokenServiceMock: TokenServiceMock;
  authPartnerServiceMock: AuthPartnerServiceMock;
  rateLimitServiceMock: RateLimitServiceMock;
}

export function createAuthPasswordServiceContext(): AuthPasswordSpecContext {
  const prismaMock = createPrismaMock();
  const tokenServiceMock: TokenServiceMock = { issueTokens: jest.fn() };
  const authPartnerServiceMock: AuthPartnerServiceMock = {
    resolvePartnerInvite: jest.fn(),
  };
  const rateLimitServiceMock: RateLimitServiceMock = { checkRateLimit: jest.fn() };

  // AuthPasswordService is instantiated manually (not via Nest DI) by AuthService,
  // so we mirror that pattern here with explicit constructor arguments.
  const service = new AuthPasswordService(
    prismaMock as never as PrismaService,
    tokenServiceMock as never as AuthTokenService,
    authPartnerServiceMock as never as AuthPartnerService,
    rateLimitServiceMock as never as RateLimitService,
  );

  return {
    service,
    prismaMock,
    tokenServiceMock,
    authPartnerServiceMock,
    rateLimitServiceMock,
  };
}
