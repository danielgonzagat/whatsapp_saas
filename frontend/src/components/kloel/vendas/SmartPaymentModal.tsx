'use client';

import { kloelT } from '@/lib/i18n/t';
import { smartPaymentApi } from '@/lib/api/smart-payment';
import { useState } from 'react';
import { IC } from './VendasView.icons';
import { SORA } from './utils';
import { SmartPaymentFormView, type SmartPaymentFormData } from './SmartPaymentForm';
import { SmartPaymentResultView, type SmartPaymentResultData } from './SmartPaymentResult';

interface SmartPaymentModalProps {
  workspaceId: string | null;
  onClose: () => void;
}

const EMPTY_FORM: SmartPaymentFormData = {
  amount: '',
  description: '',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  method: 'pix',
  dueDate: '',
};

export function SmartPaymentModal({ workspaceId, onClose }: SmartPaymentModalProps) {
  const [form, setForm] = useState<SmartPaymentFormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SmartPaymentResultData | null>(null);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!workspaceId || !form.amount || !form.customerName || !form.customerPhone) {return;}
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
      if (form.customerEmail) {payload.customerEmail = form.customerEmail;}
      if (form.dueDate) {payload.dueDate = form.dueDate;}
      const res = await smartPaymentApi.create(workspaceId, payload);
      if (res.error) {throw new Error(res.error);}
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

  return (
    <div style={backdropStyle}>
      <button
        type="button"
        aria-label="Fechar modal"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none' }}
      />
      <div onClick={(e) => e.stopPropagation()} style={modalPanelStyle}>
        <div style={modalHeaderStyle}>
          <span style={modalTitleStyle}>{kloelT('Nova cobranca')}</span>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--app-text-tertiary)', cursor: 'pointer' }}
          >
            {IC.x(16)}
          </button>
        </div>
        <div style={{ padding: 20 }}>
          {result ? (
            <SmartPaymentResultView result={result} onNewCharge={resetForm} onClose={onClose} />
          ) : (
            <SmartPaymentFormView
              form={form}
              onChange={setForm}
              error={error}
              loading={loading}
              hasRequired={hasRequired}
              onSubmit={handleCreate}
              onCancel={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  zIndex: 300,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backdropFilter: 'blur(4px)',
};

const modalPanelStyle: React.CSSProperties = {
  background: 'var(--app-bg-primary)',
  border: '1px solid var(--app-border-primary)',
  borderRadius: 6,
  width: 480,
  maxHeight: '85vh',
  overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  position: 'relative',
  zIndex: 1,
};

const modalHeaderStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid var(--app-border-subtle)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const modalTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--app-text-primary)',
  fontFamily: SORA,
};
