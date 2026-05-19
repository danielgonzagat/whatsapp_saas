import { KLOEL_THEME } from '@/lib/kloel-theme';
import {
  sectionTitleStyle,
  secondaryButtonStyle,
  inputStyle,
  textAreaStyle,
} from './shared-styles';

interface ProductOption {
  id: string;
  name: string;
}

interface Props {
  arsenal: string[];
  onArsenalChange: (value: string) => void;
  productOptions: ProductOption[];
  selectedProductIds: string[];
  busy: string | null;
  onSave: () => void;
}

/** Media type catalogue — text labels only (no emoji, per visual contract). */
const MEDIA_TYPES = [
  { value: 'photo', label: 'Foto do produto' },
  { value: 'video', label: 'Vídeo de demonstração' },
  { value: 'audio', label: 'Áudio / depoimento' },
  { value: 'testimonial', label: 'Print de depoimento' },
  { value: 'result', label: 'Prova de resultado' },
  { value: 'document', label: 'Documento / certificado' },
  { value: 'bonus', label: 'Bônus incluído' },
] as const;

interface MediaItem {
  type: string;
  productId: string;
  description: string;
}

/**
 * Each media item is persisted as ONE JSON line inside the existing real
 * `arsenal: string[]` (no backend/schema change). Legacy plain-text lines are
 * read back gracefully as a description-only item. Fully controlled by the
 * parent (arsenal prop is the single source of truth).
 */
function parseArsenal(arsenal: string[]): MediaItem[] {
  return arsenal
    .map((line) => {
      const raw = line.trim();
      if (!raw) {
        return null;
      }
      try {
        const parsed = JSON.parse(raw) as Partial<MediaItem>;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return {
            type: typeof parsed.type === 'string' ? parsed.type : '',
            productId: typeof parsed.productId === 'string' ? parsed.productId : '',
            description: typeof parsed.description === 'string' ? parsed.description : '',
          };
        }
      } catch {
        // legacy / hand-typed line → treat as a description-only material
      }
      return { type: '', productId: '', description: raw };
    })
    .filter((item): item is MediaItem => item !== null);
}

function serialize(items: MediaItem[]): string {
  return items.map((item) => JSON.stringify(item)).join('\n');
}

export function StepArsenal({
  arsenal,
  onArsenalChange,
  productOptions,
  selectedProductIds,
  busy,
  onSave,
}: Props) {
  const items = parseArsenal(arsenal);
  const selectedSet = new Set(selectedProductIds);
  const linkable = productOptions.filter((p) => selectedSet.has(p.id));

  const commit = (next: MediaItem[]) => onArsenalChange(serialize(next));
  const update = (index: number, patch: Partial<MediaItem>) =>
    commit(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index: number) => commit(items.filter((_, i) => i !== index));
  const add = () => commit([...items, { type: '', productId: '', description: '' }]);

  return (
    <div>
      <h2 style={sectionTitleStyle}>Arsenal de vendas</h2>
      <p style={{ margin: '0 0 4px', fontSize: 13, color: KLOEL_THEME.textSecondary }}>
        Cadastre fotos, vídeos, áudios, depoimentos e provas. Quanto mais material descrito, melhor
        a IA vende.
      </p>
      <p style={{ margin: '0 0 18px', fontSize: 12, color: KLOEL_THEME.accent, fontWeight: 600 }}>
        Cada mídia precisa de tipo, produto e descrição — a IA usa isso para decidir quando e como
        enviar cada prova.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item, index) => (
          <div
            key={index}
            style={{
              background: KLOEL_THEME.bgSecondary,
              border: `1px solid ${KLOEL_THEME.borderPrimary}`,
              borderRadius: 6,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  fontWeight: 600,
                  color: KLOEL_THEME.textPrimary,
                }}
              >
                Mídia {index + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label="Remover mídia"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: KLOEL_THEME.warning,
                  cursor: 'pointer',
                  fontSize: 16,
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ×
              </button>
            </div>
            <select
              value={item.type}
              onChange={(event) => update(index, { type: event.target.value })}
              style={inputStyle}
            >
              <option value="">Selecione o tipo de mídia</option>
              {MEDIA_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              value={item.productId}
              onChange={(event) => update(index, { productId: event.target.value })}
              style={inputStyle}
            >
              <option value="">
                {linkable.length === 0
                  ? 'Selecione produtos no passo anterior'
                  : 'De qual produto é essa mídia?'}
              </option>
              {linkable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <textarea
              value={item.description}
              onChange={(event) => update(index, { description: event.target.value })}
              placeholder="Descreva essa mídia — o que mostra, por que importa para a venda, contexto que a IA precisa saber..."
              rows={3}
              style={textAreaStyle}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        style={{
          width: '100%',
          marginTop: 12,
          padding: 14,
          background: 'transparent',
          border: `2px dashed ${KLOEL_THEME.borderPrimary}`,
          borderRadius: 6,
          color: KLOEL_THEME.textSecondary,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        + Adicionar mídia
      </button>

      <button type="button" onClick={onSave} style={{ ...secondaryButtonStyle, marginTop: 14 }}>
        {busy === 'setup' ? 'Salvando...' : 'Salvar arsenal'}
      </button>
    </div>
  );
}
