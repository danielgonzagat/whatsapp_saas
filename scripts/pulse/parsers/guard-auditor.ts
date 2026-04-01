import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

const HTTP_DECORATORS = ['@Get(', '@Post(', '@Put(', '@Patch(', '@Delete('];

const FINANCIAL_PATHS = ['checkout', 'wallet', 'billing', 'payment', 'payout', 'withdraw', 'transaction'];

function isFinancialFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return FINANCIAL_PATHS.some(p => lower.includes(p));
}

function hasDecoratorInRange(lines: string[], from: number, to: number, pattern: RegExp): boolean {
  for (let i = from; i < Math.min(to, lines.length); i++) {
    if (pattern.test(lines[i])) return true;
  }
  return false;
}

export function checkGuards(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter(f => {
    if (!f.endsWith('.controller.ts')) return false;
    if (/\.(spec|test)\.ts$/.test(f)) return false;
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

    // Find all @Controller blocks and their class-level guards / @Public
    interface ControllerBlock {
      startLine: number;
      endLine: number;
      hasClassGuard: boolean;
      hasClassPublic: boolean;
    }

    const blocks: ControllerBlock[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (/@Controller\s*\(/.test(lines[i])) {
        // Scan 5 lines above and up to 5 after for class-level decorators
        let hasClassGuard = false;
        let hasClassPublic = false;

        for (let j = Math.max(0, i - 5); j <= Math.min(i + 5, lines.length - 1); j++) {
          if (/@UseGuards\s*\(/.test(lines[j])) hasClassGuard = true;
          if (/@Public\s*\(\s*\)/.test(lines[j])) hasClassPublic = true;
        }

        blocks.push({
          startLine: i,
          endLine: lines.length,
          hasClassGuard,
          hasClassPublic,
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
        const hasHttpDecorator = HTTP_DECORATORS.some(d => trimmed.startsWith(d) || trimmed.includes(d));
        if (!hasHttpDecorator) continue;

        // Look at 8 lines above this decorator for method-level decorators
        const scanFrom = Math.max(block.startLine, i - 8);
        let methodHasGuard = hasDecoratorInRange(lines, scanFrom, i, /@UseGuards\s*\(/);
        let methodIsPublic = hasDecoratorInRange(lines, scanFrom, i, /@Public\s*\(\s*\)/);
        let methodHasThrottle = hasDecoratorInRange(lines, scanFrom, i, /@Throttle\s*\(/);

        // Also scan up to 3 lines after the decorator (decorators can stack)
        methodHasGuard = methodHasGuard || hasDecoratorInRange(lines, i + 1, i + 4, /@UseGuards\s*\(/);
        methodIsPublic = methodIsPublic || hasDecoratorInRange(lines, i + 1, i + 4, /@Public\s*\(\s*\)/);
        methodHasThrottle = methodHasThrottle || hasDecoratorInRange(lines, i + 1, i + 4, /@Throttle\s*\(/);

        const isProtected = block.hasClassGuard || block.hasClassPublic || methodHasGuard || methodIsPublic;

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

        if (financial && !methodHasThrottle && !block.hasClassGuard) {
          // Only flag if the class doesn't have a blanket throttle via @Throttle at class level
          const classHasThrottle = hasDecoratorInRange(
            lines,
            Math.max(0, block.startLine - 3),
            block.startLine + 5,
            /@Throttle\s*\(/,
          );
          if (!classHasThrottle) {
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
  }

  return breaks;
}
