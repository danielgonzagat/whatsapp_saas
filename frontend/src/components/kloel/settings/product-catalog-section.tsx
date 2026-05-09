'use client';

import { kloelT } from '@/lib/i18n/t';
import { AccordionSection } from './accordion-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { productApi, tokenStorage, type KnowledgeSourceItem } from '@/lib/api';
import { formatCurrency, parseCurrency } from './brain-settings-section.helpers';
import { Package, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const workspaceId = tokenStorage.getWorkspaceId();
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogSuccess, setCatalogSuccess] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({
    name: '',
    description: '',
    price: '',
    benefits: '',
    persona: '',
  });

  const hydrateCatalog = useCallback(async () => {
    if (!workspaceId) {
      setProducts([]);
      return;
    }

    setCatalogLoading(true);
    setCatalogError('');

    try {
      const productResponse = await productApi.list();

      const nextProducts = (productResponse.data?.products || []).map((product) => {
        const extended = product as typeof product & {
          activePlansCount?: number;
          memberAreasCount?: number;
          totalSales?: number;
          totalRevenue?: number;
        };
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
        } satisfies Product;
      });

      setProducts(nextProducts);
      onProductsLoaded?.(nextProducts);
    } catch (error: unknown) {
      setCatalogError(
        error instanceof Error ? error.message : 'Nao foi possivel carregar o catalogo do Kloel.',
      );
    } finally {
      setCatalogLoading(false);
    }
  }, [workspaceId, onProductsLoaded]);

  useEffect(() => {
    void hydrateCatalog();
  }, [hydrateCatalog]);

  const handleAddProduct = async () => {
    if (!workspaceId || !newProduct.name || !newProduct.price) {
      return;
    }

    setCatalogLoading(true);
    setCatalogError('');
    setCatalogSuccess('');

    try {
      await productApi.create({
        name: newProduct.name,
        description: newProduct.description,
        price: parseCurrency(newProduct.price),
      });
      setNewProduct({ name: '', description: '', price: '', benefits: '', persona: '' });
      setShowAddProduct(false);
      setCatalogSuccess(`Produto ${newProduct.name} criado com sucesso.`);
      await hydrateCatalog();
    } catch (error: unknown) {
      setCatalogError(error instanceof Error ? error.message : 'Nao foi possivel criar o produto.');
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      return;
    }

    setCatalogLoading(true);
    setCatalogError('');
    setCatalogSuccess('');

    try {
      await productApi.remove(productId);
      setCatalogSuccess(`Produto ${product.name} removido.`);
      await hydrateCatalog();
    } catch (error: unknown) {
      setCatalogError(
        error instanceof Error ? error.message : 'Nao foi possivel remover o produto.',
      );
    } finally {
      setCatalogLoading(false);
    }
  };

  const checkoutLinksCount = useMemo(
    () => products.reduce((total, product) => total + product.activePlansCount, 0),
    [products],
  );

  return (
    <AccordionSection icon={Package} title={kloelT(`Produtos e ofertas`)}>
      <div className="space-y-4">
        {!workspaceId ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {kloelT(
              `Entre com uma conta conectada para carregar o catalogo real e os links de checkout.`,
            )}
          </div>
        ) : null}

        {catalogError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {catalogError}
          </div>
        ) : null}

        {catalogSuccess ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {catalogSuccess}
          </div>
        ) : null}

        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {catalogLoading
            ? 'Sincronizando produtos e ofertas do Kloel...'
            : `${products.length} produto(s), ${checkoutLinksCount} checkout(s) ativos e ${products.reduce((total, product) => total + product.memberAreasCount, 0)} area(s) de membros vinculadas.`}
        </div>

        {products.length > 0 ? (
          <div className="space-y-3">
            {products.map((product) => (
              <div key={product.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{product.name}</p>
                    <p className="text-sm text-gray-500">
                      {product.type} - {product.price}
                    </p>
                    {product.description ? (
                      <p className="mt-1 text-xs leading-relaxed text-gray-500">
                        {product.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingProductId(editingProductId === product.id ? null : product.id)
                      }
                      className="rounded-lg p-2 text-gray-500 hover:bg-gray-200"
                    >
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteProduct(product.id)}
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {editingProductId === product.id && (
                  <div className="rounded-xl border border-[colors.text.silver]/40 bg-white p-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      {[
                        { label: 'Checkouts ativos', value: product.activePlansCount },
                        { label: 'Areas de membros', value: product.memberAreasCount },
                        { label: 'Vendas', value: product.totalSales },
                        {
                          label: 'Receita',
                          value: formatCurrency(product.totalRevenue) || 'R$ 0,00',
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3"
                        >
                          <p className="text-[11px] uppercase tracking-wide text-gray-500">
                            {item.label}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 rounded-xl border border-dashed border-[colors.text.silver]/50 bg-[#FCFBF9] px-4 py-3 text-sm text-gray-600">
                      {product.activePlansCount > 0
                        ? 'Este produto ja possui checkout operando dentro do Kloel.'
                        : 'Os checkouts deste produto sao criados e operados internamente pelo Kloel na tela de editar produto.'}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        onClick={() => router.push(`/products/${product.id}`)}
                        className="rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]"
                      >
                        {kloelT(`Abrir produto`)}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => router.push(`/products/${product.id}?tab=planos`)}
                        className="rounded-xl"
                      >
                        {kloelT(`Abrir checkouts`)}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">{kloelT(`Nenhum produto cadastrado ainda.`)}</p>
        )}

        {showAddProduct ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="space-y-3">
              <Input
                placeholder={kloelT(`Nome do produto`)}
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                className="rounded-xl border-gray-200"
              />
              <Input
                placeholder={kloelT(`Preco (ex: R$ 97)`)}
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                className="rounded-xl border-gray-200"
              />
              <Textarea
                placeholder={kloelT(`Descricao e beneficios`)}
                value={newProduct.description}
                onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                className="min-h-[60px] rounded-xl border-gray-200"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowAddProduct(false)}
                  className="flex-1 rounded-xl"
                >
                  {kloelT(`Cancelar`)}
                </Button>
                <Button
                  onClick={() => void handleAddProduct()}
                  className="flex-1 rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]"
                >
                  {kloelT(`Salvar`)}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setShowAddProduct(true)}
            className="w-full rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]"
            disabled={!workspaceId}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> {kloelT(`Adicionar produto`)}
          </Button>
        )}
      </div>
    </AccordionSection>
  );
}
