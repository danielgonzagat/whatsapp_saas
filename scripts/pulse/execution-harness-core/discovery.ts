import * as path from 'path';
import type { HarnessTarget } from '../../types.execution-harness';
import { walkFiles } from '../../parsers/utils';
import { pathExists, readTextFile } from '../../safe-fs';
import { infrastructureAliasNames, nonCallableMemberNames } from './grammar';
import { measureParenBalance } from './helpers';

// ─── Constructor Dependency Extraction ──────────────────────────────────────

export function extractConstructorAliases(content: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const ctorMatch = content.match(/constructor\s*\(([\s\S]*?)\)\s*\{/);
  if (!ctorMatch) {
    return aliases;
  }

  const paramRe =
    /(?:@(?:Inject|InjectRedis|Optional)\([^)]*\)\s*)?(?:private|public|protected)?\s*(?:readonly\s+)?(\w+)\??\s*:\s*([A-Z][A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = paramRe.exec(ctorMatch[1])) !== null) {
    if (!infrastructureAliasNames().has(match[2])) {
      aliases.set(match[1], match[2]);
    }
  }

  return aliases;
}

// ─── Worker Detection ───────────────────────────────────────────────────────

export interface RawWorkerDiscovery {
  file: string;
  line: number;
  queueName: string;
  handlerName: string;
}

