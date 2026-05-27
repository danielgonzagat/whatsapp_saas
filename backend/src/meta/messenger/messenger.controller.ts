/**
 * @deprecated Moved to `backend/src/marketing/channels/messenger/messenger.controller.ts`
 * as part of ADR-0012 OmniCore Wave W3 (channel co-location).
 *
 * This file is a re-export stub kept for backward compatibility with any
 * downstream import that still references `src/meta/messenger/messenger.controller`.
 * HTTP route paths (`meta/messenger/*`) are preserved by the canonical controller.
 * Update consumers to import from `marketing/channels/messenger/messenger.controller`
 * and delete this stub after Wave W4 (verified empty).
 *
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 * @see docs/architecture/DEPRECATION_MAP.md
 */
export { MessengerController } from '../../marketing/channels/messenger/messenger.controller';
