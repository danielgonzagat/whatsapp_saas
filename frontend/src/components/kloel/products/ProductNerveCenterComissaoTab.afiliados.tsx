'use client';

import { kloelT } from '@/lib/i18n/t';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';
import {
  Bg,
  Bt,
  M,
  PanelLoadingState,
  V,
  cs,
  unwrapApiPayload,
  type JsonRecord,
} from './product-nerve-center.shared';
import { formatBrlAmount, formatOneDecimalPercent } from './ProductNerveCenterComissaoTab.helpers';
import type {
  AffiliateLinkRecord,
  AffiliateRequestRecord,
  AffiliateStatsRecord,
  SubTabProps,
} from './ProductNerveCenterComissaoTab.types';

export function AfiliadosSubTab({
  productId,
  setAffiliateSummary,
  affiliateSummary,
  affiliateLoading,
  copied,
  cp,
}: SubTabProps & {
  affiliateSummary: JsonRecord | null;
  affiliateLoading: boolean;
  copied: string | null;
  cp: (text: string, id: string) => void;
}) {
  const stats = (affiliateSummary?.stats || {}) as AffiliateStatsRecord;
  const requests = (affiliateSummary?.requests || []) as AffiliateRequestRecord[];
  const links = (affiliateSummary?.links || []) as AffiliateLinkRecord[];
  const affiliateProduct = affiliateSummary?.affiliateProduct as
    | { listed?: boolean; approvalMode?: string; commissionPct?: number; cookieDays?: number }
    | undefined;
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [linkActionId, setLinkActionId] = useState<string | null>(null);

  const handleRequestAction = async (requestId: string, action: 'approve' | 'reject') => {
    setRequestActionId(`${action}-${requestId}`);
    try {
      const summary = unwrapApiPayload<JsonRecord | null>(
        await apiFetch(`/products/${productId}/affiliates/requests/${requestId}/${action}`, {
          method: 'POST',
        }),
      );
      // PULSE_OK: cache invalidation handled by auto-revalidation
      setAffiliateSummary(summary);
    } catch (e) {
      console.error('Affiliate request action error', { action, error: e });
    } finally {
      setRequestActionId(null);
    }
  };

  const handleLinkToggle = async (linkId: string, active: boolean) => {
    setLinkActionId(linkId);
    try {
      const summary = unwrapApiPayload<JsonRecord | null>(
        await apiFetch(`/products/${productId}/affiliates/links/${linkId}`, {
          method: 'PUT',
          body: { active },
        }),
      );
      // PULSE_OK: cache invalidation handled by auto-revalidation
      setAffiliateSummary(summary);
    } catch (e) {
      console.error('Affiliate link toggle error:', e);
    } finally {
      setLinkActionId(null);
    }
  };

  return (
    <div style={{ ...cs, padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 16,
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: 0 }}>
          {kloelT(`Afiliados`)}
        </h3>
        <div style={{ fontSize: 11, color: V.t3 }}>
          {kloelT(`Pedidos, aprovações e links ativos deste produto`)}
        </div>
      </div>
      {affiliateLoading ? (
        <PanelLoadingState
          compact
          label={kloelT(`Sincronizando afiliados`)}
          description={kloelT(
            `Solicitações, aprovações e links seguem nesta aba enquanto o backend atualiza os dados.`,
          )}
        />
      ) : (
        <>
          <div
            style={{
              ...cs,
              padding: 14,
              marginBottom: 16,
              background: affiliateProduct?.listed ? `${V.g}08` : `${V.y}08`,
              border: affiliateProduct?.listed ? `1px solid ${V.g}20` : `1px solid ${V.y}20`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: affiliateProduct?.listed ? V.g : V.y,
                    fontFamily: M,
                    letterSpacing: '.06em',
                  }}
                >
                  {affiliateProduct?.listed ? 'PROGRAMA PUBLICADO' : 'PROGRAMA FORA DO MARKETPLACE'}
                </div>
                <div style={{ fontSize: 11, color: V.t2, marginTop: 4 }}>
                  {affiliateProduct
                    ? `Aprovação ${affiliateProduct.approvalMode === 'AUTO' ? 'automática' : 'manual'} · comissão ${formatOneDecimalPercent(affiliateProduct.commissionPct)} · cookie ${affiliateProduct.cookieDays || 0} dias.`
                    : 'Salve as configurações para criar a infraestrutura real de afiliação e começar a receber solicitações.'}
                </div>
              </div>
              <Bg color={affiliateProduct?.listed ? V.g : V.y}>
                {affiliateProduct?.listed ? 'ATIVO' : 'RASCUNHO'}
              </Bg>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            {[
              ['Solicitações', stats.requests || 0],
              ['Pendentes', stats.pendingRequests || 0],
              ['Links ativos', stats.activeLinks || 0],
              ['Comissão gerada', formatBrlAmount(stats.commission)],
            ].map(([label, value]) => (
              <div key={String(label)} style={{ ...cs, padding: 14, background: V.e }}>
                <div
                  style={{
                    fontSize: 10,
                    color: V.t3,
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                  }}
                >
                  {String(label)}
                </div>
                <div style={{ fontFamily: M, fontSize: 18, fontWeight: 700, color: V.t }}>
                  {String(value)}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 16 }}
            className="grid2"
          >
            <div style={{ ...cs, padding: 16, background: V.e }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: V.t, marginBottom: 10 }}>
                {kloelT(`Solicitações recentes`)}
              </div>
              {requests.length === 0 ? (
                <div style={{ fontSize: 12, color: V.t3 }}>
                  {kloelT(`Nenhuma solicitação recebida ainda.`)}
                </div>
              ) : (
                requests.slice(0, 6).map((request) => (
                  <div
                    key={String(request.id)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 0',
                      borderBottom: `1px solid ${V.b}`,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: V.t, fontWeight: 600 }}>
                        {String(request.affiliateName || request.affiliateEmail || 'Afiliado')}
                      </div>
                      <div style={{ fontSize: 10, color: V.t3 }}>
                        {String(request.affiliateEmail || 'Sem email')}
                        {request.createdAt
                          ? ` · ${new Date(String(request.createdAt)).toLocaleDateString('pt-BR')}`
                          : ''}
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <Bg
                        color={
                          request.status === 'APPROVED'
                            ? V.g
                            : request.status === 'REJECTED'
                              ? V.r
                              : V.y
                        }
                      >
                        {String(request.status || 'PENDING')}
                      </Bg>
                      {request.status === 'PENDING' && (
                        <>
                          <Bt
                            primary
                            onClick={() => handleRequestAction(String(request.id), 'approve')}
                            style={{ padding: '4px 8px' }}
                          >
                            {requestActionId === `approve-${request.id}`
                              ? 'Aprovando...'
                              : 'Aprovar'}
                          </Bt>
                          <Bt
                            onClick={() => handleRequestAction(String(request.id), 'reject')}
                            style={{ padding: '4px 8px', color: V.r }}
                          >
                            {requestActionId === `reject-${request.id}`
                              ? 'Recusando...'
                              : 'Recusar'}
                          </Bt>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ ...cs, padding: 16, background: V.e }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: V.t, marginBottom: 10 }}>
                {kloelT(`Links ativos`)}
              </div>
              {links.length === 0 ? (
                <div style={{ fontSize: 12, color: V.t3 }}>
                  {kloelT(`Nenhum link ativo gerado ainda.`)}
                </div>
              ) : (
                links.slice(0, 6).map((link) => (
                  <div
                    key={String(link.id)}
                    style={{ padding: '10px 0', borderBottom: `1px solid ${V.b}` }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <div style={{ fontSize: 12, color: V.t, fontWeight: 600 }}>
                        {String(link.affiliateName || link.affiliateEmail || 'Afiliado')}
                      </div>
                      <Bg color={link.active ? V.g : V.t3}>{link.active ? 'ATIVO' : 'OFF'}</Bg>
                    </div>
                    <div style={{ fontSize: 10, color: V.t3, marginTop: 4 }}>
                      {kloelT(`Cliques`)} {String(link.clicks || 0)} {kloelT(`· Vendas`)}{' '}
                      {String(link.sales || 0)}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 6,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: M,
                          fontSize: 10,
                          color: V.em,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {String(link.code || link.slug || link.id)}
                      </span>
                      <div
                        style={{
                          display: 'flex',
                          gap: 6,
                          flexWrap: 'wrap',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <Bt
                          onClick={() => cp(String(link.url || link.code || ''), `aff-${link.id}`)}
                          style={{ padding: '4px 8px' }}
                        >
                          {copied === `aff-${link.id}` ? 'Copiado' : 'Copiar'}
                        </Bt>
                        <Bt
                          onClick={() => handleLinkToggle(String(link.id), !link.active)}
                          style={{ padding: '4px 8px' }}
                        >
                          {linkActionId === link.id
                            ? 'Salvando...'
                            : link.active
                              ? 'Desativar'
                              : 'Ativar'}
                        </Bt>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
