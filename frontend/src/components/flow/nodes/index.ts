// Custom node types for KLOEL FlowBuilder
export { MessageNode } from './MessageNode';
export { ConditionNode } from './ConditionNode';
export { ActionNode } from './ActionNode';
export { InputNode } from './InputNode';
export { DelayNode } from './DelayNode';
export { AINode } from './AINode';
export { StartNode } from './StartNode';
export { EndNode } from './EndNode';

// Node type registry for ReactFlow
export const nodeTypes = {
  message: () => import('./MessageNode').then(m => m.MessageNode),
  condition: () => import('./ConditionNode').then(m => m.ConditionNode),
  action: () => import('./ActionNode').then(m => m.ActionNode),
  input: () => import('./InputNode').then(m => m.InputNode),
  delay: () => import('./DelayNode').then(m => m.DelayNode),
  ai: () => import('./AINode').then(m => m.AINode),
  start: () => import('./StartNode').then(m => m.StartNode),
  end: () => import('./EndNode').then(m => m.EndNode),
};
