/**
 * @deprecated Use `backend/src/kloel/mind/cia/cia-send-helpers.service` directly.
 *   Per ADR-0013 Wave M4 (DEPRECATION_MAP row #28 — CIA learning adapter
 *   canonicalization). Sunset 2026-06-24.
 *
 * This file remains as a thin re-export shim during the 4-week alias window
 * so external callers (whatsapp/cia-remote-backlog.helpers.ts, peer cia/*
 * services, cia.module.ts) keep building while the rest of the cia/ folder
 * is incrementally migrated to `kloel/mind/cia/`.
 *
 * @canonical backend/src/kloel/mind/cia/cia-send-helpers.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export {
  CiaSendHelpersService,
  CIA_SHARED_REPLY_LOCK_MS,
  WHITESPACE_RE,
} from '../kloel/mind/cia/cia-send-helpers.service';
