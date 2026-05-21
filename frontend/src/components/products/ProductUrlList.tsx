'use client';
import { colors, typography } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { ExternalLink, Globe, Pencil, Trash2 } from 'lucide-react';
import { AI_LEARN_BADGES, PRODUCT_URLS_COPY } from './ProductUrlsTab.constants';
import type { ProductUrlItem } from './ProductUrlForm';

export function ProductUrlList({
  items,
  onDelete,
}: {
  items: ProductUrlItem[];
  onDelete: (item: ProductUrlItem) => void;
}) {
  const labelStyle: React.CSSProperties = {
    fontFamily: typography.fontFamily.display,
    fontSize: '11px',
    fontWeight: 600,
    color: colors.text.dust,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  };
  const cardStyle: React.CSSProperties = {
    background: colors.background.space,
    border: `1px solid ${colors.border.space}`,
    borderRadius: '6px',
  };

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl py-12"
        style={{ ...cardStyle }}
      >
        <Globe className="h-10 w-10 mb-3" style={{ color: colors.text.void }} aria-hidden="true" />
        <p className="text-sm" style={{ color: colors.text.dust }}>
          {kloelT(`Nenhuma URL cadastrada`)}
        </p>
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-xl"
      style={{ border: `1px solid ${colors.border.space}` }}
    >
      <table className="w-full text-left text-sm">
        <thead
          style={{
            background: colors.background.nebula,
            borderBottom: `1px solid ${colors.border.space}`,
          }}
        >
          <tr>
            {[
              'Descrição',
              'URL Destino',
              'Privado',
              'Status',
              'Vendas',
              'IA Aprende',
              'Chat',
              'Ações',
            ].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-xs font-semibold uppercase"
                style={{ ...labelStyle, padding: '12px 16px' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr
              key={row.id}
              style={{
                background: i % 2 === 0 ? colors.background.space : colors.background.void,
                borderBottom: `1px solid ${colors.border.void}`,
              }}
            >
              <td
                className="px-4 py-3 text-sm font-medium"
                style={{ color: colors.text.starlight }}
              >
                {row.description}
              </td>
              <td className="px-4 py-3">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-1 text-xs truncate max-w-[200px] hover:underline"
                  style={{ color: colors.accent.webb }}
                >
                  {row.url}{' '}
                  <ExternalLink className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                </a>
              </td>
              <td className="px-4 py-3">
                <span
                  className="text-xs font-medium"
                  style={{ color: row.isPrivate ? colors.text.starlight : colors.text.dust }}
                >
                  {row.isPrivate ? PRODUCT_URLS_COPY.yes : PRODUCT_URLS_COPY.no}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    background: row.active
                      ? `${colors.state.success}20`
                      : `${colors.state.error}20`,
                    color: row.active ? colors.state.success : colors.state.error,
                  }}
                >
                  {row.active ? PRODUCT_URLS_COPY.active : PRODUCT_URLS_COPY.inactive}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    background: `${colors.state.success}20`,
                    color: colors.state.success,
                  }}
                >
                  {row.salesFromUrl || 0}
                </span>
              </td>
              <td className="px-4 py-3">
                {!row.aiLearning ? (
                  <span className="text-xs" style={{ color: colors.text.dust }}>
                    {PRODUCT_URLS_COPY.aiOff}
                  </span>
                ) : (
                  (() => {
                    const b =
                      AI_LEARN_BADGES[row.aiLearnStatus || 'pending'] ||
                      AI_LEARN_BADGES.pending;
                    return (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: b.bg, color: b.text }}
                      >
                        {b.label}
                        {row.aiLearnStatus === 'learned' && ' \u2713'}
                      </span>
                    );
                  })()
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className="text-xs font-medium"
                  style={{ color: row.chatEnabled ? colors.accent.webb : colors.text.dust }}
                >
                  {row.chatEnabled ? PRODUCT_URLS_COPY.chatOn : PRODUCT_URLS_COPY.chatOff}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="rounded-full p-1.5 transition-colors"
                    style={{ background: `${colors.accent.webb}15`, color: colors.accent.webb }}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(row)}
                    aria-label={PRODUCT_URLS_COPY.deleteUrlAria}
                    className="rounded-full p-1.5 transition-colors"
                    style={{ background: `${colors.state.error}15`, color: colors.state.error }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
