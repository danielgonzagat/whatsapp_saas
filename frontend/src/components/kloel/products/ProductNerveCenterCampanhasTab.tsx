'use client';

import { kloelT } from '@/lib/i18n/t';
import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import { useState, useCallback, useEffect } from 'react';
import { useNerveCenterContext } from './product-nerve-center.context';
import {
  Bg,
  Bt,
  Fd,
  M,
  PanelLoadingState,
  V,
  cs,
  formatBrlCents,
  is,
  JsonRecord,
} from './product-nerve-center.shared';

function unwrapApiPayload<T>(res: unknown): T {
  const r = res as JsonRecord | undefined;
  return (r?.data ?? res) as T;
}

const R$ = formatBrlCents;

/** Product nerve center campanhas tab. */
export function ProductNerveCenterCampanhasTab({
  recommendedProducts,
  productName,
}: {
  recommendedProducts: Array<JsonRecord>;
  productName: string;
}) {
  const { productId, router } = useNerveCenterContext();
  const { showToast } = useToast();
  const [camps, setCamps] = useState<Array<JsonRecord>>([]);
  const [campsLoading, setCampsLoading] = useState(true);
  const [showCampForm, setShowCampForm] = useState(false);
  const [campName, setCampName] = useState('');
  const [campPixel, setCampPixel] = useState('');
  const [campMessage, setCampMessage] = useState('');
  const [campBusyId, setCampBusyId] = useState<string | null>(null);
  const loadCampaigns = useCallback(() => {
    setCampsLoading(true);
    return apiFetch(`/products/${productId}/campaigns`)
      .then((r: unknown) => {
        const d = unwrapApiPayload<Array<JsonRecord>>(r);
        setCamps(Array.isArray(d) ? d : []);
      })
      .catch(() => setCamps([]))
      .finally(() => setCampsLoading(false));
  }, [productId]);
  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);
  const handleCreateCamp = async () => {
    if (!campName.trim()) {
      return;
    }
    try {
      const res = await apiFetch(`/products/${productId}/campaigns`, {
        method: 'POST',
        body: {
          name: campName.trim(),
          pixelId: campPixel.trim() || null,
          messageTemplate: campMessage.trim() || undefined,
        },
      });
      const created = unwrapApiPayload<JsonRecord>(res);
      setCamps((prev) => [created, ...prev]);
      setCampName('');
      setCampPixel('');
      setCampMessage('');
      setShowCampForm(false);
      showToast('Campanha criada', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao criar campanha', 'error');
    }
  };
  const handleLaunchCamp = async (id: string, smartTime = false) => {
    setCampBusyId(`launch-${id}`);
    try {
      await unwrapApiPayload(
        await apiFetch(`/products/${productId}/campaigns/${id}/launch`, {
          method: 'POST',
          body: { smartTime },
        }),
      );
      await loadCampaigns();
      showToast('Campanha lançada', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao lançar campanha', 'error');
    } finally {
      setCampBusyId(null);
    }
  };
  const handlePauseCamp = async (id: string) => {
    setCampBusyId(`pause-${id}`);
    try {
      await unwrapApiPayload(
        await apiFetch(`/products/${productId}/campaigns/${id}/pause`, {
          method: 'POST',
        }),
      );
      await loadCampaigns();
      showToast('Campanha pausada', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao pausar campanha', 'error');
    } finally {
      setCampBusyId(null);
    }
  };
  const handleDeleteCamp = async (id: string) => {
    try {
      await unwrapApiPayload(
        await apiFetch(`/products/${productId}/campaigns/${id}`, { method: 'DELETE' }),
      );
      setCamps((prev) => prev.filter((c: JsonRecord) => c.id !== id));
      showToast('Campanha removida', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao remover campanha', 'error');
    }
  };
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: 0 }}>
          {kloelT(`Campanhas Registradas`)}
        </h2>
        <Bt primary onClick={() => setShowCampForm(!showCampForm)}>
          {kloelT(`+ Nova Campanha`)}
        </Bt>
      </div>
      <div style={{ ...cs, padding: 16, marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: V.t }}>
              {kloelT(`Recomendações do Kloel`)}
            </div>
            <div style={{ fontSize: 11, color: V.t3, marginTop: 4 }}>
              {kloelT(`Use produtos complementares, site e checkout para empilhar receita sem sair deste
              fluxo.`)}
            </div>
          </div>
          <Bg color={V.em}>RECOMENDA</Bg>
        </div>
        {recommendedProducts.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
              gap: 10,
            }}
          >
            {recommendedProducts.map((candidate: JsonRecord) => (
              <div
                key={String(candidate.id)}
                style={{
                  background: V.e,
                  border: `1px solid ${V.b}`,
                  borderRadius: 6,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: V.t }}>
                    {String(candidate.name || 'Produto complementar')}
                  </div>
                  <span style={{ fontFamily: M, fontSize: 11, color: V.em }}>
                    {R$(Math.round(Number(candidate.price || 0) * 100))}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: V.t2, lineHeight: 1.5, minHeight: 34 }}>
                  {candidate.category
                    ? `Mesma frente comercial: ${candidate.category}.`
                    : 'Produto pronto para virar oferta complementar no checkout e na página.'}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <Bt
                    onClick={() => router.push(`/products/${candidate.id}`)}
                    style={{ padding: '6px 12px' }}
                  >
                    {kloelT(`Abrir produto`)}
                  </Bt>
                  <Bt
                    onClick={() =>
                      router.push(
                        `/sites/criar?source=products&productId=${productId}&productName=${encodeURIComponent(productName)}`,
                      )
                    }
                    style={{ padding: '6px 12px' }}
                  >
                    {kloelT(`Usar no site`)}
                  </Bt>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 12, color: V.t2 }}>
              {kloelT(`Nenhum produto complementar encontrado ainda. Crie outra oferta para começar a
              recomendar no checkout e na página.`)}
            </span>
            <Bt onClick={() => router.push('/products/new')}>{kloelT(`Criar nova oferta`)}</Bt>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <Bt
            onClick={() =>
              router.push(`/products/${productId}?tab=planos&planSub=bump&focus=order-bump`)
            }
            style={{ padding: '6px 12px' }}
          >
            {kloelT(`Configurar order bump`)}
          </Bt>
          <Bt
            onClick={() =>
              router.push(
                `/sites/criar?source=products&productId=${productId}&productName=${encodeURIComponent(productName)}`,
              )
            }
            style={{ padding: '6px 12px' }}
          >
            {kloelT(`Criar página de venda`)}
          </Bt>
          <Bt
            onClick={() => router.push(`/marketing/email?source=products&productId=${productId}`)}
            style={{ padding: '6px 12px' }}
          >
            {kloelT(`Acionar marketing`)}
          </Bt>
        </div>
      </div>
      {showCampForm && (
        <div style={{ ...cs, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Fd label={kloelT(`Nome da campanha`)} value={campName} onChange={setCampName} />
            <Fd label={kloelT(`Pixel ID (opcional)`)} value={campPixel} onChange={setCampPixel} />
            <Fd label={kloelT(`Mensagem base`)} full>
              <textarea
                style={{ ...is, height: 72 }}
                value={campMessage}
                onChange={(e) => setCampMessage(e.target.value)}
                placeholder={kloelT(
                  `Mensagem inicial que será enviada para a audiência desta campanha.`,
                )}
              />
            </Fd>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Bt primary onClick={handleCreateCamp}>
              {kloelT(`Criar`)}
            </Bt>
            <Bt onClick={() => setShowCampForm(false)}>{kloelT(`Cancelar`)}</Bt>
          </div>
        </div>
      )}
      {campsLoading ? (
        <PanelLoadingState
          compact
          label={kloelT(`Carregando campanhas`)}
          description={kloelT(
            `Os atalhos comerciais e as recomendações permanecem montados enquanto o histórico é revalidado.`,
          )}
        />
      ) : camps.length === 0 ? (
        <div style={{ ...cs, padding: 40, textAlign: 'center' }}>
          <span style={{ color: V.t3, fontSize: 12 }}>{kloelT(`Nenhuma campanha criada`)}</span>
        </div>
      ) : (
        <div style={{ ...cs, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1.5fr 1fr 1fr 1.2fr',
              padding: '10px 14px',
              borderBottom: `1px solid ${V.b}`,
              background: V.e,
            }}
          >
            {['Cód.', 'Nome', 'Status', 'Envios', 'Ações'].map((h) => (
              <span
                key={h}
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: V.t3,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                }}
              >
                {h}
              </span>
            ))}
          </div>
          {camps.map((c: JsonRecord, i: number) => (
            <div
              key={String(c.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.5fr 1fr 1fr 1.2fr',
                padding: '10px 14px',
                borderBottom: i < camps.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontFamily: M, fontSize: 10, color: V.t3 }}>
                {String(c.code ?? '').slice(0, 8) || String(c.id ?? '').slice(0, 8)}
              </span>
              <div>
                <span style={{ fontSize: 12, color: V.t, display: 'block' }}>{String(c.name)}</span>
                {c.messageTemplate && (
                  <span
                    style={{
                      fontSize: 10,
                      color: V.t3,
                      display: 'block',
                      marginTop: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {String(c.messageTemplate)}
                  </span>
                )}
              </div>
              <div>
                <Bg
                  color={
                    c.status === 'COMPLETED'
                      ? V.g
                      : c.status === 'RUNNING' || c.status === 'SCHEDULED'
                        ? V.bl
                        : V.t3
                  }
                >
                  {String(c.status || 'DRAFT')}
                </Bg>
              </div>
              <span style={{ fontFamily: M, fontSize: 11, color: V.t2, textAlign: 'center' }}>
                {String(c.sentCount || 0)} / {String(c.deliveredCount || 0)}
              </span>
              <div
                style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}
              >
                {c.status === 'RUNNING' || c.status === 'SCHEDULED' ? (
                  <Bt onClick={() => handlePauseCamp(String(c.id))} style={{ padding: '4px 8px' }}>
                    {campBusyId === `pause-${c.id}` ? 'Pausando...' : 'Pausar'}
                  </Bt>
                ) : (
                  <Bt
                    primary
                    onClick={() => handleLaunchCamp(String(c.id), false)}
                    style={{ padding: '4px 8px' }}
                  >
                    {campBusyId === `launch-${c.id}` ? 'Lançando...' : 'Lançar'}
                  </Bt>
                )}
                <Bt
                  onClick={() => handleLaunchCamp(String(c.id), true)}
                  style={{ padding: '4px 8px' }}
                >
                  {campBusyId === `launch-${c.id}` ? 'Agendando...' : 'Smart time'}
                </Bt>
                <Bt
                  onClick={() => handleDeleteCamp(String(c.id))}
                  style={{ padding: '4px 8px', color: V.r }}
                >
                  {kloelT(`Excluir`)}
                </Bt>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
