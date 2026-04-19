// Custom node types for KLOEL FlowBuilder
import { ActionNode as ActionNodeComponent } from './ActionNode';
import { AINode as AINodeComponent } from './AINode';
import { ConditionNode as ConditionNodeComponent } from './ConditionNode';
import { DelayNode as DelayNodeComponent } from './DelayNode';
import { EndNode as EndNodeComponent } from './EndNode';
import { InputNode as InputNodeComponent } from './InputNode';
import { MessageNode as MessageNodeComponent } from './MessageNode';
import { StartNode as StartNodeComponent } from './StartNode';
import { WaitForReplyNode as WaitForReplyNodeComponent } from './WaitForReplyNode';

export const MessageNode = MessageNodeComponent;
export const ConditionNode = ConditionNodeComponent;
export const ActionNode = ActionNodeComponent;
export const InputNode = InputNodeComponent;
export const DelayNode = DelayNodeComponent;
export const AINode = AINodeComponent;
export const StartNode = StartNodeComponent;
export const EndNode = EndNodeComponent;
export const WaitForReplyNode = WaitForReplyNodeComponent;

// Node type registry for ReactFlow
export const nodeTypes = {
  message: () => import('./MessageNode').then((m) => m.MessageNode),
  condition: () => import('./ConditionNode').then((m) => m.ConditionNode),
  action: () => import('./ActionNode').then((m) => m.ActionNode),
  input: () => import('./InputNode').then((m) => m.InputNode),
  delay: () => import('./DelayNode').then((m) => m.DelayNode),
  ai: () => import('./AINode').then((m) => m.AINode),
  start: () => import('./StartNode').then((m) => m.StartNode),
  end: () => import('./EndNode').then((m) => m.EndNode),
  waitForReply: () => import('./WaitForReplyNode').then((m) => m.WaitForReplyNode),
};
