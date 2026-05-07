'use client';

import { kloelT } from '@/lib/i18n/t';
import { RichTextContentSubTab } from './ProductNerveCenterComissaoTab.richtext';
import type { SubTabProps } from './ProductNerveCenterComissaoTab.types';

export function MerchanSubTab({ productId, p, refreshProduct, setAffiliateSummary }: SubTabProps) {
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

export function TermosSubTab({ productId, p, refreshProduct, setAffiliateSummary }: SubTabProps) {
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
