import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

interface ModuleNode {
  file: string;
  name: string;
  /** Names of modules that appear in this module's imports[] array (excluding forwardRef). */
  imports: string[];
}

/**
 * Extract module names from the `imports: [...]` array of a @Module decorator.
 * Skips `forwardRef(() => SomeModule)` entries — those are NestJS's own cycle-breaker.
 */
function extractModuleImports(content: string): string[] {
  const imports: string[] = [];

  // Find the imports: [ ... ] block inside @Module
  const moduleStart = content.indexOf('@Module(');
  if (moduleStart === -1) {
    return imports;
  }

  // Collect the full @Module(...) call body
  let depth = 0;
  let inModule = false;
  let moduleBody = '';
  for (let i = moduleStart; i < content.length; i++) {
    const ch = content[i];
    if (ch === '(') {
      depth++;
      inModule = true;
    }
    if (inModule && ch === ')') {
      depth--;
      if (depth === 0) {
        moduleBody = content.slice(moduleStart, i + 1);
        break;
      }
    }
  }

  if (!moduleBody) {
    return imports;
  }

  // Find `imports:` key within moduleBody
  const importKeyIdx = moduleBody.indexOf('imports:');
  if (importKeyIdx === -1) {
    return imports;
  }

  // Collect the array after `imports:`
  let arrStart = -1;
  let arrDepth = 0;
  let arrBody = '';
  for (let i = importKeyIdx; i < moduleBody.length; i++) {
    if (moduleBody[i] === '[') {
      if (arrDepth === 0) {
        arrStart = i;
      }
      arrDepth++;
    } else if (moduleBody[i] === ']') {
      arrDepth--;
      if (arrDepth === 0 && arrStart !== -1) {
        arrBody = moduleBody.slice(arrStart, i + 1);
        break;
      }
    }
  }

  if (!arrBody) {
    return imports;
  }

  // Remove forwardRef(…) entries entirely so we don't process them
  const noForwardRef = arrBody.replace(/forwardRef\s*\(\s*\(\s*\)\s*=>\s*\w+\s*\)/g, '');

  // Extract PascalCase identifiers that end with "Module"
  const tokenRe = /\b([A-Z][A-Za-z0-9_]*Module)\b/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(noForwardRef)) !== null) {
    imports.push(m[1]);
  }

  return imports;
}

/** Check circular imports. */
export function checkCircularImports(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const moduleFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => f.endsWith('.module.ts') && !/\.(spec|test)\.ts$/.test(f),
  );

  const nodes: ModuleNode[] = [];
  const nameToNode = new Map<string, ModuleNode>();

  for (const mf of moduleFiles) {
    let content: string;
    try {
      content = fs.readFileSync(mf, 'utf8');
    } catch {
      continue;
    }

    const nameMatch = content.match(/export\s+class\s+([A-Z][A-Za-z0-9_]*Module)\b/);
    if (!nameMatch) {
      continue;
    }

    const name = nameMatch[1];
    const imports = extractModuleImports(content);
    const node: ModuleNode = { file: mf, name, imports };
    nodes.push(node);
    nameToNode.set(name, node);
  }

  // DFS cycle detection
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const cycleFiles = new Set<string>();

  for (const node of nodes) {
    color.set(node.name, WHITE);
  }

  function dfs(current: ModuleNode, stack: string[]): void {
    color.set(current.name, GRAY);
    stack.push(current.name);

    for (const importedName of current.imports) {
      const imported = nameToNode.get(importedName);
      if (!imported) {
        continue;
      }

      const c = color.get(importedName) ?? WHITE;

      if (c === GRAY) {
        // Found a cycle — `current` closes the cycle back to `importedName`
        const cycleKey = current.name;
        if (!cycleFiles.has(cycleKey)) {
          cycleFiles.add(cycleKey);
          const relFile = path.relative(config.rootDir, current.file);

          // Find the cycle path for detail message
          const cycleStart = stack.indexOf(importedName);
          const cyclePath = [...stack.slice(cycleStart), importedName].join(' → ');

          breaks.push({
            type: 'CIRCULAR_MODULE_DEPENDENCY',
            severity: 'high',
            file: relFile,
            line: 1,
            description: `Circular module dependency detected: "${current.name}" closes a cycle`,
            detail: `Cycle: ${cyclePath}. Use forwardRef(() => ModuleX) in one of the involved modules to break the cycle.`,
          });
        }
      } else if (c === WHITE) {
        dfs(imported, stack);
      }
    }

    stack.pop();
    color.set(current.name, BLACK);
  }

  for (const node of nodes) {
    if ((color.get(node.name) ?? WHITE) === WHITE) {
      dfs(node, []);
    }
  }

  return breaks;
}
