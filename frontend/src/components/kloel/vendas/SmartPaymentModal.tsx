'use client';

import { kloelT } from '@/lib/i18n/t';
import { smartPaymentApi } from '@/lib/api/smart-payment';
import { useState } from 'react';
import { IC } from './VendasView.icons';
import { SORA, MONO } from './utils';

interface SmartPaymentForm {
  amount: string;
  description: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  method: string;
  dueDate: string;
}

interface SmartPaymentResult {
  paymentLink?: string;
  pixCode?: string;
  boletoUrl?: string;
}

interface SmartPaymentModalProps {
  workspaceId: string | null;
  onClose: () => void;
}

const EMPTY_FORM: SmartPaymentForm = {
  amount: '',
  description: '',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  method: 'pix',
  dueDate: '',
};

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function SmartPaymentModal({ workspaceId, onClose }: SmartPaymentModalProps) {
  const [form, setForm] = useState<SmartPaymentForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SmartPaymentResult | null>(null);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!workspaceId || !form.amount || !form.customerName || !form.customerPhone) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload: {
        amount: number;
        description: string;
        customerName: string;
        customerPhone: string;
        customerEmail?: string;
        method?: string;
        dueDate?: string;
      } = {
        amount: Number.parseFloat(form.amount.replace(',', '.')),
        description: form.description || 'Cobranca',
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        method: form.method,
      };
      if (form.customerEmail) {
        payload.customerEmail = form.customerEmail;
      }
      if (form.dueDate) {
        payload.dueDate = form.dueDate;
      }
      const res = await smartPaymentApi.create(workspaceId, payload);
      if (res.error) {
        throw new Error(res.error);
      }
      setResult(res.data ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao criar cobranca');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setResult(null);
    setForm(EMPTY_FORM);
  };

  const hasRequired = Boolean(form.amount && form.customerName && form.customerPhone);

  const formFields = [
    { label: 'Cliente', key: 'customerName' as const, placeholder: 'Nome do cliente' },
    { label: 'Telefone', key: 'customerPhone' as const, placeholder: '5511999999999' },
    { label: 'E-mail', key: 'customerEmail' as const, placeholder: 'cliente@exemplo.com' },
    { label: 'Valor (R$)', key: 'amount' as const, placeholder: '97,00' },
    { label: 'Descricao', key: 'description' as const, placeholder: 'Ex: Consultoria, Produto X' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <button
        type="button"
        aria-label="Fechar modal"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none' }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--app-bg-primary)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          width: 480,
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--app-border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              fontFamily: SORA,
            }}
          >
            {kloelT('Nova cobranca')}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--app-text-tertiary)',
              cursor: 'pointer',
            }}
          >
            {IC.x(16)}
          </button>
        </div>
        <div style={{ padding: 20 }}>
          {result ? (
            <div>
              <div
                style={{
                  background: 'var(--app-bg-card)',
                  border: '1px solid var(--app-border-subtle)',
                  borderRadius: 6,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#10B981',
                    display: 'block',
                    marginBottom: 12,
                    fontFamily: SORA,
                  }}
                >
                  {kloelT('Cobranca criada')}
                </span>
                {result.paymentLink && (
                  <div style={{ marginBottom: 10 }}>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--app-text-secondary)',
                        fontFamily: SORA,
                        textTransform: 'uppercase',
                        letterSpacing: '.06em',
                      }}
                    >
                      {kloelT('Link de pagamento')}
                    </span>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <input
                        aria-label="Link de pagamento"
                        readOnly
                        value={result.paymentLink}
                        style={{
                          flex: 1,
                          background: 'var(--app-bg-primary)',
                          border: '1px solid var(--app-border-primary)',
                          borderRadius: 4,
                          padding: '8px 12px',
                          color: 'var(--app-text-primary)',
                          fontSize: 12,
                          fontFamily: MONO,
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (result.paymentLink) {
                            copyToClipboard(result.paymentLink);
                          }
                        }}
                        style={{
                          padding: '8px 12px',
                          background: 'none',
                          border: '1px solid var(--app-border-primary)',
                          borderRadius: 4,
                          color: 'var(--app-text-secondary)',
                          fontSize: 11,
                          cursor: 'pointer',
                          fontFamily: SORA,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {kloelT('Copiar')}
                      </button>
                    </div>
                  </div>
                )}
                {result.pixCode && (
                  <div style={{ marginBottom: 10 }}>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--app-text-secondary)',
                        fontFamily: SORA,
                        textTransform: 'uppercase',
                        letterSpacing: '.06em',
                      }}
                    >
                      {kloelT('Codigo PIX')}
                    </span>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <input
                        aria-label="Codigo PIX"
                        readOnly
                        value={result.pixCode}
                        style={{
                          flex: 1,
                          background: 'var(--app-bg-primary)',
                          border: '1px solid var(--app-border-primary)',
                          borderRadius: 4,
                          padding: '8px 12px',
                          color: 'var(--app-text-primary)',
                          fontSize: 12,
                          fontFamily: MONO,
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (result.pixCode) {
                            copyToClipboard(result.pixCode);
                          }
                        }}
                        style={{
                          padding: '8px 12px',
                          background: 'none',
                          border: '1px solid var(--app-border-primary)',
                          borderRadius: 4,
                          color: 'var(--app-text-secondary)',
                          fontSize: 11,
                          cursor: 'pointer',
                          fontFamily: SORA,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {kloelT('Copiar')}
                      </button>
                    </div>
                  </div>
                )}
                {result.boletoUrl && (
                  <div>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--app-text-secondary)',
                        fontFamily: SORA,
                        textTransform: 'uppercase',
                        letterSpacing: '.06em',
                      }}
                    >
                      {kloelT('Boleto')}
                    </span>
                    <div style={{ marginTop: 4 }}>
                      <a
                        href={result.boletoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 12,
                          color: 'colors.ember.primary',
                          fontFamily: SORA,
                          textDecoration: 'underline',
                        }}
                      >
                        {kloelT('Abrir boleto')}
                      </a>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={resetForm}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'none',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    color: 'var(--app-text-secondary)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT('Nova cobranca')}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'colors.ember.primary',
                    border: 'none',
                    borderRadius: 6,
                    color: 'var(--app-text-on-accent)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT('Fechar')}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {formFields.map(({ label, key, placeholder }) => (
                <div key={key}>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--app-text-secondary)',
                      fontFamily: SORA,
                      textTransform: 'uppercase',
                      letterSpacing: '.06em',
                      display: 'block',
                      marginBottom: 6,
                    }}
                  >
                    {label}
                  </span>
                  <input
                    aria-label={label}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={{
                      width: '100%',
                      background: 'var(--app-bg-card)',
                      border: '1px solid var(--app-border-primary)',
                      borderRadius: 4,
                      padding: '9px 12px',
                      color: 'var(--app-text-primary)',
                      fontSize: 13,
                      fontFamily: key === 'amount' ? MONO : SORA,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--app-text-secondary)',
                      fontFamily: SORA,
                      textTransform: 'uppercase',
                      letterSpacing: '.06em',
                      display: 'block',
                      marginBottom: 6,
                    }}
                  >
                    {kloelT('Metodo')}
                  </span>
                  <select
                    value={form.method}
                    onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
                    style={{
                      width: '100%',
                      background: 'var(--app-bg-card)',
                      border: '1px solid var(--app-border-primary)',
                      borderRadius: 4,
                      padding: '9px 12px',
                      color: 'var(--app-text-primary)',
                      fontSize: 13,
                      fontFamily: SORA,
                      outline: 'none',
                    }}
                  >
                    <option value="pix">PIX</option>
                    <option value="boleto">{kloelT('Boleto')}</option>
                    <option value="credit_card">{kloelT('Cartao')}</option>
                    <option value="link">{kloelT('Link')}</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--app-text-secondary)',
                      fontFamily: SORA,
                      textTransform: 'uppercase',
                      letterSpacing: '.06em',
                      display: 'block',
                      marginBottom: 6,
                    }}
                  >
                    {kloelT('Vencimento')}
                  </span>
                  <input
                    aria-label="Data de vencimento"
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    style={{
                      width: '100%',
                      background: 'var(--app-bg-card)',
                      border: '1px solid var(--app-border-primary)',
                      borderRadius: 4,
                      padding: '9px 12px',
                      color: 'var(--app-text-primary)',
                      fontSize: 13,
                      fontFamily: MONO,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
              {error && (
                <span style={{ fontSize: 12, color: '#EF4444', fontFamily: SORA }}>{error}</span>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'none',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    color: 'var(--app-text-secondary)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT('Cancelar')}
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={loading || !hasRequired}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: hasRequired ? 'colors.ember.primary' : 'var(--app-bg-secondary)',
                    border: 'none',
                    borderRadius: 6,
                    color: hasRequired
                      ? 'var(--app-text-on-accent)'
                      : 'var(--app-text-placeholder)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: SORA,
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? 'Criando...' : 'Cobrar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
