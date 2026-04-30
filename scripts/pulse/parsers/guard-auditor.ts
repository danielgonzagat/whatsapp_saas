import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { pathExists, readTextFile } from '../safe-fs';

const HTTP_DECORATORS = ['@Get(', '@Post(', '@Put(', '@Patch(', '@Delete('];
const MUTATING_HTTP_DECORATOR_RE = /^@(Post|Put|Patch|Delete)\s*\(/;
const EXTERNAL_INPUT_RE =
  /@(Body|Param|Query|Headers|Req|Request|UploadedFile|UploadedFiles)\b|\b(req|request|body|params|query)\b/i;
const DURABLE_MUTATION_RE =
  /\b(?:prisma|repository|repo|model)\.[\w.]+\.(?:create|update|upsert|delete|deleteMany|updateMany)\s*\(|\b(?:save|insert|update|delete)\s*\(/i;
const ABUSE_OR_AUTH_EVIDENCE_RE =
  /@Throttle\s*\(|ThrottlerGuard|RateLimit|rateLimit|idempotency|Idempotency|csrf|captcha|turnstile|recaptcha|@UseGuards\s*\(|Guard\b|Policy\b|authorize|permission/i;

function hasDecoratorInRange(lines: string[], from: number, to: number, pattern: RegExp): boolean {
  for (let i = from; i < Math.min(to, lines.length); i++) {
    if (pattern.test(lines[i])) {
      return true;
    }
  }
  return false;
}

function routeWindow(lines: string[], decoratorLine: number, blockEndLine: number): string {
  const nextDecoratorLine = lines.findIndex(
    (line, index) =>
      index > decoratorLine &&
      index < blockEndLine &&
      /^@(Get|Post|Put|Patch|Delete)\s*\(/.test(line.trim()),
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
  if (!MUTATING_HTTP_DECORATOR_RE.test(lines[decoratorLine]?.trim() ?? '')) {
    return false;
  }
  const window = routeWindow(lines, decoratorLine, blockEndLine);
  return EXTERNAL_INPUT_RE.test(window) && DURABLE_MUTATION_RE.test(window);
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
      // APP_GUARD with JwtAuthGuard means all routes are globally protected
      if (/APP_GUARD/.test(content) && /JwtAuthGuard/.test(content)) {
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
    if (/\.(spec|test)\.ts$/.test(f)) {
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
      if (/@Controller\s*\(/.test(lines[i])) {
        // Scan 5 lines above and up to 5 after for class-level decorators
        let hasClassGuard = false;
        let hasClassPublic = false;
        let hasClassThrottle = false;

        for (let j = Math.max(0, i - 5); j <= Math.min(i + 5, lines.length - 1); j++) {
          if (/@UseGuards\s*\(/.test(lines[j])) {
            hasClassGuard = true;
          }
          if (/@Public\s*\(\s*\)/.test(lines[j])) {
            hasClassPublic = true;
          }
          // Detect class-level @Throttle or ThrottlerGuard in @UseGuards
          if (/@Throttle\s*\(/.test(lines[j])) {
            hasClassThrottle = true;
          }
          if (/ThrottlerGuard/.test(lines[j])) {
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

        // Check if this line has an HTTP method decorator
        const hasHttpDecorator = HTTP_DECORATORS.some(
          (d) => trimmed.startsWith(d) || trimmed.includes(d),
        );
        if (!hasHttpDecorator) {
          continue;
        }

        // Look at 8 lines above this decorator for method-level decorators
        const scanFrom = Math.max(block.startLine, i - 8);
        let methodHasGuard = hasDecoratorInRange(lines, scanFrom, i, /@UseGuards\s*\(/);
        let methodIsPublic = hasDecoratorInRange(lines, scanFrom, i, /@Public\s*\(\s*\)/);
        let methodHasThrottle = hasDecoratorInRange(lines, scanFrom, i, /@Throttle\s*\(/);
        let methodHasAbuseOrAuthEvidence = hasDecoratorInRange(
          lines,
          scanFrom,
          i,
          ABUSE_OR_AUTH_EVIDENCE_RE,
        );

        // Also scan up to 3 lines after the decorator (decorators can stack)
        methodHasGuard =
          methodHasGuard || hasDecoratorInRange(lines, i + 1, i + 4, /@UseGuards\s*\(/);
        methodIsPublic =
          methodIsPublic || hasDecoratorInRange(lines, i + 1, i + 4, /@Public\s*\(\s*\)/);
        methodHasThrottle =
          methodHasThrottle || hasDecoratorInRange(lines, i + 1, i + 4, /@Throttle\s*\(/);
        methodHasAbuseOrAuthEvidence =
          methodHasAbuseOrAuthEvidence ||
          hasDecoratorInRange(lines, i + 1, i + 4, ABUSE_OR_AUTH_EVIDENCE_RE);

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
            type: 'ROUTE_NO_AUTH',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description: 'Controller method has no auth guard or @Public decorator',
            detail: `${trimmed.slice(0, 100)} — add @UseGuards(JwtAuthGuard) or @Public()`,
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
            type: 'behavioral-control-evidence-gap',
            severity: 'low',
            file: relFile,
            line: i + 1,
            source: 'regex-weak-signal:guard-auditor:needs_probe',
            description:
              'External-input route appears to perform a durable mutation without nearby abuse-control or authorization evidence.',
            detail: `${trimmed.slice(0, 100)} — regex-only weak signal; run AST/dataflow/runtime probes before treating this as operationally blocking.`,
          });
        }
      }
    }
  }

  return breaks;
}
