/**
 * Barrel re-export for connect.service helpers. The implementation is split
 * across two focused modules to keep each file under the 400-LOC governance
 * gate while preserving the historical public API for callers and tests:
 *
 *   - `connect.service.helpers.payloads` — pure projection helpers that
 *     transform Kloel inputs into Stripe snake_case payload fragments
 *     (`compactObject`, `buildAddress`, `buildBusinessProfile`,
 *     `buildIndividualProfile`, `buildCompanyProfile`, `buildExternalAccount`,
 *     `buildTosAcceptance`, `buildMetadata`,
 *     `CONNECT_REQUESTED_CAPABILITIES`).
 *   - `connect.service.helpers.account` — account-level orchestration
 *     helpers and the Stripe `accounts.retrieve` projection
 *     (`buildOnboardingAccountUpdate`, `buildCreateCustomAccountPayload`,
 *     `stripManualPayoutSchedule`, `shouldRetryWithoutManualPayoutSchedule`,
 *     `projectOnboardingStatus`, `OnboardingStatusProjectionInput`,
 *     `ProjectedOnboardingStatus`).
 */
export {
  buildAddress,
  buildBusinessProfile,
  buildCompanyProfile,
  buildExternalAccount,
  buildIndividualProfile,
  buildMetadata,
  buildTosAcceptance,
  compactObject,
  CONNECT_REQUESTED_CAPABILITIES,
} from './connect.service.helpers.payloads';

export {
  buildCreateCustomAccountPayload,
  buildOnboardingAccountUpdate,
  projectOnboardingStatus,
  shouldRetryWithoutManualPayoutSchedule,
  stripManualPayoutSchedule,
  type OnboardingStatusProjectionInput,
  type ProjectedOnboardingStatus,
} from './connect.service.helpers.account';
