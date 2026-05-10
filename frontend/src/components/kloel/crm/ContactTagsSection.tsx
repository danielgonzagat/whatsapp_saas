'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { type KeyboardEvent, useCallback, useState } from 'react';
import { Plus, Tag, X } from 'lucide-react';

interface ContactTagsSectionProps {
  tags: string[];
  onAddTag: (tag: string) => Promise<void>;
  onRemoveTag: (tag: string) => Promise<void>;
}

const C = {
  bg: colors.background.void,
  elevated: colors.background.elevated,
  border: colors.border.space,
  accent: colors.ember.primary,
  text: colors.text.silver,
  muted: colors.text.muted,
  sora: "var(--font-sora), 'Sora', sans-serif",
} as const;

export function ContactTagsSection({ tags, onAddTag, onRemoveTag }: ContactTagsSectionProps) {
  const [tagInput, setTagInput] = useState('');

  const handleAddTag = useCallback(async () => {
    const value = tagInput.trim();
    if (!value) {
      return;
    }
    setTagInput('');
    await onAddTag(value);
  }, [tagInput, onAddTag]);

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: tags.length ? 10 : 0,
        }}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: C.elevated,
              border: `1px solid ${C.border}`,
              borderRadius: 20,
              padding: '3px 10px',
              fontSize: 12,
              color: C.text,
            }}
          >
            <Tag size={10} style={{ color: C.accent }} aria-hidden="true" />
            {tag}
            <button
              type="button"
              onClick={() => onRemoveTag(tag)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: C.muted,
                padding: 0,
                lineHeight: 1,
                display: 'flex',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#FF453A';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = C.muted;
              }}
            >
              <X size={10} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder={kloelT('Nova tag...')}
          style={{
            flex: 1,
            background: C.elevated,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            color: C.text,
            outline: 'none',
            fontFamily: C.sora,
          }}
        />
        <button
          type="button"
          onClick={handleAddTag}
          style={{
            background: C.accent,
            border: 'none',
            borderRadius: 6,
            padding: '6px 10px',
            cursor: 'pointer',
            color: colors.text.silver,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <Plus size={12} aria-hidden="true" /> {kloelT('Adicionar')}
        </button>
      </div>
    </>
  );
}
