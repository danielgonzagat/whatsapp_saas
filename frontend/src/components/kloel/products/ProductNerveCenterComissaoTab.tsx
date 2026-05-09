'use client';

import { useState } from 'react';
import { useNerveCenterContext } from './product-nerve-center.context';
import { TabBar } from './product-nerve-center.shared';
import { useAffiliateSummary } from './ProductNerveCenterComissaoTab.hooks';
import { AfiliadosSubTab } from './ProductNerveCenterComissaoTab.afiliados';
import { CoprodSubTab } from './ProductNerveCenterComissaoTab.coprod';
import { MerchanSubTab, TermosSubTab } from './ProductNerveCenterComissaoTab.content';
import { ConfigSubTab } from './ProductNerveCenterComissaoTab.config';

const subs = [
  { k: 'config', l: 'Configurações' },
  { k: 'afiliados', l: 'Afiliados' },
  { k: 'merchan', l: 'Merchan' },
  { k: 'termos', l: 'Termos' },
  { k: 'coprod', l: 'Coprodução / Gerência' },
];

/** Product nerve center comissao tab. */
export function ProductNerveCenterComissaoTab() {
  const { productId, p, refreshProduct, copied, cp, initialFocus, initialComSub, router } =
    useNerveCenterContext();

  const { affiliateSummary, setAffiliateSummary, affiliateLoading } = useAffiliateSummary(productId);

  const [comSub, setComSub] = useState(
    initialComSub || (initialFocus === 'coproduction' ? 'coprod' : 'config'),
  );

  return (
    <>
      <TabBar tabs={subs} active={comSub} onSelect={setComSub} small />
      {comSub === 'config' && (
        <ConfigSubTab
          productId={productId}
          p={p}
          refreshProduct={refreshProduct}
          setAffiliateSummary={setAffiliateSummary}
        />
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
        <CoprodSubTab
          productId={productId}
          router={router}
          {...(initialFocus ? { initialFocus } : {})}
        />
      )}
    </>
  );
}
