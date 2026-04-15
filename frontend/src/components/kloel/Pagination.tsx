'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize = 12,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total ?? page * pageSize);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 0',
      }}
    >
      {total !== undefined && (
        <span
          style={{
            fontSize: 12,
            color: 'var(--app-text-tertiary)',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          Mostrando {start}-{end} de {total}
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            border: '1px solid var(--app-border-primary)',
            background: 'var(--app-bg-card)',
            color: page <= 1 ? '#3A3A3F' : '#6E6E73',
            cursor: page <= 1 ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 150ms ease',
          }}
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>

        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          let pageNum: number;
          if (totalPages <= 5) {
            pageNum = i + 1;
          } else if (page <= 3) {
            pageNum = i + 1;
          } else if (page >= totalPages - 2) {
            pageNum = totalPages - 4 + i;
          } else {
            pageNum = page - 2 + i;
          }

          const isActive = pageNum === page;

          return (
            <button
              type="button"
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: isActive ? '1px solid #E85D30' : '1px solid #222226',
                background: isActive ? 'rgba(232, 93, 48, 0.06)' : '#111113',
                color: isActive ? '#E85D30' : '#6E6E73',
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                fontFamily: "'Sora', sans-serif",
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              {pageNum}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            border: '1px solid var(--app-border-primary)',
            background: 'var(--app-bg-card)',
            color: page >= totalPages ? '#3A3A3F' : '#6E6E73',
            cursor: page >= totalPages ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 150ms ease',
          }}
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
