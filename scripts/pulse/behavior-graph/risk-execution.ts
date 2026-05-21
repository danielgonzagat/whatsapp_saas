import type {
  BehaviorNodeKind,
  BehaviorRiskLevel,
  BehaviorStateAccess,
  BehaviorExternalCall,
  BehaviorValidationRequirement,
  BehaviorNode,
} from '../types.behavior-graph';
import type { DetectedSourceRoot } from '../source-root-detector/types';
import type {
  ParsedFunc,
  SourceExternalContext,
  BehaviorNodeArtifact,
} from './grammar-and-types';
import {
  requireBehaviorRiskLevelCatalog,
  requireExecutionModeCatalog,
  requireBehaviorNodeKindCatalog,
  requireDecoratorRoleCatalog,
  requireOperationCatalog,
  requireGovernedEvidenceModeCatalog,
  discoverStateWriteOperationLabels,
  discoverValidationRequirementLabels,
  nextNodeId,
} from './catalog-helpers';
import { hasDecoratorRole } from './decorator-roles';
import { looksLikeExternalMutationOperation } from './grammar-and-types';
import {
  determineKind,
  extractInputs,
  detectStateAccess,
  collectSourceExternalContext,
  detectExternalCalls,
  detectOutputs,
} from './node-building';
import { IDENTIFIER_GRAMMAR } from './grammar-and-types';
import { requireJsReservedWordSet } from './catalog-helpers';

const CALL_EXPRESSION_NAME_PATTERN = new RegExp(String.raw`\b(${IDENTIFIER_GRAMMAR})\s*\(`, 'g');

function operationTokens(operation: string): string[] {
  return operation
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

function looksLikeMessageDeliveryOperation(operation: string): boolean {
  const tokens = operationTokens(operation);
  return (
    tokens.some((token) => /^(send|reply|notify|publish|dispatch)$/.test(token)) &&
    tokens.some((token) => /^(message|text|media|template|email|sms|notification)$/.test(token))
  );
}

function looksLikeMoneyMutationOperation(operation: string): boolean {
  const tokens = operationTokens(operation);
  return (
    tokens.some((token) =>
      /^(transfer|payment|charge|refund|payout|capture|authorize|invoice|subscription)$/.test(
        token,
      ),
    ) &&
    tokens.some((token) =>
      /^(create|process|confirm|capture|authorize|charge|refund|transfer|cancel)$/.test(token),
    )
  );
}

function hasMessageOrPaymentSending(
  bodyText: string,
  externalCalls: BehaviorExternalCall[],
): boolean {
  CALL_EXPRESSION_NAME_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CALL_EXPRESSION_NAME_PATTERN.exec(bodyText)) !== null) {
    const operation = match[1];
    if (
      looksLikeMessageDeliveryOperation(operation) ||
      looksLikeMoneyMutationOperation(operation) ||
      looksLikeExternalMutationOperation(operation)
    ) {
      return true;
    }
  }
  return externalCalls.some((call) => looksLikeExternalMutationOperation(call.operation));
}

function hasStateOrExternalEffects(
  stateAccess: BehaviorStateAccess[],
  externalCalls: BehaviorExternalCall[],
  bodyText: string,
): boolean {
  if (stateAccess.length > 0) return true;
  if (externalCalls.length > 0) return true;
  if (/\beventEmitter\.emit\b/.test(bodyText)) return true;
  if (/\b\.queue\.add\b/.test(bodyText)) return true;
  if (/\bprocess\.env\b/.test(bodyText)) return true;
  return false;
}

