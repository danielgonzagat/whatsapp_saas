'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package,
  Plus,
  Search,
  Filter,
  Loader2,
  ImageIcon,
} from 'lucide-react';
import { colors } from '@/lib/design-tokens';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { apiFetch, tokenStorage } from '@/lib/api';

// ============================================
// TYPES
// ============================================

interface ProductItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  category?: string;
  format: string;
  imageUrl?: string;
  active: boolean;
  status: string;
  tags: string[];
  createdAt: string;
  _count?: { plans: number };
}

// ============================================
// STATUS CONFIG
// ============================================

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  APPROVED: { bg: '#DCFCE7', text: '#16A34A', label: 'Aprovado' },
  PENDING: { bg: '#FEF9C3', text: '#CA8A04', label: 'Pendente' },
  DRAFT: { bg: '#F3F4F6', text: '#6B7280', label: 'Rascunho' },
  REJECTED: { bg: '#FEE2E2', text: '#DC2626', label: 'Reprovado' },
};

// ============================================
// PRODUCT CARD
// ============================================

function ProductCard({ product, onClick }: { product: ProductItem; onClick: () => void }) {
  const statusInfo = STATUS_COLORS[product.status] || STATUS_COLORS.DRAFT;

  return (
    <div
      className="group cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:shadow-md"
      onClick={onClick}
    >
      {/* Image */}
      <div className="relative aspect-[5/4] overflow-hidden bg-gray-100">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-12 w-12 text-gray-300" />
          </div>
        )}
        {/* Status dot */}
        <div
          className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
          style={{ backgroundColor: statusInfo.bg, color: statusInfo.text }}
        >
          {statusInfo.label}
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-900 line-clamp-1">
          {product.name}
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          {product.format === 'PHYSICAL' ? 'Físico' : product.format === 'DIGITAL' ? 'Digital' : 'Híbrido'}
          {product.category ? ` · ${product.category}` : ''}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-bold" style={{ color: colors.brand.primary }}>
            R$ {product.price.toFixed(2).replace('.', ',')}
          </span>
          <button
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            style={{ backgroundColor: colors.brand.primary }}
          >
            MAIS INFORMAÇÕES
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN PAGE
// ============================================

export default function ProductsPage() {
  const router = useRouter();
  const workspaceId = useWorkspaceId();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const perPage = 12;

  const fetchProducts = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ data: ProductItem[] }>('/api/products', {
        params: {
          workspaceId,
          search: searchQuery || undefined,
          status: statusFilter || undefined,
          page: String(page),
          limit: String(perPage),
        },
      });
      setProducts(res.data || []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, searchQuery, statusFilter, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filteredProducts = products;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / perPage));

  return (
    <div className="min-h-screen px-6 py-8" style={{ backgroundColor: colors.background.base }}>
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-2">
          <p className="text-sm text-gray-500">Home → Produtos → Meus produtos</p>
        </div>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Meus produtos</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/products/new')}
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: colors.brand.primary }}
            >
              <Plus className="h-4 w-4" />
              Cadastrar Produto
            </button>
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Filter className="h-4 w-4" />
              Realizar filtro
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        {filterOpen && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">Todos</option>
                  <option value="APPROVED">Aprovado</option>
                  <option value="PENDING">Pendente</option>
                  <option value="DRAFT">Rascunho</option>
                  <option value="REJECTED">Reprovado</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar produtos..."
                    className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: colors.brand.primary }} />
          </div>
        ) : filteredProducts.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 py-20">
            <Package className="mb-4 h-16 w-16 text-gray-300" />
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Nenhum produto cadastrado</h2>
            <p className="mb-6 text-sm text-gray-500">Cadastre seu primeiro produto e comece a vender com o Kloel.</p>
            <button
              onClick={() => router.push('/products/new')}
              className="flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: colors.brand.primary }}
            >
              <Plus className="h-4 w-4" />
              Cadastrar meu primeiro produto
            </button>
          </div>
        ) : (
          /* Product Grid */
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => router.push(`/products/${product.id}`)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-end gap-2">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      page === p
                        ? 'text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                    style={page === p ? { backgroundColor: colors.brand.primary } : {}}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
