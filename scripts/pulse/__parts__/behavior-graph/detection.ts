import type { ParsedFunc, SourceExternalContext } from './types';
import type { DetectedSourceRoot } from '../../source-root-detector';
import type {
  BehaviorStateAccess,
  BehaviorExternalCall,
  BehaviorOutput,
  BehaviorNodeKind,
} from '../../types.behavior-graph';
import {
  IDENTIFIER_GRAMMAR,
  EXTERNAL_RECEIVER_PATTERN,
  GENERIC_EXTERNAL_CALL_PATTERNS,
  EXTERNAL_PACKAGE_IMPORT_PATTERN,
  IMPORT_BINDING_PATTERN,
  EXTERNAL_SDK_OPERATION_PATTERN,
  EXTERNAL_SDK_CHAIN_PATTERN,
  CONSTRUCTOR_CALL_PATTERN,
  looksLikeExternalReceiverName,
  looksLikeHttpOperation,
  isMemberChainTail,
} from './patterns';

function detectStateAccess(bodyText: string): BehaviorStateAccess[] {
  if (!bodyText.includes('prisma')) {
    return [];
  }

  const accesses: BehaviorStateAccess[] = [];
  const seen = new Set<string>();

  const prismaPatterns = [
    new RegExp(String.raw`\bprisma\.(${IDENTIFIER_GRAMMAR})\.(${IDENTIFIER_GRAMMAR})\b`, 'g'),
    new RegExp(String.raw`\bthis\.prisma\.(${IDENTIFIER_GRAMMAR})\.(${IDENTIFIER_GRAMMAR})\b`, 'g'),
    new RegExp(String.raw`\bprismaClient\.(${IDENTIFIER_GRAMMAR})\.(${IDENTIFIER_GRAMMAR})\b`, 'g'),
  ];

  const readOperation = (operation: string): boolean =>
    /^(find|count|aggregate|group)/i.test(operation);
  const writeOperation = (operation: string): BehaviorStateAccess['operation'] | null => {
    if (/^create/i.test(operation)) return 'create';
    if (/^update/i.test(operation)) return 'update';
    if (/^delete/i.test(operation)) return 'delete';
    if (/^upsert/i.test(operation)) return 'upsert';
    return null;
  };

  for (const pattern of prismaPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(bodyText)) !== null) {
      const model = match[1];
      const op = match[2];
      const writeKind = writeOperation(op);
      const isRead = readOperation(op);
      if (!writeKind && !isRead) continue;

      const key = `${model}.${op}`;
      if (seen.has(key)) continue;
      seen.add(key);

      accesses.push({
        model,
        operation: writeKind ?? 'read',
        fieldPaths: [],
        whereClause: bodyText.includes('where') ? 'present' : null,
      });
    }
  }

  return accesses;
}