/** Detect BullMQ workers created via `new Worker('queue-name', ...)` inside backend files. */
export function rawWorkerDiscoveries(workerDir: string): RawWorkerDiscovery[] {
  const discoveries: RawWorkerDiscovery[] = [];

  if (!pathExists(workerDir)) {
    return discoveries;
  }

  const files = walkFiles(workerDir, ['.ts']).filter(
    (f) => !/\.(spec|test|d)\.ts$/.test(f) && !/node_modules/.test(f),
  );

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const workerRe =
      /new\s+Worker\s*\(\s*(?:['"`]([^'"`]+)['"`])\s*,\s*(?:async\s+)?(?:\([^)]*\)|function\s*\w*|[A-Za-z_]\w*)/g;
    let match: RegExpExecArray | null;
    const lines = content.split('\n');

    while ((match = workerRe.exec(content)) !== null) {
      const queueName = match[1];
      const precedingSlice = content.slice(0, match.index);
      const line = (precedingSlice.match(/\n/g) || []).length + 1;

      // Look up the wrapping function/class name
      let handlerName = `${queueName}-worker`;
      // Try to find a nearby export function or class
      const nearbyRe =
        /(?:export\s+(?:async\s+)?function\s+|export\s+class\s+|class\s+)([A-Za-z_]\w*)/g;
      let nearbyMatch: RegExpExecArray | null;
      while ((nearbyMatch = nearbyRe.exec(precedingSlice)) !== null) {
        handlerName = nearbyMatch[1];
      }

      discoveries.push({
        file: path.relative(workerDir, file),
        line,
        queueName,
        handlerName,
      });
    }
  }

  return discoveries;
}

/** Detect workers via `@Processor('queue-name')` and `@Process('job-name')` decorators. */
export function nestjsBullMQDiscoveries(dir: string): RawWorkerDiscovery[] {
  const discoveries: RawWorkerDiscovery[] = [];

  if (!pathExists(dir)) {
    return discoveries;
  }

  const files = walkFiles(dir, ['.ts']).filter(
    (f) => !/\.(spec|test|d)\.ts$/.test(f) && !/node_modules/.test(f),
  );

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const processorRe = /@Processor\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
    let processorMatch: RegExpExecArray | null;
    while ((processorMatch = processorRe.exec(content)) !== null) {
      const queueName = processorMatch[1] || 'unknown-queue';
      const processRe = /@Process\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
      let processMatch: RegExpExecArray | null;
      while ((processMatch = processRe.exec(content)) !== null) {
        const jobName = processMatch[1] || 'unknown-job';
        const precedingSlice = content.slice(0, processMatch.index);
        const line = (precedingSlice.match(/\n/g) || []).length + 1;

        discoveries.push({
          file: path.relative(dir, file),
          line,
          queueName,
          handlerName: jobName,
        });
      }
    }
  }

  return discoveries;
}

// ─── Public Method Detection ─────────────────────────────────────────────────

function getClassMethodDeclarationName(trimmedLine: string): string | null {
  const methodMatch = trimmedLine.match(
    /^(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?([A-Za-z_]\w*)\s*(?:<[^>{}]+>)?\s*\(/,
  );
  if (!methodMatch) {
    return null;
  }

  const methodName = methodMatch[1];
  if (nonCallableMemberNames().has(methodName)) {
    return null;
  }

  return methodName;
}

export interface ExtractedMethod {
  name: string;
  line: number;
  isPublic: boolean;
  returnType: string | null;
}

export function extractPublicMethods(content: string): ExtractedMethod[] {
  const methods: ExtractedMethod[] = [];
  const lines = content.split('\n');
  let inClass = false;
  let classBraceDepth = 0;
  let pendingDecorators: string[] = [];
  let pendingMethod: { name: string; line: number; parenDepth: number; isPublic: boolean } | null =
    null;
  let inMethod = false;
  let methodBraceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (!inClass && /\bclass\s+\w+/.test(trimmed)) {
      inClass = true;
      classBraceDepth = 0;
      continue;
    }

    if (!inClass) {
      continue;
    }

    // Track class-level braces to know when we leave the class
    for (const ch of trimmed) {
      if (ch === '{') {
        classBraceDepth++;
      } else if (ch === '}') {
        classBraceDepth--;
      }
    }

    if (classBraceDepth <= 0 && inClass) {
      inClass = false;
      break;
    }

    if (!inMethod && !pendingMethod && trimmed.startsWith('@')) {
      pendingDecorators.push(trimmed);
      continue;
    }

    // Detect method declarations
    if (!inMethod && !pendingMethod) {
      const methodName = getClassMethodDeclarationName(trimmed);
      if (methodName) {
        // Determine if method is public (no access modifier = public in TS)
        const isPublic = !/^(private|protected)\s+/.test(trimmed) && !/^#/.test(trimmed);
        pendingMethod = {
          name: methodName,
          line: i + 1,
          parenDepth: 0,
          isPublic,
        };
      } else if (trimmed && !trimmed.startsWith('@')) {
        pendingDecorators = [];
      }
    }

    if (!inMethod && pendingMethod) {
      pendingMethod.parenDepth += measureParenBalance(trimmed);
    }

    if (!inMethod && pendingMethod && pendingMethod.parenDepth <= 0 && /\{\s*$/.test(trimmed)) {
      inMethod = true;
      methodBraceDepth = 0;
    }

    if (inMethod) {
      for (const ch of trimmed) {
        if (ch === '{') {
          methodBraceDepth++;
        } else if (ch === '}') {
          methodBraceDepth--;
        }
      }

      if (methodBraceDepth <= 0 && pendingMethod) {
        if (pendingMethod.isPublic) {
          methods.push({
            name: pendingMethod.name,
            line: pendingMethod.line,
            isPublic: true,
            returnType: null,
          });
        }
        inMethod = false;
        pendingMethod = null;
        pendingDecorators = [];
      }
    }
  }

  return methods;
}

// ─── Prisma Model Detection ─────────────────────────────────────────────────

function prismaAccessGrammar(): RegExp[] {
  return [
    /this\.(?:prisma|prismaAny)\.([a-z]\w+)\.\s*(?:create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany)\s*\(/g,
    /\(this\.prisma\s+as\s+[a][n][y]\)\.([a-z]\w+)\.\s*(?:create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany)\s*\(/g,
    /(?:prismaAny|prismaExt|prisma)\.([a-z]\w+)\.\s*(?:create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany)\s*\(/g,
    /[tT][xX]\.([a-z]\w+)\.\s*(?:create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany)\s*\(/g,
  ];
}

export function collectPrismaModelsFromText(text: string): string[] {
  const models = new Set<string>();
  for (const pattern of prismaAccessGrammar()) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      models.add(match[1]);
    }
  }
  return [...models];
}

export function resolveDependencyNames(
  file: string,
  className: string,
  methodName: string,
): Array<{ className: string; methodName: string | null }> {
  const dependencies: Array<{ className: string; methodName: string | null }> = [];
  let content: string;
  try {
    content = readTextFile(file, 'utf8');
  } catch {
    return dependencies;
  }

  const aliases = extractConstructorAliases(content);
  const aliasNames = [...aliases.keys()];

  // Scan method body for `this.alias.method()` calls
  const methodStartRe = new RegExp(
    `(?:public|private|protected)?\\s*(?:async\\s+)?${methodName}\\s*\\(`,
  );
  const methodMatch = content.match(methodStartRe);
  if (!methodMatch || typeof methodMatch.index !== 'number') {
    // Return constructor-level dependencies as default
    for (const [, svcName] of aliases) {
      dependencies.push({ className: svcName, methodName: null });
    }
    return dependencies;
  }

  // Extract the method body
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
      ? afterMethod.slice(bodyStart, bodyEnd)
      : afterMethod.slice(0, Math.min(600, afterMethod.length));

  for (const aliasName of aliasNames) {
    const svcName = aliases.get(aliasName);
    if (!svcName) {
      continue;
    }

    // Capture `this.alias.methodName(`
    const callRe = new RegExp(`this\\.${aliasName}\\.([A-Za-z_]\\w*)\\s*\\(`, 'g');
    let callMatch: RegExpExecArray | null;
    while ((callMatch = callRe.exec(bodyText)) !== null) {
      dependencies.push({ className: svcName, methodName: callMatch[1] });
    }
  }

  // If no method-level deps found, fall back to constructor-level
  if (dependencies.length === 0) {
    for (const [, svcName] of aliases) {
      dependencies.push({ className: svcName, methodName: null });
    }
  }

  return dependencies;
}
