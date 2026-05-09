'use client';

import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  S,
  V,
  unwrapApiPayload,
  type JsonRecord,
} from './product-nerve-center.shared';

export function useCoprodState(productId: string) {
  const { showToast } = useToast();
  const [items, setItems] = useState<JsonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    role: 'COPRODUCER',
    percentage: '',
    agentName: '',
    agentEmail: '',
  });
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; agentName: string } | null>(null);

  const fetchCommissions = useCallback(() => {
    apiFetch<JsonRecord>(`/products/${productId}/commissions`)
      .then((r) => {
        const d = unwrapApiPayload<JsonRecord[]>(r);
        setItems(
          (Array.isArray(d) ? d : []).filter((c: JsonRecord) =>
            ['COPRODUCER', 'MANAGER'].includes(c.role as string),
          ),
        );
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => {
    fetchCommissions();
  }, [fetchCommissions]);

  const selectedRoleLabel = form.role === 'MANAGER' ? 'gerente' : 'coprodutor';

  const handleCreate = async () => {
    setCreating(true);
    try {
      await apiFetch(`/products/${productId}/commissions`, {
        method: 'POST',
        body: { ...form, percentage: Number.parseFloat(form.percentage) || 0 },
      });
      setShowForm(false);
      setForm({ role: 'COPRODUCER', percentage: '', agentName: '', agentEmail: '' });
      fetchCommissions();
      showToast(`Convite do ${selectedRoleLabel} enviado`, 'success');
    } catch (e) {
      console.error(e);
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
      await apiFetch(`/products/${productId}/commissions/${deleteTarget.id}`, { method: 'DELETE' });
      fetchCommissions();
      showToast('Coprodutor removido', 'success');
    } catch (e) {
      console.error(e);
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
    creating,
    deleteTarget,
    setDeleteTarget,
    inputSt,
    handleCreate,
    handleDelete,
  };
}
