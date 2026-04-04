import { describe, expect, it } from 'vitest';

import {
  formatConversationSearchDateLabel,
  formatConversationSearchTime,
  groupConversationSearchResults,
  highlightPlainText,
  sanitizeMarkedHtml,
} from './conversation-search-utils';

describe('conversation search utils', () => {
  it('keeps only mark tags when sanitizing highlighted previews', () => {
    expect(sanitizeMarkedHtml('<mark>API</mark> <script>alert(1)</script>')).toBe(
      '<mark>API</mark> &lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('highlights plain text matches with mark tags', () => {
    expect(highlightPlainText('Webhook do WhatsApp', 'whats')).toContain('<mark>Whats</mark>');
  });

  it('formats relative date labels in pt-BR', () => {
    const now = new Date('2026-04-04T12:00:00.000Z');

    expect(formatConversationSearchDateLabel('2026-04-04T10:00:00.000Z', now)).toBe('Hoje');
    expect(formatConversationSearchDateLabel('2026-04-03T10:00:00.000Z', now)).toBe('Ontem');
    expect(formatConversationSearchDateLabel('2026-04-01T10:00:00.000Z', now)).toBe('1 abr');
  });

  it('groups results by formatted date label', () => {
    const groups = groupConversationSearchResults(
      [
        { id: '1', title: 'A', updatedAt: '2026-04-04T10:00:00.000Z' },
        { id: '2', title: 'B', updatedAt: '2026-04-04T08:00:00.000Z' },
        { id: '3', title: 'C', updatedAt: '2026-04-03T08:00:00.000Z' },
      ],
      new Date('2026-04-04T12:00:00.000Z'),
    );

    expect(groups).toEqual([
      {
        label: 'Hoje',
        items: [
          { id: '1', title: 'A', updatedAt: '2026-04-04T10:00:00.000Z' },
          { id: '2', title: 'B', updatedAt: '2026-04-04T08:00:00.000Z' },
        ],
      },
      {
        label: 'Ontem',
        items: [{ id: '3', title: 'C', updatedAt: '2026-04-03T08:00:00.000Z' }],
      },
    ]);
  });

  it('formats times in pt-BR 24h clock', () => {
    expect(formatConversationSearchTime('2026-04-04T14:32:00.000Z')).toMatch(/14:32|11:32/);
  });
});
