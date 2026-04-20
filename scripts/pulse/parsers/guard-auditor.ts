import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

const HTTP_DECORATORS = ['@Get(', '@Post(', '@Put(', '@Patch(', '@Delete('];

const FINANCIAL_PATHS = [
  'checkout',
  'wallet',
  'billing',
  'payment',
  'payout',
  'withdraw',
  'transaction',
];

function isFinancialFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return FINANCIAL_PATHS.some((p) => lower.includes(p));
}

function hasDecoratorInRange(lines: string[], from: number, to: number, pattern: RegExp): boolean {
  for (let i = from; i < Math.min(to, lines.length); i++) {
    if (pattern.test(lines[i])) {
      return true;
    }
  }
  return false;
}

/**
 * Detect if the NestJS app registers JwtAuthGuard globally via APP_GUARD.
 * When APP_GUARD is used, all routes are protected by default — only @Public() routes
 * are exempt. In this case, method-level @UseGuards is optional (not required).
 */
function detectGlobalAuthGuard(rootDir: string): boolean {
  const candidates = [
    path.join(rootDir, 'backend/src/app.module.ts'),
    path.join(rootDir, 'src/app.module.ts'),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    try {
      const content = fs.readFileSync(candidate, 'utf8');
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
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);
    const financial = isFinancialFile(file);

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

        // Also scan up to 3 lines after the decorator (decorators can stack)
        methodHasGuard =
          methodHasGuard || hasDecoratorInRange(lines, i + 1, i + 4, /@UseGuards\s*\(/);
        methodIsPublic =
          methodIsPublic || hasDecoratorInRange(lines, i + 1, i + 4, /@Public\s*\(\s*\)/);
        methodHasThrottle =
          methodHasThrottle || hasDecoratorInRange(lines, i + 1, i + 4, /@Throttle\s*\(/);

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

        if (financial && !methodHasThrottle && !block.hasClassThrottle) {
          // Only flag if neither the class nor the method has a throttle or ThrottlerGuard
          breaks.push({
            type: 'FINANCIAL_NO_RATE_LIMIT',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description: 'Financial route has no @Throttle rate-limit decorator',
            detail: `${trimmed.slice(0, 100)} — financial endpoints must have @Throttle()`,
          });
        }
      }
    }
  }

  return breaks;
}
