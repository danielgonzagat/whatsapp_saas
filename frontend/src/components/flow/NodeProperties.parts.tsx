'use client';

/**
 * Barrel re-export for NodeProperties per-type field renderers.
 *
 * The implementations were split into sibling files to keep each module under
 * the architecture guardrail line cap. This file preserves the original public
 * surface so existing imports keep working.
 */

export type { NodeFieldsProps } from './NodeProperties.types';
export {
  ConditionFields,
  DelayFields,
  InputFields,
  MessageFields,
  StartFields,
} from './NodeProperties.flow.parts';
export { ActionFields, AiFields } from './NodeProperties.action.parts';
export { EndFields, UnknownFields, WaitForReplyFields } from './NodeProperties.terminal.parts';
