'use client';

import { kloelT } from '@/lib/i18n/t';
import { Search } from 'lucide-react';

/** Empty/placeholder state shown when there are no results to render. */
export function CommandPaletteEmpty({ hasQuery, query }: { hasQuery: boolean; query: string }) {
  return (
    <div className="kloel-search-empty">
      <div className="kloel-search-result-icon" aria-hidden="true">
        <Search size={18} aria-hidden="true" />
      </div>
      <div className="kloel-search-empty-title">
        {hasQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa recente'}
      </div>
      <div className="kloel-search-empty-copy">
        {hasQuery
          ? `Nada apareceu para “${query.trim()}”. Tenta outro termo ou uma palavra que esteja no conteúdo da conversa.`
          : 'Assim que você conversar com a Kloel, os históricos aparecem aqui para busca imediata.'}
      </div>
    </div>
  );
}

/** Keyboard hints + result count rendered in the modal footer. */
export function CommandPaletteFooter({ footerLabel }: { footerLabel: string }) {
  return (
    <div className="kloel-search-footer">
      <div className="kloel-search-hints">
        <span className="kloel-search-hint">
          <span className="kloel-search-pill">{kloelT(`↑↓`)}</span>
          navegar
        </span>
        <span className="kloel-search-hint">
          <span className="kloel-search-pill">↵</span>
          abrir
        </span>
        <span className="kloel-search-hint">
          <span className="kloel-search-pill">esc</span>
          fechar
        </span>
      </div>
      <span className="kloel-search-hint">{footerLabel}</span>
    </div>
  );
}
