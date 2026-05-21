'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors, typography } from '@/lib/design-tokens';
import { Pencil } from 'lucide-react';

interface ReviewItem {
  label: string;
  value: string;
  highlight?: boolean;
}

export function ReviewSection({
  title,
  onEdit,
  items,
}: {
  title: string;
  onEdit: () => void;
  items: ReviewItem[];
}) {
  return (
    <div
      style={{
        marginBottom: 20,
        padding: 20,
        borderRadius: 6,
        backgroundColor: colors.background.nebula,
        border: `1px solid ${colors.border.space}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            fontFamily: typography.fontFamily.display,
            color: colors.text.starlight,
            margin: 0,
          }}
        >
          {title}
        </h3>
        <button
          type="button"
          onClick={onEdit}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontWeight: 500,
            color: colors.accent.webb,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: typography.fontFamily.sans,
          }}
        >
          <Pencil style={{ width: 12, height: 12 }} aria-hidden="true" />
          {kloelT('Editar')}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 0',
              borderBottom: `1px solid ${colors.border.void}`,
            }}
          >
            <span
              style={{
                fontSize: 13,
                color: colors.text.dust,
                fontFamily: typography.fontFamily.sans,
              }}
            >
              {item.label}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: item.highlight ? 700 : 500,
                color: item.highlight ? colors.accent.webb : colors.text.starlight,
                fontFamily: typography.fontFamily.sans,
                maxWidth: '60%',
                textAlign: 'right',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.value || '\u2014'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