function packageProviderName(packageName: string): string {
  const parts = packageName.split('/').filter(Boolean);
  if (packageName.startsWith('@') && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] || packageName;
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

function collectSourceExternalContext(
  sourceText: string,
  sourceRoot: DetectedSourceRoot | null,
): SourceExternalContext {
  const packageProviders = new Set<string>();
  const importedBindings = new Set<string>();
  const importedBindingProviders = new Map<string, string>();
  const frameworkDecoratorBindings = new Set<string>();

  EXTERNAL_PACKAGE_IMPORT_PATTERN.lastIndex = 0;
  let packageMatch: RegExpExecArray | null;
  while ((packageMatch = EXTERNAL_PACKAGE_IMPORT_PATTERN.exec(sourceText)) !== null) {
    const packageName = packageMatch[1] ?? packageMatch[2] ?? '';
    if (packageName) {
      packageProviders.add(packageProviderName(packageName));
    }
  }

  IMPORT_BINDING_PATTERN.lastIndex = 0;
  let bindingMatch: RegExpExecArray | null;
  while ((bindingMatch = IMPORT_BINDING_PATTERN.exec(sourceText)) !== null) {
    const defaultBinding = bindingMatch[1];
    const namespaceBinding = bindingMatch[2];
    const namedBindings = bindingMatch[3];
    const packageName = bindingMatch[4];
    const providerName = packageProviderName(packageName);
    const observedBindings: string[] = [];
    if (defaultBinding) observedBindings.push(defaultBinding);
    if (namespaceBinding) observedBindings.push(namespaceBinding);
    if (namedBindings) {
      for (const binding of parseNamedImportBindings(namedBindings)) {
        observedBindings.push(binding);
      }
    }
    for (const binding of observedBindings) {
      importedBindings.add(binding);
      importedBindingProviders.set(binding, providerName);
      const packageLooksLikeDetectedFramework = (sourceRoot?.frameworks ?? []).some((framework) =>
        providerName.toLowerCase().includes(framework.toLowerCase().replace(/js$/, '')),
      );
      if (packageLooksLikeDetectedFramework) {
        frameworkDecoratorBindings.add(binding);
      }
    }
  }

  return {
    packageProviders: [...packageProviders],
    importedBindings,
    importedBindingProviders,
    frameworkDecoratorBindings,
  };
}

function pushExternalCall(
  calls: BehaviorExternalCall[],
  seen: Set<string>,
  provider: string,
  operation: string,
  bodyText: string,
): void {
  const key = `${provider}:${operation}`;
  if (seen.has(key)) return;
  seen.add(key);

  calls.push({
    provider,
    operation,
    hasTimeout: /\btimeout\b/i.test(bodyText) || /\bAbortSignal\b/i.test(bodyText),
    hasRetry: /\bretry\b/i.test(bodyText) || /\bmaxRetries\b/i.test(bodyText),
    hasCircuitBreaker: /\bcircuitBreaker\b/i.test(bodyText),
    hasFallback: /\bfallback\b/i.test(bodyText),
  });
}

function detectExternalCalls(
  bodyText: string,
  sourceContext: SourceExternalContext,
): BehaviorExternalCall[] {
  const calls: BehaviorExternalCall[] = [];
  const seen = new Set<string>();

  for (const { provider, pattern } of GENERIC_EXTERNAL_CALL_PATTERNS) {
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(bodyText)) !== null) {
      if (provider !== 'fetch') {
        const receiver = match[1] ?? '';
        const operation = match[2] ?? '';
        if (!looksLikeExternalReceiverName(receiver) || !looksLikeHttpOperation(operation)) {
          continue;
        }
      }
      pushExternalCall(calls, seen, provider, 'call', bodyText);
    }
  }

  EXTERNAL_RECEIVER_PATTERN.lastIndex = 0;
  let receiverMatch: RegExpExecArray | null;
  while ((receiverMatch = EXTERNAL_RECEIVER_PATTERN.exec(bodyText)) !== null) {
    if (isMemberChainTail(bodyText, receiverMatch.index)) continue;

    const receiver = receiverMatch[1];
    const operation = receiverMatch[2];
    const normalized = receiver.replace(/^this\./, '');
    if (!looksLikeExternalReceiverName(normalized)) {
      continue;
    }
    pushExternalCall(calls, seen, normalized, operation, bodyText);
  }

  EXTERNAL_SDK_OPERATION_PATTERN.lastIndex = 0;
  let sdkMatch: RegExpExecArray | null;
  while ((sdkMatch = EXTERNAL_SDK_OPERATION_PATTERN.exec(bodyText)) !== null) {
    const receiver = sdkMatch[1];
    const operation = sdkMatch[2];
    if (!sourceContext.importedBindings.has(receiver)) continue;
    pushExternalCall(calls, seen, receiver, operation, bodyText);
  }

  EXTERNAL_SDK_CHAIN_PATTERN.lastIndex = 0;
  let chainMatch: RegExpExecArray | null;
  while ((chainMatch = EXTERNAL_SDK_CHAIN_PATTERN.exec(bodyText)) !== null) {
    const receiver = chainMatch[1];
    const operation = chainMatch[3];
    if (!sourceContext.importedBindings.has(receiver)) continue;
    pushExternalCall(calls, seen, receiver, operation, bodyText);
  }

  CONSTRUCTOR_CALL_PATTERN.lastIndex = 0;
  let constructorMatch: RegExpExecArray | null;
  while ((constructorMatch = CONSTRUCTOR_CALL_PATTERN.exec(bodyText)) !== null) {
    const constructorName = constructorMatch[1];
    if (!sourceContext.importedBindings.has(constructorName)) continue;
    pushExternalCall(calls, seen, constructorName, 'instantiate', bodyText);
  }

  if (calls.length === 0 && /\bprocess\.env\.[A-Z][A-Z0-9_]*\b/.test(bodyText)) {
    for (const provider of sourceContext.packageProviders) {
      pushExternalCall(calls, seen, provider, 'configured_dependency', bodyText);
    }
  }

  return calls;
}

function detectOutputs(bodyText: string, kind: BehaviorNodeKind): BehaviorOutput[] {
  const outputs: BehaviorOutput[] = [];

  if (bodyText.includes('return') && kind === 'api_endpoint') {
    outputs.push({ kind: 'response', target: 'client', type: 'json', conditional: false });
  }

  if (bodyText.includes('prisma')) {
    const writeOps = ['create', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'];
    for (const op of writeOps) {
      if (bodyText.includes(`.${op}`)) {
        outputs.push({ kind: 'db_write', target: 'prisma', type: op, conditional: false });
        break;
      }
    }
  }

  if (bodyText.includes('eventEmitter.emit(')) {
    outputs.push({ kind: 'event', target: 'event_emitter', type: 'emit', conditional: true });
  }

  if (bodyText.includes('.queue.add(') || bodyText.includes('.bullQueue.add(')) {
    outputs.push({ kind: 'queue_message', target: 'queue', type: 'add', conditional: true });
  }

  if (
    bodyText.includes('console.log') ||
    bodyText.includes('console.error') ||
    bodyText.includes('console.warn')
  ) {
    outputs.push({ kind: 'log', target: 'console', type: 'text', conditional: false });
  }

  return outputs;
}

export {
  detectStateAccess,
  packageProviderName,
  parseNamedImportBindings,
  collectSourceExternalContext,
  pushExternalCall,
  detectExternalCalls,
  detectOutputs,
};
