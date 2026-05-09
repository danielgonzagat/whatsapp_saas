import { Calendar, Pencil, Trash2 } from 'lucide-react';

import { colors } from '@/lib/design-tokens';

import { formatDate, statusColor, statusLabel, StatusIcon } from './utils';
import type { Webinar } from './types';

interface WebinarCardProps {
  webinar: Webinar;
  onView: (webinar: Webinar) => void;
  onEdit: (webinar: Webinar) => void;
  onDelete: (id: string) => void;
}

export default function WebinarCard({ webinar, onView, onEdit, onDelete }: WebinarCardProps) {
  const statusCol = statusColor(webinar.status);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onView(webinar)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onView(webinar);
        }
      }}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8,
        padding: 20,
        cursor: 'pointer',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(232, 93, 48, 0.3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <h3
          style={{
            color: 'var(--app-text-primary)',
            fontSize: 15,
            fontWeight: 600,
            margin: 0,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {webinar.title}
        </h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
            marginLeft: 8,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: `${statusCol}18`,
              color: statusCol,
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 4,
            }}
          >
            <StatusIcon status={webinar.status} />
            {statusLabel(webinar.status)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(webinar);
            }}
            title="Editar"
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4,
              padding: '4px 6px',
              cursor: 'pointer',
              color: colors.text.muted,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Pencil size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(webinar.id);
            }}
            title="Deletar"
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4,
              padding: '4px 6px',
              cursor: 'pointer',
              color: colors.ember.primary,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Trash2 size={12} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: colors.text.muted,
          fontSize: 12,
          marginBottom: 6,
        }}
      >
        <Calendar size={12} aria-hidden="true" />
        {formatDate(webinar.date)}
      </div>
      {webinar.description && (
        <p style={{ color: colors.text.muted, fontSize: 12, margin: 0, lineHeight: 1.5, marginTop: 4 }}>
          {webinar.description.length > 100
            ? `${webinar.description.slice(0, 100)}...`
            : webinar.description}
        </p>
      )}
      <div
        style={{
          color: colors.text.muted,
          fontSize: 11,
          marginTop: 8,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {webinar.url}
      </div>
    </div>
  );
}
