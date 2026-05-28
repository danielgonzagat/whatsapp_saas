/**
 * Barrel re-export for {@link AdminCarteiraController} pure helpers.
 *
 * The original single-file helper grew past the 400-LOC governance threshold
 * (Gate-fix2-A), so it was decomposed into four themed modules. This file
 * preserves the legacy public API — every symbol previously exported from
 * `./admin-carteira.controller.helpers` is still re-exported here, so callers
 * never need to update their import paths.
 *
 * Themed submodules:
 *  - `./admin-carteira.controller.helpers.validation` — query/body parsing
 *  - `./admin-carteira.controller.helpers.fraud-blacklist` — blacklist mapping
 *  - `./admin-carteira.controller.helpers.payout-audit` — audit row shaping
 *  - `./admin-carteira.controller.helpers.connect-treasury` — connect/treasury
 */

export * from './admin-carteira.controller.helpers.validation';
export * from './admin-carteira.controller.helpers.fraud-blacklist';
export * from './admin-carteira.controller.helpers.payout-audit';
export * from './admin-carteira.controller.helpers.connect-treasury';
