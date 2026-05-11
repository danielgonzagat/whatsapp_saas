'use client';

import {
  SUBINTERFACE_PILL_ROW_STYLE,
  getSubinterfacePillStyle,
} from '@/components/kloel/ui/subinterface-pill';
import { useMemberAreas } from '@/hooks/useMemberAreas';
import { useProductMutations, useProducts } from '@/hooks/useProducts';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { affiliateApi } from '@/lib/api/affiliate';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useCallback, useEffect, useState } from 'react';

import { SORA, ANIMATIONS, PURPLE, getProductPlanPriceSummary } from './ProdutosView.shared';
import {
  type DisplayProduct,
  type DisplayArea,
  type MarketplaceItem,
  type MarketplaceStats,
  type AffiliateLink,
  type AffiliateProductItem,
  type RawProductPayload,
  type RawAreaPayload,
} from './ProdutosView.types';
import { normalizeDisplayProduct } from './ProdutosView.helpers';

import MeusProdutos from './ProdutosMeusProdutosTab';
import AreaMembros from './ProdutosAreaMembrosTab';
import AfiliarSe from './ProdutosAfiliarSeTab';

const TABS = [
  { key: 'produtos', label: 'Meus Produtos', color: PURPLE, route: '/products' },
  { key: 'membros', label: 'Area de Membros', color: PURPLE, route: '/produtos/area-membros' },
  { key: 'afiliar', label: 'Afiliar-se', color: PURPLE, route: '/produtos/afiliar-se' },
];

