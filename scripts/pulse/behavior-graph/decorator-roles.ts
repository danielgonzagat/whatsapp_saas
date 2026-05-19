import type { DetectedSourceRoot } from '../source-root-detector/types';
import type { BehaviorInputKind } from '../types.behavior-graph';
import type {
  BehaviorDecoratorRole,
  BehaviorClassNameRole,
  SourceExternalContext,
} from './grammar-and-types';
import {
  requireDecoratorRoleCatalog,
  requireClassNameRoleCatalog,
  requireBehaviorInputKindCatalog,
} from './catalog-helpers';
import { identifierTokens } from './grammar-and-types';

function decoratorRoles(
  decorator: string,
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
): BehaviorDecoratorRole[] {
  const dr = requireDecoratorRoleCatalog();
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
  if (/^(all|head|options|get|post|put|patch|delete)$/.test(joined)) roles.add(dr.httpRoute);
  if (tokens.some((token) => token === 'cron' || token === 'interval' || token === 'timeout')) {
    roles.add(dr.cronJob);
  }
  if (
    tokens.some((token) => token === 'message' || token === 'event' || token === 'pattern') ||
    joined.includes('process')
  ) {
    roles.add(dr.queueConsumer);
  }
  if (tokens.some((token) => token === 'subscribe' || token === 'listener')) {
    roles.add(dr.eventListener);
  }
  if (tokens.includes('body')) roles.add(dr.requestBody);
  if (tokens.includes('query')) roles.add(dr.requestQuery);
  if (tokens.some((token) => token === 'param' || token === 'params')) roles.add(dr.requestParams);
  if (tokens.some((token) => token === 'header' || token === 'headers')) {
    roles.add(dr.requestHeaders);
  }
  if (tokens.some((token) => token === 'req' || token === 'res' || token === 'context')) {
    roles.add(dr.requestContext);
  }
  if (tokens.some((token) => token === 'auth' || token === 'guard')) roles.add(dr.authGuard);

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
  const dr = requireDecoratorRoleCatalog();
  const roles = decoratorRoles(decorator, sourceRoot, sourceContext);
  const inputKinds = requireBehaviorInputKindCatalog();
  if (roles.includes(dr.requestBody)) return inputKinds.body;
  if (roles.includes(dr.requestQuery)) return inputKinds.query;
  if (roles.includes(dr.requestParams)) return inputKinds.params;
  if (roles.includes(dr.requestHeaders)) return inputKinds.headers;
  if (roles.includes(dr.requestContext)) return inputKinds.context;
  return null;
}

function classNameRole(
  className: string,
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
  classDecorators: string[],
): BehaviorClassNameRole | null {
  const cr = requireClassNameRoleCatalog();
  for (const decorator of classDecorators) {
    const tokens = identifierTokens(decorator);
    if (tokens.includes('controller')) return cr.controllerLike;
    if (tokens.includes('gateway')) return cr.gatewayLike;
    if (tokens.includes('guard')) return cr.guardLike;
    if (tokens.some((token) => token === 'pipe' || token === 'validator')) {
      return cr.validationLike;
    }
    if (tokens.some((token) => token === 'processor' || token === 'consumer')) {
      return cr.queueLike;
    }
  }

  const tokens = identifierTokens(className);
  const hasFrameworkEvidence =
    sourceRoot?.frameworks.length || sourceContext.frameworkDecoratorBindings.size;
  if (!hasFrameworkEvidence) {
    return null;
  }
  if (tokens.includes('controller')) return cr.controllerLike;
  if (tokens.includes('gateway')) return cr.gatewayLike;
  if (tokens.includes('guard')) return cr.guardLike;
  if (tokens.some((token) => token === 'pipe' || token === 'validator')) return cr.validationLike;
  if (tokens.some((token) => token === 'processor' || token === 'consumer')) return cr.queueLike;
  if (tokens.some((token) => token === 'service' || token === 'repository')) return cr.serviceLike;
  return null;
}

export { decoratorRoles, hasDecoratorRole, inputKindFromDecorator, classNameRole };
