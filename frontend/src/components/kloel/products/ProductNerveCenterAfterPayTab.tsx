'use client';

import { useToast } from '@/components/kloel/ToastProvider';
import { useState } from 'react';
import { useNerveCenterContext } from './product-nerve-center.context';
import { Bt, Fd, Tg, V, cs, is, unwrapApiPayload } from './product-nerve-center.shared';

/** Product nerve center after pay tab. */
export function ProductNerveCenterAfterPayTab() {
  const { productId, p, updateProduct, refreshProduct } = useNerveCenterContext();
  const { showToast } = useToast();

  const [apDup, setApDup] = useState<boolean>(Boolean(p.afterPayDuplicateAddress));
  const [apCharge, setApCharge] = useState<boolean>(Boolean(p.afterPayAffiliateCharge));
  const [apChargeVal, setApChargeVal] = useState(
    p.afterPayChargeValue ? String(p.afterPayChargeValue) : '',
  );
  const [apProvider, setApProvider] = useState<string>(
    typeof p.afterPayShippingProvider === 'string' ? p.afterPayShippingProvider : '',
  );
  const [apSaving, setApSaving] = useState(false);
  const [apSaved, setApSaved] = useState(false);
  const handleSaveAP = async () => {
    setApSaving(true);
    try {
      unwrapApiPayload(
        await updateProduct(productId, {
          afterPayDuplicateAddress: apDup,
          afterPayAffiliateCharge: apCharge,
          afterPayChargeValue: apCharge ? Number.parseFloat(apChargeVal) || 0 : null,
          afterPayShippingProvider: apProvider || null,
        }),
      );
      await refreshProduct();
      setApSaved(true);
      setTimeout(() => setApSaved(false), 2000);
      showToast('Configurações salvas', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao salvar configurações', 'error');
    } finally {
      setApSaving(false);
    }
  };
  return (
    <div style={{ ...cs, padding: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: '0 0 20px' }}>
        Configurações After Pay
      </h2>
      <div style={{ ...cs, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
          Configurações de Venda
        </h3>
        <Tg
          label="Permitir endereço duplicado na venda pós-paga?"
          checked={apDup}
          onChange={setApDup}
        />
      </div>
      <div style={{ ...cs, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
          Configurações de Afiliados
        </h3>
        <Tg
          label="Cobrança do afiliado por pedido frustrado?"
          checked={apCharge}
          onChange={setApCharge}
        />
        {apCharge && (
          <Fd label="Valor cobrança (R$)" value={apChargeVal} onChange={setApChargeVal} />
        )}
      </div>
      <div style={{ ...cs, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
          Configurações de Envio
        </h3>
        <Fd label="Provedor logístico" full>
          <select style={is} value={apProvider} onChange={(e) => setApProvider(e.target.value)}>
            <option value="">Selecione um provedor</option>
            <option value="correios">Correios</option>
            <option value="jadlog">Jadlog</option>
            <option value="melhor_envio">Melhor Envio</option>
            <option value="outro">Outro</option>
          </select>
        </Fd>
      </div>
      <Bt primary onClick={handleSaveAP} style={{ marginTop: 16 }}>
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
