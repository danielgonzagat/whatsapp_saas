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

/** Message node. */
export const MessageNode = MessageNodeComponent;
/** Condition node. */
export const ConditionNode = ConditionNodeComponent;
/** Action node. */
export const ActionNode = ActionNodeComponent;
/** Input node. */
export const InputNode = InputNodeComponent;
/** Delay node. */
export const DelayNode = DelayNodeComponent;
/** Ai node. */
export const AINode = AINodeComponent;
/** Start node. */
export const StartNode = StartNodeComponent;
/** End node. */
export const EndNode = EndNodeComponent;
/** Wait for reply node. */
export const WaitForReplyNode = WaitForReplyNodeComponent;

// Node type registry for ReactFlow. Keep this as one stable module-level object;
// ReactFlow warns and can rerender heavily when nodeTypes changes identity.
export const nodeTypes = Object.freeze({
  message: MessageNodeComponent,
  condition: ConditionNodeComponent,
  action: ActionNodeComponent,
  input: InputNodeComponent,
  delay: DelayNodeComponent,
  ai: AINodeComponent,
  start: StartNodeComponent,
  end: EndNodeComponent,
  waitForReply: WaitForReplyNodeComponent,
});
