'use client';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { BANK_ACCOUNT_ARIA_LABEL, BANK_ACCOUNT_PLACEHOLDER } from './carteira.config';

export function AddBankAccountForm({
  fid,
  addForm,
  setAddForm,
  addLoading,
  addError,
  onSave,
}: {
  fid: string;
  addForm: {
    bankName: string;
    pixKey: string;
    bankCode: string;
    agency: string;
    account: string;
    accountType: string;
  };
  setAddForm: React.Dispatch<React.SetStateAction<typeof addForm>>;
  addLoading: boolean;
  addError: string;
  onSave: () => void;
}) {
  return (
    <div
      style={{
        background: 'var(--app-bg-primary)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        padding: 16,
        marginBottom: 14,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
            htmlFor={`${fid}-banco`}
          >
            {kloelT(`Banco`)}
          </label>
          <input
            aria-label="Banco"
            value={addForm.bankName}
            onChange={(e) => setAddForm((f) => ({ ...f, bankName: e.target.value }))}
            placeholder={kloelT(`Ex: Nubank`)}
            style={{
              width: '100%',
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '8px 12px',
              color: 'var(--app-text-primary)',
              fontSize: 12,
              fontFamily: "'Sora',sans-serif",
              outline: 'none',
              boxSizing: 'border-box',
            }}
            id={`${fid}-banco`}
          />
        </div>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
            htmlFor={`${fid}-chave-pix`}
          >
            {kloelT(`Chave PIX`)}
          </label>
          <input
            aria-label="Chave PIX"
            value={addForm.pixKey}
            onChange={(e) => setAddForm((f) => ({ ...f, pixKey: e.target.value }))}
            placeholder={kloelT(`CPF, email, telefone ou aleatoria`)}
            style={{
              width: '100%',
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '8px 12px',
              color: 'var(--app-text-primary)',
              fontSize: 12,
              fontFamily: "'Sora',sans-serif",
              outline: 'none',
              boxSizing: 'border-box',
            }}
            id={`${fid}-chave-pix`}
          />
        </div>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
            htmlFor={`${fid}-agencia`}
          >
            {kloelT(`Agencia`)}
          </label>
          <input
            aria-label="Agencia"
            value={addForm.agency}
            onChange={(e) => setAddForm((f) => ({ ...f, agency: e.target.value }))}
            placeholder="0001"
            style={{
              width: '100%',
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '8px 12px',
              color: 'var(--app-text-primary)',
              fontSize: 12,
              fontFamily: "'JetBrains Mono',monospace",
              outline: 'none',
              boxSizing: 'border-box',
            }}
            id={`${fid}-agencia`}
          />
        </div>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
            htmlFor={`${fid}-conta`}
          >
            {kloelT(`Conta`)}
          </label>
          <input
            aria-label={BANK_ACCOUNT_ARIA_LABEL}
            value={addForm.account}
            onChange={(e) => setAddForm((f) => ({ ...f, account: e.target.value }))}
            placeholder={BANK_ACCOUNT_PLACEHOLDER}
            style={{
              width: '100%',
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '8px 12px',
              color: 'var(--app-text-primary)',
              fontSize: 12,
              fontFamily: "'JetBrains Mono',monospace",
              outline: 'none',
              boxSizing: 'border-box',
            }}
            id={`${fid}-conta`}
          />
        </div>
      </div>
      {addError && (
        <div
          style={{
            marginBottom: 10,
            padding: '7px 12px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 6,
          }}
        >
          <span style={{ fontSize: 11, color: colors.semantic.error }}>{addError}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={addLoading}
        style={{
          width: '100%',
          padding: '10px 16px',
          background: addLoading ? 'var(--app-bg-secondary)' : 'colors.ember.primary',
          color: addLoading ? 'var(--app-text-secondary)' : 'var(--app-text-on-accent)',
          border: 'none',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          cursor: addLoading ? 'default' : 'pointer',
          fontFamily: "'Sora',sans-serif",
        }}
      >
        {addLoading ? 'Salvando...' : 'Salvar conta'}
      </button>
    </div>
  );
}
