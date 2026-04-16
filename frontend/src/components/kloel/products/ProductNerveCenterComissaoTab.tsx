'use client';

import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import type React from 'react';
import { useCallback, useEffect, useRef, useState, useId } from 'react';
import { useNerveCenterContext } from './product-nerve-center.context';
import { IntegerStepperField, PercentStepperField } from './product-nerve-center.inputs';
import {
  Bg,
  Bt,
  Dv,
  Fd,
  M,
  PanelLoadingState,
  S,
  TabBar,
  Tg,
  V,
  cs,
  is,
  unwrapApiPayload,
} from './product-nerve-center.shared';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DOMPurify = typeof window !== 'undefined' ? require('dompurify') : null;
function sanitizeHtml(html: string): string {
  if (!DOMPurify) return html;
  return (DOMPurify as any).sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'a', 'br', 'p', 'span'],
    ALLOWED_ATTR: ['href', 'target'],
  });
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseLocalePercent(value: string, fallback: number) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? clampNumber(parsed, 0, 100) : fallback;
}

function formatPercentInput(value: unknown, fallback: number) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? clampNumber(parsed, 0, 100) : fallback;
  return String(safe).replace('.', ',');
}

function clampIntegerValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? clampNumber(parsed, min, max) : fallback;
}

/* ── Shared prop types for sub-tabs ── */
interface SubTabProps {
  productId: string;
  p: any;
  refreshProduct: () => Promise<void>;
  setAffiliateSummary: (v: any) => void;
}

/* ═══════════════════════════════════════════════════
   AfiliadosSubTab
   ═══════════════════════════════════════════════════ */
