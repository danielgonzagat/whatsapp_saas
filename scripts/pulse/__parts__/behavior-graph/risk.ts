import type {
  BehaviorRiskLevel,
  BehaviorNodeKind,
  BehaviorStateAccess,
  BehaviorExternalCall,
  BehaviorNode,
} from '../../types.behavior-graph';
import type { SourceExternalContext, BehaviorValidationRequirement } from './types';
import type { DetectedSourceRoot } from '../../source-root-detector';
import { IDENTIFIER_GRAMMAR, looksLikeExternalMutationOperation } from './patterns';
import { hasDecoratorRole } from './decorators';

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
  if (kind === 'auth_check') return 'critical';

  const hasWriteOps = stateAccess.some((a) =>
    ['create', 'update', 'delete', 'upsert'].includes(a.operation),
  );
  const hasDeleteOps = stateAccess.some((a) => a.operation === 'delete');
  const acceptsExternalInput =
    kind === 'api_endpoint' ||
    kind === 'webhook_receiver' ||
    kind === 'queue_consumer' ||
    kind === 'event_listener';
  const touchesProcessBoundary =
    /\b(process\.env|document\.cookie|localStorage|sessionStorage|crypto\.|jwt|bcrypt|hash|secret|signature)\b/i.test(
      bodyText,
    );

  if (hasDeleteOps || (hasWriteOps && externalCalls.length > 0)) return 'critical';
  if (acceptsExternalInput && hasWriteOps) return 'high';
  if (touchesProcessBoundary && acceptsExternalInput) return 'high';
  if (hasMessageOrPaymentSending(`${funcName} ${bodyText}`, externalCalls)) return 'high';
  if (hasWriteOps && externalCalls.length > 0) return 'high';
  if (hasWriteOps) return 'medium';
  if (externalCalls.length > 0) return 'medium';
  if (stateAccess.some((a) => a.operation === 'read')) return 'medium';

  return 'low';
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
  if (risk === 'critical' || risk === 'high') return 'ai_safe';

  if (hasDecoratorRole(decorators, 'auth_guard', sourceRoot, sourceContext)) return 'ai_safe';

  const sendsMessagesOrPayments = hasMessageOrPaymentSending(bodyText, externalCalls);
  if (sendsMessagesOrPayments) return 'ai_safe';

  const hasDbWrites = stateAccess.some((a) =>
    ['create', 'update', 'delete', 'upsert'].includes(a.operation),
  );

  if (hasDbWrites) {
    return 'ai_safe';
  }

  const hasEffects = hasStateOrExternalEffects(stateAccess, externalCalls, bodyText);
  if (hasEffects) return 'ai_safe';

  const isGetter =
    /^get[A-Z]/.test(funcName) ||
    /^find[A-Z]/.test(funcName) ||
    /^list[A-Z]/.test(funcName) ||
    /^fetch[A-Z]/.test(funcName) ||
    /^read[A-Z]/.test(funcName);
  if (isGetter && kind !== 'api_endpoint') return 'observation_only';

  return 'ai_safe';
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
  if (executionMode === 'observation_only') {
    return ['governed_read_only_evidence'];
  }

  const requirements: BehaviorValidationRequirement[] = ['targeted_test', 'typecheck'];
  if (risk === 'critical' || risk === 'high') {
    requirements.push('package_build', 'runtime_smoke', 'observability_evidence');
  }

  if (
    stateAccess.some((access) =>
      ['create', 'update', 'delete', 'upsert'].includes(access.operation),
    )
  ) {
    requirements.push('idempotency_check');
  }

  if (externalCalls.length > 0 || hasMessageOrPaymentSending(bodyText, externalCalls)) {
    requirements.push('external_integration_evidence');
  }

  return uniqueValidationRequirements(requirements);
}

export {
  determineRisk,
  determineExecutionMode,
  CALL_EXPRESSION_NAME_PATTERN,
  operationTokens,
  looksLikeMessageDeliveryOperation,
  looksLikeMoneyMutationOperation,
  hasMessageOrPaymentSending,
  hasStateOrExternalEffects,
  buildValidationRequirements,
  uniqueValidationRequirements,
};
