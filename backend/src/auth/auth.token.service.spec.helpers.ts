/**
 * Shared mock builders + fixtures for AuthTokenService specs. Extracted
 * to keep the spec under the architecture max_new_file_lines budget.
 */
import type { Agent } from '@prisma/client';

export interface PrismaMock {
  agent: { findUnique: jest.Mock };
  refreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  workspace: { findUnique: jest.Mock };
  $transaction: jest.Mock;
}

export interface JwtMock {
  signAsync: jest.Mock;
}

/** Build a fresh Prisma mock with an interactive `$transaction` shim. */
export function buildPrismaMock(): PrismaMock {
  const mock: PrismaMock = {
    agent: { findUnique: jest.fn() },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    workspace: { findUnique: jest.fn() },
    // Default: interactive transactions execute the callback against the
    // same mock client (not a separate tx). Tests that need a different
    // behaviour (e.g. simulate a Serializable conflict) can override.
    $transaction: jest.fn((arg: unknown, _opts?: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: PrismaMock) => unknown)(mock);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  return mock;
}

export function buildJwtMock(): JwtMock {
  return { signAsync: jest.fn() };
}

export const mockAgent = {
  id: 'agent-123',
  email: 'test@example.com',
  workspaceId: 'workspace-123',
  name: 'Test User',
  role: 'ADMIN',
  disabledAt: null,
  deletedAt: null,
} as never as Agent;

export const mockWorkspace = {
  id: 'workspace-123',
  name: 'Test Workspace',
};

export const mockRefreshToken = {
  id: 'token-id-123',
  token: 'rt-stub-1',
  agentId: 'agent-123',
  revoked: false,
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
};
