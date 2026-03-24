'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { colors } from '@/lib/design-tokens';

interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, pageSize = 12, onPageChange }: PaginationProps) {
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
            color: colors.text.dust,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Mostrando {start}-{end} de {total}
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: `1px solid ${colors.border.space}`,
            background: colors.background.space,
            color: page <= 1 ? colors.text.void : colors.text.moonlight,
            cursor: page <= 1 ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 150ms',
          }}
        >
          <ChevronLeft size={14} />
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
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: isActive ? `1px solid ${colors.accent.webb}` : `1px solid ${colors.border.space}`,
                background: isActive ? 'rgba(78, 122, 224, 0.12)' : colors.background.space,
                color: isActive ? colors.accent.webb : colors.text.moonlight,
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                fontFamily: "'DM Sans', sans-serif",
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
            >
              {pageNum}
            </button>
          );
        })}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: `1px solid ${colors.border.space}`,
            background: colors.background.space,
            color: page >= totalPages ? colors.text.void : colors.text.moonlight,
            cursor: page >= totalPages ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 150ms',
          }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
