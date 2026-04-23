import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

// Services that NestJS / common providers inject globally — never flag these
const FRAMEWORK_PROVIDERS = new Set([
  'PrismaService',
  'ConfigService',
  'Logger',
  'JwtService',
  'EventEmitter2',
  'HttpService',
  'SchedulerRegistry',
  'ModuleRef',
  'Reflector',
  'APP_GUARD',
  'APP_PIPE',
  'APP_FILTER',
  'APP_INTERCEPTOR',
  'ThrottlerGuard',
  'ThrottlerStorage',
  'I18nService',
  'AlertsGateway',
]);

interface ModuleRecord {
  file: string;
  name: string;
  providers: string[];
  controllers: string[];
  exports: string[];
  imports: string[];
}

function extractConstructorParameterSpans(
  content: string,
): Array<{ text: string; lineOffset: number }> {
  const spans: Array<{ text: string; lineOffset: number }> = [];
  const constructorRe = /\bconstructor\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = constructorRe.exec(content)) !== null) {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    for (let i = start; i < content.length; i++) {
      const ch = content[i];
      if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (depth === 0 && end > start) {
      spans.push({
        text: content.slice(start, end),
        lineOffset: content.slice(0, start).split('\n').length - 1,
      });
    }
  }

  return spans;
}

/**
 * Extract an array literal value from a decorator property like `providers: [A, B, C]`.
 * Handles multi-line arrays by scanning forward until brackets balance.
 */
function extractArrayItems(lines: string[], startIdx: number, key: string): string[] {
  const items: string[] = [];

  // Find the key in lines starting from startIdx
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const keyIdx = line.indexOf(`${key}:`);
    if (keyIdx === -1) {
      continue;
    }

    // Collect everything from the '[' onwards
    let buffer = line.slice(keyIdx + key.length + 1);
    let depth = 0;
    let started = false;

    for (let j = i; j < lines.length; j++) {
      const chunk = j === i ? buffer : lines[j];
      for (const ch of chunk) {
        if (ch === '[') {
          depth++;
          started = true;
        }
        if (started && ch === ']') {
          depth--;
          if (depth === 0) {
            break;
          }
        }
      }
      buffer += (j === i ? '' : '\n') + (j === i ? '' : lines[j]);
      if (started && depth === 0) {
        break;
      }
    }

    // Extract identifiers from the collected buffer, skipping forwardRef(() => X) refs
    // and string literals
    const stripped = buffer.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // Match identifiers: word chars not preceded by quote/dot/$ (to skip string keys and obj props)
    const tokenRe = /\b([A-Z][A-Za-z0-9_]*)\b/g;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(stripped)) !== null) {
      // Skip keywords inside forwardRef (the lambda target is fine, but the `forwardRef` call itself)
      if (m[1] === 'forwardRef') {
        continue;
      }
      items.push(m[1]);
    }
    break; // found the key, stop
  }
  return items;
}

function parseModule(file: string): ModuleRecord | null {
  let content: string;
  try {
    content = readTextFile(file, 'utf8');
  } catch {
    return null;
  }

  if (!content.includes('@Module(')) {
    return null;
  }

  const lines = content.split('\n');
  const nameMatch = content.match(/export\s+class\s+(\w+Module)\b/);
  const name = nameMatch ? nameMatch[1] : path.basename(file, '.ts');

  // Find @Module decorator start line
  let moduleStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/@Module\s*\(/.test(lines[i])) {
      moduleStart = i;
      break;
    }
  }
  if (moduleStart === -1) {
    return null;
  }

  const providers = extractArrayItems(lines, moduleStart, 'providers');
  const controllers = extractArrayItems(lines, moduleStart, 'controllers');
  const exports_ = extractArrayItems(lines, moduleStart, 'exports');
  const imports = extractArrayItems(lines, moduleStart, 'imports');

  return { file, name, providers, controllers, exports: exports_, imports };
}

