import { Loader2, Plus, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';



export interface WebinarFormData {
  title: string;
  url: string;
  date: string;
  description: string;
}

type FormMode = 'create' | 'edit';

interface WebinarFormModalProps {
  mode: FormMode;
  defaultValues?: WebinarFormData;
  onClose: () => void;
  onSubmit: (data: WebinarFormData) => Promise<void>;
  isSaving: boolean;
  fidPrefix: string;
  savingLabel?: string;
  submitLabel?: string;
}

export default function WebinarFormModal({
  mode,
  defaultValues,
  onClose,
  onSubmit,
  isSaving,
  fidPrefix,
  savingLabel = 'Criando...',
  submitLabel = 'Criar Webinario',
}: WebinarFormModalProps) {
  const [title, setTitle] = useState(defaultValues?.title ?? '');
  const [url, setUrl] = useState(defaultValues?.url ?? '');
  const [date, setDate] = useState(defaultValues?.date ?? '');
  const [description, setDescription] = useState(defaultValues?.description ?? '');

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !url.trim() || !date) {
      return;
    }
    await onSubmit({
      title: title.trim(),
      url: url.trim(),
      date,
      description: description.trim(),
    });
  }, [title, url, date, description, onSubmit]);

  const isDisabled = isSaving || !title.trim() || !url.trim() || !date;
  const titleLabel = mode === 'edit' ? 'Editar Webinario' : 'Novo Webinario';
  const closeLabel = mode === 'edit' ? 'Fechar modal de edicao' : 'Fechar modal';
  const actionLabel = isSaving ? savingLabel : submitLabel;
  const fid = fidPrefix;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={modalPanelStyle}
      >
        <div style={headerRowStyle}>
          <h2 style={modalTitleStyle}>{kloelT(titleLabel)}</h2>
          <button type="button" aria-label={closeLabel} onClick={onClose} style={closeBtnStyle}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={fieldLabelStyle} htmlFor={`${fid}-titulo`}>
              {kloelT('Titulo *')}
            </label>
            <input
              aria-label="Titulo do webinario"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kloelT('Ex: Lancamento do produto X')}
              style={inputStyle}
              id={`${fid}-titulo`}
            />
          </div>

          <div>
            <label style={fieldLabelStyle} htmlFor={`${fid}-url`}>
              {kloelT('URL do Webinario *')}
            </label>
            <input
              aria-label="URL do webinario"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/live/..."
              style={inputStyle}
              id={`${fid}-url`}
            />
          </div>

          <div>
            <label style={fieldLabelStyle} htmlFor={`${fid}-data`}>
              {kloelT('Data e Hora *')}
            </label>
            <input
              aria-label="Data e hora do webinario"
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                ...inputStyle,
                colorScheme: 'dark',
              }}
              id={`${fid}-data`}
            />
          </div>

          <div>
            <label style={fieldLabelStyle} htmlFor={`${fid}-desc`}>
              {kloelT('Descricao (opcional)')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={kloelT('Descreva o webinario...')}
              rows={3}
              style={textareaStyle}
              id={`${fid}-desc`}
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isDisabled}
            style={submitBtnStyle(isSaving)}
          >
            {isSaving ? (
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" />
            ) : (
              <Plus size={14} aria-hidden="true" />
            )}
            {kloelT(actionLabel)}
          </button>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 9999,
};

const modalPanelStyle: React.CSSProperties = {
  background: colors.checkout.bg,
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  padding: 28,
  width: 440,
  maxWidth: '90vw',
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 20,
};

const modalTitleStyle: React.CSSProperties = {
  color: 'var(--app-text-primary)',
  fontSize: 16,
  fontWeight: 700,
  margin: 0,
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: colors.text.muted,
  cursor: 'pointer',
  padding: 4,
};

const fieldLabelStyle: React.CSSProperties = {
  color: colors.text.muted,
  fontSize: 12,
  display: 'block',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  padding: '10px 12px',
  color: 'var(--app-text-primary)',
  fontSize: 13,
  fontFamily: 'Sora, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
};

function submitBtnStyle(saving: boolean): React.CSSProperties {
  return {
    background: saving ? colors.text.muted : colors.ember.primary,
    color: colors.text.silver,
    border: 'none',
    borderRadius: 6,
    padding: '10px 20px',
    cursor: saving ? 'not-allowed' : 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'Sora, sans-serif',
    marginTop: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  };
}
