/**
 * UTP-LINEAGE wiring — DI tokens.
 *
 * Tokens for injecting interface-typed providers (LineageLedgerRepository
 * has no class identity at runtime).
 */
export const LINEAGE_LEDGER_REPOSITORY = Symbol('LINEAGE_LEDGER_REPOSITORY');
