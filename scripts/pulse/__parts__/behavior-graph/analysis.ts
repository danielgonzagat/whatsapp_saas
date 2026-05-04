import type { ParsedFunc, SourceExternalContext } from './types';
import type { DetectedSourceRoot } from '../../source-root-detector';
import type {
  BehaviorNodeKind,
  BehaviorInput,
  BehaviorInputKind,
} from '../../types.behavior-graph';
import { hasDecoratorRole, classNameRole, inputKindFromDecorator } from './decorators';

function determineKind(
  func: ParsedFunc,
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
): BehaviorNodeKind {
  const { decorators, className, name } = func;

  if (hasDecoratorRole(decorators, 'http_route', sourceRoot, sourceContext)) return 'api_endpoint';
  if (hasDecoratorRole(decorators, 'cron_job', sourceRoot, sourceContext)) return 'cron_job';
  if (hasDecoratorRole(decorators, 'queue_consumer', sourceRoot, sourceContext)) {
    return 'queue_consumer';
  }
  if (hasDecoratorRole(decorators, 'event_listener', sourceRoot, sourceContext)) {
    return 'event_listener';
  }

  if (className) {
    const role = classNameRole(className, sourceRoot, sourceContext, func.classDecorators);
    if (role === 'controller_like') {
      if (hasDecoratorRole(decorators, 'http_route', sourceRoot, sourceContext)) {
        return 'api_endpoint';
      }
      return 'handler';
    }
    if (role === 'gateway_like') return 'event_listener';
    if (role === 'guard_like') return 'auth_check';
    if (role === 'validation_like') return 'validation';
    if (role === 'service_like') {
      if (/^use[A-Z]/.test(name) || /^on[A-Z]/.test(name)) return 'lifecycle_hook';
      return 'handler';
    }
    if (role === 'queue_like') return 'queue_consumer';
  }

  const lower = name.toLowerCase();

  if (/^use[A-Z]/.test(name)) return 'lifecycle_hook';
  if (/^validate/i.test(name)) return 'validation';
  return 'function_definition';
}

function extractInputs(
  func: ParsedFunc,
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
): BehaviorInput[] {
  const inputs: BehaviorInput[] = [];
  const { parameters, decorators } = func;

  for (const param of parameters) {
    const input: BehaviorInput = {
      kind: 'body',
      name: param.name,
      type: param.typeText,
      required: !param.typeText.includes('?') && !param.name.includes('?'),
      validated: false,
      source: param.name,
    };

    const nestedInputKind = decorators
      .map((decorator) => inputKindFromDecorator(decorator, sourceRoot, sourceContext))
      .filter(Boolean)
      .pop();
    if (nestedInputKind) {
      input.kind = nestedInputKind;
    }

    if (func.bodyText.includes(`validate`) && func.bodyText.includes(param.name)) {
      input.validated = true;
    }

    inputs.push(input);
  }

  return inputs;
}

export { determineKind, extractInputs };
