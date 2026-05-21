export { CONVERSATION_HISTORY_LIMIT } from './cognition-context';
export {
  fetchConversationHistory,
  fetchCompressedContactContext,
  getKbContext,
  generateAutonomousFallbackResponse,
} from './cognition-context';
export {
  generatePitchSafe,
  computePersistentCognitiveState,
  computeCognitiveRewardSignal,
  decideActionSafe,
} from './cognition-decision';
export {
  buildCognitiveMessage,
  normalizeAutonomyLedgerValue,
  buildAutonomyExecutionKey,
  isAutonomyExecutionDuplicate,
  beginAutonomyExecution,
  finishAutonomyExecution,
} from './cognition-log';
export {
  dispatchAutonomousTextMessage,
  normalizeOutboundMessageForDedupe,
  findRecentDuplicateOutbound,
  dispatchAutonomousReplyPlan,
  buildQuotedReplyPlan,
} from './cognition-reply';
