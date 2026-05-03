import type { UIElement } from '../../../types';

export function buildHandlerEvidence(
  handler: string | null,
  resolved: { type: UIElement['handlerType']; apiCalls: string[] },
): Pick<UIElement, 'handlerEvidence' | 'handlerPredicates'> {
  const evidence = new Set<string>();
  const predicates = new Set<string>();
  if (!handler || handler.trim().length === 0) {
    predicates.add('handler:missing');
  } else {
    predicates.add('handler:present');
  }
  predicates.add(`handler:${resolved.type}`);
  if (resolved.apiCalls.length > 0) {
    predicates.add('api_call:observed');
    for (const apiCall of resolved.apiCalls) {
      evidence.add(`api_call:${apiCall}`);
    }
  }
  if (handler?.includes('=>')) {
    predicates.add('handler:inline');
  }
  return {
    handlerEvidence: [...evidence],
    handlerPredicates: [...predicates],
  };
}
