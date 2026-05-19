'use client';

import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import { useState, useEffect, useRef } from 'react';

function unwrapApiPayload<T = unknown>(response: unknown): T {
  const r = response as { error?: string; data?: unknown } | null | undefined;
  if (r?.error) {
    throw new Error(r.error);
  }

  return (r?.data ?? response) as T;
}

export interface AiConfigShape {
  customerProfile?: {
    whobuys?: string;
    idealCustomer?: string;
    pains?: string;
    painPoints?: string;
    promise?: string;
    promisedResult?: string;
  };
  objections?: Array<{ label?: string; q?: string; response?: string; a?: string }>;
  tone?: string;
  persistenceLevel?: number | string;
  messageLimit?: number | string;
  followUpConfig?: {
    schedule?: string;
    autoCheckoutLink?: boolean;
    offerDiscount?: boolean;
    useUrgency?: boolean;
  };
  salesArguments?: {
    autoCheckoutLink?: boolean;
    offerDiscount?: boolean;
    useUrgency?: boolean;
  };
}

export function useAIConfig(productId: string) {
  const { showToast } = useToast();

  const [aiCfg, setAiCfg] = useState<AiConfigShape | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [_aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);
  useEffect(() => {
    apiFetch(`/products/${productId}/ai-config`)
      .then((r) => setAiCfg(unwrapApiPayload<AiConfigShape>(r) || {}))
      .catch(() => setAiCfg({}))
      .finally(() => setAiLoading(false));
  }, [productId]);
  const [whobuys, setWhobuys] = useState('');
  const [pains, setPains] = useState('');
  const [promise, setPromise] = useState('');
  const [objs, setObjs] = useState<{ id: string; label: string; response: string }[]>([
    { id: 'obj-seed-1', label: 'É caro', response: '' },
    { id: 'obj-seed-2', label: 'Não confio', response: '' },
    { id: 'obj-seed-3', label: 'Funciona?', response: '' },
  ]);
  const objIdCounter = useRef(0);
  const nextObjId = () => {
    objIdCounter.current += 1;
    return `obj-${Date.now()}-${objIdCounter.current}`;
  };
  const [tone, setTone] = useState('CONSULTIVE');
  const [persist, setPersist] = useState('3');
  const [msgLimit, setMsgLimit] = useState('10');
  const [followUp, setFollowUp] = useState('2h,24h,72h');
  const [autoLink, setAutoLink] = useState(true);
  const [offerDisc, setOfferDisc] = useState(true);
  const [useUrg, setUseUrg] = useState(true);
  useEffect(() => {
    if (!aiCfg) {
      return;
    }
    const cp = aiCfg.customerProfile || {};
    setWhobuys(cp.whobuys || cp.idealCustomer || '');
    setPains(cp.pains || cp.painPoints || '');
    setPromise(cp.promise || cp.promisedResult || '');
    if (Array.isArray(aiCfg.objections) && aiCfg.objections.length) {
      setObjs(
        aiCfg.objections.map((obj, idx) => ({
          id: `obj-loaded-${idx}-${Date.now()}`,
          label: obj.label || obj.q || '',
          response: obj.response || obj.a || '',
        })),
      );
    }
    setTone(aiCfg.tone || 'CONSULTIVE');
    setPersist(String(aiCfg.persistenceLevel ?? 3));
    setMsgLimit(String(aiCfg.messageLimit ?? 10));
    const fc = aiCfg.followUpConfig || {};
    const sa = aiCfg.salesArguments || {};
    setFollowUp(fc.schedule || '2h,24h,72h');
    setAutoLink((sa.autoCheckoutLink ?? fc.autoCheckoutLink) !== false);
    setOfferDisc((sa.offerDiscount ?? fc.offerDiscount) !== false);
    setUseUrg((sa.useUrgency ?? fc.useUrgency) !== false);
  }, [aiCfg]);
  const handleSaveAI = async () => {
    setAiSaving(true);
    try {
      await apiFetch(`/products/${productId}/ai-config`, {
        method: 'PUT',
        body: {
          customerProfile: { whobuys, pains, promise },
          objections: objs,
          tone,
          persistenceLevel: Number.parseInt(persist, 10) || 3,
          messageLimit: Number.parseInt(msgLimit, 10) || 10,
          followUpConfig: {
            schedule: followUp,
            autoCheckoutLink: autoLink,
            offerDiscount: offerDisc,
            useUrgency: useUrg,
          },
          salesArguments: {
            autoCheckoutLink: autoLink,
            offerDiscount: offerDisc,
            useUrgency: useUrg,
          },
        },
      });
      setAiSaved(true);
      setTimeout(() => setAiSaved(false), 2000);
      showToast('Configuração de IA salva', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao salvar configuração de IA', 'error');
    } finally {
      setAiSaving(false);
    }
  };
  return {
    aiCfg,
    aiLoading,
    _aiSaving,
    aiSaved,
    whobuys,
    setWhobuys,
    pains,
    setPains,
    promise,
    setPromise,
    objs,
    setObjs,
    nextObjId,
    tone,
    setTone,
    persist,
    setPersist,
    msgLimit,
    setMsgLimit,
    followUp,
    setFollowUp,
    autoLink,
    setAutoLink,
    offerDisc,
    setOfferDisc,
    useUrg,
    setUseUrg,
    handleSaveAI,
  };
}
