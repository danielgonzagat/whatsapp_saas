'use client';

import React, { useState, useEffect } from 'react';
import { useNerveCenterContext } from './product-nerve-center.context';
import { apiFetch } from '@/lib/api';
import { Bt, cs, Fd, is, PanelLoadingState, Tg, V } from './product-nerve-center.shared';
import { useToast } from '@/components/kloel/ToastProvider';

function unwrapApiPayload<T = any>(response: any): T {
  if (response?.error) {
    throw new Error(response.error);
  }

  return (response?.data ?? response) as T;
}

export function ProductNerveCenterIATab({
  primaryPlanId,
  primaryCheckoutConfig,
}: {
  primaryPlanId: string | null;
  primaryCheckoutConfig: any;
}) {
  const { productId, openCheckoutEditor, initialFocus } = useNerveCenterContext();
  const { showToast } = useToast();

  const [aiCfg, setAiCfg] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);
  useEffect(() => {
    apiFetch(`/products/${productId}/ai-config`)
      .then((r: any) => setAiCfg(unwrapApiPayload<any>(r) || {}))
      .catch(() => setAiCfg({}))
      .finally(() => setAiLoading(false));
  }, [productId]);
  const [whobuys, setWhobuys] = useState('');
  const [pains, setPains] = useState('');
  const [promise, setPromise] = useState('');
  const [objs, setObjs] = useState<{ label: string; response: string }[]>([
    { label: 'É caro', response: '' },
    { label: 'Não confio', response: '' },
    { label: 'Funciona?', response: '' },
  ]);
  const [tone, setTone] = useState('CONSULTIVE');
  const [persist, setPersist] = useState('3');
  const [msgLimit, setMsgLimit] = useState('10');
  const [followUp, setFollowUp] = useState('2h,24h,72h');
  const [autoLink, setAutoLink] = useState(true);
  const [offerDisc, setOfferDisc] = useState(true);
  const [useUrg, setUseUrg] = useState(true);
  useEffect(() => {
    if (!aiCfg) return;
    const cp = aiCfg.customerProfile || {};
    setWhobuys(cp.whobuys || cp.idealCustomer || '');
    setPains(cp.pains || cp.painPoints || '');
    setPromise(cp.promise || cp.promisedResult || '');
    if (Array.isArray(aiCfg.objections) && aiCfg.objections.length)
      setObjs(
        aiCfg.objections.map((obj: any) => ({
          label: obj.label || obj.q || '',
          response: obj.response || obj.a || '',
        })),
      );
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
          persistenceLevel: parseInt(persist) || 3,
          messageLimit: parseInt(msgLimit) || 10,
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
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={V.em} strokeWidth={2}>
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: V.em }}>Marketing Artificial</span>
        </div>
        <p style={{ fontSize: 11, color: V.t2, margin: '6px 0 0' }}>
          Configure como a IA vende este produto via WhatsApp, Instagram, TikTok e Facebook.
        </p>
      </div>
      {aiLoading ? (
        <PanelLoadingState
          compact
          label="Carregando config da IA"
          description="A área de IA permanece aberta enquanto argumentos, objeções e automações do produto são sincronizados."
        />
      ) : (
        <>
          <div
            style={{
              ...cs,
              padding: 16,
              marginBottom: 16,
              background: initialFocus === 'urgency' ? `${V.em}08` : V.s,
              border: initialFocus === 'urgency' ? `1px solid ${V.em}25` : `1px solid ${V.b}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: V.t }}>Urgência e escassez</div>
                <div style={{ fontSize: 11, color: V.t3, marginTop: 4, lineHeight: 1.6 }}>
                  {`IA ${useUrg ? 'já usa' : 'ainda não usa'} gatilhos de urgência. Checkout principal com timer ${primaryCheckoutConfig.enableTimer ? 'ativo' : 'desligado'} e contador ${primaryCheckoutConfig.showStockCounter ? 'ativo' : 'desligado'}.`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {primaryPlanId && (
                  <Bt primary onClick={() => openCheckoutEditor('urgency', primaryPlanId)}>
                    Abrir checkout
                  </Bt>
                )}
                {primaryPlanId && (
                  <Bt onClick={() => openCheckoutEditor('checkout-appearance', primaryPlanId)}>
                    Ir para configurações
                  </Bt>
                )}
              </div>
            </div>
          </div>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
            className="grid2"
          >
            <div style={{ ...cs, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 16px' }}>
                Perfil do cliente ideal
              </h3>
              <Fd label="Quem compra?" full>
                <textarea
                  style={{ ...is, height: 70 }}
                  value={whobuys}
                  onChange={(e) => setWhobuys(e.target.value)}
                  placeholder="Mulheres 35-55 anos..."
                />
              </Fd>
              <Fd label="Principais dores" full>
                <textarea
                  style={{ ...is, height: 60 }}
                  value={pains}
                  onChange={(e) => setPains(e.target.value)}
                  placeholder="Dores, problemas..."
                />
              </Fd>
              <Fd label="Resultado prometido" full>
                <textarea
                  style={{ ...is, height: 60 }}
                  value={promise}
                  onChange={(e) => setPromise(e.target.value)}
                  placeholder="Resultado que o cliente terá..."
                />
              </Fd>
            </div>
            <div style={{ ...cs, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 16px' }}>
                Objeções e respostas
              </h3>
              {objs.map((o, i) => (
                <div
                  key={i}
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
                      placeholder="Objeção"
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
                    placeholder="Resposta da IA..."
                  />
                </div>
              ))}
              <Bt
                onClick={() => setObjs([...objs, { label: '', response: '' }])}
                style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
              >
                + Adicionar objeção
              </Bt>
            </div>
          </div>
          <div style={{ ...cs, padding: 20, marginTop: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 16px' }}>
              Comportamento
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 16px' }}>
              <Fd label="Tom">
                <select style={is} value={tone} onChange={(e) => setTone(e.target.value)}>
                  <option value="CONSULTIVE">Consultivo</option>
                  <option value="AGGRESSIVE">Agressivo</option>
                  <option value="FRIENDLY">Amigável</option>
                  <option value="TECHNICAL">Técnico</option>
                  <option value="CASUAL">Casual</option>
                  <option value="DIRECT">Direto</option>
                  <option value="EMPATHETIC">Empático</option>
                  <option value="EDUCATIVE">Educativo</option>
                  <option value="URGENT">Urgente</option>
                  <option value="AUTO">Automático</option>
                </select>
              </Fd>
              <Fd label="Persistência (1-5)" value={persist} onChange={setPersist} />
              <Fd label="Limite mensagens" value={msgLimit} onChange={setMsgLimit} />
              <Fd label="Follow-up">
                <select style={is} value={followUp} onChange={(e) => setFollowUp(e.target.value)}>
                  <option value="2h,24h,72h">2h, 24h, 72h</option>
                  <option value="1h,12h,48h">1h, 12h, 48h</option>
                  <option value="6h,24h">6h, 24h</option>
                  <option value="off">Desativado</option>
                </select>
              </Fd>
            </div>
            <Tg label="Enviar link checkout auto" checked={autoLink} onChange={setAutoLink} />
            <Tg
              label="Oferecer desconto se resistência"
              checked={offerDisc}
              onChange={setOfferDisc}
            />
            <Tg label="Usar urgência/escassez" checked={useUrg} onChange={setUseUrg} />
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
