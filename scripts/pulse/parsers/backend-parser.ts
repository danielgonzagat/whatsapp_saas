import * as path from 'path';
import type { BackendRoute, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

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
    const match = lines[i].match(/@Controller\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/);
    if (match) {
      blocks.push({ path: match[1] || '', startLine: i, endLine: lines.length });
    }
  }

  // Set endLine for each block (until the next @Controller or end of file)
  for (let i = 0; i < blocks.length - 1; i++) {
    blocks[i].endLine = blocks[i + 1].startLine;
  }

  return blocks;
}

function extractConstructorAliases(content: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const ctorMatch = content.match(/constructor\s*\(([\s\S]*?)\)\s*\{/);
  if (!ctorMatch) {
    return aliases;
  }

  const paramRe =
    /(?:private|public|protected)?\s*(?:readonly\s+)?(\w+)\s*:\s*([A-Z][A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = paramRe.exec(ctorMatch[1])) !== null) {
    aliases.set(match[1], match[2]);
  }

  return aliases;
}

function findControllerMethod(
  lines: string[],
  decoratorLine: number,
  blockEndLine: number,
): { line: number; name: string } {
  for (let j = decoratorLine + 1; j < Math.min(decoratorLine + 14, blockEndLine); j++) {
    const trimmed = lines[j]?.trim() || '';
    if (!trimmed || trimmed.startsWith('@')) {
      continue;
    }

    const nameMatch = trimmed.match(
      /^(?:public|private|protected)?\s*(?:async\s+)?([A-Za-z_]\w*)\s*\(/,
    );
    if (nameMatch) {
      return { line: j, name: nameMatch[1] };
    }
  }

  return { line: decoratorLine, name: 'unknown' };
}

function findMethodBodyStart(
  lines: string[],
  methodLine: number,
  blockEndLine: number,
): { line: number; column: number } | null {
  let parenDepth = 0;
  let sawClosedSignature = false;

  for (let j = methodLine; j < Math.min(blockEndLine, lines.length); j++) {
    const bodyLine = lines[j] || '';
    for (let column = 0; column < bodyLine.length; column++) {
      const ch = bodyLine[column];
      if (ch === '(') {
        parenDepth++;
        continue;
      }
      if (ch === ')') {
        parenDepth = Math.max(0, parenDepth - 1);
        if (parenDepth === 0) {
          sawClosedSignature = true;
        }
        continue;
      }
      if (ch === '{' && parenDepth === 0 && sawClosedSignature) {
        return { line: j, column };
      }
    }
  }

  return null;
}

/** Parse backend routes. */
export function parseBackendRoutes(config: PulseConfig): BackendRoute[] {
  const routes: BackendRoute[] = [];
  const files = walkFiles(config.backendDir, ['.ts']).filter((f) => f.endsWith('.controller.ts'));

  for (const file of files) {
    try {
      const content = readTextFile(file, 'utf8');
      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);
      const serviceAliases = extractConstructorAliases(content);

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

            const controllerMethod = findControllerMethod(lines, i, block.endLine);
            const methodName = controllerMethod.name;

            // Extract service calls from method body (brace-depth tracking)
            const serviceCalls: string[] = [];
            const bodyStart = findMethodBodyStart(lines, controllerMethod.line, block.endLine);

            if (bodyStart) {
              let depth = 0;
              for (let j = bodyStart.line; j < Math.min(block.endLine, lines.length); j++) {
                const bodyLine = j === bodyStart.line ? lines[j].slice(bodyStart.column) : lines[j];
                for (const ch of bodyLine) {
                  if (ch === '{') {
                    depth++;
                  } else if (ch === '}') {
                    depth--;
                  }
                }
                if (depth === 0) {
                  const firstLine = lines[bodyStart.line].slice(bodyStart.column);
                  const bodyText = [firstLine, ...lines.slice(bodyStart.line + 1, j + 1)].join(
                    '\n',
                  );
                  const svcRe = /this\.(\w+Service|\w+)\.(\w+)\s*\(/g;
                  let svcMatch;
                  while ((svcMatch = svcRe.exec(bodyText)) !== null) {
                    const svcName = serviceAliases.get(svcMatch[1]) || svcMatch[1];
                    const svcMethod = svcMatch[2];
                    if (svcName === 'prisma' || svcName === 'prismaAny') {
                      continue;
                    }
                    serviceCalls.push(`${svcName}.${svcMethod}`);
                  }
                  break;
                }
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