/** Check nest js modules. */
export function checkNestJSModules(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const moduleFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => f.endsWith('.module.ts') && !/\.(spec|test)\.ts$/.test(f),
  );

  const serviceFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => f.endsWith('.service.ts') && !/\.(spec|test)\.ts$/.test(f),
  );

  const controllerFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => f.endsWith('.controller.ts') && !/\.(spec|test)\.ts$/.test(f),
  );

  // Parse all modules
  const modules: ModuleRecord[] = [];
  for (const mf of moduleFiles) {
    const rec = parseModule(mf);
    if (rec) {
      modules.push(rec);
    }
  }

  // Build global sets of provided class names and registered controller names
  const allProvided = new Set<string>();
  const allExported = new Set<string>();
  const allControllersInModules = new Set<string>();

  for (const mod of modules) {
    for (const p of mod.providers) {
      allProvided.add(p);
    }
    for (const e of mod.exports) {
      allExported.add(e);
    }
    for (const c of mod.controllers) {
      allControllersInModules.add(c);
    }
  }

  // ── CHECK 1: Services injected via constructor that appear in NO module provider list ──
  for (const sf of serviceFiles) {
    let content: string;
    try {
      content = readTextFile(sf, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, sf);

    for (const constructorSpan of extractConstructorParameterSpans(content)) {
      const lines = constructorSpan.text.split('\n');
      // Match constructor injection: private/public/protected/readonly someService: ServiceClass
      const injRe =
        /(?:private|public|protected|readonly)\s+\w+\s*:\s*([A-Z][A-Za-z0-9_]*Service)\b/g;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m: RegExpExecArray | null;
        while ((m = injRe.exec(line)) !== null) {
          const serviceName = m[1];
          if (FRAMEWORK_PROVIDERS.has(serviceName)) {
            continue;
          }
          if (allProvided.has(serviceName) || allExported.has(serviceName)) {
            continue;
          }

          breaks.push({
            type: 'SERVICE_NOT_PROVIDED',
            severity: 'critical',
            file: relFile,
            line: constructorSpan.lineOffset + i + 1,
            description: `Injected service "${serviceName}" not found in any module's providers`,
            detail: `"${serviceName}" is injected in ${path.basename(sf)} but does not appear in providers[] of any module. Add it to the appropriate module or import the module that exports it.`,
          });
        }
      }
    }
  }

  // Also check controller files for injected services
  for (const cf of controllerFiles) {
    let content: string;
    try {
      content = readTextFile(cf, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, cf);

    for (const constructorSpan of extractConstructorParameterSpans(content)) {
      const lines = constructorSpan.text.split('\n');
      const injRe =
        /(?:private|public|protected|readonly)\s+\w+\s*:\s*([A-Z][A-Za-z0-9_]*Service)\b/g;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m: RegExpExecArray | null;
        while ((m = injRe.exec(line)) !== null) {
          const serviceName = m[1];
          if (FRAMEWORK_PROVIDERS.has(serviceName)) {
            continue;
          }
          if (allProvided.has(serviceName) || allExported.has(serviceName)) {
            continue;
          }

          breaks.push({
            type: 'SERVICE_NOT_PROVIDED',
            severity: 'critical',
            file: relFile,
            line: constructorSpan.lineOffset + i + 1,
            description: `Injected service "${serviceName}" not found in any module's providers`,
            detail: `"${serviceName}" is injected in ${path.basename(cf)} but does not appear in providers[] of any module. Add it to the appropriate module or import the module that exports it.`,
          });
        }
      }
    }
  }

  // ── CHECK 2: Controllers not registered in any module ──
  for (const cf of controllerFiles) {
    let content: string;
    try {
      content = readTextFile(cf, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, cf);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      // Find exported controller classes
      const classMatch = lines[i].match(/export\s+class\s+([A-Z][A-Za-z0-9_]*Controller)\b/);
      if (!classMatch) {
        continue;
      }

      const controllerName = classMatch[1];
      if (allControllersInModules.has(controllerName)) {
        continue;
      }

      // Check if any module imports array contains it (sometimes controllers referenced in imports)
      const inImports = modules.some((m) => m.imports.includes(controllerName));
      if (inImports) {
        continue;
      }

      breaks.push({
        type: 'CONTROLLER_NOT_REGISTERED',
        severity: 'critical',
        file: relFile,
        line: i + 1,
        description: `Controller "${controllerName}" not registered in any module's controllers array`,
        detail: `"${controllerName}" in ${path.basename(cf)} is never added to a module's controllers[]. NestJS will not route requests to it.`,
      });
    }
  }

  return breaks;
}
