import * as path from 'path';
import { assertWithinRoot } from '../../lib/safe-path';
import {
  isProtectedFile as isGovernanceProtectedFile,
  type GovernanceBoundary,
} from '../../scope-state-classify';
import type { ScopeFileRole, ScopeExecutionMode } from '../../types.scope-engine';
import {
  extractImports,
  hasTestRuntimeEvidence,
  hasTestPathSignal,
  hasGeneratedPathSignal,
  hasGeneratedContentEvidence,
} from './constants';
import { hasExports } from './import-utils';

function isTestFile(filePath: string, content = ''): boolean {
  if (!hasTestRuntimeEvidence(content)) return false;
  const imports = extractImports('', content);
  return hasTestPathSignal(filePath) || imports.some((importPath) => importPath.includes('test'));
}

function isGeneratedFile(filePath: string, content = ''): boolean {
  return hasGeneratedPathSignal(filePath) && hasGeneratedContentEvidence(content);
}

function isProtectedFile(
  rootDir: string,
  filePath: string,
  governanceBoundary: GovernanceBoundary,
): boolean {
  const relativePath = path.relative(rootDir, assertWithinRoot(filePath, rootDir));
  return isGovernanceProtectedFile(relativePath, governanceBoundary);
}

function isSourceFile(filePath: string, extension: string, content = ''): boolean {
  const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
  return sourceExtensions.has(extension) && !isTestFile(filePath, content);
}

function roleFromPathSignal(filePath: string, content: string): ScopeFileRole | null {
  if (!hasExports(content)) return null;
  const roleBySegment = new Map<string, ScopeFileRole>([
    ['asset', 'asset'],
    ['assets', 'asset'],
    ['component', 'component'],
    ['components', 'component'],
    ['config', 'config'],
    ['configs', 'config'],
    ['controller', 'controller'],
    ['controllers', 'controller'],
    ['cron', 'cron_job'],
    ['crons', 'cron_job'],
    ['decorator', 'decorator'],
    ['decorators', 'decorator'],
    ['doc', 'doc'],
    ['docs', 'doc'],
    ['fixture', 'fixture'],
    ['fixtures', 'fixture'],
    ['gateway', 'gateway'],
    ['gateways', 'gateway'],
    ['guard', 'guard'],
    ['guards', 'guard'],
    ['hook', 'hook'],
    ['hooks', 'hook'],
    ['interface', 'interface'],
    ['interfaces', 'interface'],
    ['interceptor', 'interceptor'],
    ['interceptors', 'interceptor'],
    ['layout', 'layout'],
    ['layouts', 'layout'],
    ['lib', 'lib'],
    ['middleware', 'middleware'],
    ['middlewares', 'middleware'],
    ['migration', 'migration'],
    ['migrations', 'migration'],
    ['module', 'module'],
    ['modules', 'module'],
    ['page', 'page'],
    ['pages', 'page'],
    ['provider', 'provider'],
    ['providers', 'provider'],
    ['queue', 'queue_processor'],
    ['queues', 'queue_processor'],
    ['resolver', 'resolver'],
    ['resolvers', 'resolver'],
    ['schema', 'schema'],
    ['schemas', 'schema'],
    ['script', 'script'],
    ['scripts', 'script'],
    ['seed', 'seed'],
    ['seeds', 'seed'],
    ['service', 'service'],
    ['services', 'service'],
    ['style', 'style'],
    ['styles', 'style'],
    ['type', 'type'],
    ['types', 'type'],
    ['util', 'util'],
    ['utils', 'util'],
    ['webhook', 'webhook_handler'],
    ['webhooks', 'webhook_handler'],
    ['worker', 'worker'],
    ['workers', 'worker'],
  ]);
  for (const segment of filePath.split(path.sep)) {
    const role = roleBySegment.get(segment.toLowerCase());
    if (role) return role;
  }
  return null;
}

function roleFromContentEvidence(content: string): ScopeFileRole | null {
  if (content.includes('@Controller(')) return 'controller';
  if (content.includes('@Injectable()')) return 'provider';
  if (content.includes('@Component')) return 'component';
  if (content.includes('@Module(')) return 'module';
  if (content.includes('@Resolver(')) return 'resolver';
  if (content.includes('@WebSocketGateway(')) return 'gateway';
  if (content.includes('@Cron(')) return 'cron_job';
  if (content.includes('@Processor(')) return 'queue_processor';
  if (content.includes('@WebhookHandler')) return 'webhook_handler';
  if (content.includes('@Middleware(')) return 'middleware';
  if (content.includes('@Guard(')) return 'guard';
  if (content.includes('use client') || content.includes('"use client"')) return 'component';
  if (hasTestRuntimeEvidence(content)) return 'test';
  if (content.includes('export default function') || content.includes('export function')) {
    return 'component';
  }
  if (content.includes('model ') && content.includes('{')) return 'schema';
  if (content.includes('enum ') && content.includes('{')) return 'type';
  if (content.includes('interface ')) return 'interface';
  if (content.includes('type ') && content.includes('=')) return 'type';
  return null;
}

function classifyFileRole(filePath: string, content: string): ScopeFileRole {
  if (isTestFile(filePath, content)) return 'test';

  const contentRole = roleFromContentEvidence(content);
  if (contentRole) return contentRole;

  const pathRole = roleFromPathSignal(filePath, content);
  if (pathRole) return pathRole;

  return 'unknown';
}

function computeExecutionMode(
  filePath: string,
  extension: string,
  isProtected: boolean,
  content = '',
): ScopeExecutionMode {
  if (isProtected) return 'human_required';

  const nonExecutableExtensions = new Set([
    '.md',
    '.mdx',
    '.html',
    '.svg',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.ico',
    '.webp',
    '.env',
    '.env.example',
  ]);
  if (nonExecutableExtensions.has(extension)) return 'not_executable';

  const observationExtensions = new Set([
    '.json',
    '.yml',
    '.yaml',
    '.css',
    '.scss',
    '.less',
    '.graphql',
    '.gql',
  ]);
  if (observationExtensions.has(extension)) return 'observation_only';

  if (isTestFile(filePath, content)) return 'ai_safe';

  return 'ai_safe';
}

export {
  isTestFile,
  isGeneratedFile,
  isProtectedFile,
  isSourceFile,
  roleFromPathSignal,
  roleFromContentEvidence,
  classifyFileRole,
  computeExecutionMode,
};
