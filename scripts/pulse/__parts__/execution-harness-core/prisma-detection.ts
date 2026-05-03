import { readTextFile } from '../../safe-fs';
import { extractConstructorAliases } from './constructor-deps';

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
