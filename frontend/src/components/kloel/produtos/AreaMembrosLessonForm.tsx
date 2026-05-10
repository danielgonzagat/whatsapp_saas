'use client';

import {
  SORA,
  inputStyle,
  btnPrimary,
  btnGhost,
} from './ProdutosView.shared';
import { kloelT } from '@/lib/i18n/t';

interface Props {
  mode: 'create' | 'edit';
  name: string;
  description: string;
  videoUrl: string;
  accentColor: string;
  savingLabel: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onVideoUrlChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function AreaMembrosLessonForm({
  mode,
  name,
  description,
  videoUrl,
  accentColor: c,
  savingLabel,
  onNameChange,
  onDescriptionChange,
  onVideoUrlChange,
  onSave,
  onCancel,
}: Props) {
  return (
    <>
      <input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder={kloelT('Nome da aula')}
        style={inputStyle}
      />
      <input
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder={kloelT('Descricao')}
        style={inputStyle}
      />
      <input
        value={videoUrl}
        onChange={(e) => onVideoUrlChange(e.target.value)}
        placeholder={kloelT('URL do video')}
        style={inputStyle}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          style={btnPrimary(c)}
          onClick={onSave}
        >
          {savingLabel}
        </button>
        <button
          type="button"
          style={btnGhost}
          onClick={onCancel}
        >
          {kloelT('Cancelar')}
        </button>
      </div>
    </>
  );
}
