import type { UIElement } from '../../../types';
import { buildHandlerEvidence } from './handler-evidence';

export function buildElement(
  relFile: string,
  lineNumber: number,
  elementType: UIElement['type'],
  label: string,
  handler: string,
  resolved: { type: UIElement['handlerType']; apiCalls: string[] },
  component: string | null,
): UIElement {
  return {
    file: relFile,
    line: lineNumber,
    type: elementType,
    label,
    handler,
    handlerType: resolved.type,
    apiCalls: resolved.apiCalls,
    ...buildHandlerEvidence(handler, resolved),
    component,
  };
}
