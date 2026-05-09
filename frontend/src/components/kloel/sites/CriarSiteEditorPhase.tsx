'use client';

import { kloelT } from '@/lib/i18n/t';
import { useRouter } from 'next/navigation';
import type { RefObject } from 'react';
import { IC, SORA, MONO, TEXT, TEXT_DIM, TEXT_MUTED, BORDER, BG_ELEVATED } from './SitesViewIcons';
import { Btn, Card, Input } from './SitesViewAtoms';

interface EditorPhaseProps {
  siteName: string;
  setSiteName: (v: string) => void;
  generatedHtml: string;
  savedSiteId: string | null;
  saving: boolean;
  handleSave: () => void;
  publishing: boolean;
  handlePublish: () => void;
  publishedUrl: string;
  productId: string;
  editPrompt: string;
  setEditPrompt: (v: string) => void;
  editLoading: boolean;
  handleEditWithAI: () => void;
  error: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onBack: () => void;
}

export function CriarSiteEditorPhase({
  siteName,
  setSiteName,
  generatedHtml,
  savedSiteId,
  saving,
  handleSave,
  publishing,
  handlePublish,
  publishedUrl,
  productId,
  editPrompt,
  setEditPrompt,
  editLoading,
  handleEditWithAI,
  error,
  iframeRef,
  onBack,
}: EditorPhaseProps) {
  const router = useRouter();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn variant="ghost" small onClick={onBack}>{kloelT(`Voltar`)}</Btn>
          <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Editor do Site`)}</span>
          {savedSiteId && (
            <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED }}>{kloelT(`ID:`)} {savedSiteId.slice(0, 8)}...</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Btn>
          <Btn variant="primary" onClick={handlePublish} disabled={publishing || saving}>{publishing ? 'Publicando...' : 'Publicar'}</Btn>
        </div>
      </div>

      {publishedUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', marginBottom: 12, background: 'rgba(16,185,129,0.08)', borderRadius: 6, border: '1px solid rgba(16,185,129,0.2)' }}>
          <span style={{ color: '#10B981' }}>{IC.check(16)}</span>
          <span style={{ fontFamily: SORA, fontSize: 13, color: '#10B981' }}>{kloelT(`Publicado em:`)}</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT }}>{publishedUrl}</span>
        </div>
      )}

      {(publishedUrl || productId) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {productId && (
            <>
              <Btn variant="ghost" onClick={() => router.push(`/products/${productId}?tab=checkouts&focus=checkout-appearance`)}>
                {IC.site(14)} {kloelT(`Voltar para Checkout`)}
              </Btn>
              <Btn variant="ghost" onClick={() => router.push(`/products/${productId}?tab=urls`)}>
                {IC.link(14)} {kloelT(`Conectar URL`)}
              </Btn>
            </>
          )}
          <Btn variant="ghost" onClick={() => router.push('/sites/dominios')}>
            {IC.globe(14)} {kloelT(`Domínios`)}
          </Btn>
          <Btn variant="ghost" onClick={() => router.push('/sites/apps')}>
            {IC.puzzle(14)} {kloelT(`Apps`)}
          </Btn>
        </div>
      )}

      {error && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: '#ef4444', padding: '8px 16px', marginBottom: 12, background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>{error}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>{kloelT(`Nome:`)}</span>
        <Input value={siteName} onChange={setSiteName} placeholder={kloelT(`Nome do site`)} style={{ maxWidth: 300 }} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input value={editPrompt} onChange={setEditPrompt} placeholder={kloelT(`Pedir alteracao para a IA... Ex: Mude as cores para azul, adicione mais depoimentos`)} />
        <Btn variant="primary" onClick={handleEditWithAI} disabled={editLoading || !editPrompt.trim()}>
          {editLoading ? 'Editando...' : <>{IC.zap(14)} {kloelT(`Editar com IA`)}</>}
        </Btn>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden', minHeight: 500 }}>
        <div style={{ background: BG_ELEVATED, padding: '6px 12px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED, marginLeft: 8 }}>{kloelT(`Preview`)}</span>
        </div>
        <iframe ref={iframeRef} srcDoc={generatedHtml} sandbox="allow-scripts" style={{ width: '100%', height: 500, border: 'none', background: '#fff' }} title={kloelT(`Site Preview`)} />
      </Card>
    </div>
  );
}
