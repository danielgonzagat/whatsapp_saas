import type { PulseStructuralNode } from './types';

export function hasApiCalls(node: PulseStructuralNode): boolean {
  return Array.isArray(node.metadata.apiCalls) && node.metadata.apiCalls.length > 0;
}

function isReusableUiComponent(filePath: string): boolean {
  return /(?:^|\/)components\//.test(filePath);
}

export function shouldSkipUiSeed(
  node: PulseStructuralNode,
  apiBackedUiFiles: Set<string>,
): boolean {
  if (node.kind !== 'ui_element') {
    return false;
  }

  if (node.metadata.handlerType === 'navigation') {
    return true;
  }

  if (hasApiCalls(node)) {
    return false;
  }

  const filePath = String(node.file || '');
  return isReusableUiComponent(filePath) || apiBackedUiFiles.has(filePath);
}
