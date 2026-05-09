'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useCRMMutations, useContact } from '@/hooks/useCRM';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import {
  Briefcase,
  MessageCircle,
  X,
} from 'lucide-react';
import { Section } from './crm-drawer-parts';
import { ContactDetailLoadingBody } from './ContactDetailLoadingBody';
import { ContactInfoSection } from './ContactInfoSection';
import { ContactTagsSection } from './ContactTagsSection';
import { ContactScoreSentimentSection } from './ContactScoreSentimentSection';
import { ContactNeuroSection } from './ContactNeuroSection';
import { ContactDealsSection } from './ContactDealsSection';

interface Deal {
  _id?: string;
  id?: string;
  title?: string;
  value?: number;
  stage?: string | { id?: string; name?: string };
  currency?: string;
}

interface Contact {
  id?: string;
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

const C = {
  bg: 'var(--bg-void, #0A0A0C)',
  surface: 'var(--bg-surface, #111113)',
  border: 'var(--border-space, #222226)',
  accent: colors.ember.primary,
  text: 'var(--text-silver, #E0DDD8)',
  muted: 'var(--text-muted, #6E6E73)',
  sora: "var(--font-sora), 'Sora', sans-serif",
  mono: "var(--font-jetbrains), 'JetBrains Mono', monospace",
} as const;

export function ContactDetailDrawer({ phone, onClose }: ContactDetailDrawerProps) {
  const router = useRouter();
  const { contact: raw, isLoading, mutate } = useContact(phone);
  const { addTag, removeTag } = useCRMMutations();

  const contact = raw as Contact | undefined;

  const handleAddTag = useCallback(
    async (tag: string) => {
      if (!phone) {
        return;
      }
      await addTag(phone, tag);
      mutate();
    },
    [phone, addTag, mutate],
  );

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      if (!phone) {
        return;
      }
      await removeTag(phone, tag);
      mutate();
    },
    [phone, removeTag, mutate],
  );

  const handleMutate = useCallback(() => {
    mutate();
  }, [mutate]);

  if (!phone) {
    return null;
  }

  const name = contact?.name || phone;
  const score = contact?.leadScore ?? 0;
  const sentiment = contact?.sentiment ?? 'neutral';
  const tags: string[] = contact?.tags ?? [];
  const deals: Deal[] = contact?.deals ?? [];
  const contactId = contact?.id ?? '';

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar detalhes do contato"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      />

      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 100,
          width: 380,
          maxWidth: '100vw',
          background: C.surface,
          borderLeft: `1px solid ${C.border}`,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: C.sora,
          color: C.text,
          animation: 'slideInRight .2s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {name}
            </h2>
            <span style={{ fontSize: 12, color: C.muted, fontFamily: C.mono }}>{phone}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: C.muted,
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = C.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = C.muted;
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 24px', background: C.bg }}>
          {isLoading ? (
            <ContactDetailLoadingBody />
          ) : (
            <>
              <Section title={kloelT('Informacoes')}>
                <ContactInfoSection phone={phone} email={contact?.email} />
              </Section>

              <Section title={kloelT('Tags')}>
                <ContactTagsSection
                  tags={tags}
                  onAddTag={handleAddTag}
                  onRemoveTag={handleRemoveTag}
                />
              </Section>

              <Section title={kloelT('Score & Sentimento')}>
                <ContactScoreSentimentSection score={score} sentiment={sentiment} />
              </Section>

              <Section title={kloelT('Neuro IA')}>
                <ContactNeuroSection contactId={contactId} onMutate={handleMutate} />
              </Section>

              <Section title={kloelT('Deals')}>
                <ContactDealsSection deals={deals} />
              </Section>
            </>
          )}
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            gap: 8,
            background: C.surface,
          }}
        >
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push('/whatsapp');
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 0',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: C.accent,
              color: colors.text.silver,
              fontFamily: C.sora,
              transition: 'opacity .15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.85';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            <MessageCircle size={14} aria-hidden="true" /> {kloelT('Enviar mensagem')}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push('/vendas/pipeline');
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 0',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: `1px solid ${C.border}`,
              background: 'transparent',
              color: C.text,
              fontFamily: C.sora,
              transition: 'opacity .15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.85';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            <Briefcase size={14} aria-hidden="true" /> {kloelT('Criar deal')}
          </button>
        </div>
      </aside>

      <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
    </>
  );
}
