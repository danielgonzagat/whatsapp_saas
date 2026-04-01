'use client';

import { useState, useCallback, KeyboardEvent } from 'react';
import { X, Mail, Phone, Tag, TrendingUp, Briefcase, MessageCircle, Plus, Brain, Zap } from 'lucide-react';
import { useContact, useCRMMutations } from '@/hooks/useCRM';
import { neuroCrmApi } from '@/lib/api/crm';

/* ── Types ── */
interface Deal {
  _id?: string;
  id?: string;
  title?: string;
  value?: number;
  stage?: string;
  currency?: string;
}

interface Contact {
  name?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  leadScore?: number;
  sentiment?: 'positive' | 'neutral' | 'negative';
  deals?: Deal[];
}

interface ContactDetailDrawerProps {
  phone: string | null;
  onClose: () => void;
}

/* ── Design tokens ── */
const C = {
  bg: '#0A0A0C',
  surface: '#111113',
  elevated: '#19191C',
  border: '#222226',
  accent: '#E85D30',
  text: '#E0DDD8',
  muted: '#6E6E73',
  sora: "'Sora', sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

const sentimentColors: Record<string, { bg: string; text: string }> = {
  positive: { bg: 'rgba(52,199,89,0.15)', text: '#34C759' },
  neutral:  { bg: 'rgba(110,110,115,0.15)', text: '#8E8E93' },
  negative: { bg: 'rgba(255,69,58,0.15)', text: '#FF453A' },
};

function LoadingStrip({ width = '100%', height = 12, marginBottom = 0 }: { width?: string | number; height?: string | number; marginBottom?: number }) {
  return (
    <div
      style={{
        width,
        height,
        marginBottom,
        borderRadius: 6,
        background: 'linear-gradient(90deg, rgba(25,25,28,0.98) 0%, rgba(41,41,46,1) 50%, rgba(25,25,28,0.98) 100%)',
      }}
    />
  );
}

function ContactDetailLoadingBody() {
  return (
    <>
      <Section title="Informacoes">
        <LoadingStrip width="72%" height={13} marginBottom={10} />
        <LoadingStrip width="58%" height={13} />
      </Section>

      <Section title="Tags">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <LoadingStrip width={88} height={26} />
          <LoadingStrip width={106} height={26} />
          <LoadingStrip width={74} height={26} />
        </div>
        <LoadingStrip width="100%" height={34} />
      </Section>

      <Section title="Score & Sentimento">
        <LoadingStrip width="100%" height={10} marginBottom={12} />
        <LoadingStrip width="100%" height={8} marginBottom={12} />
        <LoadingStrip width="48%" height={20} />
      </Section>

      <Section title="Neuro IA">
        <LoadingStrip width={132} height={34} marginBottom={12} />
        <LoadingStrip width="100%" height={58} />
      </Section>

      <Section title="Deals">
        {[0, 1].map((index) => (
          <div
            key={index}
            style={{
              background: C.elevated,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '10px 12px',
              marginBottom: 8,
            }}
          >
            <LoadingStrip width={index === 0 ? '62%' : '48%'} height={13} marginBottom={8} />
            <LoadingStrip width="32%" height={11} />
          </div>
        ))}
      </Section>
    </>
  );
}

/* ── Component ── */
export function ContactDetailDrawer({ phone, onClose }: ContactDetailDrawerProps) {
  const { contact: raw, isLoading, mutate } = useContact(phone);
  const { addTag, removeTag } = useCRMMutations();
  const [tagInput, setTagInput] = useState('');
  const [neuroLoading, setNeuroLoading] = useState(false);
  const [neuroResult, setNeuroResult] = useState<{ action?: string; reason?: string; suggestedMessage?: string } | null>(null);
  const [neuroError, setNeuroError] = useState<string | null>(null);

  const contact = raw as Contact | undefined;

  const handleAddTag = useCallback(async () => {
    const value = tagInput.trim();
    if (!value || !phone) return;
    setTagInput('');
    await addTag(phone, value);
    mutate();
  }, [tagInput, phone, addTag, mutate]);

  const handleRemoveTag = useCallback(async (tag: string) => {
    if (!phone) return;
    await removeTag(phone, tag);
    mutate();
  }, [phone, removeTag, mutate]);

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); }
  };

  const handleNeuroAnalyze = useCallback(async () => {
    const contactId = (contact as any)?.id;
    if (!contactId) return;
    setNeuroLoading(true);
    setNeuroError(null);
    setNeuroResult(null);
    try {
      const [analysisRes, nbaRes] = await Promise.all([
        neuroCrmApi.analyze(contactId),
        neuroCrmApi.nextBestAction(contactId),
      ]);
      const nba = nbaRes.data as { action?: string; reason?: string; suggestedMessage?: string } | undefined;
      setNeuroResult(nba ?? null);
      mutate();
    } catch (err: any) {
      setNeuroError(err?.message || 'Falha na análise');
    } finally {
      setNeuroLoading(false);
    }
  }, [contact, mutate]);

  if (!phone) return null;

  /* ── Derived data ── */
  const name = contact?.name || phone;
  const score = contact?.leadScore ?? 0;
  const sentiment = contact?.sentiment ?? 'neutral';
  const tags = contact?.tags ?? [];
  const deals: Deal[] = contact?.deals ?? [];
  const sentimentStyle = sentimentColors[sentiment] ?? sentimentColors.neutral;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 99,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        }}
      />

      {/* Drawer */}
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 100,
          width: 380, maxWidth: '100vw',
          background: C.surface, borderLeft: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column',
          fontFamily: C.sora, color: C.text,
          animation: 'slideInRight .2s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</h2>
            <span style={{ fontSize: 12, color: C.muted, fontFamily: C.mono }}>{phone}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 24px', background: C.bg }}>
          {isLoading ? (
            <ContactDetailLoadingBody />
          ) : (
            <>
              {/* ── Contact Info ── */}
              <Section title="Informacoes">
                <InfoRow icon={<Phone size={14} />} label={phone} />
                {contact?.email && <InfoRow icon={<Mail size={14} />} label={contact.email} />}
              </Section>

              {/* ── Tags ── */}
              <Section title="Tags">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: tags.length ? 10 : 0 }}>
                  {tags.map(tag => (
                    <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 20, padding: '3px 10px', fontSize: 12, color: C.text }}>
                      <Tag size={10} style={{ color: C.accent }} />
                      {tag}
                      <button onClick={() => handleRemoveTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 0, lineHeight: 1, display: 'flex' }} onMouseEnter={e => (e.currentTarget.style.color = '#FF453A')} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder="Nova tag..."
                    style={{ flex: 1, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: C.text, outline: 'none', fontFamily: C.sora }}
                  />
                  <button onClick={handleAddTag} style={{ background: C.accent, border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    <Plus size={12} /> Adicionar
                  </button>
                </div>
              </Section>

              {/* ── Score & Sentiment ── */}
              <Section title="Score & Sentimento">
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: C.muted }}>Lead Score</span>
                    <span style={{ fontFamily: C.mono, color: C.text }}>{score}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: C.elevated, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(score, 100)}%`, height: '100%', borderRadius: 3, background: C.accent, transition: 'width .3s ease' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={14} style={{ color: C.muted }} />
                  <span style={{ fontSize: 12, color: C.muted }}>Sentimento:</span>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: sentimentStyle.bg, color: sentimentStyle.text }}>
                    {sentiment}
                  </span>
                </div>
              </Section>

              {/* ── Neuro CRM ── */}
              <Section title="Neuro IA">
                <button
                  onClick={handleNeuroAnalyze}
                  disabled={neuroLoading || !(contact as any)?.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: C.accent, border: 'none', borderRadius: 6,
                    padding: '7px 14px', fontSize: 12, fontWeight: 600,
                    cursor: neuroLoading || !(contact as any)?.id ? 'not-allowed' : 'pointer',
                    color: '#fff', opacity: neuroLoading || !(contact as any)?.id ? 0.6 : 1,
                    fontFamily: C.sora, marginBottom: 10,
                  }}
                >
                  <Brain size={13} />
                  {neuroLoading ? 'Analisando...' : 'Analisar com IA'}
                </button>
                {neuroError && (
                  <p style={{ fontSize: 12, color: '#FF453A', margin: '0 0 8px' }}>{neuroError}</p>
                )}
                {neuroResult && (
                  <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px' }}>
                    {neuroResult.action && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <Zap size={12} style={{ color: C.accent, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{neuroResult.action}</span>
                      </div>
                    )}
                    {neuroResult.reason && (
                      <p style={{ fontSize: 11, color: C.muted, margin: '0 0 6px', lineHeight: 1.5 }}>{neuroResult.reason}</p>
                    )}
                    {neuroResult.suggestedMessage && (
                      <div style={{ background: C.bg, borderRadius: 4, padding: '6px 8px', fontSize: 11, color: C.text, lineHeight: 1.5 }}>
                        {neuroResult.suggestedMessage}
                      </div>
                    )}
                  </div>
                )}
                {!neuroResult && !neuroError && !neuroLoading && (
                  <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                    Clique em &quot;Analisar&quot; para obter a proxima melhor acao para este contato.
                  </p>
                )}
              </Section>

              {/* ── Deals ── */}
              <Section title="Deals">
                {deals.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Nenhum deal associado.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {deals.map(deal => (
                      <div key={deal._id ?? deal.id ?? deal.title} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{deal.title ?? 'Sem titulo'}</div>
                          {deal.stage && <div style={{ fontSize: 11, color: C.muted }}>{deal.stage}</div>}
                        </div>
                        {deal.value != null && (
                          <span style={{ fontFamily: C.mono, fontSize: 13, color: C.accent, fontWeight: 600 }}>
                            {(deal.currency ?? 'R$')} {deal.value.toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, background: C.surface }}>
          <ActionButton icon={<MessageCircle size={14} />} label="Enviar mensagem" primary />
          <ActionButton icon={<Briefcase size={14} />} label="Criar deal" />
        </div>
      </aside>

      {/* Keyframe (injected once) */}
      <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
    </>
  );
}

/* ── Sub-components ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, margin: '0 0 10px' }}>{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text, marginBottom: 6 }}>
      <span style={{ color: C.muted, display: 'flex' }}>{icon}</span>
      <span style={{ fontFamily: C.mono }}>{label}</span>
    </div>
  );
}

function ActionButton({ icon, label, primary }: { icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <button
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '10px 0', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        border: primary ? 'none' : `1px solid ${C.border}`,
        background: primary ? C.accent : 'transparent',
        color: primary ? '#fff' : C.text,
        fontFamily: C.sora, transition: 'opacity .15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {icon} {label}
    </button>
  );
}
