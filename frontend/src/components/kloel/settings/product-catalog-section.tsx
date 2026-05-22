'use client';

import { kloelT } from '@/lib/i18n/t';
import { AccordionSection } from './accordion-section';
import { ProductCard } from './product-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { productApi, tokenStorage, type KnowledgeSourceItem } from '@/lib/api';
import { formatCurrency, parseCurrency } from './brain-settings-section.helpers';
import { Package, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface Product {
  id: string;
  name: string;
  type: string;
  price: string;
  description?: string;
  active: boolean;
  files: number;
  activePlansCount: number;
  memberAreasCount: number;
  totalSales: number;
  totalRevenue: number;
}

interface ProductCatalogSectionProps {
  knowledgeSources?: KnowledgeSourceItem[];
  onProductsLoaded?: (products: Product[]) => void;
}

export function ProductCatalogSection({
  knowledgeSources: _knowledgeSources = [],
  onProductsLoaded,
}: ProductCatalogSectionProps) {
  const workspaceId = tokenStorage.getWorkspaceId();
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogSuccess, setCatalogSuccess] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', description: '', price: '', benefits: '', persona: '' });

  const hydrateCatalog = useCallback(async () => {
    if (!workspaceId) { setProducts([]); return; }
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const productResponse = await productApi.list();
      const nextProducts: Product[] = (productResponse.data?.products || []).map((product) => {
        const extended = product as typeof product & { activePlansCount?: number; memberAreasCount?: number; totalSales?: number; totalRevenue?: number };
        return {
          id: extended.id,
          name: extended.name,
          type: extended.category || 'Produto',
          price: formatCurrency(extended.price),
          description: extended.description || '',
          active: extended.active !== false,
          files: 0,
          activePlansCount: Number(extended.activePlansCount || 0),
          memberAreasCount: Number(extended.memberAreasCount || 0),
          totalSales: Number(extended.totalSales || 0),
          totalRevenue: Number(extended.totalRevenue || 0),
        };
      });
      setProducts(nextProducts);
      onProductsLoaded?.(nextProducts);
    } catch (error: unknown) {
      setCatalogError(error instanceof Error ? error.message : 'Nao foi possivel carregar o catalogo.');
    } finally {
      setCatalogLoading(false);
    }
  }, [workspaceId, onProductsLoaded]);

  useEffect(() => { void hydrateCatalog(); }, [hydrateCatalog]);

  const handleAddProduct = async () => {
    if (!workspaceId || !newProduct.name || !newProduct.price) {return;}
    setCatalogLoading(true);
    setCatalogError('');
    setCatalogSuccess('');
    try {
      await productApi.create({ name: newProduct.name, description: newProduct.description, price: parseCurrency(newProduct.price) });
      setNewProduct({ name: '', description: '', price: '', benefits: '', persona: '' });
      setShowAddProduct(false);
      setCatalogSuccess(`Produto ${newProduct.name} criado.`);
      await hydrateCatalog();
    } catch (error: unknown) {
      setCatalogError(error instanceof Error ? error.message : 'Nao foi possivel criar o produto.');
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) {return;}
    setCatalogLoading(true);
    setCatalogError('');
    setCatalogSuccess('');
    try {
      await productApi.remove(productId);
      setCatalogSuccess(`Produto ${product.name} removido.`);
      await hydrateCatalog();
    } catch (error: unknown) {
      setCatalogError(error instanceof Error ? error.message : 'Nao foi possivel remover o produto.');
    } finally {
      setCatalogLoading(false);
    }
  };

  const checkoutLinksCount = useMemo(() => products.reduce((total, p) => total + p.activePlansCount, 0), [products]);

  return (
    <AccordionSection icon={Package} title={kloelT(`Produtos e ofertas`)}>
      <div className="space-y-4">
        {!workspaceId ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {kloelT(`Entre com uma conta conectada para carregar o catalogo real e os links de checkout.`)}
          </div>
        ) : null}
        {catalogError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{catalogError}</div> : null}
        {catalogSuccess ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{catalogSuccess}</div> : null}
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {catalogLoading ? 'Sincronizando produtos e ofertas do Kloel...' : `${products.length} produto(s), ${checkoutLinksCount} checkout(s) ativos e ${products.reduce((t, p) => t + p.memberAreasCount, 0)} area(s) de membros.`}
        </div>
        {products.length > 0 ? (
          <div className="space-y-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onDelete={handleDeleteProduct} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">{kloelT(`Nenhum produto cadastrado ainda.`)}</p>
        )}
        {showAddProduct ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="space-y-3">
              <Input placeholder={kloelT(`Nome do produto`)} value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} className="rounded-xl border-gray-200" />
              <Input placeholder={kloelT(`Preco (ex: R$ 97)`)} value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} className="rounded-xl border-gray-200" />
              <Textarea placeholder={kloelT(`Descricao e beneficios`)} value={newProduct.description} onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })} className="min-h-[60px] rounded-xl border-gray-200" />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowAddProduct(false)} className="flex-1 rounded-xl">{kloelT(`Cancelar`)}</Button>
                <Button onClick={() => void handleAddProduct()} className="flex-1 rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]">{kloelT(`Salvar`)}</Button>
              </div>
            </div>
          </div>
        ) : (
          <Button onClick={() => setShowAddProduct(true)} className="w-full rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]" disabled={!workspaceId}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> {kloelT(`Adicionar produto`)}
          </Button>
        )}
      </div>
    </AccordionSection>
  );
}
