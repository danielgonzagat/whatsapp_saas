'use client';
import type { DisplayProduct } from './ProdutosView.types';
import ProductsListing from './ProductsListing';

export default function MeusProdutos({
  displayProducts,
  totalRevenue,
  totalSales,
  activeProducts,
  onDeleteProduct: _onDeleteProduct,
  onCreateProduct,
  requestedFeature: _requestedFeature,
}: {
  displayProducts: DisplayProduct[];
  totalRevenue: number;
  totalSales: number;
  activeProducts: number;
  onDeleteProduct?: (id: string) => void;
  onCreateProduct?: () => void;
  requestedFeature?: string;
}) {
  return (
    <ProductsListing
      displayProducts={displayProducts}
      totalRevenue={totalRevenue}
      totalSales={totalSales}
      activeProducts={activeProducts}
      {...(onCreateProduct ? { onCreateProduct } : {})}
    />
  );
}
