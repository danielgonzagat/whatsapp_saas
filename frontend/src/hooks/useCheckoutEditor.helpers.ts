/**
 * Barrel for the checkout editor helpers. The original module grew past the
 * 400-LOC gate so it was split into two themed siblings:
 *
 *   - `useCheckoutEditor.helpers.types.ts`       — interfaces + `DEFAULT_CONFIG`
 *   - `useCheckoutEditor.helpers.normalizers.ts` — pure normalizers
 *
 * Every public symbol is re-exported here so the existing import surface
 * (notably `useCheckoutEditor.ts` and `useCheckoutEditor.test.ts`) keeps
 * working without changes.
 */

export {
  DEFAULT_CONFIG,
  type CheckoutConfig,
  type CheckoutOrderBump,
  type CheckoutPixel,
  type CheckoutTestimonial,
  type CheckoutTrustBadge,
  type CheckoutUpsell,
} from './useCheckoutEditor.helpers.types';

export {
  normalizeConfigForEditor,
  normalizeOrderBumpEntry,
  normalizePixelEntry,
  normalizePixelTypeForEditor,
  normalizeTestimonialEntry,
  normalizeTimerTypeForEditor,
  normalizeTrustBadgeEntry,
  normalizeUpsellEntry,
  resolveBumpPrice,
} from './useCheckoutEditor.helpers.normalizers';
