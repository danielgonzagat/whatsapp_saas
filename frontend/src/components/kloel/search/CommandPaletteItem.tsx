'use client';

import DOMPurify from 'dompurify';
import { ArrowRight } from 'lucide-react';
import { forwardRef } from 'react';
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
  if (!hasQuery) return sanitizeMarkedHtml(rawPreview);
  return rawPreview.includes('<mark>')
    ? sanitizeMarkedHtml(rawPreview)
    : highlightPlainText(rawPreview, query);
}

export const CommandPaletteItem = forwardRef<HTMLButtonElement, CommandPaletteItemProps>(
  function CommandPaletteItem(
    { item, isSelected, hasQuery, query, groupLabel, onHover, onSelect },
    ref,
  ) {
    // Both markup sources are sanitized with DOMPurify before being set as innerHTML.
    // highlightPlainText and sanitizeMarkedHtml both produce known-safe markup.
    const titleMarkup = buildTitleMarkup(item, hasQuery, query);
    const previewMarkup = buildPreviewMarkup(item, hasQuery, query);
    const sanitizedTitle = DOMPurify.sanitize(titleMarkup);
    const sanitizedPreview = DOMPurify.sanitize(previewMarkup);

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
          <p
            className="kloel-search-result-title"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via DOMPurify above
            dangerouslySetInnerHTML={{ __html: sanitizedTitle }}
          />
          <p
            className="kloel-search-result-preview"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via DOMPurify above
            dangerouslySetInnerHTML={{ __html: sanitizedPreview }}
          />
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
