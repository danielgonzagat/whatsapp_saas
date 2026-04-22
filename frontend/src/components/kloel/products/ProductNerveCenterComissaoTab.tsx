'use client';

import { kloelT } from '@/lib/i18n/t';
import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import type React from 'react';
import { useCallback, useEffect, useRef, useState, useId } from 'react';
import { useNerveCenterContext } from './product-nerve-center.context';
import { IntegerStepperField, PercentStepperField } from './product-nerve-center.inputs';
import { LabeledFormField } from './LabeledFormField';
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
  JsonRecord,
} from './product-nerve-center.shared';
import {
  clampIntegerValue,
  formatPercentInput,
  formatBrlAmount,
  formatOneDecimalPercent,
  normalizeLinkUrl,
  parseLocalePercent,
  readEditableHtml,
  syncEditableHtml,
} from './ProductNerveCenterComissaoTab.helpers';

/* ── Data shapes for affiliate / coproduction records ── */
interface AffiliateRequestRecord {
  id: string;
  affiliateName?: string;
  affiliateEmail?: string;
  createdAt?: string;
  status?: string;
  [key: string]: unknown;
}

interface AffiliateLinkRecord {
  id: string;
  affiliateName?: string;
  affiliateEmail?: string;
  active?: boolean;
  clicks?: number;
  sales?: number;
  code?: string;
  slug?: string;
  url?: string;
  [key: string]: unknown;
}

interface AffiliateStatsRecord {
  requests?: number;
  pendingRequests?: number;
  activeLinks?: number;
  commission?: number;
  [key: string]: unknown;
}

/* ── Shared prop types for sub-tabs ── */
interface SubTabProps {
  productId: string;
  p: Record<string, unknown>;
  refreshProduct: () => Promise<void>;
  setAffiliateSummary: (v: JsonRecord | null) => void;
}

type RichTextSaveField = 'merchandContent' | 'affiliateTerms';

function DialogFrame({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0, 0, 0, 0.72)',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: V.s,
          border: `1px solid ${V.b}`,
          borderRadius: 6,
          padding: 20,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: V.t }}>{title}</h4>
            {description ? (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: V.t2, lineHeight: 1.5 }}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: V.t3,
              cursor: 'pointer',
              padding: 0,
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label={kloelT(`Fechar`)}
          >
            ×
          </button>
        </div>
        <div style={{ marginTop: 16 }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

function RichTextToolbar({ onInsertLink }: { onInsertLink: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
      {['B', 'I', 'U'].map((token) => (
        <button
          type="button"
          key={token}
          onClick={() =>
            document.execCommand(token === 'B' ? 'bold' : token === 'I' ? 'italic' : 'underline')
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
            fontWeight: token === 'B' ? 'bold' : 'normal',
            fontStyle: token === 'I' ? 'italic' : 'normal',
            textDecoration: token === 'U' ? 'underline' : 'none',
          }}
        >
          {token}
        </button>
      ))}
      <button
        type="button"
        onClick={onInsertLink}
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
        aria-label={kloelT(`Inserir link`)}
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
          <path d={kloelT(`M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71`)} />
          <path d={kloelT(`M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71`)} />
        </svg>
      </button>
    </div>
  );
}

function RichTextEditor({
  editorRef,
  html,
  onChange,
}: {
  editorRef: React.RefObject<HTMLDivElement | null>;
  html: string;
  onChange: (nextHtml: string) => void;
}) {
  useEffect(() => {
    syncEditableHtml(editorRef.current, html);
  }, [editorRef, html]);

  return (
    <div
      ref={editorRef}
      contentEditable
      onInput={(event) => onChange(readEditableHtml(event.currentTarget, html))}
      style={{ minHeight: 140, color: V.t2, fontSize: 13, outline: 'none', fontFamily: S }}
      suppressContentEditableWarning
    />
  );
}

