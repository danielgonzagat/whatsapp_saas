import * as path from 'path';
import type { PulseScopeState, PulseStructuralNode, PulseTruthMode } from './types';
import { readTextFile } from './safe-fs';

const SIDE_EFFECT_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'network_call', pattern: /\b(fetch|axios|HttpService|httpService)\b/ },
  {
    label: 'external_sdk_call',
    pattern:
      /\b(new\s+OpenAI|openai\.|graphApi(?:Get|Post|Put|Patch|Delete)?|metaSdk\.|stripe\.|mercadoPago\.|resend\.|sendgrid\.)\b/i,
  },
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

function readFile(rootDir: string, filePath: string): string {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
    return readTextFile(absolutePath, 'utf8');
  } catch {
    return '';
  }
}

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

    for (const signal of SIDE_EFFECT_PATTERNS) {
      if (!signal.pattern.test(content)) {
        continue;
      }
      const file = scopeByPath.get(relativePath) || null;
      nodes.push({
        id: `side-effect:${compactWords(relativePath)}:${signal.label}`,
        kind: 'side_effect_signal',
        role: 'side_effect',
        truthMode,
        adapter: 'side-effect-signal',
        label: `${signal.label} in ${path.basename(relativePath)}`,
        file: relativePath,
        line: 1,
        userFacing: Boolean(file?.userFacing),
        runtimeCritical: Boolean(file?.runtimeCritical),
        protectedByGovernance: Boolean(file?.protectedByGovernance),
        metadata: {
          signal: signal.label,
          filePath: relativePath,
        },
      });
    }
  }

  return nodes;
}
