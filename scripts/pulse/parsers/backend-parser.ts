import * as fs from 'fs';
import * as path from 'path';
import type { BackendRoute, PulseConfig } from '../types';
import { walkFiles } from './utils';

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete'] as const;

function buildFullPath(controllerPath: string, methodPath: string): string {
  const cp = controllerPath.replace(/^\/|\/$/g, '');
  const mp = (methodPath || '').replace(/^\/|\/$/g, '');
  const full = mp ? `/${cp}/${mp}` : `/${cp}`;
  return full.replace(/\/+/g, '/');
}

/**
 * Find all @Controller declarations in a file with their line positions.
 * Handles files with MULTIPLE controller classes (like product-sub-resources.controller.ts).
 */
function findControllerBlocks(
  lines: string[],
): Array<{ path: string; startLine: number; endLine: number }> {
  const blocks: Array<{ path: string; startLine: number; endLine: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/@Controller\(\s*['"`]([^'"`]*)['"`]\s*\)/);
    if (match) {
      blocks.push({ path: match[1], startLine: i, endLine: lines.length });
    }
  }

  // Set endLine for each block (until the next @Controller or end of file)
  for (let i = 0; i < blocks.length - 1; i++) {
    blocks[i].endLine = blocks[i + 1].startLine;
  }

  return blocks;
}

export function parseBackendRoutes(config: PulseConfig): BackendRoute[] {
  const routes: BackendRoute[] = [];
  const files = walkFiles(config.backendDir, ['.ts']).filter((f) => f.endsWith('.controller.ts'));

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      // Find ALL controller blocks in the file
      const controllerBlocks = findControllerBlocks(lines);
      if (controllerBlocks.length === 0) {
        continue;
      }

      for (const block of controllerBlocks) {
        const controllerPath = block.path;

        // Extract class-level guards for this block
        const classGuards: string[] = [];
        for (let j = block.startLine; j < Math.min(block.startLine + 5, block.endLine); j++) {
          const guardMatch = lines[j]?.match(/@UseGuards\(([^)]+)\)/);
          if (guardMatch) {
            classGuards.push(...guardMatch[1].split(',').map((g) => g.trim()));
          }
        }
        // Also check lines ABOVE @Controller for guards
        for (let j = Math.max(0, block.startLine - 3); j < block.startLine; j++) {
          const guardMatch = lines[j]?.match(/@UseGuards\(([^)]+)\)/);
          if (guardMatch) {
            classGuards.push(...guardMatch[1].split(',').map((g) => g.trim()));
          }
        }

        // Walk lines within this controller block
        for (let i = block.startLine; i < block.endLine; i++) {
          const line = lines[i].trim();

          for (const method of HTTP_METHODS) {
            const decoratorRe = new RegExp(`@${method}\\(\\s*(?:['"\`]([^'"\`]*)['"\`])?\\s*\\)`);
            const match = line.match(decoratorRe);
            if (!match) {
              continue;
            }

            const methodPath = match[1] || '';
            const fullPath = buildFullPath(controllerPath, methodPath);

            // Check for @Public() in the 5 lines above
            let isPublic = false;
            const guards = [...classGuards];
            for (let j = Math.max(block.startLine, i - 5); j < i; j++) {
              const above = lines[j].trim();
              if (/@Public\(\)/.test(above)) {
                isPublic = true;
              }
              const guardMatch = above.match(/@UseGuards\(([^)]+)\)/);
              if (guardMatch) {
                guards.push(...guardMatch[1].split(',').map((g) => g.trim()));
              }
            }

            // Extract method name (scan lines below decorator)
            let methodName = 'unknown';
            for (let j = i; j < Math.min(i + 5, lines.length); j++) {
              const below = lines[j];
              const nameMatch = below.match(/(?:async\s+)?(\w+)\s*\(/);
              if (
                nameMatch &&
                !HTTP_METHODS.some((m) => nameMatch[1] === m) &&
                nameMatch[1] !== 'async'
              ) {
                methodName = nameMatch[1];
                break;
              }
            }

            // Extract service calls from method body (brace-depth tracking)
            const serviceCalls: string[] = [];
            let bodyStart = -1;
            let depth = 0;

            for (let j = i; j < Math.min(block.endLine, lines.length); j++) {
              const bodyLine = lines[j];
              for (const ch of bodyLine) {
                if (ch === '{') {
                  if (depth === 0 && bodyStart === -1) {
                    bodyStart = j;
                  }
                  depth++;
                }
                if (ch === '}') {
                  depth--;
                }
              }
              if (bodyStart !== -1 && depth === 0) {
                const bodyText = lines.slice(bodyStart, j + 1).join('\n');
                const svcRe = /this\.(\w+Service|\w+)\.(\w+)\s*\(/g;
                let svcMatch;
                while ((svcMatch = svcRe.exec(bodyText)) !== null) {
                  const svcName = svcMatch[1];
                  const svcMethod = svcMatch[2];
                  if (svcName === 'prisma' || svcName === 'prismaAny') {
                    continue;
                  }
                  serviceCalls.push(`${svcName}.${svcMethod}`);
                }
                break;
              }
            }

            routes.push({
              file: relFile,
              line: i + 1,
              controllerPath,
              methodPath,
              fullPath,
              httpMethod: method.toUpperCase(),
              methodName,
              guards,
              isPublic,
              serviceCalls,
            });
          }
        }
      }
    } catch (e) {
      process.stderr.write(`  [warn] Could not parse ${file}: ${(e as Error).message}\n`);
    }
  }

  return routes;
}
