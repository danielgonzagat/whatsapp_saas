'use client';

import React from 'react';
import { kloelT } from '@/lib/i18n/t';
import { useSmsMarketing } from './useSmsMarketing';
import { SORA, MONO, BG_CARD, BORDER, Fmt } from './MarketingShared';
import type { ChannelRealData } from './MarketingTypes';

const SMS_COLOR = '#8B5CF6';
const SMS_LABEL = 'SMS';

interface SmsMarketingTabProps {
  channelData: ChannelRealData | null;
}

function SmsIcon(s: number) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d={kloelT(
          `M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h2v2H7V9zm8 0h2v2h-2V9zm-4 0h2v2h-2V9z`,
        )}
      />
    </svg>
  );
}

export default function SmsMarketingTab({ channelData }: SmsMarketingTabProps) {
  const { smsStatus, isConnected, isConfigured, isLoading } = useSmsMarketing();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          gap: 20,
        }}
      >
        <div style={{ opacity: 0.25 }}>{SmsIcon(80)}</div>
        <div style={{ fontFamily: SORA, fontSize: 14, color: 'var(--app-text-secondary)' }}>
          Verificando configuração do canal SMS...
        </div>
      </div>
    );
  }

  if (isConnected && channelData) {
    return (
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: SMS_COLOR }}>{SmsIcon(24)}</span>
            <span style={{ fontFamily: SORA, fontSize: 18, color: 'var(--app-text-primary)' }}>
              {SMS_LABEL}
            </span>
            <ConnectedBadge />
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
            gap: 10,
            marginBottom: 16,
          }}
        >
          {[
            { label: 'Provider', value: smsStatus?.provider || 'N/A' },
            { label: 'Status', value: smsStatus?.status || 'Ativo' },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                background: BG_CARD,
                borderRadius: 6,
                padding: '12px 14px',
                border: `1px solid ${BORDER}`,
              }}
            >
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  color: 'var(--app-text-tertiary)',
                  marginBottom: 6,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: 'var(--app-text-primary)',
                  wordBreak: 'break-word',
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { label: 'Mensagens', value: Fmt(channelData.messages) },
            { label: 'Leads', value: Fmt(channelData.leads) },
            { label: 'Vendas', value: channelData.sales.toString() },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 16px 12px 20px',
                background: BG_CARD,
                borderRadius: 6,
                border: `1px solid ${BORDER}`,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  background: SMS_COLOR,
                }}
              />
              <span
                style={{
                  fontFamily: SORA,
                  fontSize: 11,
                  color: 'var(--app-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.25em',
                  minWidth: 120,
                }}
              >
                {s.label}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 16,
                  color: 'var(--app-text-primary)',
                  flex: 1,
                }}
              >
                {s.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 400,
        gap: 20,
      }}
    >
      <div style={{ color: SMS_COLOR, opacity: 0.25 }}>{SmsIcon(80)}</div>
      <div style={{ fontFamily: SORA, fontSize: 22, color: 'var(--app-text-primary)' }}>
        {kloelT(`Conectar`)} {SMS_LABEL}
      </div>
      <div
        style={{
          fontFamily: SORA,
          fontSize: 14,
          color: 'var(--app-text-secondary)',
          maxWidth: 420,
          textAlign: 'center',
          lineHeight: 1.6,
        }}
      >
        {isConfigured
          ? 'Provider de SMS detectado. Ative a integração para começar a enviar campanhas via SMS.'
          : kloelT(
              `O canal SMS requer configuração do provider no backend. Entre em contato com o suporte para ativar este canal.`,
            )}
      </div>

      {!isConfigured && (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 12,
            color: '#F59E0B',
            background: 'rgba(245,158,11,0.1)',
            padding: '10px 16px',
            borderRadius: 6,
            border: '1px solid rgba(245,158,11,0.2)',
            maxWidth: 420,
            textAlign: 'center',
          }}
        >
          Setup pendente — provider SMS não configurado no backend
        </div>
      )}

      {channelData && (channelData.messages > 0 || channelData.leads > 0) && (
        <div
          style={{
            width: '100%',
            maxWidth: 400,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginTop: 8,
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 10,
              color: 'var(--app-text-tertiary)',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            {kloelT(`Dados registrados`)}
          </div>
          {[
            { label: 'Mensagens', value: Fmt(channelData.messages) },
            { label: 'Leads', value: Fmt(channelData.leads) },
            { label: 'Vendas', value: channelData.sales.toString() },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '10px 16px 10px 20px',
                background: BG_CARD,
                borderRadius: 6,
                border: `1px solid ${BORDER}`,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  background: SMS_COLOR,
                  opacity: 0.4,
                }}
              />
              <span
                style={{
                  fontFamily: SORA,
                  fontSize: 11,
                  color: 'var(--app-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.25em',
                  minWidth: 80,
                }}
              >
                {s.label}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 14,
                  color: 'var(--app-text-primary)',
                  flex: 1,
                }}
              >
                {s.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectedBadge() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontFamily: MONO,
        color: '#10B981',
        background: 'rgba(16,185,129,0.1)',
        padding: '2px 8px',
        borderRadius: 99,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#10B981',
          animation: 'mktPulse 2s infinite',
        }}
      />
      Conectado
    </span>
  );
}
