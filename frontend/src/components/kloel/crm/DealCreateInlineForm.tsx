'use client';

import { kloelT } from '@/lib/i18n/t';
import { type FormEvent, useState } from 'react';
import { CRM_ICONS } from './crm-pipeline-icons';
import { btnStyle, inputStyle } from './CRMPipelineView.parts';

const IC = CRM_ICONS;

interface DealCreateInlineFormProps {
  pipelineId: string;
  stageId: string;
  onCreateDeal: (payload: Record<string, unknown>) => Promise<unknown>;
  onCreated: () => void;
  onCancel: () => void;
}

export function DealCreateInlineForm({
  pipelineId,
  stageId,
  onCreateDeal,
  onCreated,
  onCancel,
}: DealCreateInlineFormProps) {
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await onCreateDeal({
        title: title.trim(),
        value: Number.parseFloat(value) || 0,
        contact: contact.trim() || undefined,
        pipeline: pipelineId,
        stage: stageId,
      });
      setTitle('');
      setValue('');
      setContact('');
      onCreated();
    } catch {
      /* silent */
    }
    setSubmitting(false);
  };

  const handleCancel = () => {
    setTitle('');
    setValue('');
    setContact('');
    onCancel();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        placeholder={kloelT('Titulo do deal')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={inputStyle}
      />
      <input
        placeholder={kloelT('Valor (ex: 5000)')}
        value={value}
        type="number"
        step="0.01"
        onChange={(e) => setValue(e.target.value)}
        style={inputStyle}
      />
      <input
        placeholder={kloelT('Contato (telefone)')}
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        style={inputStyle}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            ...btnStyle,
            background: '#E85D30',
            color: '#fff',
            flex: 1,
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? '...' : 'Criar'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          style={{
            ...btnStyle,
            background: 'var(--app-bg-secondary)',
            color: 'var(--app-text-secondary)',
          }}
        >
          {IC.x(12)}
        </button>
      </div>
    </form>
  );
}
