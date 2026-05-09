'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/ui/button';
import { formatCurrency } from './brain-settings-section.helpers';
import { Sparkles, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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

interface ProductCardProps {
  product: Product;
  onDelete: (productId: string) => void;
}

export function ProductCard({ product, onDelete }: ProductCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="font-medium text-gray-900">{product.name}</p>
          <p className="text-sm text-gray-500">{product.type} - {product.price}</p>
          {product.description ? (
            <p className="mt-1 text-xs leading-relaxed text-gray-500">{product.description}</p>
          ) : null}
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => setIsExpanded(!isExpanded)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-200">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => void onDelete(product.id)} className="rounded-lg p-2 text-red-500 hover:bg-red-50">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="rounded-xl border border-[colors.text.silver]/40 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: 'Checkouts ativos', value: product.activePlansCount },
              { label: 'Areas de membros', value: product.memberAreasCount },
              { label: 'Vendas', value: product.totalSales },
              { label: 'Receita', value: formatCurrency(product.totalRevenue) || 'R$ 0,00' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">{item.label}</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-dashed border-[colors.text.silver]/50 bg-[#FCFBF9] px-4 py-3 text-sm text-gray-600">
            {product.activePlansCount > 0 ? 'Este produto ja possui checkout operando dentro do Kloel.' : 'Os checkouts deste produto sao criados e operados internamente pelo Kloel na tela de editar produto.'}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => router.push(`/products/${product.id}`)} className="rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]">
              {kloelT(`Abrir produto`)}
            </Button>
            <Button variant="outline" onClick={() => router.push(`/products/${product.id}?tab=planos`)} className="rounded-xl">
              {kloelT(`Abrir checkouts`)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