function RichTextContentSubTab({
  productId,
  refreshProduct,
  setAffiliateSummary,
  title,
  description,
  initialValue,
  saveField,
  successToast,
  errorToast,
}: {
  productId: string;
  refreshProduct: () => Promise<void>;
  setAffiliateSummary: (value: JsonRecord | null) => void;
  title: string;
  description?: string;
  initialValue: string;
  saveField: RichTextSaveField;
  successToast: string;
  errorToast: string;
}) {
  const { showToast } = useToast();
  const [content, setContent] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkInputId = useId();
  const editorRef = useRef<HTMLDivElement | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const summary = unwrapApiPayload<JsonRecord | null>(
        await apiFetch(`/products/${productId}/affiliates`, {
          method: 'PUT',
          body: { [saveField]: readEditableHtml(editorRef.current, content) },
        }),
      );
      setAffiliateSummary(summary);
      await refreshProduct();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      showToast(successToast, 'success');
    } catch (error) {
      console.error('Affiliate rich-text save error', { field: saveField, error });
      showToast(error instanceof Error ? error.message : errorToast, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenLinkDialog = () => {
    setLinkValue('');
    setLinkError(null);
    setLinkDialogOpen(true);
  };

  const handleInsertLink = () => {
    const normalizedUrl = normalizeLinkUrl(linkValue);
    if (!normalizedUrl) {
      setLinkError(kloelT(`Informe uma URL válida.`));
      return;
    }

    document.execCommand('createLink', false, normalizedUrl);
    setContent(readEditableHtml(editorRef.current, content));
    setLinkDialogOpen(false);
  };

  return (
    <>
      <div style={{ ...cs, padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: '0 0 8px' }}>{title}</h3>
        {description ? (
          <p style={{ fontSize: 12, color: V.t2, marginBottom: 16 }}>{description}</p>
        ) : null}
        <div style={{ background: V.e, border: `1px solid ${V.b}`, borderRadius: 6, padding: 12 }}>
          <RichTextToolbar onInsertLink={handleOpenLinkDialog} />
          <RichTextEditor editorRef={editorRef} html={content} onChange={setContent} />
        </div>
        <Bt primary onClick={handleSave} style={{ marginTop: 16 }}>
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
          {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar'}
        </Bt>
        {linkDialogOpen ? (
          <DialogFrame
            title={kloelT(`Inserir link`)}
            description={kloelT(
              `Cole a URL completa para transformar o texto selecionado em um link.`,
            )}
            onClose={() => setLinkDialogOpen(false)}
            footer={
              <>
                <Bt onClick={() => setLinkDialogOpen(false)}>{kloelT(`Cancelar`)}</Bt>
                <Bt primary onClick={handleInsertLink}>
                  {kloelT(`Aplicar link`)}
                </Bt>
              </>
            }
          >
            <label
              htmlFor={linkInputId}
              style={{ display: 'block', fontSize: 11, color: V.t3, marginBottom: 8 }}
            >
              {kloelT(`URL do link`)}
            </label>
            <input
              id={linkInputId}
              value={linkValue}
              onChange={(event) => {
                setLinkValue(event.target.value);
                if (linkError) {
                  setLinkError(null);
                }
              }}
              placeholder="https://"
              style={is}
              autoFocus
            />
            {linkError ? (
              <div style={{ marginTop: 8, fontSize: 11, color: V.r }}>{linkError}</div>
            ) : null}
          </DialogFrame>
        ) : null}
      </div>
    </>
  );
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

/* ═══════════════════════════════════════════════════
   MerchanSubTab
   ═══════════════════════════════════════════════════ */
function MerchanSubTab({ productId, p, refreshProduct, setAffiliateSummary }: SubTabProps) {
  return (
    <RichTextContentSubTab
      productId={productId}
      refreshProduct={refreshProduct}
      setAffiliateSummary={setAffiliateSummary}
      title={kloelT(`Merchan`)}
      description={kloelT(`Materiais para afiliados.`)}
      initialValue={String(p.merchandContent ?? '')}
      saveField="merchandContent"
      successToast="Merchan salvo"
      errorToast="Erro ao salvar merchan"
    />
  );
}

/* ═══════════════════════════════════════════════════
   TermosSubTab
   ═══════════════════════════════════════════════════ */
function TermosSubTab({ productId, p, refreshProduct, setAffiliateSummary }: SubTabProps) {
  return (
    <RichTextContentSubTab
      productId={productId}
      refreshProduct={refreshProduct}
      setAffiliateSummary={setAffiliateSummary}
      title={kloelT(`Termos de uso`)}
      initialValue={String(p.affiliateTerms ?? '')}
      saveField="affiliateTerms"
      successToast="Termos salvos"
      errorToast="Erro ao salvar termos"
    />
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
  router: ReturnType<typeof import('next/navigation').useRouter>;
}) {
  const fid = useId();
  const { showToast } = useToast();
  const [items, setItems] = useState<JsonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    role: 'COPRODUCER',
    percentage: '',
    agentName: '',
    agentEmail: '',
  });
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; agentName: string } | null>(null);

  const fetchCommissions = useCallback(() => {
    apiFetch<JsonRecord>(`/products/${productId}/commissions`)
      .then((r) => {
        const d = unwrapApiPayload<JsonRecord[]>(r);
        setItems(
          (Array.isArray(d) ? d : []).filter((c: JsonRecord) =>
            ['COPRODUCER', 'MANAGER'].includes(c.role as string),
          ),
        );
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => {
    fetchCommissions();
  }, [fetchCommissions]);

  const selectedRoleLabel = form.role === 'MANAGER' ? 'gerente' : 'coprodutor';

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
      showToast(`Convite do ${selectedRoleLabel} enviado`, 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : `Erro ao adicionar ${selectedRoleLabel}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await apiFetch(`/products/${productId}/commissions/${deleteTarget.id}`, { method: 'DELETE' });
      fetchCommissions();
      showToast('Coprodutor removido', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao remover coprodutor', 'error');
    } finally {
      setDeleteTarget(null);
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
    <>
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
                {kloelT(`COPRODUÇÃO`)}
              </div>
              <div style={{ fontSize: 12, color: V.t2, marginTop: 4 }}>
                {kloelT(`Cadastre parceiros com divisão automática de receita e acompanhe o impacto em vendas e
              repasses.`)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Bt onClick={() => router.push('/parcerias?tab=afiliados')}>
                {kloelT(`Abrir parcerias`)}
              </Bt>
              <Bt onClick={() => router.push('/vendas?tab=estrategias')}>
                {kloelT(`Ver estratégias`)}
              </Bt>
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
            {kloelT(`Coprodução e gerência`)}
          </h3>
          <Bt primary onClick={() => setShowForm(!showForm)}>
            {kloelT(`+ Adicionar parceiro`)}
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
              <LabeledFormField
                id={`${fid}-papel`}
                label={kloelT(`Papel`)}
                value={form.role}
                onChange={(value) => setForm({ ...form, role: value })}
              >
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  style={inputSt}
                  id={`${fid}-papel`}
                >
                  <option value="COPRODUCER">{kloelT(`Coprodutor`)}</option>
                  <option value="MANAGER">{kloelT(`Gerente`)}</option>
                </select>
              </LabeledFormField>
            </div>
            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}
            >
              <LabeledFormField
                id={`${fid}-nome`}
                label={kloelT(`Nome`)}
                value={form.agentName}
                onChange={(value) => setForm({ ...form, agentName: value })}
                placeholder={kloelT(`Nome do coprodutor`)}
              />
              <LabeledFormField
                id={`${fid}-email`}
                label={kloelT(`E-mail`)}
                value={form.agentEmail}
                onChange={(value) => setForm({ ...form, agentEmail: value })}
                placeholder={kloelT(`email@exemplo.com`)}
                type="email"
              />
            </div>
            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}
            >
              <LabeledFormField
                id={`${fid}-comissao`}
                label={kloelT(`Comissão (%)`)}
                value={form.percentage}
                onChange={(value) => setForm({ ...form, percentage: value })}
                placeholder="10.0"
                type="number"
              />
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <Bt primary onClick={handleCreate} style={{ flex: 1 }}>
                  {creating ? 'Salvando...' : 'Adicionar'}
                </Bt>
                <Bt onClick={() => setShowForm(false)}>{kloelT(`Cancelar`)}</Bt>
              </div>
            </div>
            <div
              style={{
                background: `${V.bl}08`,
                border: `1px solid ${V.bl}16`,
                borderRadius: 6,
                padding: '10px 12px',
                fontSize: 12,
                color: V.t2,
                lineHeight: 1.6,
              }}
            >
              {kloelT(
                `Quando houver e-mail, a Kloel envia o convite automaticamente para o parceiro concluir o cadastro e ativar a conta operacional dele.`,
              )}
            </div>
          </div>
        )}
        {loading ? (
          <PanelLoadingState
            compact
            label={kloelT(`Carregando parceiros`)}
            description={kloelT(
              `A distribuição de coprodução e gerência permanece nesta aba enquanto os repasses sincronizam.`,
            )}
          />
        ) : items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <span style={{ color: V.t3, fontSize: 13 }}>
              {kloelT(`Nenhum parceiro cadastrado`)}
            </span>
          </div>
        ) : (
          items.map((c: JsonRecord) => (
            <div
              key={String(c.id)}
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
                  <path d={kloelT(`M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2`)} />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: V.t }}>
                    {String(c.agentName || 'Sem nome')}
                  </div>
                  <Bg color={c.role === 'MANAGER' ? V.bl : V.em}>
                    {c.role === 'MANAGER' ? 'GERENTE' : 'COPRODUTOR'}
                  </Bg>
                </div>
                <div style={{ fontSize: 11, color: V.t3 }}>{String(c.agentEmail || '—')}</div>
              </div>
              <div style={{ textAlign: 'right', marginRight: 8 }}>
                <span style={{ fontFamily: M, fontSize: 15, fontWeight: 700, color: V.em }}>
                  {formatOneDecimalPercent(c.percentage)}
                </span>
                <div style={{ fontSize: 9, color: V.t3 }}>{kloelT(`comissão`)}</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDeleteTarget({
                    id: String(c.id),
                    agentName: String(c.agentName || 'este coprodutor'),
                  })
                }
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: V.t3,
                  padding: 4,
                }}
                title={kloelT(`Excluir`)}
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
                  <path
                    d={kloelT(
                      `M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2`,
                    )}
                  />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
      {deleteTarget ? (
        <DialogFrame
          title={kloelT(`Excluir coprodutor`)}
          description={[
            kloelT(`Esta ação remove `),
            deleteTarget.agentName,
            kloelT(` da divisão atual de comissão.`),
          ].join('')}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <Bt onClick={() => setDeleteTarget(null)}>{kloelT(`Cancelar`)}</Bt>
              <Bt primary onClick={handleDelete}>
                {kloelT(`Excluir`)}
              </Bt>
            </>
          }
        >
          <div style={{ fontSize: 12, color: V.t2, lineHeight: 1.5 }}>
            {kloelT(`Confirme para remover o vínculo de coprodução ou gerência deste produto.`)}
          </div>
        </DialogFrame>
      ) : null}
    </>
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
  const [affiliateSummary, setAffiliateSummary] = useState<JsonRecord | null>(null);
  const [affiliateLoading, setAffiliateLoading] = useState(false);

  /* ── comSub state (moved from parent) ── */
  const [comSub, setComSub] = useState(
    initialComSub || (initialFocus === 'coproduction' ? 'coprod' : 'config'),
  );

  /* ── load affiliate summary on mount ── */
  const loadAffiliateSummary = useCallback(() => {
    if (!productId) {
      return;
    }
    setAffiliateLoading(true);
    apiFetch(`/products/${productId}/affiliates`)
      .then((res: unknown) => {
        const data = unwrapApiPayload<JsonRecord>(res);
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
      const summary = unwrapApiPayload<JsonRecord | null>(
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
            {kloelT(`Programa de Afiliados`)}
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
                <path
                  d={kloelT(
                    `M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z`,
                  )}
                />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>{' '}
              {kloelT(`Configurações aplicam apenas para novas afiliações.`)}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Tg
              label={kloelT(`Participar?`)}
              checked={affEnabled}
              onChange={setAffEnabled}
              desc={kloelT(`Ativa o programa de afiliados para este produto`)}
            />
            <Tg
              label={kloelT(`Acesso dados?`)}
              checked={affAccessData}
              onChange={setAffAccessData}
              desc={kloelT(`Afiliado vê dados completos do cliente`)}
            />
            <Tg
              label={kloelT(`Visível loja?`)}
              checked={affVisible}
              onChange={setAffVisible}
              desc={kloelT(`Produto aparece no marketplace para afiliados`)}
            />
            <Tg
              label={kloelT(`Acesso abandonos?`)}
              checked={affAccessAbandoned}
              onChange={setAffAccessAbandoned}
              desc={kloelT(`Afiliado vê leads que abandonaram checkout`)}
            />
            <Tg
              label={kloelT(`Aprovação auto?`)}
              checked={affAutoApprove}
              onChange={setAffAutoApprove}
              desc={kloelT(`Afiliados são aprovados instantaneamente`)}
            />
            <Tg
              label={kloelT(`Comissão 1ª parcela?`)}
              checked={affFirstInstallment}
              onChange={setAffFirstInstallment}
              desc={kloelT(`Para assinaturas: comissão só na primeira parcela`)}
            />
          </div>
          <Dv />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Fd label={kloelT(`Comissionamento`)}>
              <select style={is} value={comType} onChange={(e) => setComType(e.target.value)}>
                <option value="first_click">{kloelT(`Primeiro Clique`)}</option>
                <option value="last_click">{kloelT(`Último Clique`)}</option>
                <option value="proportional">{kloelT(`Divisão Proporcional`)}</option>
              </select>
            </Fd>
            <IntegerStepperField
              label={kloelT(`Cookie (dias)`)}
              value={comCookie}
              onChange={setComCookie}
              min={1}
              max={3650}
            />
            <PercentStepperField
              label={kloelT(`Comissão (%)`)}
              value={comPercent}
              onChange={setComPercent}
              min={0}
              max={100}
            />
          </div>
          {comType === 'proportional' && (
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              <Fd
                label={kloelT(`Último Clique (%)`)}
                value={comLastClick}
                onChange={(v: string) => {
                  setComLastClick(v);
                  setComOther(formatPercentInput(100 - parseLocalePercent(v, 0), 0));
                }}
              />
              <Fd
                label={kloelT(`Demais Cliques (%)`)}
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
          p={p as unknown as JsonRecord}
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
          p={p as unknown as JsonRecord}
          refreshProduct={refreshProduct}
          setAffiliateSummary={setAffiliateSummary}
        />
      )}
      {comSub === 'termos' && (
        <TermosSubTab
          productId={productId}
          p={p as unknown as JsonRecord}
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
