import { KLOEL_THEME } from '@/lib/kloel-theme';
import { sectionTitleStyle, secondaryButtonStyle } from './shared-styles';

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

/**
 * Selectable product cards wired to the REAL product list from the channel
 * setup hook (id + name only — no invented price/affiliate data). Theme-token
 * based so it renders correctly in light and dark.
 */
export function StepProducts({
  productOptions,
  selectedProductIds,
  onToggleProduct,
  busy,
  onSave,
}: Props) {
  const total = productOptions.length;
  const selectedSet = new Set(selectedProductIds);
  const selectedCount = productOptions.filter((p) => selectedSet.has(p.id)).length;
  const allSelected = total > 0 && selectedCount === total;

  const toggleAll = () => {
    if (allSelected) {
      for (const p of productOptions) {
        if (selectedSet.has(p.id)) {
          onToggleProduct(p.id);
        }
      }
    } else {
      for (const p of productOptions) {
        if (!selectedSet.has(p.id)) {
          onToggleProduct(p.id);
        }
      }
    }
  };

  return (
    <div>
      <h2 style={sectionTitleStyle}>Produtos liberados no canal</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: KLOEL_THEME.textSecondary }}>
        Escolha quais produtos a IA pode vender neste canal. Seus produtos e afiliações
        aprovadas aparecem aqui.
      </p>

      {total === 0 ? (
        <p
          style={{
            padding: '14px 16px',
            borderRadius: 6,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            background: KLOEL_THEME.bgSecondary,
            color: KLOEL_THEME.textSecondary,
            fontSize: 13,
          }}
        >
          Nenhum produto cadastrado ainda. Cadastre produtos para liberar ofertas neste
          canal.
        </p>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: KLOEL_THEME.textSecondary,
              }}
            >
              {selectedCount} de {total} selecionados
            </span>
            <button
              type="button"
              onClick={toggleAll}
              style={{
                background: 'transparent',
                border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                borderRadius: 4,
                padding: '6px 12px',
                color: KLOEL_THEME.textSecondary,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {productOptions.map((product) => {
              const selected = selectedSet.has(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onToggleProduct(product.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    background: selected
                      ? KLOEL_THEME.accentLight
                      : KLOEL_THEME.bgSecondary,
                    border: `1.5px solid ${
                      selected ? KLOEL_THEME.accent : KLOEL_THEME.borderPrimary
                    }`,
                    borderRadius: 6,
                    padding: 14,
                    cursor: 'pointer',
                    transition: 'all .2s',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: 600,
                      color: KLOEL_THEME.textPrimary,
                    }}
                  >
                    {product.name}
                  </span>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      flexShrink: 0,
                      border: `2px solid ${
                        selected ? KLOEL_THEME.accent : KLOEL_THEME.borderPrimary
                      }`,
                      background: selected ? KLOEL_THEME.accent : 'transparent',
                      color: KLOEL_THEME.textOnAccent,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {selected ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onSave}
        style={{ ...secondaryButtonStyle, marginTop: 18 }}
      >
        {busy === 'setup' ? 'Salvando...' : 'Salvar produtos'}
      </button>
    </div>
  );
}
