import * as path from 'path';
import type { PulseScopeState, PulseStructuralNode, PulseTruthMode } from './types';
import { readTextFile } from './safe-fs';

const SIDE_EFFECT_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'network_call', pattern: /\b(fetch|axios|HttpService|httpService)\b/ },
  { label: 'queue_dispatch', pattern: /\b(queue\.add|bull|bullmq)\b/i },
  { label: 'event_emit', pattern: /\b(emit|publish|dispatchEvent)\b/ },
  { label: 'message_send', pattern: /\b(send(Message|Email|Sms)?|reply|notify)\b/ },
  {
    label: 'state_mutation',
    pattern:
      /\b(clearSharedAuthCookies|cookies\(\)|cookies\.(?:set|delete)|response\.cookies|res\.cookie|tokenStorage\.(?:set|clear)|localStorage\.(?:setItem|removeItem|clear)|sessionStorage\.(?:setItem|removeItem|clear))\b/,
  },
  { label: 'file_write', pattern: /\b(writeFile|appendFile|createWriteStream)\b/ },
  {
    label: 'file_upload',
    pattern:
      /\b(FileInterceptor|FilesInterceptor|UploadedFile|UploadedFiles|storageService\.upload|\.upload\s*\()\b/,
  },
  {
    label: 'generated_artifact',
    pattern: /\b(toDataURL|arrayBuffer|Buffer\.from|toString\(\s*['"`]base64['"`])\b/,
  },
];
const EXTERNAL_IMPORT_PATTERN =
  /\bimport\s+(?:type\s+)?(?:(\w+)|\*\s+as\s+(\w+)|\{([^}]+)\})\s+from\s+['"]([^.'"][^'"]*)['"]|\brequire\(\s*['"]([^.'"][^'"]*)['"]\s*\)/g;
const EXTERNAL_MEMBER_CALL_PATTERN =
  /\b([A-Za-z_$][\w$]*)\.(?:get|post|put|patch|delete|request|send|create|update|confirm|refund|call|emit|upload)\s*\(/g;
const CONSTRUCTOR_CALL_PATTERN = /\bnew\s+([A-Z][A-Za-z0-9_$]*)\s*\(/g;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function compactWords(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/');
}

function parseNamedImportBindings(namedImports: string): string[] {
  return namedImports
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(
      (entry) =>
        entry
          .split(/\s+as\s+/i)
          .pop()
          ?.trim() || '',
    )
    .filter(Boolean);
}

function collectExternalImportBindings(content: string): Set<string> {
  const bindings = new Set<string>();
  EXTERNAL_IMPORT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EXTERNAL_IMPORT_PATTERN.exec(content)) !== null) {
    const defaultBinding = match[1];
    const namespaceBinding = match[2];
    const namedBindings = match[3];
    const requiredPackage = match[5];
    if (defaultBinding) bindings.add(defaultBinding);
    if (namespaceBinding) bindings.add(namespaceBinding);
    if (namedBindings) {
      for (const binding of parseNamedImportBindings(namedBindings)) {
        bindings.add(binding);
      }
    }
    if (requiredPackage) {
      const packageBase = requiredPackage.split('/').filter(Boolean).pop();
      if (packageBase) bindings.add(compactWords(packageBase).replace(/-/g, ''));
    }
  }
  return bindings;
}

function hasExternalSdkCall(content: string): boolean {
  const bindings = collectExternalImportBindings(content);
  if (bindings.size === 0) {
    return false;
  }

  EXTERNAL_MEMBER_CALL_PATTERN.lastIndex = 0;
  let memberMatch: RegExpExecArray | null;
  while ((memberMatch = EXTERNAL_MEMBER_CALL_PATTERN.exec(content)) !== null) {
    if (bindings.has(memberMatch[1])) {
      return true;
    }
  }

  CONSTRUCTOR_CALL_PATTERN.lastIndex = 0;
  let constructorMatch: RegExpExecArray | null;
  while ((constructorMatch = CONSTRUCTOR_CALL_PATTERN.exec(content)) !== null) {
    if (bindings.has(constructorMatch[1])) {
      return true;
    }
  }

  return false;
}

function readFile(rootDir: string, filePath: string): string {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
    return readTextFile(absolutePath, 'utf8');
  } catch {
    return '';
  }
}

/** Build side effect signals. */
export function buildSideEffectSignals(
  rootDir: string,
  files: string[],
  scopeByPath: Map<string, PulseScopeState['files'][number]>,
  truthMode: PulseTruthMode,
): PulseStructuralNode[] {
  const nodes: PulseStructuralNode[] = [];

  for (const filePath of unique(files).filter(Boolean)) {
    const relativePath = normalizePath(filePath);
    const content = readFile(rootDir, relativePath);
    if (!content) {
      continue;
    }

    const signals = SIDE_EFFECT_PATTERNS.filter((signal) => signal.pattern.test(content)).map(
      (signal) => signal.label,
    );
    if (hasExternalSdkCall(content)) {
      signals.push('external_sdk_call');
    }

    for (const label of unique(signals)) {
      const file = scopeByPath.get(relativePath) || null;
      nodes.push({
        id: `side-effect:${compactWords(relativePath)}:${label}`,
        kind: 'side_effect_signal',
        role: 'side_effect',
        truthMode,
        adapter: 'side-effect-signal',
        label: `${label} in ${path.basename(relativePath)}`,
        file: relativePath,
        line: 1,
        userFacing: Boolean(file?.userFacing),
        runtimeCritical: Boolean(file?.runtimeCritical),
        protectedByGovernance: Boolean(file?.protectedByGovernance),
        metadata: {
          signal: label,
          filePath: relativePath,
        },
      });
    }
  }

  return nodes;
}
