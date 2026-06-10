'use client';

import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { S, V, unwrapApiPayload, type JsonRecord } from './product-nerve-center.shared';

type CoprodForm = {
  role: string;
  percentage: string;
  agentName: string;
  agentEmail: string;
};

const EMPTY_COPROD_FORM: CoprodForm = {
  role: 'COPRODUCER',
  percentage: '',
  agentName: '',
  agentEmail: '',
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseCoprodPercentage(value: string) {
  return Number.parseFloat(value.replace(',', '.'));
}

function validateCoprodForm(form: CoprodForm) {
  const agentName = form.agentName.trim();
  const agentEmail = form.agentEmail.trim();
  const percentageText = form.percentage.trim();
  const percentage = parseCoprodPercentage(percentageText);

  if (!agentName && !agentEmail) {
    return 'Informe ao menos nome ou e-mail do parceiro desta comissão.';
  }

  if (agentEmail && !isValidEmail(agentEmail)) {
    return 'Informe um e-mail válido para o parceiro desta comissão.';
  }

  if (!percentageText) {
    return 'Informe o percentual da comissão.';
  }

  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    return 'Informe uma comissão válida entre 0 e 100.';
  }

  return null;
}

export function useCoprodState(productId: string) {
  const { showToast } = useToast();
  const [items, setItems] = useState<JsonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setFormState] = useState<CoprodForm>(EMPTY_COPROD_FORM);
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; agentName: string } | null>(null);

  const setForm = useCallback((next: React.SetStateAction<CoprodForm>) => {
    setFormError('');
    setFormState(next);
  }, []);

  const fetchCommissions = useCallback(() => {
    apiFetch<JsonRecord>(`/products/${productId}/commissions`)
      .then((r) => {
        const d = unwrapApiPayload<JsonRecord[]>(r);
        if (!Array.isArray(d)) {
          throw new Error('Invalid product commissions payload');
        }
        setItems(
          d.filter((c: JsonRecord) => ['COPRODUCER', 'MANAGER'].includes(c.role as string)),
        );
      })
      .catch((e: unknown) => {
        showToast(e instanceof Error ? e.message : 'Erro ao carregar comissões', 'error');
      })
      .finally(() => setLoading(false));
  }, [productId, showToast]);

  useEffect(() => {
    fetchCommissions();
  }, [fetchCommissions]);

  const selectedRoleLabel = form.role === 'MANAGER' ? 'gerente' : 'coprodutor';

  const handleCreate = async () => {
    const validationError = validateCoprodForm(form);
    if (validationError) {
      setFormError(validationError);
      showToast(validationError, 'error');
      return;
    }

    setCreating(true);
    try {
      unwrapApiPayload(
        await apiFetch(`/products/${productId}/commissions`, {
          method: 'POST',
          body: {
            role: form.role,
            percentage: parseCoprodPercentage(form.percentage),
            agentName: form.agentName.trim() || null,
            agentEmail: form.agentEmail.trim() || null,
          },
        }),
      );
      setShowForm(false);
      setFormState(EMPTY_COPROD_FORM);
      setFormError('');
      fetchCommissions();
      showToast(`Convite do ${selectedRoleLabel} enviado`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : `Erro ao adicionar ${selectedRoleLabel}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      unwrapApiPayload(
        await apiFetch(`/products/${productId}/commissions/${deleteTarget.id}`, {
          method: 'DELETE',
        }),
      );
      fetchCommissions();
      showToast('Coprodutor removido', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao remover coprodutor', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const inputSt: React.CSSProperties = {
    width: '100%',
    background: V.e,
    border: `1px solid ${V.b}`,
    borderRadius: 6,
    padding: '10px 14px',
    fontSize: 13,
    color: V.t2,
    outline: 'none',
    fontFamily: S,
  };

  return {
    items,
    loading,
    showForm,
    setShowForm,
    form,
    setForm,
    formError,
    creating,
    deleteTarget,
    setDeleteTarget,
    inputSt,
    handleCreate,
    handleDelete,
  };
}
