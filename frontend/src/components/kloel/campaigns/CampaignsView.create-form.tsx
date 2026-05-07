'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';

const SORA = "'Sora', sans-serif";
const BG_CARD = KLOEL_THEME.bgCard;
const BG_ELEVATED = KLOEL_THEME.bgSecondary;
const BORDER = KLOEL_THEME.borderPrimary;
const TEXT_PRIMARY = KLOEL_THEME.textPrimary;
const TEXT_SECONDARY = KLOEL_THEME.textSecondary;
const ACCENT = KLOEL_THEME.accent;

interface CampaignCreateFormProps {
  show: boolean;
  newName: string;
  newMessage: string;
  creating: boolean;
  onNameChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onCreate: () => void;
  onCancel: () => void;
}

export function CampaignCreateForm({
  show,
  newName,
  newMessage,
  creating,
  onNameChange,
  onMessageChange,
  onCreate,
  onCancel,
}: CampaignCreateFormProps) {
  if (!show) return null;

  return (
    <div
      style={{
        background: BG_CARD,
        borderRadius: 6,
        border: `1px solid ${BORDER}`,
        padding: 20,
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label
            style={{
              fontFamily: SORA,
              fontSize: 12,
              color: TEXT_SECONDARY,
              display: 'block',
              marginBottom: 6,
            }}
          >
            {kloelT('Nome da campanha')}
          </label>
          <input
            value={newName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={kloelT('Ex: Lançamento Verão 2026')}
            style={{
              fontFamily: SORA,
              fontSize: 13,
              padding: '10px 14px',
              width: '100%',
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              background: BG_ELEVATED,
              color: TEXT_PRIMARY,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label
            style={{
              fontFamily: SORA,
              fontSize: 12,
              color: TEXT_SECONDARY,
              display: 'block',
              marginBottom: 6,
            }}
          >
            {kloelT('Mensagem (opcional)')}
          </label>
          <textarea
            value={newMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder={kloelT('Use {{name}} para personalizar com o nome do contato')}
            rows={4}
            style={{
              fontFamily: SORA,
              fontSize: 13,
              padding: '10px 14px',
              width: '100%',
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              background: BG_ELEVATED,
              color: TEXT_PRIMARY,
              outline: 'none',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onCreate}
            disabled={creating || !newName.trim()}
            style={{
              background: ACCENT,
              color: '#0A0A0C',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: SORA,
              cursor: creating || !newName.trim() ? 'not-allowed' : 'pointer',
              opacity: creating || !newName.trim() ? 0.5 : 1,
            }}
          >
            {creating ? kloelT('Criando...') : kloelT('Criar')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'transparent',
              color: TEXT_SECONDARY,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: 12,
              fontFamily: SORA,
              cursor: 'pointer',
            }}
          >
            {kloelT('Cancelar')}
          </button>
        </div>
      </div>
    </div>
  );
}
