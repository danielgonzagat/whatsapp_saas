const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Format numeric BRL amount for user-facing output. */
export function formatBrlAmount(amount: number) {
  const normalized = Number.isFinite(amount) ? amount : 0;
  return BRL_FORMATTER.format(normalized);
}
