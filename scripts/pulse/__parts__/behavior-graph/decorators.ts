import type { DetectedSourceRoot } from '../../source-root-detector';
import type { BehaviorInputKind } from '../../types.behavior-graph';
import type { SourceExternalContext } from './types';
import { identifierTokens } from './patterns';

type BehaviorDecoratorRole =
  | 'http_route'
  | 'queue_consumer'
  | 'cron_job'
  | 'event_listener'
  | 'request_body'
  | 'request_query'
  | 'request_params'
  | 'request_headers'
  | 'request_context'
  | 'auth_guard';

type BehaviorClassNameRole =
  | 'controller_like'
  | 'gateway_like'
  | 'guard_like'
  | 'validation_like'
  | 'service_like'
  | 'queue_like';

function identifierTokens(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

function decoratorRoles(
  decorator: string,
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
): BehaviorDecoratorRole[] {
  const roles = new Set<BehaviorDecoratorRole>();
  const tokens = identifierTokens(decorator);
  const packageName = sourceContext.importedBindingProviders.get(decorator) ?? null;
  const frameworkBacked =
    sourceContext.frameworkDecoratorBindings.has(decorator) ||
    (packageName
      ? (sourceRoot?.frameworks ?? []).some((framework) =>
          packageName.toLowerCase().includes(framework.toLowerCase().replace(/js$/, '')),
        )
      : false);

  if (!frameworkBacked) {
    return [];
  }

  const joined = tokens.join('-');
  if (/^(all|head|options|get|post|put|patch|delete)$/.test(joined)) roles.add('http_route');
  if (tokens.some((token) => token === 'cron' || token === 'interval' || token === 'timeout')) {
    roles.add('cron_job');
  }
  if (
    tokens.some((token) => token === 'message' || token === 'event' || token === 'pattern') ||
    joined.includes('process')
  ) {
    roles.add('queue_consumer');
  }
  if (tokens.some((token) => token === 'subscribe' || token === 'listener')) {
    roles.add('event_listener');
  }
  if (tokens.includes('body')) roles.add('request_body');
  if (tokens.includes('query')) roles.add('request_query');
  if (tokens.some((token) => token === 'param' || token === 'params')) roles.add('request_params');
  if (tokens.some((token) => token === 'header' || token === 'headers')) {
    roles.add('request_headers');
  }
  if (tokens.some((token) => token === 'req' || token === 'res' || token === 'context')) {
    roles.add('request_context');
  }
  if (tokens.some((token) => token === 'auth' || token === 'guard')) roles.add('auth_guard');

  return [...roles];
}

function hasDecoratorRole(
  decorators: string[],
  role: BehaviorDecoratorRole,
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
): boolean {
  return decorators.some((decorator) =>
    decoratorRoles(decorator, sourceRoot, sourceContext).includes(role),
  );
}

function inputKindFromDecorator(
  decorator: string,
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
): BehaviorInputKind | null {
  const roles = decoratorRoles(decorator, sourceRoot, sourceContext);
  if (roles.includes('request_body')) return 'body';
  if (roles.includes('request_query')) return 'query';
  if (roles.includes('request_params')) return 'params';
  if (roles.includes('request_headers')) return 'headers';
  if (roles.includes('request_context')) return 'context';
  return null;
}

function classNameRole(
  className: string,
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
  classDecorators: string[],
): BehaviorClassNameRole | null {
  for (const decorator of classDecorators) {
    const tokens = identifierTokens(decorator);
    if (tokens.includes('controller')) return 'controller_like';
    if (tokens.includes('gateway')) return 'gateway_like';
    if (tokens.includes('guard')) return 'guard_like';
    if (tokens.some((token) => token === 'pipe' || token === 'validator')) {
      return 'validation_like';
    }
    if (tokens.some((token) => token === 'processor' || token === 'consumer')) {
      return 'queue_like';
    }
  }

  const tokens = identifierTokens(className);
  const hasFrameworkEvidence =
    sourceRoot?.frameworks.length || sourceContext.frameworkDecoratorBindings.size;
  if (!hasFrameworkEvidence) {
    return null;
  }
  if (tokens.includes('controller')) return 'controller_like';
  if (tokens.includes('gateway')) return 'gateway_like';
  if (tokens.includes('guard')) return 'guard_like';
  if (tokens.some((token) => token === 'pipe' || token === 'validator')) return 'validation_like';
  if (tokens.some((token) => token === 'processor' || token === 'consumer')) return 'queue_like';
  if (tokens.some((token) => token === 'service' || token === 'repository')) return 'service_like';
  return null;
}

export {
  identifierTokens,
  decoratorRoles,
  hasDecoratorRole,
  inputKindFromDecorator,
  classNameRole,
};
export type { BehaviorDecoratorRole, BehaviorClassNameRole };
