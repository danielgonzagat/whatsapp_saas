/**
 * Shared test helpers for `flow-template.recommended` spec files.
 *
 * The production type uses `unknown` for `nodes`/`edges` so the seed catalog
 * stays storage-shape-agnostic; tests reflect the catalog's actual literal
 * shapes here without resorting to `as any`.
 */

import type { RecommendedFlowTemplate } from './flow-template.recommended';

export interface FlowTemplateBaseNode {
  id: string;
  label: string;
}
export interface FlowTemplateStartNode extends FlowTemplateBaseNode {
  type: 'start';
}
export interface FlowTemplateEndNode extends FlowTemplateBaseNode {
  type: 'end';
}
export interface FlowTemplateMessageNode extends FlowTemplateBaseNode {
  type: 'message';
  content: string;
}
export type FlowTemplateNode =
  | FlowTemplateStartNode
  | FlowTemplateEndNode
  | FlowTemplateMessageNode;

export interface FlowTemplateEdge {
  id: string;
  source: string;
  target: string;
}

export const nodesOf = (template: RecommendedFlowTemplate): FlowTemplateNode[] =>
  template.nodes as FlowTemplateNode[];

export const edgesOf = (template: RecommendedFlowTemplate): FlowTemplateEdge[] =>
  template.edges as FlowTemplateEdge[];

export const messageNodesOf = (template: RecommendedFlowTemplate): FlowTemplateMessageNode[] =>
  nodesOf(template).filter((n): n is FlowTemplateMessageNode => n.type === 'message');

export const findMessageNode = (
  template: RecommendedFlowTemplate,
  id: string,
): FlowTemplateMessageNode => {
  const node = messageNodesOf(template).find((n) => n.id === id);
  if (!node) {
    throw new Error(`message node ${id} not found in template ${template.name}`);
  }
  return node;
};
