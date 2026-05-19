export const METHOD_LABELS: Record<string, string> = {
  CREDIT_CARD: 'Cartão',
  PIX: 'PIX',
  BOLETO: 'Boleto',
};

const INTEGER_FORMATTER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});
const PERCENT_FORMATTER = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function toIsoDateTime(value: Date) {
  return value.toISOString();
}

export function formatInteger(value: number | null | undefined) {
  return INTEGER_FORMATTER.format(Number(value || 0));
}

export function formatCurrency(value: number | null | undefined) {
  return CURRENCY_FORMATTER.format((Number(value || 0) || 0) / 100);
}

export function formatPercent(value: number | null | undefined) {
  return `${PERCENT_FORMATTER.format((Number(value || 0) || 0) * 100)}%`;
}

export function formatDelta(deltaPct: number | null | undefined) {
  if (deltaPct === null || deltaPct === undefined) {
    return 'Sem comparativo anterior';
  }
  const sign = deltaPct >= 0 ? '+' : '';
  return `${sign}${PERCENT_FORMATTER.format(deltaPct)}% vs período anterior`;
}

export function formatRelativeTime(value?: string | null) {
  if (!value) {
    return 'Agora';
  }

  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return 'Agora';
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return 'Agora';
  }
  if (minutes < 60) {
    return `há ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `há ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}
