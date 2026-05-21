'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useRouter } from 'next/navigation';
import type { RefObject } from 'react';
import { IC, SORA, MONO, EMBER, TEXT, TEXT_MUTED, BORDER, BG_ELEVATED } from './SitesViewIcons';
import { Btn, Card } from './SitesViewAtoms';
import { Input } from './SitesViewControls';
import type { SiteItem } from './SitesViewIcons';

interface EditarSiteEditorProps {
  selectedSite: SiteItem;
  saving: boolean;
  handleSave: () => void;
  error: string;
  editPrompt: string;
  setEditPrompt: (v: string) => void;
  editLoading: boolean;
  handleEditWithAI: () => void;
  abMode: boolean;
  variantPrompt: string;
  setVariantPrompt: (v: string) => void;
  variantLoading: boolean;
  handleCreateVariant: () => void;
  variantNotice: string;
  productId: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onBack: () => void;
}

export function EditarSiteEditor({
  selectedSite,
  saving,
  handleSave,
  error,
  editPrompt,
  setEditPrompt,
  editLoading,
  handleEditWithAI,
  abMode,
  variantPrompt,
  setVariantPrompt,
  variantLoading,
  handleCreateVariant,
  variantNotice,
  productId,
  iframeRef,
  onBack,
}: EditarSiteEditorProps) {
  const router = useRouter();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn variant="ghost" small onClick={onBack}>{kloelT(`Voltar`)}</Btn>
          <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{selectedSite.name || 'Site sem titulo'}</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED }}>{kloelT(`ID:`)} {selectedSite.id?.slice(0, 8)}...</span>
        </div>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Alteracoes'}
        </Btn>
      </div>

      {abMode && (
        <div style={{ padding: '12px 16px', marginBottom: 12, background: `${EMBER}10`, borderRadius: 6, border: `1px solid ${EMBER}40` }}>
          <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT, marginBottom: 8 }}>{kloelT(`Modo páginas alternativas`)}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={variantPrompt} onChange={setVariantPrompt} placeholder={kloelT(`Ex: crie uma variante mais agressiva focada em prova social`)} />
            <Btn variant="primary" onClick={handleCreateVariant} disabled={variantLoading || !variantPrompt.trim()}>
              {variantLoading ? 'Gerando...' : 'Gerar Variante B'}
            </Btn>
          </div>
          {variantNotice && <div style={{ fontFamily: MONO, fontSize: 11, color: colors.semantic.success, marginTop: 8 }}>{variantNotice}</div>}
        </div>
      )}

      {productId && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <Btn variant="ghost" onClick={() => router.push(`/products/${productId}?tab=checkouts&focus=checkout-appearance`)}>
            {IC.site(14)} {kloelT(`Voltar para Checkout`)}
          </Btn>
          <Btn variant="ghost" onClick={() => router.push(`/products/${productId}?tab=campanhas&focus=recommendations`)}>
            {IC.chart(14)} {kloelT(`Revisar recomendações`)}
          </Btn>
        </div>
      )}

      {error && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: colors.semantic.error, padding: '8px 16px', marginBottom: 12, background: colors.semantic.errorBg, borderRadius: 6 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input value={editPrompt} onChange={setEditPrompt} placeholder={kloelT(`Descreva a alteracao que deseja...`)} />
        <Btn variant="primary" onClick={handleEditWithAI} disabled={editLoading || !editPrompt.trim()}>
          {editLoading ? 'Editando...' : <>{IC.zap(14)} {kloelT(`Editar com IA`)}</>}
        </Btn>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden', minHeight: 500 }}>
        <div style={{ background: BG_ELEVATED, padding: '6px 12px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '16%', background: colors.semantic.error }} />
          <div style={{ width: 8, height: 8, borderRadius: '16%', background: colors.semantic.warning }} />
          <div style={{ width: 8, height: 8, borderRadius: '16%', background: colors.semantic.success }} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED, marginLeft: 8 }}>{kloelT(`Preview`)}</span>
        </div>
        <iframe ref={iframeRef} srcDoc={selectedSite.htmlContent || ''} sandbox="allow-scripts" style={{ width: '100%', height: 500, border: 'none', background: colors.text.silver }} title={kloelT(`Site Preview`)} />
      </Card>
    </div>
  );
}
