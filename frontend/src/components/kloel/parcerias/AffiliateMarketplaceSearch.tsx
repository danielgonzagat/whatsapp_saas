'use client';
import { colors } from '@/lib/design-tokens';

import { useState } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { affiliateApi } from '@/lib/api/affiliate';
import type { AffiliateSuggestion } from './partnershipTypes';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';

export default function AffiliateMarketplaceSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<AffiliateSuggestion[] | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const res = await affiliateApi.aiSearch(searchQuery.trim());
      setSearchResults(res.data?.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSave = async (productId: string) => {
    setSaving((prev) => ({ ...prev, [productId]: true }));
    try {
      await affiliateApi.saveProduct(productId);
    } catch {
      // ignore
    } finally {
      setSaving((prev) => ({ ...prev, [productId]: false }));
    }
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16 }}>
      <div style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: C.secondary, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
        {kloelT(`Buscar no Marketplace`)}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input aria-label="Buscar no marketplace por categoria ou tag" type="text"
          value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          placeholder={kloelT(`Buscar por categoria ou tag...`)}
          style={{ flex: 1, padding: '10px 12px', background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: FONT.sans, fontSize: 13, outline: 'none' }}
          onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = C.ember; }}
          onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = C.border; }}
        />
        <button type="button" onClick={handleSearch} disabled={!searchQuery.trim() || searchLoading}
          style={{ padding: '10px 14px', background: C.ember, border: 'none', borderRadius: 6, color: colors.text.silver, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, cursor: !searchQuery.trim() || searchLoading ? 'not-allowed' : 'pointer', opacity: !searchQuery.trim() || searchLoading ? 0.5 : 1 }}>
          {IC.search(14)}
        </button>
      </div>
      {searchResults !== null && (
        searchResults.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {searchResults.map((p) => (
              <div key={p.id}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: C.elevated, borderRadius: 6 }}>
                <div>
                  <div style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: C.text }}>{p.productId}</div>
                  <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.ember }}>{p.commissionPct}{kloelT(`% —`)} {p.category || 'Geral'}</div>
                </div>
                <button type="button" onClick={() => handleSave(p.id)} disabled={saving[p.id]}
                  style={{ padding: '6px 12px', background: 'none', border: `1px solid ${C.ember}`, borderRadius: 6, color: C.ember, fontFamily: FONT.sans, fontSize: 11, cursor: saving[p.id] ? 'wait' : 'pointer' }}>
                  {saving[p.id] ? '...' : 'Salvar'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: FONT.sans, fontSize: 13, color: C.muted, textAlign: 'center' as const, padding: '16px 0' }}>
            {kloelT(`Nenhum produto encontrado para "`)}{searchQuery}{kloelT(`"`)}
          </div>
        )
      )}
    </div>
  );
}
