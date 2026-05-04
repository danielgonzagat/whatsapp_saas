import * as path from 'path';
import type { PulseConfig } from '../../types';
import type { HarnessTarget } from '../../types.execution-harness';
import { walkFiles } from '../../parsers/utils';
import { readTextFile } from '../../safe-fs';
import { camelToKebab } from './helpers';

/**
 * Discover cron targets from `@Cron()` decorated methods.
 *
 * Scans the backend directory for NestJS `@Cron(schedule)` decorators.
 * Each scheduled method becomes a harness target.
 *
 * @param config - PULSE configuration with backend directory paths
 * @returns Array of cron harness targets
 */
export function discoverCrons(config: PulseConfig): HarnessTarget[] {
  const targets: HarnessTarget[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => !/\.(spec|test|d)\.ts$/.test(f) && !/node_modules/.test(f),
  );

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    if (!/@Cron\s*\(/.test(content)) {
      continue;
    }

    const classMatch = content.match(/export\s+class\s+(\w+)/);
    const className = classMatch ? classMatch[1] : path.basename(file, '.ts');

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const cronMatch = trimmed.match(/@Cron\(\s*([^)]*)\)/);
      if (!cronMatch) {
        continue;
      }

      const cronExpr = cronMatch[1].replace(/\s+/g, ' ').trim();

      // Find the method name on the next line(s)
      let methodName = 'unknown';
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const methodLine = lines[j].trim();
        if (methodLine.startsWith('@')) {
          continue;
        }
        const nameMatch = methodLine.match(
          /^(?:public|private|protected)?\s*(?:async\s+)?([A-Za-z_]\w*)\s*\(/,
        );
        if (nameMatch) {
          methodName = nameMatch[1];
          break;
        }
      }

      const targetId = `cron:${camelToKebab(className)}:${camelToKebab(methodName)}`;

      targets.push({
        targetId,
        kind: 'cron',
        name: `${className}.${methodName} (${cronExpr})`,
        filePath: relFile,
        methodName,
        routePattern: null,
        httpMethod: null,
        requiresAuth: false,
        requiresTenant: false,
        dependencies: [],
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
