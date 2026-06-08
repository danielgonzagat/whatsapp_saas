'use client';

import { kloelT } from '@/lib/i18n/t';
import { useToast } from '@/components/kloel/ToastProvider';
import { useState } from 'react';
import { useNerveCenterContext } from './product-nerve-center.context';
import { Bt, Fd, Tg, V, cs, is, unwrapApiPayload } from './product-nerve-center.shared';

type AfterPayPayload = {
  afterPayDuplicateAddress: boolean;
  afterPayAffiliateCharge: boolean;
  afterPayChargeValue: number | null;
  afterPayShippingProvider: string | null;
};

export type AfterPayDraft = {
  duplicateAddress: boolean;
  affiliateCharge: boolean;
  chargeValue: string;
  shippingProvider: string;
};

export type AfterPayDraftResult =
  | { ok: true; payload: AfterPayPayload }
  | { ok: false; message: string };

export const AFTER_PAY_CHARGE_VALUE_ERROR = 'Informe um valor de cobrança maior que zero.';

export function formatAfterPayChargeValue(value: unknown): string {
  const parsedValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value.trim().replace(',', '.'))
        : null;

  if (parsedValue === null || !Number.isFinite(parsedValue) || parsedValue <= 0) {
    return '';
  }

  return parsedValue.toLocaleString('pt-BR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

export function buildAfterPayPayload(draft: AfterPayDraft): AfterPayDraftResult {
  const normalizedProvider = draft.shippingProvider.trim();
  const normalizedChargeValue = draft.chargeValue.trim().replace(',', '.');
  const parsedChargeValue = Number(normalizedChargeValue);

  if (
    draft.affiliateCharge &&
    (!normalizedChargeValue || !Number.isFinite(parsedChargeValue) || parsedChargeValue <= 0)
  ) {
    return { ok: false, message: AFTER_PAY_CHARGE_VALUE_ERROR };
  }

  return {
    ok: true,
    payload: {
      afterPayDuplicateAddress: draft.duplicateAddress,
      afterPayAffiliateCharge: draft.affiliateCharge,
      afterPayChargeValue: draft.affiliateCharge ? parsedChargeValue : null,
      afterPayShippingProvider: normalizedProvider || null,
    },
  };
}

/** Product nerve center after pay tab. */
export function ProductNerveCenterAfterPayTab() {
  const { productId, p, updateProduct, refreshProduct } = useNerveCenterContext();
  const { showToast } = useToast();

  const [apDup, setApDup] = useState<boolean>(Boolean(p.afterPayDuplicateAddress));
  const [apCharge, setApCharge] = useState<boolean>(Boolean(p.afterPayAffiliateCharge));
  const [apChargeVal, setApChargeVal] = useState(() =>
    formatAfterPayChargeValue(p.afterPayChargeValue),
  );
  const [apProvider, setApProvider] = useState<string>(
    typeof p.afterPayShippingProvider === 'string' ? p.afterPayShippingProvider : '',
  );
  const [apSaving, setApSaving] = useState(false);
  const [apSaved, setApSaved] = useState(false);
  const [apError, setApError] = useState('');

  const handleSaveAP = async () => {
    if (apSaving) {
      return;
    }

    const result = buildAfterPayPayload({
      duplicateAddress: apDup,
      affiliateCharge: apCharge,
      chargeValue: apChargeVal,
      shippingProvider: apProvider,
    });

    if (!result.ok) {
      setApError(result.message);
      showToast(result.message, 'error');
      return;
    }

    setApError('');
    setApSaving(true);
    try {
      unwrapApiPayload(await updateProduct(productId, result.payload));
      await refreshProduct();
      setApSaved(true);
      setTimeout(() => setApSaved(false), 2000);
      showToast('Configurações salvas', 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao salvar configurações';
      setApError(message);
      showToast(message, 'error');
    } finally {
      setApSaving(false);
    }
  };

  return (
    <div style={{ ...cs, padding: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: '0 0 20px' }}>
        {kloelT(`Configurações After Pay`)}
      </h2>
      <div style={{ ...cs, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
          {kloelT(`Configurações de Venda`)}
        </h3>
        <Tg
          label={kloelT(`Permitir endereço duplicado na venda pós-paga?`)}
          checked={apDup}
          onChange={(checked) => {
            setApError('');
            setApDup(checked);
          }}
        />
      </div>
      <div style={{ ...cs, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
          {kloelT(`Configurações de Afiliados`)}
        </h3>
        <Tg
          label={kloelT(`Cobrança do afiliado por pedido frustrado?`)}
          checked={apCharge}
          onChange={(checked) => {
            setApError('');
            setApCharge(checked);
          }}
        />
        {apCharge && (
          <Fd
            label={kloelT(`Valor cobrança (R$)`)}
            value={apChargeVal}
            onChange={(value) => {
              setApError('');
              setApChargeVal(value);
            }}
          />
        )}
      </div>
      <div style={{ ...cs, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
          {kloelT(`Configurações de Envio`)}
        </h3>
        <Fd label={kloelT(`Provedor logístico`)} full>
          <select
            style={is}
            value={apProvider}
            onChange={(e) => {
              setApError('');
              setApProvider(e.target.value);
            }}
          >
            <option value="">{kloelT(`Selecione um provedor`)}</option>
            <option value="correios">{kloelT(`Correios`)}</option>
            <option value="jadlog">{kloelT(`Jadlog`)}</option>
            <option value="melhor_envio">{kloelT(`Melhor Envio`)}</option>
            <option value="outro">{kloelT(`Outro`)}</option>
          </select>
        </Fd>
      </div>
      {apError && (
        <div
          role="alert"
          style={{
            marginTop: 14,
            padding: '9px 11px',
            borderRadius: 6,
            border: `1px solid ${V.r}`,
            background: `color-mix(in srgb, ${V.r} 14%, transparent)`,
            color: V.t,
            fontSize: 11,
          }}
        >
          {apError}
        </div>
      )}
      <Bt primary disabled={apSaving} onClick={handleSaveAP} style={{ marginTop: 16 }}>
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
        {apSaved ? 'Salvo!' : apSaving ? 'Salvando...' : 'Salvar'}
      </Bt>
    </div>
  );
}
