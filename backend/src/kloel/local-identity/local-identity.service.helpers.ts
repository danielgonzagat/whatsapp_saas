/**
 * Barrel re-export for the local-identity helper module. The implementation
 * lives in themed sibling files (`.tokens.ts` for tokenisation/aggregation
 * primitives, `.derivations.ts` for SpineEvent → DerivedX projections) so each
 * stays under the 400-LOC gate. Importers must keep using this path.
 */
export {
  extractMessageTokens,
  hourFromTimestamp,
  median,
  OPERATOR_FEEDBACK_DECISION_SLOT_COUNT,
  OPERATOR_FEEDBACK_NEXT_STEP_PREFIX,
  OPERATOR_FEEDBACK_REPETITION_THRESHOLD,
  parseTimestamp,
  PEAK_HOURS_COUNT,
  TOP_N,
  tokenize,
  toneFromValenceMix,
  VOCABULARY_STOP_WORDS,
  VOCABULARY_TOP_N,
} from './local-identity.service.helpers.tokens';

export {
  deriveCustomer,
  deriveDecisionPatterns,
  deriveLanguage,
  deriveOperational,
  deriveProduct,
  deriveTemporal,
} from './local-identity.service.helpers.derivations';
