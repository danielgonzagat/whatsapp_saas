import { KLOEL_THEME } from '@/lib/kloel-theme';
import { sectionTitleStyle, productRowStyle, secondaryButtonStyle } from './shared-styles';

interface ProductOption {
  id: string;
  name: string;
}

interface Props {
  productOptions: ProductOption[];
  selectedProductIds: string[];
  onToggleProduct: (productId: string) => void;
  busy: string | null;
  onSave: () => void;
}

export function StepProducts({
  productOptions,
  selectedProductIds,
  onToggleProduct,
  busy,
  onSave,
}: Props) {
  return (
    <div>
      <h2 style={sectionTitleStyle}>Produtos liberados no canal</h2>
      {productOptions.length === 0 ? (
        <p style={{ color: KLOEL_THEME.textSecondary }}>
          Nenhum produto cadastrado ainda. Cadastre produtos para liberar ofertas neste
          canal.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {productOptions.map((product) => (
            <label key={product.id} style={productRowStyle}>
              <span>{product.name}</span>
              <input
                type="checkbox"
                checked={selectedProductIds.includes(product.id)}
                onChange={() => onToggleProduct(product.id)}
              />
            </label>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onSave}
        style={{ ...secondaryButtonStyle, marginTop: 14 }}
      >
        {busy === 'setup' ? 'Salvando...' : 'Salvar produtos'}
      </button>
    </div>
  );
}
