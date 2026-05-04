import { nonCallableMemberNames } from './grammar';
import { measureParenBalance } from './helpers';

export function getClassMethodDeclarationName(trimmedLine: string): string | null {
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
