/**
 * Canonical BRL currency formatting helpers for the frontend.
 *
 * Phase F+J of the canonicalization mission. Consolidates `formatCurrency`
 * implementations that share semantics; intentionally divergent variants
 * (different null/empty handling) keep their local form with a note.
 */

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

/**
 * Format a numeric amount as `R$ X,YZ` (pt-BR conventions, 2 decimal places).
 *
 * Null/undefined/NaN coerce to `0`. Use when the field is always shown
 * (dashboards, totals). For nullable display (return `''` on missing),
 * see `formatBRLOptional`.
 */
export function formatBRL(value: number | null | undefined): string {
  return BRL_FORMATTER.format(Number(value ?? 0));
}

/**
 * Format a BRL amount, returning `''` when the input is not a finite number.
 *
 * Use in form previews and editable fields where empty input must not
 * display `R$ 0,00`.
 */
export function formatBRLOptional(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '';
  }
  return BRL_FORMATTER.format(value);
}

/**
 * Back-compat alias kept for the two identical legacy callers
 * (`cia/utils.ts`, `cia/page.helpers.ts`). New code MUST use `formatBRL`.
 *
 * @deprecated use `formatBRL`.
 */
export const formatCurrency = formatBRL;

/**
 * Format an integer **cents** amount as `R$ X,YZ` using the manual
 * `(cents / 100).toFixed(2)` + `.`→`,` substitution.
 *
 * Consolidates four byte-identical local copies (`OrderBumpCard`,
 * `upsell.helpers`, `PlanOrderBumpTab`, `PlanAffiliateTab`). Distinct from
 * `formatBRL`/`formatMoney`, which take reais and use `Intl.NumberFormat`.
 */
export function formatBRLFromCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/**
 * Format a reais amount as `R$ X,YZ` via `Number.toLocaleString`. Returns
 * `R$ 0,00` for null/undefined/NaN. Consolidates two byte-identical settings
 * copies (`billing-settings-section.helpers`, `crm-settings-section.helpers`).
 *
 * Intentionally NOT folded into `formatBRL`: the NaN handling differs
 * (`formatBRL(NaN)` yields `R$ NaN`, this yields `R$ 0,00`).
 */
export function formatMoney(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'R$ 0,00';
  }
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
