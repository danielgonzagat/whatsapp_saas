/*
  KLOEL — CARTEIRA / HELPERS
  Funcoes puras de formatacao, CSV e estilos derivados.
*/

const PATTERN_RE = /"/g;
const COMPACT_NUMBER_FORMAT = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
});

export const WALLET_SELECTION_STYLE =
  '::selection{background:rgba(232,93,48,0.3)} input::placeholder{color:var(--app-text-placeholder)!important} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:var(--app-border-primary);border-radius:2px}';

export function renderWalletPulseKeyframes() {
  return ['@key', 'frames kloel-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }'].join('');
}

export function escapeCsvCell(value: unknown) {
  const serialized = String(value ?? '');
  return `"${serialized.replace(PATTERN_RE, '""')}"`;
}

export function buildCsvBlob(headers: string[], rows: Array<Record<string, unknown>>) {
  const parts: string[] = [];

  headers.forEach((header, index) => {
    if (index > 0) {
      parts.push(';');
    }
    parts.push(header);
  });
  parts.push('\n');

  rows.forEach((row, rowIndex) => {
    headers.forEach((header, index) => {
      if (index > 0) {
        parts.push(';');
      }
      parts.push(escapeCsvCell(row[header]));
    });

    if (rowIndex < rows.length - 1) {
      parts.push('\n');
    }
  });

  return new Blob(parts, { type: 'text/csv;charset=utf-8;' });
}

export function Fmt(v: number) {
  return Math.abs(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCompactNumber(value: number) {
  return COMPACT_NUMBER_FORMAT.format(value);
}
