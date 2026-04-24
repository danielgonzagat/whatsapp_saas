'use client';

import { FONT_SORA as S } from './canvas-editor.types';
import type { ContextMenuItem } from '@/lib/fabric/ContextMenuManager';

type ContextMenuProps = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function CanvasContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: '#111113',
        border: '1px solid #1C1C1F',
        borderRadius: 6,
        padding: '4px 0',
        minWidth: 180,
        zIndex: 9999,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      {items.map((item, i, arr) => {
        const priorLabels = arr
          .slice(0, i)
          .map((it) => it.label ?? '-')
          .join('|');
        const key = `${item.separator ? 'sep' : (item.label ?? 'item')}::${priorLabels}`;
        return item.separator ? (
          <div key={key} style={{ height: 1, background: '#1C1C1F', margin: '4px 0' }} />
        ) : (
          <button
            type="button"
            key={key}
            onClick={() => {
              if (!item.disabled) {
                item.action();
                onClose();
              }
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: '7px 12px',
              background: 'none',
              border: 'none',
              textAlign: 'left',
              fontSize: 11,
              fontFamily: S,
              cursor: item.disabled ? 'default' : 'pointer',
              color: item.disabled ? '#3A3A3F' : '#E0DDD8',
              transition: 'background 100ms',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                (e.target as HTMLElement).style.background = '#1C1C1F';
              }
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.background = 'none';
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
