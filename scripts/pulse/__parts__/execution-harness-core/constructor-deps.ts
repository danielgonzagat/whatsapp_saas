import { infrastructureAliasNames } from './grammar';

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
