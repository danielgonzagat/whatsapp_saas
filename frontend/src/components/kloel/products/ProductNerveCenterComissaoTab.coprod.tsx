'use client';

import { kloelT } from '@/lib/i18n/t';
import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import type React from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
import { LabeledFormField } from './LabeledFormField';
import {
  Bg,
  Bt,
  M,
  PanelLoadingState,
  S,
  V,
  cs,
  unwrapApiPayload,
  type JsonRecord,
} from './product-nerve-center.shared';
import { formatOneDecimalPercent } from './ProductNerveCenterComissaoTab.helpers';
import { DialogFrame } from './ProductNerveCenterComissaoTab.richtext';

export function CoprodSubTab({
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
