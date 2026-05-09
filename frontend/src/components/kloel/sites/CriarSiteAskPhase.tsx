'use client';

import { kloelT } from '@/lib/i18n/t';
import React from 'react';
import { useRouter } from 'next/navigation';
import { IC, FmtMoney, SORA, MONO, EMBER, TEXT, TEXT_DIM, BORDER, BG_CARD } from './SitesViewIcons';
import { Btn, Card, SectionLabel } from './SitesViewAtoms';
import type { SiteItem } from './SitesViewIcons';

interface AskPhaseProps {
  prompt: string;
  setPrompt: (v: string) => void;
  handleGenerate: () => void;
  error: string;
  productList: Array<{ name: string; price: number }>;
  savedSites: SiteItem[];
  loadingSites: boolean;
  loadSavedSite: (site: SiteItem) => void;
  handleDelete: (id: string) => void;
  dynamicMode: boolean;
  source: string;
  productName: string;
  productId: string;
}

export function CriarSiteAskPhase({
  prompt,
  setPrompt,
  handleGenerate,
  error,
  productList,
  savedSites,
  loadingSites,
  loadSavedSite,
  handleDelete,
  dynamicMode,
  source,
  productName,
  productId,
}: AskPhaseProps) {
  const router = useRouter();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20 }}>
      <div style={{ color: EMBER, opacity: 0.3 }}>{IC.globe(80)}</div>
      <div style={{ fontFamily: SORA, fontSize: 22, color: TEXT }}>{kloelT(`Criar seu Site`)}</div>
      <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT_DIM, maxWidth: 400, textAlign: 'center' }}>
        {kloelT(`Descreva o site que voce quer e a IA vai gerar um site completo. Pronto em segundos.`)}
      </div>

      {(source || productName) && (
        <div style={{ width: '100%', maxWidth: 500, padding: '12px 16px', borderRadius: 6, border: `1px solid ${EMBER}30`, background: `${EMBER}10` }}>
          <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT, marginBottom: 6 }}>{kloelT(`Contexto comercial`)}</div>
          <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
            {productName
              ? `Você veio de Produtos para publicar a oferta ${productName}. Gere a página, publique e depois volte para conectar checkout, URL e campanha.`
              : 'Use este editor para criar a superfície pública da sua oferta e conecte com checkout, domínio e publicação.'}
          </div>
        </div>
      )}

      {dynamicMode && (
        <div style={{ width: '100%', maxWidth: 500, padding: '12px 16px', borderRadius: 6, border: `1px solid ${EMBER}40`, background: `${EMBER}10` }}>
          <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT, marginBottom: 8 }}>{kloelT(`Modo páginas dinâmicas`)}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['Adapte headline por origem do tráfego', 'Mostre provas por estágio de compra', 'Troque CTA por campanha ativa'].map((hint) => (
              <button key={hint} type="button" onClick={() => setPrompt(`${prompt.trim()} ${hint}.`.trim())}
                style={{ fontFamily: MONO, fontSize: 10, padding: '4px 10px', borderRadius: 4, border: `1px solid ${BORDER}`, background: BG_CARD, color: TEXT, cursor: 'pointer' }}>
                {hint}
              </button>
            ))}
          </div>
        </div>
      )}

      {productList.length > 0 && (
        <div style={{ width: '100%', maxWidth: 500 }}>
          <SectionLabel>{kloelT(`Seus Produtos (clique para incluir)`)}</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {productList.map((p) => (
              <button key={p.name} type="button" onClick={() => setPrompt(prompt + (prompt ? ', ' : '') + p.name)}
                style={{ fontFamily: MONO, fontSize: 11, padding: '4px 10px', borderRadius: 4, border: `1px solid ${BORDER}`, background: BG_CARD, color: TEXT, cursor: 'pointer' }}>
                {p.name} -- {FmtMoney(p.price)}
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={kloelT(`Ex: Landing page para venda de curso de marketing digital, com secao de depoimentos e botao de compra...`)}
        style={{ fontFamily: SORA, fontSize: 14, width: '100%', maxWidth: 500, minHeight: 100, padding: 14, borderRadius: 6, border: `1px solid ${BORDER}`, background: BG_CARD, color: TEXT, resize: 'vertical', outline: 'none' }}
        onFocus={(e) => { e.currentTarget.style.borderColor = EMBER; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = BORDER; }}
      />

      <Btn variant="primary" onClick={handleGenerate} disabled={!prompt.trim()}>
        {IC.zap(16)} {kloelT(`Gerar Site com IA`)}
      </Btn>

      {error && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: '#ef4444', maxWidth: 500, textAlign: 'center', padding: '8px 16px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
          {error}
        </div>
      )}

      {(loadingSites || savedSites.length > 0) && (
        <div style={{ width: '100%', maxWidth: 500, marginTop: 16 }}>
          <SectionLabel>{kloelT(`Sites Salvos`)}</SectionLabel>
          {loadingSites && <div style={{ fontFamily: MONO, fontSize: 12, color: TEXT_DIM }}>{kloelT(`Carregando...`)}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {savedSites.map((site) => (
              <Card key={site.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px' }}>
                <button type="button" aria-label="Abrir site salvo" onClick={() => loadSavedSite(site)}
                  style={{ color: EMBER, background: 'transparent', border: 'none', padding: 0, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  {IC.site(16)}
                </button>
                <button type="button" onClick={() => loadSavedSite(site)}
                  style={{ fontFamily: SORA, fontSize: 13, color: TEXT, flex: 1, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, textAlign: 'left' }}>
                  {site.name || 'Site sem titulo'}
                </button>
                {site.published && <Badge color="#10B981">{kloelT(`Publicado`)}</Badge>}
                <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_DIM }}>
                  {site.updatedAt ? new Date(site.updatedAt).toLocaleDateString('pt-BR') : ''}
                </span>
                <button type="button" onClick={() => handleDelete(site.id)}
                  style={{ fontFamily: MONO, fontSize: 10, padding: '2px 8px', borderRadius: 4, border: `1px solid ${BORDER}`, background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>
                  X
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
