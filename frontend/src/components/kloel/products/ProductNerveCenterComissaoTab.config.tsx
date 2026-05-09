'use client';

import { kloelT } from '@/lib/i18n/t';
import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import { formatPercentInput, parseLocalePercent } from './ProductNerveCenterComissaoTab.helpers';
import { useCommissionConfigState } from './ProductNerveCenterComissaoTab.hooks';
import { IntegerStepperField, PercentStepperField } from './product-nerve-center.inputs';
import {
  Bt,
  Dv,
  Fd,
  Tg,
  V,
  cs,
  is,
  unwrapApiPayload,
  type JsonRecord,
} from './product-nerve-center.shared';

interface ConfigSubTabProps {
  productId: string;
  p: Record<string, unknown>;
  refreshProduct: () => Promise<void>;
  setAffiliateSummary: (value: JsonRecord | null) => void;
}

export function ConfigSubTab({ productId, p, refreshProduct, setAffiliateSummary }: ConfigSubTabProps) {
  const { showToast } = useToast();
  const {
    affEnabled, setAffEnabled,
    affVisible, setAffVisible,
    affAutoApprove, setAffAutoApprove,
    affAccessData, setAffAccessData,
    affAccessAbandoned, setAffAccessAbandoned,
    affFirstInstallment, setAffFirstInstallment,
    comType, setComType,
    comCookie, setComCookie,
    comPercent, setComPercent,
    comLastClick, setComLastClick,
    comOther, setComOther,
    comSaving, setComSaving,
    comSaved, setComSaved,
  } = useCommissionConfigState(p);

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
            commissionCookieDays: comCookie,
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
  );
}
