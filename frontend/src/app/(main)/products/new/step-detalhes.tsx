'use client';

import { kloelT } from '@/lib/i18n/t';
import { MediaPreviewBox } from '@/components/kloel/MediaPreviewBox';
import { colors, typography } from '@/lib/design-tokens';
import { MonitorInputField } from './monitor-input-field';
import { inputProps, monitorCard, selectStyle, monitorInput } from './shared-styles';
import type { FormState, StepCommonProps } from './types';
import { Layers, Monitor, Package, X } from 'lucide-react';

interface StepDetalhesProps extends StepCommonProps {
  tagInput: string;
  setTagInput: (value: string) => void;
  onTagAdd: () => void;
  onTagRemove: (tag: string) => void;
  categories: string[];
  catLoading: boolean;
  catError: unknown;
  localPreviewUrl: string | null;
  uploading: boolean;
  onFileSelect: (file: File) => void;
  onClearPreview: () => void;
}

export function StepDetalhes({
  form,
  updateForm,
  tagInput,
  setTagInput,
  onTagAdd,
  onTagRemove,
  categories,
  catLoading,
  catError,
  localPreviewUrl,
  uploading,
  onFileSelect,
  onClearPreview,
}: StepDetalhesProps) {
  return (
    <div style={monitorCard}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 600,
          fontFamily: typography.fontFamily.display,
          color: colors.text.starlight,
          margin: '0 0 24px 0',
        }}
      >
        {kloelT('Detalhes do produto')}
      </h2>

      <MonitorInputField label={kloelT('Nome do produto *')}>
        <input
          {...inputProps}
          value={form.name}
          onChange={(e) => updateForm({ name: e.target.value })}
          placeholder={kloelT('Nome do produto')}
          maxLength={200}
        />
        <p style={{ textAlign: 'right', marginTop: 4, fontSize: 11, color: colors.text.dust }}>
          {form.name.length}/200
        </p>
      </MonitorInputField>

      <MonitorInputField label={kloelT('Descricao *')}>
        <textarea
          style={{ ...monitorInput, resize: 'vertical' as const, minHeight: 100 }}
          onFocus={inputProps.onFocus}
          onBlur={inputProps.onBlur}
          value={form.description}
          onChange={(e) => updateForm({ description: e.target.value })}
          placeholder={kloelT('Descreva seu produto...')}
          maxLength={5000}
          rows={4}
        />
        <p style={{ textAlign: 'right', marginTop: 4, fontSize: 11, color: colors.text.dust }}>
          {form.description.length}/5000
        </p>
      </MonitorInputField>

      <MonitorInputField label={kloelT('Categoria *')}>
        <select
          style={selectStyle}
          onFocus={inputProps.onFocus}
          onBlur={inputProps.onBlur}
          value={form.category}
          onChange={(e) => updateForm({ category: e.target.value })}
          disabled={catLoading}
        >
          <option value="">
            {catLoading
              ? kloelT('Carregando categorias...')
              : kloelT('Selecione uma categoria')}
          </option>
          {catError ? (
            <option value="" disabled>
              {kloelT('Erro ao carregar categorias')}
            </option>
          ) : categories.length === 0 && !catLoading ? (
            <option value="" disabled>
              {kloelT('Nenhuma categoria cadastrada ainda')}
            </option>
          ) : (
            categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))
          )}
        </select>
      </MonitorInputField>

      <MonitorInputField label={kloelT('Tags (max. 5)')}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            {...inputProps}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onTagAdd();
              }
            }}
            placeholder={
              form.tags.length >= 5
                ? 'Maximo atingido'
                : 'Adicionar tag e pressionar Enter...'
            }
            disabled={form.tags.length >= 5}
          />
        </div>
        {form.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {form.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  borderRadius: 6,
                  backgroundColor: 'rgba(232, 93, 48, 0.12)',
                  color: colors.accent.webb,
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: typography.fontFamily.sans,
                }}
              >
                {tag}
                <button
                  type="button"
                  onClick={() => onTagRemove(tag)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: colors.accent.webb,
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                  }}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
      </MonitorInputField>

      <MonitorInputField label={kloelT('Formato do produto *')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg3)', gap: 12 }}>
          {FORMAT_OPTIONS.map((opt) => {
            const selected = form.format === opt.value;
            const Icon = opt.icon;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => updateForm({ format: opt.value })}
                style={{
                  background: selected ? 'rgba(232, 93, 48, 0.08)' : colors.background.nebula,
                  border: `1.5px solid ${selected ? colors.accent.webb : colors.border.space}`,
                  borderRadius: 6,
                  padding: '20px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 150ms ease',
                }}
              >
                <Icon
                  style={{
                    width: 28,
                    height: 28,
                    color: selected ? colors.accent.webb : colors.text.dust,
                  }}
                />
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: typography.fontFamily.display,
                    color: selected ? colors.accent.webb : colors.text.moonlight,
                  }}
                >
                  {opt.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: colors.text.dust,
                    fontFamily: typography.fontFamily.sans,
                    textAlign: 'center',
                  }}
                >
                  {opt.desc}
                </span>
              </button>
            );
          })}
        </div>
      </MonitorInputField>

      <MonitorInputField label={kloelT('Foto do produto')}>
        <MediaPreviewBox
          inputAriaLabel={kloelT('Imagem do produto')}
          previewUrl={localPreviewUrl}
          fallbackUrl={form.imageUrl}
          uploading={uploading}
          emptySubtitle={kloelT('JPG, PNG ou WebP - Max 10MB')}
          emptyTitle={kloelT('Arraste ou clique para enviar')}
          onSelectFile={(file) => {
            void onFileSelect(file);
          }}
          onClear={() => {
            onClearPreview();
            updateForm({ imageUrl: '' });
          }}
          theme={{
            accentColor: colors.accent.webb,
            borderColor: colors.border.space,
            frameBackground: 'rgba(255,255,255,0.04)',
            labelColor: colors.text.dust,
            mutedColor: colors.text.dust,
            textColor: colors.text.moonlight,
          }}
        />
      </MonitorInputField>
    </div>
  );
}

const FORMAT_OPTIONS: {
  value: FormState['format'];
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  desc: string;
}[] = [
  {
    value: 'PHYSICAL',
    label: 'Fisico',
    icon: Package,
    desc: 'Produto tangivel enviado por correio',
  },
  {
    value: 'DIGITAL',
    label: 'Digital',
    icon: Monitor,
    desc: 'Curso, e-book, software ou arquivo',
  },
  {
    value: 'HYBRID',
    label: 'Hibrido',
    icon: Layers,
    desc: 'Parte fisica + parte digital',
  },
];
