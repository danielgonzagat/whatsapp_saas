import type { HarnessTargetKind } from '../../types.execution-harness';

export function harnessArtifactPath(): string {
  return '.pulse/current/PULSE_HARNESS_EVIDENCE.json';
}

export function targetKindFromDecorator(decoratorName: string): HarnessTargetKind {
  const decoratorTokens = new Set(
    ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options'].map((token) =>
      token.toLowerCase(),
    ),
  );
  return decoratorTokens.has(decoratorName.toLowerCase()) ? 'endpoint' : 'endpoint';
}

export function ignoredDirectoryNames(): Set<string> {
  return new Set([
    'node_modules',
    '.next',
    'dist',
    '.git',
    'coverage',
    '__tests__',
    '__mocks__',
    '.turbo',
    '.vercel',
    '__snapshots__',
  ]);
}

export function nonCallableMemberNames(): Set<string> {
  return new Set([
    'constructor',
    'if',
    'for',
    'while',
    'return',
    'catch',
    'switch',
    'import',
    'export',
    'throw',
    'new',
    'await',
    'super',
  ]);
}

export function infrastructureAliasNames(): Set<string> {
  return new Set([
    'ConfigService',
    'EventEmitter2',
    'HttpService',
    'Logger',
    'ModuleRef',
    'PrismaService',
    'Reflector',
    'Request',
    'Sentry',
  ]);
}

export function constructorMemberName(): string {
  return 'constructor';
}

export function isConstructorMemberName(name: string): boolean {
  return name === constructorMemberName();
}

export function mutatingHttpVerbs(): Set<string> {
  return new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
}

export function persistentStateMutationShape(): RegExp {
  return /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/i;
}
