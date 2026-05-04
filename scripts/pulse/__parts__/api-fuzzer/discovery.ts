import * as path from 'path';
import { safeJoin } from '../../lib/safe-path';
import { pathExists, readTextFile } from '../../safe-fs';
import { walkFiles } from '../../parsers/utils';
import type { APIEndpointProbe } from '../../types.api-fuzzer';
import {
  buildFullPath,
  collectNonRouteMetadataDecorators,
  extractBodyDtoType,
  extractEndpointEffectGraph,
  extractGuardNames,
  findControllerBlocks,
  findMethodName,
  parseRouteDecorator,
  parseRouteParameters,
  uniqueStrings,
} from './helpers';

// ---------------------------------------------------------------------------
// Endpoint Discovery
// ---------------------------------------------------------------------------

/**
 * Discover all API endpoints in the NestJS backend.
 *
 * Scans `backend/src` for controller files decorated with `@Controller()`,
 * extracts routes, auth guards, throttle config, DTO types, and metadata.
 */
export function discoverAPIEndpoints(rootDir: string): APIEndpointProbe[] {
  const probes: APIEndpointProbe[] = [];
  const backendDir = safeJoin(rootDir, 'backend', 'src');

  if (!pathExists(backendDir)) {
    process.stderr.write('  [api-fuzzer] Backend directory not found\n');
    return probes;
  }

  const files = walkFiles(backendDir, ['.ts']).filter(
    (f) => f.endsWith('.controller.ts') && !/\.(spec|test)\.ts$/.test(f),
  );

  for (const file of files) {
    try {
      const content = readTextFile(file, 'utf8');
      const lines = content.split('\n');
      const relFile = path.relative(rootDir, file);
      const controllerBlocks = findControllerBlocks(lines);

      if (controllerBlocks.length === 0) {
        continue;
      }

      for (const block of controllerBlocks) {
        const controllerPath = block.path;

        for (let i = block.startLine; i < block.endLine; i++) {
          const line = lines[i].trim();

          const routeDecorator = parseRouteDecorator(line);
          if (!routeDecorator) {
            continue;
          }

          const methodPath = routeDecorator.path;
          const fullPath = buildFullPath(controllerPath, methodPath);

          let methodPublic = block.isPublic;
          let methodGuards = [...block.classGuards];
          let methodThrottle = block.throttleConfig;

          for (let j = Math.max(block.startLine, i - 8); j < i; j++) {
            const above = lines[j].trim();
            if (/@Public\(\s*\)/.test(above)) {
              methodPublic = true;
            }
            const guardMatch = above.match(/@UseGuards\(([^)]+)\)/);
            if (guardMatch) {
              methodGuards.push(...extractGuardNames(guardMatch[1]));
            }
            const throttleMatch = above.match(
              /@Throttle\(\s*(?:{\s*default:\s*{\s*limit:\s*(\d+)\s*,\s*ttl:\s*(\d+)\s*}\s*})?\s*\)/,
            );
            if (throttleMatch) {
              methodThrottle = {
                max: throttleMatch[1] ? parseInt(throttleMatch[1], 10) : 30,
                windowMs: throttleMatch[2] ? parseInt(throttleMatch[2], 10) : 60000,
              };
            }
          }

          for (let j = i + 1; j < Math.min(i + 5, block.endLine); j++) {
            const below = lines[j].trim();
            if (/@Public\(\s*\)/.test(below)) {
              methodPublic = true;
            }
            const guardMatch = below.match(/@UseGuards\(([^)]+)\)/);
            if (guardMatch) {
              methodGuards.push(...extractGuardNames(guardMatch[1]));
            }
            const throttleMatch = below.match(
              /@Throttle\(\s*(?:{\s*default:\s*{\s*limit:\s*(\d+)\s*,\s*ttl:\s*(\d+)\s*}\s*})?\s*\)/,
            );
            if (throttleMatch) {
              methodThrottle = {
                max: throttleMatch[1] ? parseInt(throttleMatch[1], 10) : 30,
                windowMs: throttleMatch[2] ? parseInt(throttleMatch[2], 10) : 60000,
              };
            }
          }

          const methodInfo = findMethodName(lines, i, block.endLine);
          const dtoType = extractBodyDtoType(lines, methodInfo.line, block.endLine);
          const effectGraph = extractEndpointEffectGraph(lines, methodInfo.line, block.endLine);
          const routeParameters = parseRouteParameters(fullPath);
          const methodMetadataDecorators = collectNonRouteMetadataDecorators(
            lines,
            Math.max(block.startLine, i - 8),
            Math.min(i + 5, block.endLine),
          );
          methodGuards = uniqueStrings(methodGuards);
          const authorizationMetadata = uniqueStrings([
            ...block.classMetadataDecorators,
            ...methodMetadataDecorators,
          ]);
          const requiresAuth = !methodPublic && methodGuards.length > 0;
          const requiresTenant =
            requiresAuth && (routeParameters.length > 0 || authorizationMetadata.length > 0);

          const requestSchema: Record<string, unknown> | null = dtoType
            ? { dtoType, source: 'inferred' }
            : null;

          const endpointId = `${routeDecorator.method}:${fullPath}:${methodInfo.name}:${relFile}:${i + 1}`;

          probes.push({
            endpointId,
            method: routeDecorator.method,
            path: fullPath,
            controller: relFile,
            filePath: relFile,
            requiresAuth,
            requiresTenant,
            authProbeMetadata: {
              guardNames: methodGuards,
              authorizationMetadata,
              routeParameters,
              bodyDtoType: dtoType,
            },
            rateLimit: methodThrottle,
            requestSchema,
            responseSchema: { effectGraph },
            authTests: [],
            schemaTests: [],
            idempotencyTests: [],
            rateLimitTests: [],
            securityTests: [],
          });
        }
      }
    } catch (e) {
      process.stderr.write(`  [api-fuzzer] Could not parse ${file}: ${(e as Error).message}\n`);
    }
  }

  return probes;
}
