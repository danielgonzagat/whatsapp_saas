/**
 * Concatenated intent-pattern catalogue.
 *
 * The catalogue is split into four thematic chunks (core, products, commerce,
 * engagement) for grep-friendliness and independent testability; the runtime
 * order is preserved here so `INTENT_PATTERNS` stays bytewise-equivalent to the
 * legacy monolithic export.
 */

import type { IntentPattern } from '../intent-router.parsers';
import { CORE_INTENT_PATTERNS } from './catalog.core';
import { PRODUCT_INTENT_PATTERNS } from './catalog.products';
import { COMMERCE_INTENT_PATTERNS } from './catalog.commerce';
import { ENGAGEMENT_INTENT_PATTERNS } from './catalog.engagement';

export const INTENT_PATTERNS: IntentPattern[] = [
  ...CORE_INTENT_PATTERNS,
  ...PRODUCT_INTENT_PATTERNS,
  ...COMMERCE_INTENT_PATTERNS,
  ...ENGAGEMENT_INTENT_PATTERNS,
];
