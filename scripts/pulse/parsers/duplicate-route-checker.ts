import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

interface RouteEntry {
  file: string;
  relFile: string;
  line: number;
  httpMethod: string;
  controllerPath: string;
  methodPath: string;
  fullPath: string;
  normalizedPath: string;
}

/**
 * Normalize a route path for duplicate comparison:
 * - Replace :param segments with :_ so different param names don't prevent detection
 * - Strip trailing slashes
 * - Lowercase everything
 */
function normalizePath(p: string): string {
  return (
    p
      .toLowerCase()
      .replace(/:[^/]+/g, ':_')
      .replace(/\/+$/, '')
      .replace(/\/+/g, '/') || '/'
  );
}

function buildFullPath(controllerPath: string, methodPath: string): string {
  const cp = controllerPath.replace(/^\/|\/$/g, '');
  const mp = (methodPath || '').replace(/^\/|\/$/g, '');
  const full = mp ? `/${cp}/${mp}` : `/${cp}`;
  return full.replace(/\/+/g, '/');
}

/**
 * Extract the controller prefix from @Controller('path') or @Controller().
 * Returns '' for @Controller() with no path.
 */
function extractControllerPath(line: string): string | null {
  const match = line.match(/@Controller\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/);
  if (!match) {
    return null;
  }
  return match[1] ?? '';
}

export function checkDuplicateRoutes(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const controllerFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => f.endsWith('.controller.ts') && !/\.(spec|test)\.ts$/.test(f),
  );

  // Collect all routes across all controller files
  const allRoutes: RouteEntry[] = [];

  for (const file of controllerFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    // Find all @Controller blocks (a file may have multiple controller classes)
    interface ControllerBlock {
      controllerPath: string;
      startLine: number;
      endLine: number;
    }

    const blocks: ControllerBlock[] = [];
    for (let i = 0; i < lines.length; i++) {
      const cp = extractControllerPath(lines[i]);
      if (cp !== null) {
        blocks.push({ controllerPath: cp, startLine: i, endLine: lines.length });
      }
    }
    for (let i = 0; i < blocks.length - 1; i++) {
      blocks[i].endLine = blocks[i + 1].startLine;
    }

    for (const block of blocks) {
      for (let i = block.startLine; i < block.endLine; i++) {
        const trimmed = lines[i].trim();

        for (const method of HTTP_METHODS) {
          // Match @Get('path'), @Get("path"), @Get(`path`), @Get() with no path
          const decoratorRe = new RegExp(`^@${method}\\(\\s*(?:['"\`]([^'"\`]*)['"\`])?\\s*\\)`);
          const match = trimmed.match(decoratorRe);
          if (!match) {
            continue;
          }

          const methodPath = match[1] ?? '';
          const fullPath = buildFullPath(block.controllerPath, methodPath);
          const normalizedPath = normalizePath(fullPath);

          allRoutes.push({
            file,
            relFile,
            line: i + 1,
            httpMethod: method.toUpperCase(),
            controllerPath: block.controllerPath,
            methodPath,
            fullPath,
            normalizedPath,
          });
        }
      }
    }
  }

  // Group routes by METHOD:normalizedPath
  const routeMap = new Map<string, RouteEntry[]>();
  for (const route of allRoutes) {
    const key = `${route.httpMethod}:${route.normalizedPath}`;
    if (!routeMap.has(key)) {
      routeMap.set(key, []);
    }
    routeMap.get(key)!.push(route);
  }

  // Report duplicates where entries come from DIFFERENT files (or same file, different controller blocks)
  for (const [key, entries] of routeMap) {
    if (entries.length < 2) {
      continue;
    }

    // Check if at least 2 entries are from different files or different controller paths
    const uniqueSources = new Set(entries.map((e) => `${e.file}::${e.controllerPath}`));
    if (uniqueSources.size < 2) {
      continue;
    }

    // Report each duplicate entry (after the first)
    const [first, ...rest] = entries;
    for (const dup of rest) {
      breaks.push({
        type: 'DUPLICATE_ROUTE',
        severity: 'high',
        file: dup.relFile,
        line: dup.line,
        description: `Duplicate route: ${key.replace(':', ' ')}`,
        detail: `"${dup.fullPath}" [${dup.httpMethod}] in ${path.basename(dup.file)} conflicts with same route in ${path.basename(first.file)}:${first.line}. NestJS will only serve the first-registered handler.`,
      });
    }
  }

  return breaks;
}
