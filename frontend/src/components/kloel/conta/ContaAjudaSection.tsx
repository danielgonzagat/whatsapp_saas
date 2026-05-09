'use client';

import { kloelT } from '@/lib/i18n/t';
import { useState } from 'react';
import Icons from './ContaIcons';
import { SORA, EMBER } from './ContaConstants';
import { SectionCard } from './ContaShared';

function FaqItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        background: 'var(--app-bg-secondary)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontFamily: SORA,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            textAlign: 'left' as const,
          }}
        >
          {question}
        </span>
        <span
          style={{
            color: 'var(--app-text-tertiary)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform .15s',
            flexShrink: 0,
            marginLeft: 8,
          }}
        >
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {isOpen && (
        <div
          style={{
            padding: '0 16px 12px',
            fontSize: 11,
            color: 'var(--app-text-secondary)',
            lineHeight: 1.6,
            fontFamily: SORA,
          }}
        >
          {answer}
        </div>
      )}
    </div>
  );
}

export default function AjudaSection() {
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);

  const faqs = [
    {
      q: 'Como conecto meu WhatsApp?',
      a: 'Acesse a secao "WhatsApp" no menu lateral e escaneie o QR Code com o aplicativo do WhatsApp no seu celular.',
    },
    {
      q: 'Quanto tempo leva a verificacao KYC?',
      a: 'A analise dos documentos pode levar ate 48 horas uteis. Voce sera notificado por e-mail quando o resultado estiver disponivel.',
    },
    {
      q: 'Qual o limite de saque mensal?',
      a: 'Para contas com CPF, o limite e de R$ 2.259,20/mes. Cadastre um CNPJ nos dados fiscais para remover esse limite.',
    },
    {
      q: 'Como altero meu plano?',
      a: 'Entre em contato com nosso suporte via WhatsApp ou e-mail para solicitar alteracoes no seu plano atual.',
    },
  ];

  const toggle = (idx: number) => {
    setOpenQuestion(openQuestion === idx ? null : idx);
  };

  const helpLinks = [
    { label: 'Central de Ajuda', href: '#', target: '_blank', icon: Icons.help },
    {
      label: 'Contato / Suporte',
      href: 'mailto:suporte@kloel.com',
      target: undefined,
      icon: Icons.bell,
    },
  ];

  return (
    <SectionCard
      title={kloelT(`Precisa de ajuda?`)}
      subtitle={kloelT(`Entre em contato conosco ou consulte as perguntas frequentes`)}
    >
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 24 }}>
        {helpLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target={link.target}
            rel={link.target === '_blank' ? 'noopener noreferrer' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 18px',
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 8,
              textDecoration: 'none',
              color: 'var(--app-text-primary)',
              fontSize: 13,
              fontFamily: SORA,
              transition: 'all 150ms ease',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = EMBER;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--app-border-primary)';
            }}
          >
            <span style={{ color: EMBER, flexShrink: 0 }}>{link.icon(16)}</span>
            <span style={{ flex: 1 }}>{link.label}</span>
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--app-text-placeholder)"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path d={kloelT(`M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6`)} />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <a
          href="https://wa.me/5500000000000"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1,
            padding: '14px 20px',
            background: 'rgba(37,211,102,.06)',
            border: '1px solid rgba(37,211,102,.2)',
            borderRadius: 6,
            color: '#25D366',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: SORA,
            textDecoration: 'none',
            textAlign: 'center' as const,
            cursor: 'pointer',
            transition: 'all 150ms ease',
            display: 'block',
          }}
        >
          {kloelT(`WhatsApp`)}
        </a>
        <a
          href="mailto:suporte@kloel.com"
          style={{
            flex: 1,
            padding: '14px 20px',
            background: 'rgba(232,93,48,.06)',
            border: `1px solid rgba(232,93,48,.2)`,
            borderRadius: 6,
            color: EMBER,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: SORA,
            textDecoration: 'none',
            textAlign: 'center' as const,
            cursor: 'pointer',
            transition: 'all 150ms ease',
            display: 'block',
          }}
        >
          {kloelT(`E-mail`)}
        </a>
      </div>

      <div style={{ borderTop: '1px solid var(--app-border-subtle)', paddingTop: 20 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            display: 'block',
            marginBottom: 14,
            fontFamily: SORA,
          }}
        >
          {kloelT(`Perguntas frequentes`)}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
          {faqs.map((faq, idx) => (
            <FaqItem
              key={faq.q}
              question={faq.q}
              answer={faq.a}
              isOpen={openQuestion === idx}
              onToggle={() => toggle(idx)}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          borderTop: '1px solid var(--app-border-subtle)',
          marginTop: 20,
          paddingTop: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: 'var(--app-text-tertiary)', flexShrink: 0 }}>{Icons.shield(14)}</span>
        <span style={{ fontSize: 11, color: 'var(--app-text-tertiary)', fontFamily: SORA }}>
          {kloelT(`Versao da plataforma: Kloel v1.0.0-beta`)}
        </span>
      </div>
    </SectionCard>
  );
}