function AfiliadosSubTab({
  productId,
  setAffiliateSummary,
  affiliateSummary,
  affiliateLoading,
  copied,
  cp,
}: SubTabProps & {
  affiliateSummary: any;
  affiliateLoading: boolean;
  copied: string | null;
  cp: (text: string, id: string) => void;
}) {
  const stats = affiliateSummary?.stats || {};
  const requests = affiliateSummary?.requests || [];
  const links = affiliateSummary?.links || [];
  const affiliateProduct = affiliateSummary?.affiliateProduct;
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [linkActionId, setLinkActionId] = useState<string | null>(null);

  const handleRequestAction = async (requestId: string, action: 'approve' | 'reject') => {
    setRequestActionId(`${action}-${requestId}`);
    try {
      const summary = unwrapApiPayload(
        await apiFetch(`/products/${productId}/affiliates/requests/${requestId}/${action}`, {
          method: 'POST',
        }),
      );
      setAffiliateSummary(summary);
    } catch (e) {
      console.error(`Affiliate request ${action} error:`, e);
    } finally {
      setRequestActionId(null);
    }
  };

  const handleLinkToggle = async (linkId: string, active: boolean) => {
    setLinkActionId(linkId);
    try {
      const summary = unwrapApiPayload(
        await apiFetch(`/products/${productId}/affiliates/links/${linkId}`, {
          method: 'PUT',
          body: { active },
        }),
      );
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
        <h3 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: 0 }}>Afiliados</h3>
        <div style={{ fontSize: 11, color: V.t3 }}>
          Pedidos, aprovações e links ativos deste produto
        </div>
      </div>
      {affiliateLoading ? (
        <PanelLoadingState
          compact
          label="Sincronizando afiliados"
          description="Solicitações, aprovações e links seguem nesta aba enquanto o backend atualiza os dados."
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
                    ? `Aprovação ${affiliateProduct.approvalMode === 'AUTO' ? 'automática' : 'manual'} · comissão ${Number(affiliateProduct.commissionPct || 0).toFixed(1)}% · cookie ${affiliateProduct.cookieDays || 0} dias.`
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
              [
                'Comissão gerada',
                `R$ ${Number(stats.commission || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              ],
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
                  {label}
                </div>
                <div style={{ fontFamily: M, fontSize: 18, fontWeight: 700, color: V.t }}>
                  {value}
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
                Solicitações recentes
              </div>
              {requests.length === 0 ? (
                <div style={{ fontSize: 12, color: V.t3 }}>Nenhuma solicitação recebida ainda.</div>
              ) : (
                requests.slice(0, 6).map((request: any) => (
                  <div
                    key={request.id}
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
                        {request.affiliateName || request.affiliateEmail || 'Afiliado'}
                      </div>
                      <div style={{ fontSize: 10, color: V.t3 }}>
                        {request.affiliateEmail || 'Sem email'}
                        {request.createdAt
                          ? ` · ${new Date(request.createdAt).toLocaleDateString('pt-BR')}`
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
                        {request.status || 'PENDING'}
                      </Bg>
                      {request.status === 'PENDING' && (
                        <>
                          <Bt
                            primary
                            onClick={() => handleRequestAction(request.id, 'approve')}
                            style={{ padding: '4px 8px' }}
                          >
                            {requestActionId === `approve-${request.id}`
                              ? 'Aprovando...'
                              : 'Aprovar'}
                          </Bt>
                          <Bt
                            onClick={() => handleRequestAction(request.id, 'reject')}
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
                Links ativos
              </div>
              {links.length === 0 ? (
                <div style={{ fontSize: 12, color: V.t3 }}>Nenhum link ativo gerado ainda.</div>
              ) : (
                links.slice(0, 6).map((link: any) => (
                  <div
                    key={link.id}
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
                        {link.affiliateName || link.affiliateEmail || 'Afiliado'}
                      </div>
                      <Bg color={link.active ? V.g : V.t3}>{link.active ? 'ATIVO' : 'OFF'}</Bg>
                    </div>
                    <div style={{ fontSize: 10, color: V.t3, marginTop: 4 }}>
                      Cliques {link.clicks || 0} · Vendas {link.sales || 0}
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
                        {link.code || link.slug || link.id}
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
                          onClick={() => cp(link.url || link.code || '', `aff-${link.id}`)}
                          style={{ padding: '4px 8px' }}
                        >
                          {copied === `aff-${link.id}` ? 'Copiado' : 'Copiar'}
                        </Bt>
                        <Bt
                          onClick={() => handleLinkToggle(link.id, !link.active)}
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

/* ═══════════════════════════════════════════════════
   MerchanSubTab
   ═══════════════════════════════════════════════════ */
function MerchanSubTab({ productId, p, refreshProduct, setAffiliateSummary }: SubTabProps) {
  const { showToast } = useToast();
  const [merchan, setMerchan] = useState(p.merchandContent || '');
  const [mSaving, setMSaving] = useState(false);
  const [mSaved, setMSaved] = useState(false);
  const edRef = useRef<any>(null);
  const handleSaveMerchan = async () => {
    setMSaving(true);
    try {
      const summary = unwrapApiPayload(
        await apiFetch(`/products/${productId}/affiliates`, {
          method: 'PUT',
          body: { merchandContent: edRef.current?.innerHTML || merchan },
        }),
      );
      setAffiliateSummary(summary);
      await refreshProduct();
      setMSaved(true);
      setTimeout(() => setMSaved(false), 2000);
      showToast('Merchan salvo', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao salvar merchan', 'error');
    } finally {
      setMSaving(false);
    }
  };
  return (
    <div style={{ ...cs, padding: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: '0 0 8px' }}>Merchan</h3>
      <p style={{ fontSize: 12, color: V.t2, marginBottom: 16 }}>Materiais para afiliados.</p>
      <div style={{ background: V.e, border: `1px solid ${V.b}`, borderRadius: 6, padding: 12 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {['B', 'I', 'U'].map((t) => (
            <button
              type="button"
              key={t}
              onClick={() =>
                document.execCommand(t === 'B' ? 'bold' : t === 'I' ? 'italic' : 'underline')
              }
              style={{
                width: 28,
                height: 28,
                background: 'transparent',
                border: `1px solid ${V.b}`,
                borderRadius: 4,
                color: V.t2,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: t === 'B' ? 'bold' : 'normal',
                fontStyle: t === 'I' ? 'italic' : 'normal',
                textDecoration: t === 'U' ? 'underline' : 'none',
              }}
            >
              {t}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const url = prompt('URL do link:');
              if (url) document.execCommand('createLink', false, url);
            }}
            style={{
              width: 28,
              height: 28,
              background: 'transparent',
              border: `1px solid ${V.b}`,
              borderRadius: 4,
              color: V.t2,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <svg
              aria-hidden="true"
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
          </button>
        </div>
        <div
          ref={edRef}
          contentEditable
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(merchan) }}
          onInput={(e) => setMerchan((e.target as any).innerHTML)}
          style={{ minHeight: 140, color: V.t2, fontSize: 13, outline: 'none', fontFamily: S }}
          suppressContentEditableWarning
        />
      </div>
      <Bt primary onClick={handleSaveMerchan} style={{ marginTop: 16 }}>
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {mSaved ? 'Salvo!' : mSaving ? 'Salvando...' : 'Salvar'}
      </Bt>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TermosSubTab
   ═══════════════════════════════════════════════════ */
function TermosSubTab({ productId, p, refreshProduct, setAffiliateSummary }: SubTabProps) {
  const { showToast } = useToast();
  const [terms, setTerms] = useState(p.affiliateTerms || '');
  const [tSaving, setTSaving] = useState(false);
  const [tSaved, setTSaved] = useState(false);
  const edRef = useRef<any>(null);
  const handleSaveTerms = async () => {
    setTSaving(true);
    try {
      const summary = unwrapApiPayload(
        await apiFetch(`/products/${productId}/affiliates`, {
          method: 'PUT',
          body: { affiliateTerms: edRef.current?.innerHTML || terms },
        }),
      );
      setAffiliateSummary(summary);
      await refreshProduct();
      setTSaved(true);
      setTimeout(() => setTSaved(false), 2000);
      showToast('Termos salvos', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao salvar termos', 'error');
    } finally {
      setTSaving(false);
    }
  };
  return (
    <div style={{ ...cs, padding: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: '0 0 8px' }}>
        Termos de uso
      </h3>
      <div style={{ background: V.e, border: `1px solid ${V.b}`, borderRadius: 6, padding: 12 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {['B', 'I', 'U'].map((t) => (
            <button
              type="button"
              key={t}
              onClick={() =>
                document.execCommand(t === 'B' ? 'bold' : t === 'I' ? 'italic' : 'underline')
              }
              style={{
                width: 28,
                height: 28,
                background: 'transparent',
                border: `1px solid ${V.b}`,
                borderRadius: 4,
                color: V.t2,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: t === 'B' ? 'bold' : 'normal',
                fontStyle: t === 'I' ? 'italic' : 'normal',
                textDecoration: t === 'U' ? 'underline' : 'none',
              }}
            >
              {t}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const url = prompt('URL do link:');
              if (url) document.execCommand('createLink', false, url);
            }}
            style={{
              width: 28,
              height: 28,
              background: 'transparent',
              border: `1px solid ${V.b}`,
              borderRadius: 4,
              color: V.t2,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <svg
              aria-hidden="true"
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
          </button>
        </div>
        <div
          ref={edRef}
          contentEditable
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(terms) }}
          onInput={(e) => setTerms((e.target as any).innerHTML)}
          style={{ minHeight: 140, color: V.t2, fontSize: 13, outline: 'none', fontFamily: S }}
          suppressContentEditableWarning
        />
      </div>
      <Bt primary onClick={handleSaveTerms} style={{ marginTop: 16 }}>
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {tSaved ? 'Salvo!' : tSaving ? 'Salvando...' : 'Salvar'}
      </Bt>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CoprodSubTab
   ═══════════════════════════════════════════════════ */
function CoprodSubTab({
  productId,
  initialFocus,
  router,
}: {
  productId: string;
  initialFocus?: string;
  router: any;
}) {
  const fid = useId();
  const { showToast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    role: 'COPRODUCER',
    percentage: '',
    agentName: '',
    agentEmail: '',
  });
  const [creating, setCreating] = useState(false);

  const fetchCommissions = () => {
    apiFetch<any>(`/products/${productId}/commissions`)
      .then((r) => {
        const d = unwrapApiPayload<any[]>(r);
        setItems(
          (Array.isArray(d) ? d : []).filter((c: any) =>
            ['COPRODUCER', 'MANAGER'].includes(c.role),
          ),
        );
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCommissions();
  }, [productId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await apiFetch(`/products/${productId}/commissions`, {
        method: 'POST',
        body: { ...form, percentage: Number.parseFloat(form.percentage) || 0 },
      });
      setShowForm(false);
      setForm({ role: 'COPRODUCER', percentage: '', agentName: '', agentEmail: '' });
      fetchCommissions();
      showToast('Coprodutor adicionado', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao adicionar coprodutor', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir coprodutor?')) return;
    try {
      await apiFetch(`/products/${productId}/commissions/${id}`, { method: 'DELETE' });
      fetchCommissions();
      showToast('Coprodutor removido', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao remover coprodutor', 'error');
    }
  };

  const inputSt: React.CSSProperties = {
    width: '100%',
    background: V.e,
    border: `1px solid ${V.b}`,
    borderRadius: 6,
    padding: '10px 14px',
    fontSize: 13,
    color: V.t2,
    outline: 'none',
    fontFamily: S,
  };

  return (
    <div style={{ ...cs, padding: 24 }}>
      {initialFocus === 'coproduction' && (
        <div
          style={{
            background: `${V.em}08`,
            border: `1px solid ${V.em}18`,
            borderRadius: 6,
            padding: 14,
            marginBottom: 16,
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
                color: V.em,
                fontFamily: M,
                letterSpacing: '.06em',
              }}
            >
              COPRODUÇÃO
            </div>
            <div style={{ fontSize: 12, color: V.t2, marginTop: 4 }}>
              Cadastre parceiros com divisão automática de receita e acompanhe o impacto em vendas e
              repasses.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Bt onClick={() => router.push('/parcerias?tab=afiliados')}>Abrir parcerias</Bt>
            <Bt onClick={() => router.push('/vendas?tab=estrategias')}>Ver estratégias</Bt>
          </div>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: 0 }}>
          Coprodução e gerência
        </h3>
        <Bt primary onClick={() => setShowForm(!showForm)}>
          + Adicionar parceiro
        </Bt>
      </div>
      {showForm && (
        <div
          style={{
            background: V.e,
            border: `1px solid ${V.b}`,
            borderRadius: 6,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 600,
                  color: V.t3,
                  marginBottom: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                }}
                htmlFor={`${fid}-papel`}
              >
                Papel
              </label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                style={inputSt}
                id={`${fid}-papel`}
              >
                <option value="COPRODUCER">Coprodutor</option>
                <option value="MANAGER">Gerente</option>
              </select>
            </div>
          </div>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 600,
                  color: V.t3,
                  marginBottom: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                }}
                htmlFor={`${fid}-nome`}
              >
                Nome
              </label>
              <input
                value={form.agentName}
                onChange={(e) => setForm({ ...form, agentName: e.target.value })}
                style={inputSt}
                placeholder="Nome do coprodutor"
                id={`${fid}-nome`}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 600,
                  color: V.t3,
                  marginBottom: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                }}
                htmlFor={`${fid}-email`}
              >
                E-mail
              </label>
              <input
                value={form.agentEmail}
                onChange={(e) => setForm({ ...form, agentEmail: e.target.value })}
                style={inputSt}
                placeholder="email@exemplo.com"
                id={`${fid}-email`}
              />
            </div>
          </div>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 600,
                  color: V.t3,
                  marginBottom: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                }}
                htmlFor={`${fid}-comissao`}
              >
                Comissão (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={form.percentage}
                onChange={(e) => setForm({ ...form, percentage: e.target.value })}
                style={inputSt}
                placeholder="10.0"
                id={`${fid}-comissao`}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <Bt primary onClick={handleCreate} style={{ flex: 1 }}>
                {creating ? 'Salvando...' : 'Adicionar'}
              </Bt>
              <Bt onClick={() => setShowForm(false)}>Cancelar</Bt>
            </div>
          </div>
        </div>
      )}
      {loading ? (
        <PanelLoadingState
          compact
          label="Carregando parceiros"
          description="A distribuição de coprodução e gerência permanece nesta aba enquanto os repasses sincronizam."
        />
      ) : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <span style={{ color: V.t3, fontSize: 13 }}>Nenhum parceiro cadastrado</span>
        </div>
      ) : (
        items.map((c: any) => (
          <div
            key={c.id}
            style={{
              background: V.e,
              border: `1px solid ${V.b}`,
              borderRadius: 6,
              padding: 14,
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                background: 'rgba(232,93,48,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke={V.em}
                strokeWidth={2}
                aria-hidden="true"
              >
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: V.t }}>
                  {c.agentName || 'Sem nome'}
                </div>
                <Bg color={c.role === 'MANAGER' ? V.bl : V.em}>
                  {c.role === 'MANAGER' ? 'GERENTE' : 'COPRODUTOR'}
                </Bg>
              </div>
              <div style={{ fontSize: 11, color: V.t3 }}>{c.agentEmail || '—'}</div>
            </div>
            <div style={{ textAlign: 'right', marginRight: 8 }}>
              <span style={{ fontFamily: M, fontSize: 15, fontWeight: 700, color: V.em }}>
                {Number(c.percentage).toFixed(1)}%
              </span>
              <div style={{ fontSize: 9, color: V.t3 }}>comissão</div>
            </div>
            <button
              type="button"
              onClick={() => handleDelete(c.id)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: V.t3,
                padding: 4,
              }}
              title="Excluir"
            >
              <svg
                aria-hidden="true"
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN EXPORTED COMPONENT — ComissaoTab
   ═══════════════════════════════════════════════════ */
export function ProductNerveCenterComissaoTab() {
  const { productId, p, refreshProduct, copied, cp, initialFocus, initialComSub, router } =
    useNerveCenterContext();
  const { showToast } = useToast();

  /* ── affiliate state (moved from parent) ── */
  const [affiliateSummary, setAffiliateSummary] = useState<any | null>(null);
  const [affiliateLoading, setAffiliateLoading] = useState(false);

  /* ── comSub state (moved from parent) ── */
  const [comSub, setComSub] = useState(
    initialComSub || (initialFocus === 'coproduction' ? 'coprod' : 'config'),
  );

  /* ── load affiliate summary on mount ── */
  const loadAffiliateSummary = useCallback(() => {
    if (!productId) return;
    setAffiliateLoading(true);
    apiFetch(`/products/${productId}/affiliates`)
      .then((res: any) => {
        const data = unwrapApiPayload<any>(res);
        setAffiliateSummary(data || null);
      })
      .catch(() => setAffiliateSummary(null))
      .finally(() => setAffiliateLoading(false));
  }, [productId]);

  useEffect(() => {
    loadAffiliateSummary();
  }, [loadAffiliateSummary]);

  /* ── config sub-tab local state ── */
  const [affEnabled, setAffEnabled] = useState<boolean>(Boolean(p.affiliateEnabled));
  const [affVisible, setAffVisible] = useState<boolean>(Boolean(p.affiliateVisible));
  const [affAutoApprove, setAffAutoApprove] = useState<boolean>(p.affiliateAutoApprove !== false);
  const [affAccessData, setAffAccessData] = useState<boolean>(p.affiliateAccessData !== false);
  const [affAccessAbandoned, setAffAccessAbandoned] = useState<boolean>(
    p.affiliateAccessAbandoned !== false,
  );
  const [affFirstInstallment, setAffFirstInstallment] = useState<boolean>(
    Boolean(p.affiliateFirstInstallment),
  );
  const [comType, setComType] = useState<string>(
    typeof p.commissionType === 'string' ? p.commissionType : 'last_click',
  );
  const [comCookie, setComCookie] = useState(() =>
    clampIntegerValue(p.commissionCookieDays ?? 180, 180, 1, 3650),
  );
  const [comPercent, setComPercent] = useState(() => formatPercentInput(p.commissionPercent, 30));
  const [comLastClick, setComLastClick] = useState(() =>
    formatPercentInput(p.commissionLastClickPercent, 70),
  );
  const [comOther, setComOther] = useState(() =>
    formatPercentInput(p.commissionOtherClicksPercent, 30),
  );
  const [comSaving, setComSaving] = useState(false);
  const [comSaved, setComSaved] = useState(false);

  const subs = [
    { k: 'config', l: 'Configurações' },
    { k: 'afiliados', l: 'Afiliados' },
    { k: 'merchan', l: 'Merchan' },
    { k: 'termos', l: 'Termos' },
    { k: 'coprod', l: 'Coprodução / Gerência' },
  ];

  const handleComSave = async () => {
    setComSaving(true);
    try {
      const summary = unwrapApiPayload(
        await apiFetch(`/products/${productId}/affiliates`, {
          method: 'PUT',
          body: {
            affiliateEnabled: affEnabled,
            affiliateVisible: affVisible,
            affiliateAutoApprove: affAutoApprove,
            affiliateAccessData: affAccessData,
            affiliateAccessAbandoned: affAccessAbandoned,
            affiliateFirstInstallment: affFirstInstallment,
            commissionType: comType,
            commissionCookieDays: clampIntegerValue(comCookie, 180, 1, 3650),
            commissionPercent: parseLocalePercent(comPercent, 30),
            commissionLastClickPercent:
              comType === 'proportional' ? parseLocalePercent(comLastClick, 70) : undefined,
            commissionOtherClicksPercent:
              comType === 'proportional' ? parseLocalePercent(comOther, 30) : undefined,
          },
        }),
      );
      setAffiliateSummary(summary);
      await refreshProduct();
      setComSaved(true);
      setTimeout(() => setComSaved(false), 2000);
      showToast('Comissões salvas', 'success');
    } catch (e) {
      console.error('Commission save error:', e);
      showToast(e instanceof Error ? e.message : 'Erro ao salvar comissões', 'error');
    } finally {
      setComSaving(false);
    }
  };

  return (
    <>
      <TabBar tabs={subs} active={comSub} onSelect={setComSub} small />
      {comSub === 'config' && (
        <div style={{ ...cs, padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
            Programa de Afiliados
          </h3>
          <div
            style={{
              ...cs,
              padding: 12,
              marginBottom: 16,
              background: `${V.y}08`,
              border: `1px solid ${V.y}20`,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: V.y,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>{' '}
              Configurações aplicam apenas para novas afiliações.
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Tg
              label="Participar?"
              checked={affEnabled}
              onChange={setAffEnabled}
              desc="Ativa o programa de afiliados para este produto"
            />
            <Tg
              label="Acesso dados?"
              checked={affAccessData}
              onChange={setAffAccessData}
              desc="Afiliado vê dados completos do cliente"
            />
            <Tg
              label="Visível loja?"
              checked={affVisible}
              onChange={setAffVisible}
              desc="Produto aparece no marketplace para afiliados"
            />
            <Tg
              label="Acesso abandonos?"
              checked={affAccessAbandoned}
              onChange={setAffAccessAbandoned}
              desc="Afiliado vê leads que abandonaram checkout"
            />
            <Tg
              label="Aprovação auto?"
              checked={affAutoApprove}
              onChange={setAffAutoApprove}
              desc="Afiliados são aprovados instantaneamente"
            />
            <Tg
              label="Comissão 1ª parcela?"
              checked={affFirstInstallment}
              onChange={setAffFirstInstallment}
              desc="Para assinaturas: comissão só na primeira parcela"
            />
          </div>
          <Dv />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Fd label="Comissionamento">
              <select style={is} value={comType} onChange={(e) => setComType(e.target.value)}>
                <option value="first_click">Primeiro Clique</option>
                <option value="last_click">Último Clique</option>
                <option value="proportional">Divisão Proporcional</option>
              </select>
            </Fd>
            <IntegerStepperField
              label="Cookie (dias)"
              value={comCookie}
              onChange={setComCookie}
              min={1}
              max={3650}
            />
            <PercentStepperField
              label="Comissão (%)"
              value={comPercent}
              onChange={setComPercent}
              min={0}
              max={100}
            />
          </div>
          {comType === 'proportional' && (
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              <Fd
                label="Último Clique (%)"
                value={comLastClick}
                onChange={(v: string) => {
                  setComLastClick(v);
                  setComOther(formatPercentInput(100 - parseLocalePercent(v, 0), 0));
                }}
              />
              <Fd
                label="Demais Cliques (%)"
                value={comOther}
                onChange={(v: string) => {
                  setComOther(v);
                  setComLastClick(formatPercentInput(100 - parseLocalePercent(v, 0), 0));
                }}
              />
            </div>
          )}
          <Bt primary onClick={handleComSave} style={{ marginTop: 16 }}>
            <svg
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {comSaved ? 'Salvo!' : comSaving ? 'Salvando...' : 'Salvar'}
          </Bt>
        </div>
      )}
      {comSub === 'afiliados' && (
        <AfiliadosSubTab
          productId={productId}
          p={p}
          refreshProduct={refreshProduct}
          setAffiliateSummary={setAffiliateSummary}
          affiliateSummary={affiliateSummary}
          affiliateLoading={affiliateLoading}
          copied={copied}
          cp={cp}
        />
      )}
      {comSub === 'merchan' && (
        <MerchanSubTab
          productId={productId}
          p={p}
          refreshProduct={refreshProduct}
          setAffiliateSummary={setAffiliateSummary}
        />
      )}
      {comSub === 'termos' && (
        <TermosSubTab
          productId={productId}
          p={p}
          refreshProduct={refreshProduct}
          setAffiliateSummary={setAffiliateSummary}
        />
      )}
      {comSub === 'coprod' && (
        <CoprodSubTab productId={productId} initialFocus={initialFocus} router={router} />
      )}
    </>
  );
}
