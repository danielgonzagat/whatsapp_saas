'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import { ConversationsIcon } from '../sidebar/ConversationsIcon';
import { DIVIDER, MUTED, SURFACE, TEXT } from './conversations-utils';

interface ConversationsEmptyProps {
  hasQuery: boolean;
}

/** Conversations empty. */
export function ConversationsEmpty({ hasQuery }: ConversationsEmptyProps) {
  return (
    <div
      style={{
        minHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        textAlign: 'center',
        borderRadius: 6,
        border: `1px dashed ${DIVIDER}`,
        background: KLOEL_THEME.bgSecondary,
        padding: '32px 24px',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 6,
          background: SURFACE,
          border: `1px solid ${DIVIDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ConversationsIcon size={20} color={TEXT} aria-hidden />
      </div>
      <div style={{ maxWidth: 420 }}>
        <h2
          style={{
            margin: '0 0 8px',
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          {hasQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa registrada ainda'}
        </h2>
        <p
          style={{
            margin: 0,
            color: MUTED,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {hasQuery
            ? 'Refine a busca ou abra um novo chat para começar outra thread.'
            : 'Abra um novo chat para iniciar a primeira thread e o histórico aparecerá aqui.'}
        </p>
      </div>
    </div>
  );
}
