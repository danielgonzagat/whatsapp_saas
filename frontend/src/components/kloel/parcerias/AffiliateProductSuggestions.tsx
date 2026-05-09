'use client';

import { useState } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { affiliateApi } from '@/lib/api/affiliate';
import type { AffiliateSuggestion } from './partnershipTypes';
import { C, FONT } from './ParceriasDesignTokens';

export default function AffiliateProductSuggestions() {
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AffiliateSuggestion[]>([]);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const handleSuggest = async () => {
    setSuggestLoading(true);
    try {
      const res = await affiliateApi.suggest();
      setSuggestions(res.data?.products || []);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
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
        {kloelT(`Sugestoes por IA`)}
      </div>
      <button type="button" onClick={handleSuggest} disabled={suggestLoading}
        style={{ width: '100%', padding: '10px 0', background: C.ember, border: 'none', borderRadius: 6, color: '#fff', fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, cursor: suggestLoading ? 'wait' : 'pointer', marginBottom: 12, opacity: suggestLoading ? 0.7 : 1 }}>
        {suggestLoading ? 'Buscando...' : 'Ver sugestoes para meu nicho'}
      </button>
      {suggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {suggestions.map((p) => (
            <div key={p.id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: C.elevated, borderRadius: 6 }}>
              <div>
                <div style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: C.text }}>{p.productId}</div>
                <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.ember }}>{p.commissionPct}{kloelT(`% comissao`)}</div>
              </div>
              <button type="button" onClick={() => handleSave(p.id)} disabled={saving[p.id]}
                style={{ padding: '6px 12px', background: 'none', border: `1px solid ${C.ember}`, borderRadius: 6, color: C.ember, fontFamily: FONT.sans, fontSize: 11, cursor: saving[p.id] ? 'wait' : 'pointer' }}>
                {saving[p.id] ? '...' : 'Salvar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
