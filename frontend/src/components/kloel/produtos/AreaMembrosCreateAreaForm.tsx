'use client';

import type { DisplayProduct } from './ProdutosView.types';
import {
  SORA,
  MONO,
  BG_CARD,
  BORDER,
  PURPLE,
  inputStyle,
  selectStyle,
  btnPrimary,
  btnGhost,
} from './ProdutosView.shared';
import { kloelT } from '@/lib/i18n/t';

interface Props {
  formId: string;
  newArea: Record<string, string | boolean>;
  productOptions: DisplayProduct[];
  saving: boolean;
  onSetNewArea: React.Dispatch<
    React.SetStateAction<Record<string, string | boolean>>
  >;
  onCreate: () => Promise<void>;
  onCancel: () => void;
}

const toggles = [
  { key: 'certificates', label: kloelT('Certificados') },
  { key: 'quizzes', label: kloelT('Quizzes') },
  { key: 'community', label: kloelT('Comunidade') },
  { key: 'gamification', label: kloelT('Gamificacao') },
  { key: 'progressTrack', label: kloelT('Controle de progresso') },
  { key: 'downloads', label: kloelT('Downloads') },
  { key: 'comments', label: kloelT('Comentarios') },
];

export default function AreaMembrosCreateAreaForm({
  formId: _formId,
  newArea,
  productOptions,
  saving,
  onSetNewArea,
  onCreate,
  onCancel,
}: Props) {
  const set = (key: string, value: string | boolean) =>
    onSetNewArea((prev) => ({ ...prev, [key]: value }));

  return (
    <div
      style={{
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            fontFamily: SORA,
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--app-text-primary)',
          }}
        >
          {kloelT('Nova Area')}
        </span>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: PURPLE,
          }}
        />
      </div>

      {/* Row 1: Name + Type + Product */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          value={String(newArea.name || '')}
          onChange={(e) => set('name', e.target.value)}
          placeholder={kloelT('Nome da area')}
          style={{ ...inputStyle, flex: 2 }}
        />
        <select
          value={String(newArea.type || 'COURSE')}
          onChange={(e) => set('type', e.target.value)}
          style={{ ...selectStyle, flex: 1 }}
        >
          <option value="COURSE">{kloelT('Curso')}</option>
          <option value="COMMUNITY">{kloelT('Comunidade')}</option>
          <option value="HYBRID">{kloelT('Hibrido')}</option>
        </select>
        <select
          value={String(newArea.productId || '')}
          onChange={(e) => set('productId', e.target.value)}
          style={{ ...selectStyle, flex: 1 }}
        >
          <option value="">{kloelT('Produto vinculado')}</option>
          {productOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Row 2: Slug + Color */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          value={String(newArea.slug || '')}
          onChange={(e) => set('slug', e.target.value)}
          placeholder={kloelT('slug-da-area')}
          style={{ ...inputStyle, flex: 1, fontFamily: MONO, fontSize: 11 }}
        />
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}
        >
          <input
            type="color"
            value={String(newArea.primaryColor || PURPLE)}
            onChange={(e) => set('primaryColor', e.target.value)}
            style={{
              width: 34,
              height: 34,
              padding: 2,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              cursor: 'pointer',
              background: 'transparent',
            }}
          />
          <input
            value={String(newArea.primaryColor || PURPLE)}
            onChange={(e) => set('primaryColor', e.target.value)}
            placeholder="#8B5CF6"
            style={{ ...inputStyle, fontFamily: MONO, fontSize: 11 }}
          />
        </div>
      </div>

      {/* Row 3: Description + Template */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          value={String(newArea.description || '')}
          onChange={(e) => set('description', e.target.value)}
          placeholder={kloelT('Descricao da area')}
          style={{ ...inputStyle, flex: 2 }}
        />
        <select
          value={String(newArea.template || 'academy')}
          onChange={(e) => set('template', e.target.value)}
          style={{ ...selectStyle, flex: 1 }}
        >
          <option value="academy">{kloelT('Academy')}</option>
          <option value="community">{kloelT('Community')}</option>
          <option value="membership">{kloelT('Membership')}</option>
        </select>
      </div>

      {/* Row 4: Logo URL + Cover URL */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          value={String(newArea.logoUrl || '')}
          onChange={(e) => set('logoUrl', e.target.value)}
          placeholder={kloelT('URL do Logo')}
          style={{ ...inputStyle, flex: 1 }}
        />
        <input
          value={String(newArea.coverUrl || '')}
          onChange={(e) => set('coverUrl', e.target.value)}
          placeholder={kloelT('URL da Capa')}
          style={{ ...inputStyle, flex: 1 }}
        />
      </div>

      {/* Toggles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {toggles.map((t) => (
          <label
            key={t.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              fontFamily: SORA,
              fontSize: 12,
              color: 'var(--app-text-secondary)',
            }}
          >
            <input
              type="checkbox"
              checked={Boolean(newArea[t.key])}
              onChange={(e) => set(t.key, e.target.checked)}
              style={{ accentColor: PURPLE }}
            />
            {t.label}
          </label>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" style={btnGhost} onClick={onCancel}>
          {kloelT('Cancelar')}
        </button>
        <button
          type="button"
          style={btnPrimary(PURPLE)}
          disabled={saving}
          onClick={onCreate}
        >
          {saving ? kloelT('Criando...') : kloelT('Criar')}
        </button>
      </div>
    </div>
  );
}
