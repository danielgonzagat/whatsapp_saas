'use client';

import { kloelT } from '@/lib/i18n/t';
import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import { useState, useEffect, useRef } from 'react';
import { useNerveCenterContext } from './product-nerve-center.context';
import { Bt, Fd, PanelLoadingState, Tg, V, cs, is } from './product-nerve-center.shared';

function unwrapApiPayload<T = unknown>(response: unknown): T {
  const r = response as { error?: string; data?: unknown } | null | undefined;
  if (r?.error) {
    throw new Error(r.error);
  }

  return (r?.data ?? response) as T;
}

interface AiConfigShape {
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

/** Product nerve center ia tab. */
export function ProductNerveCenterIATab() {
  const { productId } = useNerveCenterContext();
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
  return (
    <>
      <div
        style={{
          ...cs,
          padding: 14,
          marginBottom: 16,
          background: `${V.em}08`,
          border: `1px solid ${V.em}15`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke={V.em}
            strokeWidth={2}
            aria-hidden="true"
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: V.em }}>
            {kloelT(`Marketing Artificial`)}
          </span>
        </div>
        <p style={{ fontSize: 11, color: V.t2, margin: '6px 0 0' }}>
          {kloelT(
            `Configure como a IA vende este produto via WhatsApp, Instagram, TikTok e Facebook.`,
          )}
        </p>
      </div>
      {aiLoading ? (
        <PanelLoadingState
          compact
          label={kloelT(`Carregando config da IA`)}
          description={kloelT(
            `A área de IA permanece aberta enquanto argumentos, objeções e automações do produto são sincronizados.`,
          )}
        />
      ) : (
        <>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
            className="grid2"
          >
            <div style={{ ...cs, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 16px' }}>
                {kloelT(`Perfil do cliente ideal`)}
              </h3>
              <Fd label={kloelT(`Quem compra?`)} full>
                <textarea
                  style={{ ...is, height: 70 }}
                  value={whobuys}
                  onChange={(e) => setWhobuys(e.target.value)}
                  placeholder={kloelT(`Mulheres 35-55 anos...`)}
                />
              </Fd>
              <Fd label={kloelT(`Principais dores`)} full>
                <textarea
                  style={{ ...is, height: 60 }}
                  value={pains}
                  onChange={(e) => setPains(e.target.value)}
                  placeholder={kloelT(`Dores, problemas...`)}
                />
              </Fd>
              <Fd label={kloelT(`Resultado prometido`)} full>
                <textarea
                  style={{ ...is, height: 60 }}
                  value={promise}
                  onChange={(e) => setPromise(e.target.value)}
                  placeholder={kloelT(`Resultado que o cliente terá...`)}
                />
              </Fd>
            </div>
            <div style={{ ...cs, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 16px' }}>
                {kloelT(`Objeções e respostas`)}
              </h3>
              {objs.map((o, i) => (
                <div
                  key={o.id}
                  style={{
                    padding: '8px 0',
                    borderBottom: i < objs.length - 1 ? `1px solid ${V.b}` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      style={{ ...is, flex: 1, fontSize: 11, fontWeight: 600 }}
                      value={o.label}
                      onChange={(e) => {
                        const n = [...objs];
                        n[i] = { ...n[i], label: e.target.value };
                        setObjs(n);
                      }}
                      placeholder={kloelT(`Objeção`)}
                    />
                    <Bt
                      onClick={() => setObjs(objs.filter((_, j) => j !== i))}
                      style={{ padding: '2px 6px', color: V.r, fontSize: 10 }}
                    >
                      x
                    </Bt>
                  </div>
                  <textarea
                    style={{ ...is, height: 40, marginTop: 4, fontSize: 11 }}
                    value={o.response}
                    onChange={(e) => {
                      const n = [...objs];
                      n[i] = { ...n[i], response: e.target.value };
                      setObjs(n);
                    }}
                    placeholder={kloelT(`Resposta da IA...`)}
                  />
                </div>
              ))}
              <Bt
                onClick={() => setObjs([...objs, { id: nextObjId(), label: '', response: '' }])}
                style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
              >
                {kloelT(`+ Adicionar objeção`)}
              </Bt>
            </div>
          </div>
          <div style={{ ...cs, padding: 20, marginTop: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 16px' }}>
              {kloelT(`Comportamento`)}
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 16px' }}>
              <Fd label={kloelT(`Tom`)}>
                <select style={is} value={tone} onChange={(e) => setTone(e.target.value)}>
                  <option value="CONSULTIVE">{kloelT(`Consultivo`)}</option>
                  <option value="AGGRESSIVE">{kloelT(`Agressivo`)}</option>
                  <option value="FRIENDLY">{kloelT(`Amigável`)}</option>
                  <option value="TECHNICAL">{kloelT(`Técnico`)}</option>
                  <option value="CASUAL">{kloelT(`Casual`)}</option>
                  <option value="DIRECT">{kloelT(`Direto`)}</option>
                  <option value="EMPATHETIC">{kloelT(`Empático`)}</option>
                  <option value="EDUCATIVE">{kloelT(`Educativo`)}</option>
                  <option value="URGENT">{kloelT(`Urgente`)}</option>
                  <option value="AUTO">{kloelT(`Automático`)}</option>
                </select>
              </Fd>
              <Fd label={kloelT(`Persistência (1-5)`)} value={persist} onChange={setPersist} />
              <Fd label={kloelT(`Limite mensagens`)} value={msgLimit} onChange={setMsgLimit} />
              <Fd label={kloelT(`Follow-up`)}>
                <select style={is} value={followUp} onChange={(e) => setFollowUp(e.target.value)}>
                  <option value="2h,24h,72h">{kloelT(`2h, 24h, 72h`)}</option>
                  <option value="1h,12h,48h">{kloelT(`1h, 12h, 48h`)}</option>
                  <option value="6h,24h">{kloelT(`6h, 24h`)}</option>
                  <option value="off">{kloelT(`Desativado`)}</option>
                </select>
              </Fd>
            </div>
            <Tg
              label={kloelT(`Enviar link checkout auto`)}
              checked={autoLink}
              onChange={setAutoLink}
            />
            <Tg
              label={kloelT(`Oferecer desconto se resistência`)}
              checked={offerDisc}
              onChange={setOfferDisc}
            />
            <Tg label={kloelT(`Usar urgência/escassez`)} checked={useUrg} onChange={setUseUrg} />
          </div>
          <Bt
            primary
            onClick={handleSaveAI}
            style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              style={{ marginRight: 6 }}
              aria-hidden="true"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {aiSaved ? 'IA atualizada' : 'Salvar config da IA'}
          </Bt>
        </>
      )}
    </>
  );
}
