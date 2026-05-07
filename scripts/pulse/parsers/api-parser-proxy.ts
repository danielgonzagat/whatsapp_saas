import { safeJoin } from '../safe-path';
import * as path from 'path';
import type { ProxyRoute } from '../types.core';
import type { PulseConfig } from '../types.manifest';
import { walkFiles } from './utils';
import { pathExists, readTextFile } from '../safe-fs';
import { getFrontendSourceDirs } from '../frontend-roots';
import { deriveUnitValue } from '../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { discoverSourceExtensionsFromObservedTypescript } from '../dynamic-reality-kernel/__parts__/token-evidence';

function removeLeadingRouteSegment(routePath: string, segment: string): string {
  const normalized = routePath.replace(/^\/+/, '').split('/');
  if (normalized[0] === segment) {
    normalized.shift();
  }
  return '/' + normalized.join('/');
}

export function parseProxyRoutes(config: PulseConfig): ProxyRoute[] {
  const routes: ProxyRoute[] = [];
  const apiDirs = getFrontendSourceDirs(config)
    .map((frontendDir) => safeJoin(frontendDir, 'app', 'api'))
    .filter((apiDir) => pathExists(apiDir));

  const routeFiles = apiDirs
    .flatMap((apiDir) => walkFiles(apiDir, [...discoverSourceExtensionsFromObservedTypescript()]))
    .filter((filePath) => path.parse(filePath).name === 'route');

  for (const file of routeFiles) {
    try {
      const content = readTextFile(file, 'utf8');
      const relFile = path.relative(config.rootDir, file);

      const appIdx = file.indexOf('/app/api/');
      if (appIdx === -1) {
        continue;
      }
      const routePart = path.dirname(
        file.substring(
          appIdx + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue(),
        ),
      );
      const frontendPath = routePart.replace(/\/\[\.\.\.?\w+\]/, '/:path');

      const handlerRe = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g;
      let m;
      while ((m = handlerRe.exec(content)) !== null) {
        const method = m[1];
        let backendPath = removeLeadingRouteSegment(frontendPath, 'api');

        const templateFetchMatch = content.match(/fetch\s*\(\s*`\$\{[^}]+\}(\/[^`]+)`/);
        if (templateFetchMatch) {
          backendPath = templateFetchMatch[1];
        }

        if (backendPath === removeLeadingRouteSegment(frontendPath, 'api')) {
          const proxyMatch = content.match(/['"`](\/[^'"`]+)['"`]\s*(?:,|\))/);
          if (proxyMatch) {
            const candidate = proxyMatch[1];
            if (!candidate.startsWith('/api/') && candidate.includes('/')) {
              backendPath = candidate;
            }
          }
        }

        routes.push({
          file: relFile,
          line: deriveUnitValue(),
          frontendPath,
          httpMethod: method,
          backendPath,
        });
      }
    } catch {
      // ignore unreadable route files
    }
  }

  return routes;
}
