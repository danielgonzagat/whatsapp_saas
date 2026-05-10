export type {
  BusinessStateSnapshot,
  CommercialDecisionEnvelope,
  DemandLane,
  DemandState,
  DemandStrategy,
  HumanTaskPayload,
  MarketSignal,
  NextAction,
  ResponseTone,
  RuntimeMode,
} from './commercial-intelligence.types';

export { computeDemandState, buildDecisionEnvelope, shouldAutonomousSend } from './commercial-intelligence.core';
export { extractMarketSignals } from './commercial-intelligence.signals';
export { buildHumanTask, buildBusinessStateSnapshot, buildMissionPlan } from './commercial-intelligence.tasks';
export {
  persistDemandState,
  persistMarketSignals,
  persistBusinessSnapshot,
  persistHumanTask,
  persistSystemInsight,
} from './commercial-intelligence.persistence';
