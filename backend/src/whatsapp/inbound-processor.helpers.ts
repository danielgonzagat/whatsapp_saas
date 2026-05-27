/**
 * @deprecated Moved to `backend/src/marketing/channels/whatsapp/inbound-processor.helpers.ts`.
 * This re-export stub preserves the legacy import path while consumers migrate.
 * Update your imports to `../marketing/channels/whatsapp/inbound-processor.helpers`.
 */
export {
  getDefaultContent,
  mapMessageType,
  checkDuplicateExt,
  isWorkspaceSelfInboundExt,
  isAutonomousEnabledExt,
  shouldUseInlineReactiveProcessingExt,
  shouldForceLiveAutonomyFallbackExt,
  shouldBypassHumanLockExt,
  shouldAutoReclaimHumanLockExt,
  buildInlineFallbackReplyExt,
  hasOutboundActionExt,
  buildPendingInboundBatchExt,
} from '../marketing/channels/whatsapp/inbound-processor.helpers';
export type {
  InboundIngestMode,
  InboundMessage,
  ProcessDeps,
} from '../marketing/channels/whatsapp/inbound-processor.helpers';