function determineRisk(
  kind: BehaviorNodeKind,
  bodyText: string,
  stateAccess: BehaviorStateAccess[],
  externalCalls: BehaviorExternalCall[],
  funcName: string,
  _decorators: string[],
): BehaviorRiskLevel {
  const risk = requireBehaviorRiskLevelCatalog();
  const kindValues = requireBehaviorNodeKindCatalog();
  if (kind === kindValues.authCheck) return risk.critical;

  const writeOps = new Set(discoverStateWriteOperationLabels());
  const hasWriteOps = stateAccess.some((a) => writeOps.has(a.operation));
  const hasDeleteOps = stateAccess.some((a) => a.operation === requireOperationCatalog().delete);
  const acceptsExternalInput = [
    kindValues.apiEndpoint,
    kindValues.webhookReceiver,
    kindValues.queueConsumer,
    kindValues.eventListener,
  ].includes(kind);
  const touchesProcessBoundary =
    /\b(process\.env|document\.cookie|localStorage|sessionStorage|crypto\.|jwt|bcrypt|hash|secret|signature)\b/i.test(
      bodyText,
    );

  if (hasDeleteOps || (hasWriteOps && externalCalls.length > 0)) return risk.critical;
  if (acceptsExternalInput && hasWriteOps) return risk.high;
  if (touchesProcessBoundary && acceptsExternalInput) return risk.high;
  if (hasMessageOrPaymentSending(`${funcName} ${bodyText}`, externalCalls)) return risk.high;
  if (hasWriteOps && externalCalls.length > 0) return risk.high;
  if (hasWriteOps) return risk.medium;
  if (externalCalls.length > 0) return risk.medium;
  if (stateAccess.some((a) => a.operation === requireOperationCatalog().read)) return risk.medium;

  return risk.low;
}

function determineExecutionMode(
  risk: BehaviorRiskLevel,
  kind: BehaviorNodeKind,
  funcName: string,
  decorators: string[],
  bodyText: string,
  stateAccess: BehaviorStateAccess[],
  externalCalls: BehaviorExternalCall[],
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
): BehaviorNode['executionMode'] {
  const riskCatalog = requireBehaviorRiskLevelCatalog();
  const modeCatalog = requireExecutionModeCatalog() as Record<
    string,
    BehaviorNode['executionMode']
  >;
  const kindCatalog = requireBehaviorNodeKindCatalog();
  const dr = requireDecoratorRoleCatalog();
  if (risk === riskCatalog.critical || risk === riskCatalog.high) return modeCatalog.aiSafe;

  if (hasDecoratorRole(decorators, dr.authGuard, sourceRoot, sourceContext))
    return modeCatalog.aiSafe;

  const sendsMessagesOrPayments = hasMessageOrPaymentSending(bodyText, externalCalls);
  if (sendsMessagesOrPayments) return modeCatalog.aiSafe;

  const writeOpSet = new Set(discoverStateWriteOperationLabels());
  const hasDbWrites = stateAccess.some((a) => writeOpSet.has(a.operation));

  if (hasDbWrites) {
    return modeCatalog.aiSafe;
  }

  const hasEffects = hasStateOrExternalEffects(stateAccess, externalCalls, bodyText);
  if (hasEffects) return modeCatalog.aiSafe;

  const isGetter =
    /^get[A-Z]/.test(funcName) ||
    /^find[A-Z]/.test(funcName) ||
    /^list[A-Z]/.test(funcName) ||
    /^fetch[A-Z]/.test(funcName) ||
    /^read[A-Z]/.test(funcName);
  if (isGetter && kind !== kindCatalog.apiEndpoint) return modeCatalog.observationOnly;

  return modeCatalog.aiSafe;
}

function uniqueValidationRequirements(
  requirements: BehaviorValidationRequirement[],
): BehaviorValidationRequirement[] {
  return [...new Set(requirements)];
}

function buildValidationRequirements(
  risk: BehaviorRiskLevel,
  executionMode: BehaviorNode['executionMode'],
  stateAccess: BehaviorStateAccess[],
  externalCalls: BehaviorExternalCall[],
  bodyText: string,
): BehaviorValidationRequirement[] {
  const vr = discoverValidationRequirementLabels();
  const risks = requireBehaviorRiskLevelCatalog();
  const modes = requireExecutionModeCatalog();
  const writeOps = new Set(discoverStateWriteOperationLabels());

  if (executionMode === modes.observationOnly) {
    return [vr.governedReadOnlyEvidence];
  }

  const requirements: BehaviorValidationRequirement[] = [vr.targetedTest, vr.typecheck];
  if (risk === risks.critical || risk === risks.high) {
    requirements.push(vr.packageBuild, vr.runtimeSmoke, vr.observabilityEvidence);
  }

  if (stateAccess.some((access) => writeOps.has(access.operation))) {
    requirements.push(vr.idempotencyCheck);
  }

  if (externalCalls.length > 0 || hasMessageOrPaymentSending(bodyText, externalCalls)) {
    requirements.push(vr.externalIntegrationEvidence);
  }

  return uniqueValidationRequirements(requirements);
}

