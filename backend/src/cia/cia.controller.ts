/**
 * @deprecated ADR-0013 Wave M4 — the canonical home for CiaController is
 * `backend/src/kloel/mind/cia/cia.controller.ts`. This file is a temporary
 * re-export shim kept during the 4-week alias window. Update imports to
 * `@/kloel/mind/cia/cia.controller` or the barrel `@/kloel/mind/cia`.
 *
 * @see docs/adr/0013-kloel-mind-unification.md
 * @see docs/architecture/DEPRECATION_MAP.md
 */
export { CiaController } from '../kloel/mind/cia/cia.controller';
