'use client';

import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import { useState, useEffect, useRef } from 'react';
import { unwrapApiPayload } from './product-nerve-center.shared';

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

export type AiObjectionDraft = { id: string; label: string; response: string };

export type AiConfigDraftInput = {
  whobuys: string;
  pains: string;
  promise: string;
  objs: AiObjectionDraft[];
  tone: string;
  persist: string;
  msgLimit: string;
  followUp: string;
  autoLink: boolean;
  offerDisc: boolean;
  useUrg: boolean;
};

export type AiConfigSavePayload = {
  customerProfile: { whobuys: string; pains: string; promise: string };
  objections: Array<{ label: string; response: string }>;
  tone: string;
  persistenceLevel: number;
  messageLimit: number;
  followUpConfig: {
    schedule: string;
    autoCheckoutLink: boolean;
    offerDiscount: boolean;
    useUrgency: boolean;
  };
  salesArguments: {
    autoCheckoutLink: boolean;
    offerDiscount: boolean;
    useUrgency: boolean;
  };
};

export type AiConfigPayloadResult =
  | { ok: true; payload: AiConfigSavePayload }
  | { ok: false; error: string };

export const AI_CONFIG_OBJECTION_ERROR = 'Preencha a objecao e a resposta antes de salvar.';
export const AI_CONFIG_PERSISTENCE_ERROR = 'A persistencia precisa ficar entre 1 e 5.';
export const AI_CONFIG_MESSAGE_LIMIT_ERROR =
  'O limite de mensagens precisa ser zero ou um inteiro positivo.';

function parseIntegerField(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

export function buildAIConfigPayload(input: AiConfigDraftInput): AiConfigPayloadResult {
  const objections: Array<{ label: string; response: string }> = [];

  for (const objection of input.objs) {
    const label = objection.label.trim();
    const response = objection.response.trim();

    if (!label && !response) {
      continue;
    }
    if (!label || !response) {
      return { ok: false, error: AI_CONFIG_OBJECTION_ERROR };
    }

    objections.push({ label, response });
  }

  const persistenceLevel = parseIntegerField(input.persist);
  if (persistenceLevel === null || persistenceLevel < 1 || persistenceLevel > 5) {
    return { ok: false, error: AI_CONFIG_PERSISTENCE_ERROR };
  }

  const messageLimit = parseIntegerField(input.msgLimit);
  if (messageLimit === null || messageLimit < 0) {
    return { ok: false, error: AI_CONFIG_MESSAGE_LIMIT_ERROR };
  }

  return {
    ok: true,
    payload: {
      customerProfile: {
        whobuys: input.whobuys.trim(),
        pains: input.pains.trim(),
        promise: input.promise.trim(),
      },
      objections,
      tone: input.tone,
      persistenceLevel,
      messageLimit,
      followUpConfig: {
        schedule: input.followUp.trim() || '2h,24h,72h',
        autoCheckoutLink: input.autoLink,
        offerDiscount: input.offerDisc,
        useUrgency: input.useUrg,
      },
      salesArguments: {
        autoCheckoutLink: input.autoLink,
        offerDiscount: input.offerDisc,
        useUrgency: input.useUrg,
      },
    },
  };
}

export function useAIConfig(productId: string) {
  const { showToast } = useToast();

  const [aiCfg, setAiCfg] = useState<AiConfigShape | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [_aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  useEffect(() => {
    setAiLoading(true);
    setAiError(null);
    apiFetch(`/products/${productId}/ai-config`)
      .then((r) => setAiCfg(unwrapApiPayload<AiConfigShape>(r) || {}))
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Erro ao carregar configuração de IA';
        setAiCfg(null);
        setAiError(message);
        showToast(message, 'error');
      })
      .finally(() => setAiLoading(false));
  }, [productId, showToast]);
  const [whobuys, setWhobuys] = useState('');
  const [pains, setPains] = useState('');
  const [promise, setPromise] = useState('');
  const [objs, setObjs] = useState<AiObjectionDraft[]>([]);
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
  // Hydrate the editable form fields whenever a freshly-loaded `aiCfg`
  // arrives. Adjusting state during render (with a tracked previous value)
  // keeps this off the effect path, avoiding cascading renders.
  const [lastAiCfg, setLastAiCfg] = useState(aiCfg);
  if (aiCfg && aiCfg !== lastAiCfg) {
    setLastAiCfg(aiCfg);
    const cp = aiCfg.customerProfile || {};
    setWhobuys(cp.whobuys || cp.idealCustomer || '');
    setPains(cp.pains || cp.painPoints || '');
    setPromise(cp.promise || cp.promisedResult || '');
    if (Array.isArray(aiCfg.objections) && aiCfg.objections.length) {
      setObjs(
        aiCfg.objections.map((obj, idx) => ({
          id: `obj-loaded-${idx}`,
          label: obj.label || obj.q || '',
          response: obj.response || obj.a || '',
        })),
      );
    } else {
      setObjs([]);
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
  }
  const clearAiError = () => setAiError(null);
  const handleSaveAI = async () => {
    const payloadResult = buildAIConfigPayload({
      whobuys,
      pains,
      promise,
      objs,
      tone,
      persist,
      msgLimit,
      followUp,
      autoLink,
      offerDisc,
      useUrg,
    });

    if (!payloadResult.ok) {
      setAiSaved(false);
      setAiError(payloadResult.error);
      showToast(payloadResult.error, 'error');
      return;
    }

    setAiError(null);
    setAiSaving(true);
    try {
      unwrapApiPayload(
        await apiFetch(`/products/${productId}/ai-config`, {
          method: 'PUT',
          body: payloadResult.payload,
        }),
      );
      setObjs(
        payloadResult.payload.objections.map((obj, idx) => ({
          id: `obj-saved-${idx}`,
          label: obj.label,
          response: obj.response,
        })),
      );
      setAiSaved(true);
      setTimeout(() => setAiSaved(false), 2000);
      showToast('Configuração de IA salva', 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao salvar configuração de IA';
      setAiSaved(false);
      setAiError(message);
      showToast(message, 'error');
    } finally {
      setAiSaving(false);
    }
  };
  return {
    aiCfg,
    aiLoading,
    _aiSaving,
    aiSaved,
    aiError,
    clearAiError,
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
