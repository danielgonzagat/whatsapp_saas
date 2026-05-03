import { Node } from 'ts-morph';
import type { AstResolvedNodeKind, AstCallEdgeKind } from '../../types.ast-graph';
import type { DecoratorSemanticRole } from './constants';
import type { FrameworkDecoratorMeta } from './decorator-analysis';

export function hasSemanticRole(
  decoratorMeta: FrameworkDecoratorMeta,
  role: DecoratorSemanticRole,
): boolean {
  return decoratorMeta.semanticRoles.includes(role);
}

export function classifySymbolKind(
  symbolName: string,
  decoratorMeta: FrameworkDecoratorMeta,
  node: Node,
  parentClass?: string | null,
): AstResolvedNodeKind {
  if (Node.isMethodDeclaration(node) || Node.isMethodSignature(node)) {
    if (node.getName() === 'constructor') return 'constructor';

    if (hasSemanticRole(decoratorMeta, 'http_route')) return 'api_route';
    if (hasSemanticRole(decoratorMeta, 'schedule')) return 'cron_job';
    if (hasSemanticRole(decoratorMeta, 'queue_handler')) return 'queue_processor';
    if (hasSemanticRole(decoratorMeta, 'event_handler')) return 'websocket_gateway';
    if (hasSemanticRole(decoratorMeta, 'graphql_resolver')) return 'graphql_resolver';

    return 'class_method';
  }

  if (Node.isFunctionDeclaration(node)) return 'function';
  if (Node.isArrowFunction(node)) return 'arrow_function';

  if (Node.isClassDeclaration(node)) {
    if (hasSemanticRole(decoratorMeta, 'class_controller')) return 'controller';
    if (hasSemanticRole(decoratorMeta, 'graphql_resolver')) return 'resolver';
    if (hasSemanticRole(decoratorMeta, 'realtime_gateway')) return 'websocket_gateway';
    if (hasSemanticRole(decoratorMeta, 'framework_module')) return 'module';
    if (hasSemanticRole(decoratorMeta, 'provider')) return 'service';
    return 'provider';
  }

  return 'function';
}

export function classifyCallEdgeKind(node: Node, resolved: boolean): AstCallEdgeKind {
  if (Node.isNewExpression(node)) return 'new_expression';
  if (Node.isDecorator(node)) return 'decorator_application';
  if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) return 'jsx_usage';
  if (Node.isCallExpression(node)) {
    if (!resolved) return 'indirect_call';
    return 'direct_call';
  }
  return 'direct_call';
}
