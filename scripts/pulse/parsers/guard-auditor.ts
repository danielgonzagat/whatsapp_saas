import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { pathExists, readTextFile } from '../safe-fs';

const HTTP_DECORATOR_KERNEL_GRAMMAR = ['Get', 'Post', 'Put', 'Patch', 'Delete'];

interface GuardDiagnosticInput {
  predicateKinds: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  source?: string;
}

function buildGuardDiagnostic(input: GuardDiagnosticInput): Break {
  const predicateToken =
    input.predicateKinds
      .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
      .filter(Boolean)
      .join('+') || 'guard-observation';

  return {
    type: `diagnostic:guard-auditor:${predicateToken}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source:
      input.source ?? `syntax-evidence:guard-auditor;predicates=${input.predicateKinds.join(',')}`,
  };
}

function splitIdentifier(value: string): Set<string> {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase();
  return new Set(spaced.split(/\s+/).filter(Boolean));
}

function hasAnyToken(value: string, tokens: readonly string[]): boolean {
  const available = splitIdentifier(value);
  return tokens.some((token) => available.has(token.toLowerCase()));
}

function hasDecoratorCall(line: string, decoratorName: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith(`@${decoratorName}`) && trimmed.includes('(');
}

function httpDecoratorName(line: string): string | null {
  return (
    HTTP_DECORATOR_KERNEL_GRAMMAR.find((decoratorName) => hasDecoratorCall(line, decoratorName)) ??
    null
  );
}

function hasHttpDecorator(line: string): boolean {
  return httpDecoratorName(line) !== null;
}

function hasMutatingHttpDecorator(line: string): boolean {
  const decoratorName = httpDecoratorName(line);
  return decoratorName !== null && decoratorName !== HTTP_DECORATOR_KERNEL_GRAMMAR[0];
}

function hasExternalInputEvidence(value: string): boolean {
  return (
    hasAnyToken(value, [
      'body',
      'param',
      'query',
      'headers',
      'req',
      'request',
      'uploaded',
      'file',
      'files',
      'params',
    ]) ||
    value.includes('@Body') ||
    value.includes('@Param') ||
    value.includes('@Query')
  );
}

function hasDurableMutationEvidence(value: string): boolean {
  return hasAnyToken(value, [
    'prisma',
    'repository',
    'repo',
    'model',
    'create',
    'update',
    'upsert',
    'delete',
    'save',
    'insert',
  ]);
}

function hasControlEvidence(value: string): boolean {
  return (
    hasAnyToken(value, [
      'throttle',
      'guard',
      'policy',
      'authorize',
      'permission',
      'idempotency',
      'csrf',
      'captcha',
      'turnstile',
      'recaptcha',
    ]) ||
    value.includes('@UseGuards') ||
    value.includes('@Throttle')
  );
}

function hasDecoratorInRange(
  lines: string[],
  from: number,
  to: number,
  predicate: (line: string) => boolean,
): boolean {
  for (let i = from; i < Math.min(to, lines.length); i++) {
    if (predicate(lines[i])) {
      return true;
    }
  }
  return false;
}

function routeWindow(lines: string[], decoratorLine: number, blockEndLine: number): string {
  const nextDecoratorLine = lines.findIndex(
    (line, index) => index > decoratorLine && index < blockEndLine && hasHttpDecorator(line.trim()),
  );
  const endLine =
    nextDecoratorLine === -1 ? Math.min(blockEndLine, decoratorLine + 40) : nextDecoratorLine;
  return lines.slice(decoratorLine, endLine).join('\n');
}

function hasWeakBehavioralMutationSignal(
  lines: string[],
  decoratorLine: number,
  blockEndLine: number,
): boolean {
  if (!hasMutatingHttpDecorator(lines[decoratorLine]?.trim() ?? '')) {
    return false;
  }
  const window = routeWindow(lines, decoratorLine, blockEndLine);
  return hasExternalInputEvidence(window) && hasDurableMutationEvidence(window);
}

/**
 * Detect if the NestJS app registers JwtAuthGuard globally via APP_GUARD.
 * When APP_GUARD is used, all routes are protected by default — only @Public() routes
 * are exempt. In this case, method-level @UseGuards is optional (not required).
 */
function detectGlobalAuthGuard(rootDir: string): boolean {
  const candidates = [
    safeJoin(rootDir, 'backend/src/app.module.ts'),
    safeJoin(rootDir, 'src/app.module.ts'),
  ];
  for (const candidate of candidates) {
    if (!pathExists(candidate)) {
      continue;
    }
    try {
      const content = readTextFile(candidate, 'utf8');
      if (content.includes('APP_GUARD') && hasControlEvidence(content)) {
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

/** Check guards. */
export function checkGuards(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // When APP_GUARD + JwtAuthGuard is registered globally, all routes are protected
  // by default. Only routes explicitly marked @Public() bypass the guard.
  // In this case, method-level @UseGuards() is optional — not having it is NOT a bug.
  const hasGlobalAuthGuard = detectGlobalAuthGuard(config.rootDir);

  const files = walkFiles(config.backendDir, ['.ts']).filter((f) => {
    if (!f.endsWith('.controller.ts')) {
      return false;
    }
    if (f.endsWith('.spec.ts') || f.endsWith('.test.ts')) {
      return false;
    }
    return true;
  });

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    // Find all @Controller blocks and their class-level guards / @Public / @Throttle
    interface ControllerBlock {
      startLine: number;
      endLine: number;
      hasClassGuard: boolean;
      hasClassPublic: boolean;
      hasClassThrottle: boolean;
    }

    const blocks: ControllerBlock[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (hasDecoratorCall(lines[i], 'Controller')) {
        // Scan 5 lines above and up to 5 after for class-level decorators
        let hasClassGuard = false;
        let hasClassPublic = false;
        let hasClassThrottle = false;

        for (let j = Math.max(0, i - 5); j <= Math.min(i + 5, lines.length - 1); j++) {
          if (hasDecoratorCall(lines[j], 'UseGuards')) {
            hasClassGuard = true;
          }
          if (hasDecoratorCall(lines[j], 'Public')) {
            hasClassPublic = true;
          }
          if (hasControlEvidence(lines[j])) {
            hasClassThrottle = true;
          }
        }

        blocks.push({
          startLine: i,
          endLine: lines.length,
          hasClassGuard,
          hasClassPublic,
          hasClassThrottle,
        });
      }
    }

    // Set end lines
    for (let i = 0; i < blocks.length - 1; i++) {
      blocks[i].endLine = blocks[i + 1].startLine;
    }

    for (const block of blocks) {
      for (let i = block.startLine; i < block.endLine; i++) {
        const trimmed = lines[i].trim();

        if (!hasHttpDecorator(trimmed)) {
          continue;
        }

        const scanFrom = Math.max(block.startLine, i - 8);
        let methodHasGuard = hasDecoratorInRange(lines, scanFrom, i, (line) =>
          hasDecoratorCall(line, 'UseGuards'),
        );
        let methodIsPublic = hasDecoratorInRange(lines, scanFrom, i, (line) =>
          hasDecoratorCall(line, 'Public'),
        );
        let methodHasThrottle = hasDecoratorInRange(lines, scanFrom, i, hasControlEvidence);
        let methodHasAbuseOrAuthEvidence = hasDecoratorInRange(
          lines,
          scanFrom,
          i,
          hasControlEvidence,
        );

        methodHasGuard =
          methodHasGuard ||
          hasDecoratorInRange(lines, i + 1, i + 4, (line) => hasDecoratorCall(line, 'UseGuards'));
        methodIsPublic =
          methodIsPublic ||
          hasDecoratorInRange(lines, i + 1, i + 4, (line) => hasDecoratorCall(line, 'Public'));
        methodHasThrottle =
          methodHasThrottle || hasDecoratorInRange(lines, i + 1, i + 4, hasControlEvidence);
        methodHasAbuseOrAuthEvidence =
          methodHasAbuseOrAuthEvidence ||
          hasDecoratorInRange(lines, i + 1, i + 4, hasControlEvidence);

        // A route is considered protected if:
        // 1. It has a class-level @UseGuards or @Public decorator, OR
        // 2. It has a method-level @UseGuards or @Public decorator, OR
        // 3. The app registers JwtAuthGuard globally via APP_GUARD (protects all routes by default)
        const isProtected =
          block.hasClassGuard ||
          block.hasClassPublic ||
          methodHasGuard ||
          methodIsPublic ||
          hasGlobalAuthGuard;

        if (!isProtected) {
          breaks.push({
            ...buildGuardDiagnostic({
              predicateKinds: ['external-route', 'missing-nearby-control-evidence'],
              severity: 'high',
              file: relFile,
              line: i + 1,
              description: 'Controller method has no nearby control evidence',
              detail: `${trimmed.slice(0, 100)} - add or prove route-level/class-level/global control evidence.`,
            }),
          });
        }

        const hasWeakMutationSignal = hasWeakBehavioralMutationSignal(lines, i, block.endLine);
        const hasAbuseOrAuthEvidence =
          block.hasClassGuard ||
          block.hasClassThrottle ||
          hasGlobalAuthGuard ||
          methodHasAbuseOrAuthEvidence ||
          methodHasThrottle;

        if (hasWeakMutationSignal && !hasAbuseOrAuthEvidence) {
          breaks.push({
            ...buildGuardDiagnostic({
              predicateKinds: [
                'external-input-route',
                'durable-mutation-evidence',
                'missing-nearby-control-evidence',
              ],
              severity: 'low',
              file: relFile,
              line: i + 1,
              source: 'syntax-weak-signal:guard-auditor:needs_probe',
              description:
                'External-input route appears to perform a durable mutation without nearby control evidence.',
              detail: `${trimmed.slice(0, 100)} - weak syntax signal; run AST/dataflow/runtime probes before treating this as operationally blocking.`,
            }),
          });
        }
      }
    }
  }

  return breaks;
}