export default function ProdutosView({ defaultTab = 'produtos' }: { defaultTab?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isMobile } = useResponsiveViewport();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const requestedFeature = searchParams?.get('feature') || '';

  const { products: rawProducts, mutate: mutateProducts } = useProducts();
  const { areas: rawAreas, mutate: mutateAreas } = useMemberAreas();
  const { deleteProduct } = useProductMutations();

  const [marketplace, setMarketplace] = useState<MarketplaceItem[]>([]);
  const [marketplaceStats, setMarketplaceStats] = useState<MarketplaceStats>({});
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLink[]>([]);
  const [affiliateTotals, setAffiliateTotals] = useState<{
    clicks: number;
    sales: number;
    revenue: number;
    commission: number;
  }>({
    clicks: 0,
    sales: 0,
    revenue: 0,
    commission: 0,
  });
  const [affiliateProducts, setAffiliateProducts] = useState<AffiliateProductItem[]>([]);

  const hydrateAffiliate = useCallback(async () => {
    try {
      const [marketplaceResponse, statsResponse, linksResponse, productsResponse] =
        await Promise.all([
          affiliateApi.marketplace(),
          affiliateApi.marketplaceStats(),
          affiliateApi.myLinks(),
          affiliateApi.myProducts(),
        ]);

      const mktData = marketplaceResponse.data;
      setMarketplace(Array.isArray(mktData?.products) ? mktData.products : []);
      const sData = statsResponse.data;
      setMarketplaceStats(sData ?? {});
      const lnkData = linksResponse.data;
      setAffiliateLinks(Array.isArray(lnkData?.links) ? lnkData.links : []);
      setAffiliateTotals(lnkData?.totals ?? { clicks: 0, sales: 0, revenue: 0, commission: 0 });
      const prdData = productsResponse.data;
      setAffiliateProducts(Array.isArray(prdData) ? prdData : []);
    } catch {
      setMarketplace([]);
      setMarketplaceStats({});
      setAffiliateLinks([]);
      setAffiliateTotals({ clicks: 0, sales: 0, revenue: 0, commission: 0 });
      setAffiliateProducts([]);
    }
  }, []);

  useEffect(() => {
    void hydrateAffiliate();
  }, [hydrateAffiliate]);

  const displayProducts: DisplayProduct[] = Array.isArray(rawProducts)
    ? (rawProducts as RawProductPayload[]).map((p) =>
        normalizeDisplayProduct(p, getProductPlanPriceSummary(p)),
      )
    : [];

  const displayAreas: DisplayArea[] = Array.isArray(rawAreas)
    ? (rawAreas as RawAreaPayload[]).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type || 'COURSE',
        description: a.description || '',
        students: a.studentsCount || a.totalStudents || a.students || 0,
        modules: a.modulesCount || a.totalModules || a.modules || 0,
        modulesCount: a.modulesCount || a.totalModules || a.modules || 0,
        lessonsCount: a.lessonsCount || a.totalLessons || 0,
        completion: a.avgCompletion || a.completion || 0,
        status: a.status || 'active',
        active: a.active !== false,
        productId: a.productId || '',
        productName: displayProducts.find((product) => product.id === a.productId)?.name || '',
        slug: a.slug || '',
        template: a.template || 'academy',
        primaryColor: a.primaryColor || PURPLE,
        logoUrl: a.logoUrl || '',
        coverUrl: a.coverUrl || '',
        certificates: a.certificates !== false,
        quizzes: a.quizzes !== false,
        community: a.community === true,
        gamification: a.gamification !== false,
        progressTrack: a.progressTrack !== false,
        downloads: a.downloads !== false,
        comments: a.comments !== false,
        createdAt: a.createdAt || '',
        updatedAt: a.updatedAt || '',
        modules_list: a.modules_list || a.modulesList || a.Modules || [],
      }))
    : [];

  const totalRevenue = displayProducts.reduce(
    (s, p) => s + (p.revenue || p.price * (p.sales || 0)),
    0,
  );
  const totalSales = displayProducts.reduce((s, p) => s + (p.sales || 0), 0);
  const activeProducts = displayProducts.filter((p) => p.status === 'active').length;
  const totalStudents = displayAreas.reduce((s, a) => s + (a.students || 0), 0);
  const areasWithCompletion = displayAreas.filter((a) => a.completion > 0);
  const avgCompletion =
    areasWithCompletion.length > 0
      ? Math.round(
          areasWithCompletion.reduce((s, a) => s + a.completion, 0) / areasWithCompletion.length,
        )
      : 0;
  const earnings = Number(affiliateTotals.commission || 0);

  const handleDeleteProduct = useCallback(
    async (id: string) => {
      try {
        await deleteProduct(id);
        mutateProducts();
      } catch (e) {
        console.error(e);
      }
    },
    [deleteProduct, mutateProducts],
  );

  const handleTabChange = useCallback(
    (key: string) => {
      setActiveTab(key);
      const tab = TABS.find((t) => t.key === key);
      if (!tab || pathname === tab.route) {
        return;
      }
      startTransition(() => {
        router.push(tab.route);
      });
    },
    [pathname, router],
  );

  const buildFeatureHref = useCallback((productId: string, feature: string) => {
    switch (feature) {
      case 'recommendation':
        return `/products/${productId}?tab=campanhas&focus=recommendations`;
      case 'order-bump':
        return `/products/${productId}?tab=planos&planSub=bump&focus=order-bump`;
      case 'coupon':
        return `/products/${productId}?tab=cupons&modal=newCoupon&focus=coupon`;
      case 'coproduction':
        return `/products/${productId}?tab=comissao&comSub=coprod&focus=coproduction`;
      case 'checkout-appearance':
        return `/products/${productId}?tab=checkouts&focus=checkout-appearance`;
      case 'payment-widget':
        return `/products/${productId}?tab=checkouts&focus=payment-widget`;
      case 'urgency':
        return `/products/${productId}?tab=ia&focus=urgency`;
      default:
        return `/products/${productId}`;
    }
  }, []);

  useEffect(() => {
    if (!requestedFeature || activeTab !== 'produtos' || displayProducts.length === 0) {
      return;
    }
    router.replace(buildFeatureHref(displayProducts[0].id, requestedFeature));
  }, [requestedFeature, activeTab, displayProducts, router, buildFeatureHref]);

  return (
    <div
      data-testid="products-view-root"
      style={{
        minHeight: '100vh',
        background: 'var(--app-bg-primary)',
        color: 'var(--app-text-primary)',
        fontFamily: SORA,
        padding: isMobile ? 16 : 24,
      }}
    >
      <style>{ANIMATIONS}</style>

      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div
          style={{
            ...SUBINTERFACE_PILL_ROW_STYLE,
            scrollbarWidth: 'none',
          }}
        >
          {TABS.filter((t) => t.key !== 'membros').map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                type="button"
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                style={getSubinterfacePillStyle(isActive, isMobile)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'produtos' && (
          <MeusProdutos
            displayProducts={displayProducts}
            totalRevenue={totalRevenue}
            totalSales={totalSales}
            activeProducts={activeProducts}
            onDeleteProduct={handleDeleteProduct}
            onCreateProduct={() => router.push('/products/new')}
            requestedFeature={requestedFeature}
          />
        )}
        {activeTab === 'membros' && (
          <AreaMembros
            totalStudents={totalStudents}
            displayAreas={displayAreas}
            avgCompletion={avgCompletion}
            mutateAreas={mutateAreas}
            productOptions={displayProducts}
          />
        )}
        {activeTab === 'afiliar' && (
          <AfiliarSe
            marketplace={marketplace}
            earnings={earnings}
            marketplaceStats={marketplaceStats}
            affiliateLinks={affiliateLinks}
            affiliateProducts={affiliateProducts}
            onRefresh={hydrateAffiliate}
          />
        )}
      </div>
    </div>
  );
}
