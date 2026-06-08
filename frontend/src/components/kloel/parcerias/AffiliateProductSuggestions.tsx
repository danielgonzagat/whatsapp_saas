'use client';
import { colors } from '@/lib/design-tokens';

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
      setSuggestions((prev) =>
        prev.map((item) =>
          item.id === productId ? { ...item, isSaved: true, requestStatus: 'SAVED' } : item,
        ),
      );
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
        style={{ width: '100%', padding: '10px 0', background: C.ember, border: 'none', borderRadius: 6, color: colors.text.silver, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, cursor: suggestLoading ? 'wait' : 'pointer', marginBottom: 12, opacity: suggestLoading ? 0.7 : 1 }}>
        {suggestLoading ? 'Buscando...' : 'Ver sugestoes para meu nicho'}
      </button>
      {suggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {suggestions.map((p) => {
            const title = p.name?.trim() || p.productId || 'Produto sem nome';
            const meta = [p.producer, p.category].filter(Boolean).join(' · ') || 'Marketplace Kloel';
            const commission = p.commissionPct ?? p.commission ?? 0;
            const saved = p.isSaved || p.requestStatus === 'SAVED';
            return (
              <div key={p.id}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', background: C.elevated, borderRadius: 6 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: C.text }}>{title}</div>
                  <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.secondary, marginTop: 3 }}>{meta}</div>
                  <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.ember, marginTop: 3 }}>{commission}{kloelT(`% comissao`)}</div>
                </div>
                <button type="button" onClick={() => handleSave(p.id)} disabled={saving[p.id] || saved}
                  style={{ padding: '6px 12px', background: 'none', border: `1px solid ${C.ember}`, borderRadius: 6, color: saved ? C.secondary : C.ember, fontFamily: FONT.sans, fontSize: 11, cursor: saving[p.id] ? 'wait' : saved ? 'default' : 'pointer', opacity: saved ? 0.72 : 1 }}>
                  {saved ? 'Salvo' : saving[p.id] ? '...' : 'Salvar'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