function extractCalledFunctions(bodyText: string, allFuncNames: Set<string>): string[] {
  const called: string[] = [];
  const seen = new Set<string>();

  const callRegex = /(\w+)\s*\(/g;
  let callMatch: RegExpExecArray | null;
  while ((callMatch = callRegex.exec(bodyText)) !== null) {
    const callee = callMatch[1];
    if (
      allFuncNames.has(callee) &&
      !seen.has(callee) &&
      !requireJsReservedWordSet().has(callee) &&
      (callee[0] === callee[0].toUpperCase()) === false
    ) {
      seen.add(callee);
      called.push(callee);
    }
  }

  return called;
}

function buildFuncNameMap(functions: ParsedFunc[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const func of functions) {
    const names = map.get(func.name) || [];
    names.push(nextNodeId());
    map.set(func.name, names);
  }
  return map;
}

function buildNodesFromParsedFunctions(
  relPath: string,
  funcs: ParsedFunc[],
  sourceText: string,
  sourceRoot: DetectedSourceRoot | null,
): BehaviorNodeArtifact[] {
  const sourceContext = collectSourceExternalContext(sourceText, sourceRoot);

  return funcs.map((func) => {
    const kind = determineKind(func, sourceRoot, sourceContext);
    const inputs = extractInputs(func, sourceRoot, sourceContext);
    const stateAccess = detectStateAccess(func.bodyText, sourceContext);
    const externalCalls = detectExternalCalls(func.bodyText, sourceContext);
    const outputs = detectOutputs(func.bodyText, kind);
    const risk = determineRisk(
      kind,
      func.bodyText,
      stateAccess,
      externalCalls,
      func.name,
      func.decorators,
    );
    const executionMode = determineExecutionMode(
      risk,
      kind,
      func.name,
      func.decorators,
      func.bodyText,
      stateAccess,
      externalCalls,
      sourceRoot,
      sourceContext,
    );

    const hasErrorHandler = func.bodyText.includes('try') && func.bodyText.includes('catch');
    const hasLogging =
      func.bodyText.includes('this.logger.') ||
      func.bodyText.includes('console.') ||
      func.bodyText.includes('logger.');
    const lowerBody = func.bodyText.toLowerCase();
    const hasMetrics =
      lowerBody.includes('metrics') ||
      lowerBody.includes('counter') ||
      lowerBody.includes('gauge') ||
      lowerBody.includes('histogram') ||
      lowerBody.includes('increment') ||
      lowerBody.includes('decrement');
    const hasTracing =
      lowerBody.includes('trace') || lowerBody.includes('span') || lowerBody.includes('context.');
    const validationRequirements = buildValidationRequirements(
      risk,
      executionMode,
      stateAccess,
      externalCalls,
      func.bodyText,
    );

    const sourceRootMeta = sourceRoot
      ? {
          relativePath: sourceRoot.relativePath,
          kind: sourceRoot.kind,
          languages: sourceRoot.languages,
          frameworks: sourceRoot.frameworks,
          entrypoints: sourceRoot.entrypoints,
        }
      : undefined;

    return {
      id: nextNodeId(),
      kind,
      name: func.name,
      filePath: relPath,
      ...(sourceRootMeta ? { sourceRoot: sourceRootMeta } : {}),
      line: func.line,
      parentFunctionId: null,
      inputs,
      outputs,
      stateAccess,
      externalCalls,
      risk,
      executionMode,
      calledBy: [],
      calls: [],
      isAsync: func.isAsync,
      hasErrorHandler,
      hasLogging,
      hasMetrics,
      hasTracing,
      decorators: func.decorators,
      docComment: func.docComment,
      validationRequirements,
      governedEvidenceMode:
        executionMode === requireExecutionModeCatalog().observationOnly
          ? requireGovernedEvidenceModeCatalog().readOnlyEvidence
          : requireGovernedEvidenceModeCatalog().sandboxedExecutionWithValidation,
    };
  });
}

export {
  CALL_EXPRESSION_NAME_PATTERN,
  operationTokens,
  looksLikeMessageDeliveryOperation,
  looksLikeMoneyMutationOperation,
  hasMessageOrPaymentSending,
  hasStateOrExternalEffects,
  determineRisk,
  determineExecutionMode,
  uniqueValidationRequirements,
  buildValidationRequirements,
  extractCalledFunctions,
  buildFuncNameMap,
  buildNodesFromParsedFunctions,
};
