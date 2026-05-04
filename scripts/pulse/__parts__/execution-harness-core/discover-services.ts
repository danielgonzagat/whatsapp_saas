import * as path from 'path';
import type { PulseConfig } from '../../types';
import type { HarnessTarget } from '../../types.execution-harness';
import { walkFiles } from '../../parsers/utils';
import { readTextFile } from '../../safe-fs';
import { persistentStateMutationShape } from './grammar';
import { camelToKebab, unique } from './helpers';
import { extractConstructorAliases } from './constructor-deps';
import { extractPublicMethods } from './method-detection';
import { collectPrismaModelsFromText, resolveDependencyNames } from './prisma-detection';

/**
 * Discover service-level targets from `@Injectable()` classes.
 *
 * Scans service files and extracts every public method as a harness target.
 * Each target's dependencies are resolved by tracing constructor injection
 * and intra-method `this.dependency.method()` calls.
 *
 * @param config - PULSE configuration with backend directory paths
 * @returns Array of service harness targets
 */
export function discoverServices(config: PulseConfig): HarnessTarget[] {
  const targets: HarnessTarget[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter(
    (f) =>
      !/\.(spec|test|d)\.ts$/.test(f) &&
      !/node_modules/.test(f) &&
      (/\.service\.ts$/.test(f) ||
        /\.engine\.ts$/.test(f) ||
        /\.guard\.ts$/.test(f) ||
        /\.interceptor\.ts$/.test(f) ||
        /\.middleware\.ts$/.test(f)),
  );

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    if (!/@Injectable\(\)/.test(content)) {
      continue;
    }

    const classMatch = content.match(/export\s+class\s+(\w+)/);
    const className = classMatch ? classMatch[1] : path.basename(file, '.ts');
    const methods = extractPublicMethods(content);
    const aliases = extractConstructorAliases(content);

    for (const method of methods) {
      const targetId = `service:${camelToKebab(className)}:${camelToKebab(method.name)}`;
      const relFile = path.relative(config.rootDir, file);

      const dependencyEdges = resolveDependencyNames(file, className, method.name);
      const serviceDependencyIds = dependencyEdges.map(
        (dep) => `service:${camelToKebab(dep.className)}`,
      );

      // Detect Prisma models accessed within the method body
      const methodRe = new RegExp(`\\b${method.name}\\s*(?:<[^>]+>)?\\s*\\(`);
      const methodMatch = content.match(methodRe);
      let prismaModels: string[] = [];
      let methodBodyText = '';
      if (methodMatch && typeof methodMatch.index === 'number') {
        const afterMethod = content.slice(methodMatch.index);
        let braceDepth = 0;
        let bodyStart = -1;
        let bodyEnd = -1;
        for (let i = 0; i < afterMethod.length; i++) {
          const ch = afterMethod[i];
          if (ch === '{') {
            if (bodyStart === -1) {
              bodyStart = i;
            }
            braceDepth++;
          } else if (ch === '}') {
            braceDepth--;
            if (braceDepth === 0 && bodyStart !== -1) {
              bodyEnd = i;
              break;
            }
          }
        }
        const bodyText =
          bodyStart !== -1 && bodyEnd !== -1
            ? afterMethod.slice(bodyStart, bodyEnd + 1)
            : afterMethod.slice(0, Math.min(2000, afterMethod.length));
        methodBodyText = bodyText;
        prismaModels = collectPrismaModelsFromText(bodyText);
      }
      const hasPersistentMutation =
        prismaModels.length > 0 && persistentStateMutationShape().test(methodBodyText);
      const requiresAuth = false;
      const requiresTenant = hasPersistentMutation;
      const dependencies = unique([
        ...serviceDependencyIds,
        ...prismaModels.map((model) => `model:${model}`),
      ]);

      targets.push({
        targetId,
        kind: 'service',
        name: `${className}.${method.name}`,
        filePath: relFile,
        methodName: method.name,
        routePattern: null,
        httpMethod: null,
        requiresAuth,
        requiresTenant,
        dependencies,
        fixtures: [],
        feasibility: 'executable',
        feasibilityReason: '',
        generatedTests: [],
        generated: false,
      });
    }
  }

  return targets;
}
