'use client';

import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { IC, TYPE_CONFIG, STATUS_LABEL } from './carteira.config';
import { buildCsvBlob } from './carteira.helpers';
import type { TransactionItem } from './carteira.types';

export default function CarteiraExtratoTable({
  txList,
  filterType,
  onFilterTypeChange,
  search,
  onSearchChange,
}: {
  txList: TransactionItem[];
  filterType: string;
  onFilterTypeChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const { isMobile } = useResponsiveViewport();
  const filtered = txList.filter((t) => {
    if (filterType !== 'todos' && t.type !== filterType) {
      return false;
    }
    if (search && !t.desc.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: '8px 14px',
          }}
        >
          <span style={{ color: 'var(--app-text-tertiary)' }}>{IC.search(14)}</span>
          <input
            aria-label="Buscar transacao"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={kloelT(`Buscar transacao...`)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--app-text-primary)',
              fontSize: 12,
              fontFamily: "'Sora',sans-serif",
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['todos', 'sale', 'commission', 'withdrawal', 'refund', 'anticipation'].map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => onFilterTypeChange(f)}
              style={{
                padding: '7px 12px',
                background: filterType === f ? 'var(--app-bg-card)' : 'colors.ember.primary',
                border: '1px solid colors.ember.primary',
                borderRadius: 6,
                color: filterType === f ? 'colors.ember.primary' : 'var(--app-text-on-accent)',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Sora',sans-serif",
              }}
            >
              {f === 'todos' ? 'Todos' : TYPE_CONFIG[f]?.label || f}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            if (!filtered.length) {
              return;
            }
            const rows = filtered.map((t) => ({
              id: t.id,
              tipo: TYPE_CONFIG[t.type]?.label || t.type,
              descricao: t.desc,
              valor: t.amount,
              status: STATUS_LABEL[t.status] || t.status,
              metodo: t.method,
              data: t.date,
              hora: t.time,
              taxa: t.fee,
            }));
            const headers = Object.keys(rows[0]);
            const blob = buildCsvBlob(headers, rows);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `carteira-extrato-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}
          style={{
            padding: '7px 12px',
            background: 'none',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-secondary)',
            fontSize: 10,
            cursor: 'pointer',
            fontFamily: "'Sora',sans-serif",
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {IC.download(10)} CSV
        </button>
      </div>

      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--app-text-tertiary)' }}>
              {kloelT(`Nenhuma transacao encontrada`)}
            </span>
          </div>
        ) : (
          filtered.map((t, i) => {
            const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.sale;
            return (
              <div
                key={t.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '36px 2fr 0.8fr 0.6fr 1fr 0.6fr',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom:
                    i < filtered.length - 1 ? '1px solid var(--app-border-subtle)' : 'none',
                  alignItems: 'center',
                  transition: 'background .1s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--app-bg-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: `${cfg.color}12`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: cfg.color,
                  }}
                >
                  {cfg.icon(14)}
                </div>
                <div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--app-text-primary)',
                      display: 'block',
                    }}
                  >
                    {t.desc}
                  </span>
                  {t.fee > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                      {kloelT(`Taxa: R$`)}{' '}
                      {Math.abs(t.fee).toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: cfg.color,
                    background: `${cfg.color}12`,
                    padding: '3px 8px',
                    borderRadius: 4,
                    textTransform: 'uppercase',
                    fontFamily: "'JetBrains Mono',monospace",
                    textAlign: isMobile ? 'left' : 'center',
                    justifySelf: isMobile ? 'flex-start' : undefined,
                  }}
                >
                  {cfg.label}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: STATUS_COLOR[t.status],
                    fontFamily: "'JetBrains Mono',monospace",
                  }}
                >
                  {STATUS_LABEL[t.status]}
                </span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 14,
                    fontWeight: 600,
                    color: t.amount > 0 ? cfg.color : 'var(--app-text-secondary)',
                  }}
                >
                  {t.amount > 0 ? '+' : ''}
                  {kloelT(`R$`)}{' '}
                  {Math.abs(t.amount).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                  {t.date}
                  <br />
                  {t.time}
                </span>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

const STATUS_COLOR: Record<string, string> = {
  completed: 'colors.ember.primary',
  pending: '#F59E0B',
  processing: '#3B82F6',
  failed: '#EF4444',
};
