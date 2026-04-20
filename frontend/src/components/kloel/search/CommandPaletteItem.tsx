'use client';

import { ArrowRight } from 'lucide-react';
import { type ReactNode, forwardRef } from 'react';
import { ConversationsIcon } from '../sidebar/ConversationsIcon';
import {
  type ConversationSearchResult,
  formatConversationSearchTime,
  highlightPlainText,
  sanitizeMarkedHtml,
} from './conversation-search-utils';

interface CommandPaletteItemProps {
  item: ConversationSearchResult;
  isSelected: boolean;
  hasQuery: boolean;
  query: string;
  groupLabel: string;
  onHover: () => void;
  onSelect: () => void;
}

function buildTitleMarkup(item: ConversationSearchResult, hasQuery: boolean, query: string) {
  return hasQuery ? highlightPlainText(item.title, query) : sanitizeMarkedHtml(item.title);
}

function buildPreviewMarkup(item: ConversationSearchResult, hasQuery: boolean, query: string) {
  const rawPreview = item.previewHtml || item.matchedContent || item.title;
  if (!hasQuery) {
    return sanitizeMarkedHtml(rawPreview);
  }
  return rawPreview.includes('<mark>')
    ? sanitizeMarkedHtml(rawPreview)
    : highlightPlainText(rawPreview, query);
}

function decodeHtmlEntities(value: string): string {
  if (typeof document === 'undefined') {
    return value;
  }

  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function renderMarkedMarkup(markup: string): ReactNode[] {
  const parts = markup.split(/(<mark>.*?<\/mark>)/g).filter(Boolean);
  const seen = new Map<string, number>();

  return parts.map((part) => {
    const isMarked = part.startsWith('<mark>') && part.endsWith('</mark>');
    const keyBase = `${isMarked ? 'mark' : 'text'}-${part}`;
    const occurrence = (seen.get(keyBase) || 0) + 1;
    seen.set(keyBase, occurrence);

    if (isMarked) {
      return <mark key={`${keyBase}-${occurrence}`}>{decodeHtmlEntities(part.slice(6, -7))}</mark>;
    }

    return <span key={`${keyBase}-${occurrence}`}>{decodeHtmlEntities(part)}</span>;
  });
}

/** Command palette item. */
export const CommandPaletteItem = forwardRef<HTMLButtonElement, CommandPaletteItemProps>(
  function CommandPaletteItem(
    { item, isSelected, hasQuery, query, groupLabel, onHover, onSelect },
    ref,
  ) {
    const titleMarkup = buildTitleMarkup(item, hasQuery, query);
    const previewMarkup = buildPreviewMarkup(item, hasQuery, query);

    return (
      <button
        ref={ref}
        type="button"
        className="kloel-search-result"
        data-selected={isSelected}
        onMouseEnter={onHover}
        onClick={onSelect}
      >
        <div className="kloel-search-result-icon" aria-hidden="true">
          <ConversationsIcon size={16} color="currentColor" />
        </div>

        <div style={{ minWidth: 0 }}>
          <p className="kloel-search-result-title">{renderMarkedMarkup(titleMarkup)}</p>
          <p className="kloel-search-result-preview">{renderMarkedMarkup(previewMarkup)}</p>
          {hasQuery && item.tags && item.tags.length > 0 && (
            <div className="kloel-search-tags">
              {item.tags.map((tag) => (
                <span key={`${item.id}-${tag}`} className="kloel-search-tag">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="kloel-search-meta">
          <span>{formatConversationSearchTime(item.updatedAt) || groupLabel}</span>
          <ArrowRight size={14} className="kloel-search-arrow" aria-hidden="true" />
        </div>
      </button>
    );
  },
);
