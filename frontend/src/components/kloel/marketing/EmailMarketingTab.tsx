'use client';

import React from 'react';
import { kloelT } from '@/lib/i18n/t';
import { useEmailMarketing } from './useEmailMarketing';
import {
  CH_CONFIG,
  SORA,
  MONO,
  BG_CARD,
  BG_ELEVATED,
  BORDER,
  EMBER,
  Fmt,
  IC,
  ConnBadge,
  channelDataStats,
  EMAIL_TEMPLATE_PRESETS,
} from './MarketingShared';
import type { ChannelRealData, MarketingConnectStatus, EmailTemplatePreset } from './MarketingTypes';

interface EmailMarketingTabProps {
  channelData: ChannelRealData | null;
  connectionStatus?: MarketingConnectStatus | null;
  mode?: string;
  defaultRecipientEmail?: string | null;
  onConnectEmail?: () => void;
  onDisconnectEmail?: () => void;
  onSendEmailTest?: () => void;
  connectingKey?: string | null;
  emailTestSending?: boolean;
  emailTestResult?: string | null;
}

export default function EmailMarketingTab({
  channelData,
  connectionStatus,
  mode,
  defaultRecipientEmail,
  onConnectEmail,
  onDisconnectEmail,
  onSendEmailTest,
  connectingKey,
  emailTestSending,
  emailTestResult,
}: EmailMarketingTabProps) {
  const ch = CH_CONFIG.email;
  const {
    connection,
    emailSubject,
    setEmailSubject,
    emailBody,
    setEmailBody,
    emailSending,
    emailResult,
    canSubmit,
    handleSend,
    handleSelectTemplate,
  } = useEmailMarketing({ connectionStatus, defaultRecipientEmail });

  const templateFocused = mode === 'templates';
  const connecting = connectingKey === 'email';

  return (
    <div>
      {templateFocused && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 6,
            border: `1px solid ${ch.color}40`,
            background: `${ch.color}10`,
            color: 'var(--app-text-primary)',
            fontSize: 12,
            fontFamily: SORA,
          }}
        >
          {kloelT(`Biblioteca de templates aberta. Escolha um modelo pronto para preencher o assunto e o
          corpo do email antes de enviar.`)}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <span style={{ color: ch.color }}>{ch.icon(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: 'var(--app-text-primary)' }}>
          {ch.label}
        </span>
        <ConnBadge connected={connection?.connected === true} />
      </div>

      <EmailConnectionPanel
        connection={connection}
        connecting={connecting}
        testSending={emailTestSending}
        testResult={emailTestResult}
        color={ch.color}
        onConnect={() => onConnectEmail?.()}
        onDisconnect={() => onDisconnectEmail?.()}
        onSendTest={() => onSendEmailTest?.()}
      />

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 24 }}
      >
        {channelDataStats(channelData).map((s) => (
          <div
            key={s.label}
            style={{
              background: BG_CARD,
              borderRadius: 6,
              padding: 14,
              border: `1px solid ${BORDER}`,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 10,
                color: 'var(--app-text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                marginBottom: 4,
              }}
            >
              {s.label}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 20, color: 'var(--app-text-primary)' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.1fr) minmax(260px,0.9fr)',
          gap: 16,
        }}
      >
        <div
          style={{
            background: BG_CARD,
            borderRadius: 6,
            padding: 20,
            border: `1px solid ${BORDER}`,
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 10,
              color: 'var(--app-text-tertiary)',
              marginBottom: 16,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
            }}
          >
            {kloelT(`Enviar Campanha`)}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 12,
                  color: 'var(--app-text-secondary)',
                  marginBottom: 6,
                }}
              >
                {kloelT(`Assunto`)}
              </div>
              <input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder={kloelT(`Assunto do email...`)}
                style={{
                  fontFamily: SORA,
                  fontSize: 13,
                  padding: '10px 14px',
                  width: '100%',
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  background: BG_ELEVATED,
                  color: 'var(--app-text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = ch.color;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = BORDER;
                }}
              />
            </div>

            <div>
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 12,
                  color: 'var(--app-text-secondary)',
                  marginBottom: 6,
                }}
              >
                {kloelT(`Corpo HTML`)}
              </div>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder={kloelT(`<h1>Seu HTML aqui...</h1>`)}
                rows={8}
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  padding: '10px 14px',
                  width: '100%',
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  background: BG_ELEVATED,
                  color: 'var(--app-text-primary)',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = ch.color;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = BORDER;
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!canSubmit}
              style={{
                fontFamily: SORA,
                fontSize: 14,
                padding: '12px 32px',
                borderRadius: 6,
                border: 'none',
                background: canSubmit ? EMBER : 'var(--app-text-placeholder)',
                color: 'var(--app-text-on-accent)',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                alignSelf: 'flex-start',
              }}
            >
              {emailSending ? (
                'Enviando...'
              ) : (
                <>
                  {IC.send(16)} {kloelT(`Enviar`)}
                </>
              )}
            </button>

            {emailResult && (
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  padding: '10px 16px',
                  borderRadius: 6,
                  background:
                    emailResult.failed === 0 ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                  border: `1px solid ${emailResult.failed === 0 ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
                  color: emailResult.failed === 0 ? '#10B981' : '#F59E0B',
                }}
              >
                {emailResult.sent} {kloelT(`enviados,`)} {emailResult.failed} falharam
              </div>
            )}
          </div>
        </div>

        <EmailTemplatesPanel onSelect={handleSelectTemplate} />
      </div>
    </div>
  );
}

function EmailConnectionPanel({
  connection,
  connecting,
  testSending,
  testResult,
  color,
  onConnect,
  onDisconnect,
  onSendTest,
}: {
  connection?: {
    connected?: boolean;
    providerAvailable?: boolean;
    provider?: string;
    fromName?: string;
    fromEmail?: string;
  };
  connecting?: boolean;
  testSending?: boolean;
  testResult?: string | null;
  color: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onSendTest: () => void;
}) {
  return (
    <div
      style={{
        background: BG_CARD,
        borderRadius: 6,
        padding: 18,
        border: `1px solid ${BORDER}`,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: SORA,
              fontSize: 10,
              color: 'var(--app-text-tertiary)',
              marginBottom: 8,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
            }}
          >
            {kloelT(`Conexao de email`)}
          </div>
          <div
            style={{
              fontFamily: SORA,
              fontSize: 15,
              color: 'var(--app-text-primary)',
              marginBottom: 4,
            }}
          >
            {connection?.providerAvailable
              ? 'Provider detectado e pronto para ativacao'
              : 'Nenhum provider de email configurado no backend'}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 12,
              color: 'var(--app-text-secondary)',
              lineHeight: 1.6,
            }}
          >
            {kloelT(`Provider:`)} {connection?.provider || 'log'} {kloelT(`&middot; Remetente:`)}{' '}
            {connection?.fromName || 'KLOEL'} {kloelT(`&lt;`)}
            {connection?.fromEmail || 'noreply@kloel.com'}
            {kloelT(`&gt;`)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {connection?.connected ? (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={connecting}
              style={{
                fontFamily: SORA,
                fontSize: 12,
                padding: '10px 14px',
                borderRadius: 6,
                border: `1px solid ${BORDER}`,
                background: BG_ELEVATED,
                color: 'var(--app-text-primary)',
                cursor: connecting ? 'wait' : 'pointer',
                opacity: connecting ? 0.7 : 1,
              }}
            >
              {kloelT(`Desativar email`)}
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              disabled={connecting || !connection?.providerAvailable}
              style={{
                fontFamily: SORA,
                fontSize: 12,
                padding: '10px 14px',
                borderRadius: 6,
                border: 'none',
                background: connection?.providerAvailable
                  ? color
                  : 'var(--app-text-placeholder)',
                color: 'var(--app-text-on-accent)',
                cursor: connecting ? 'wait' : 'pointer',
                opacity: connecting ? 0.7 : 1,
              }}
            >
              {connecting ? 'Ativando...' : 'Conectar Email'}
            </button>
          )}
          <button
            type="button"
            onClick={onSendTest}
            disabled={testSending || !connection?.providerAvailable}
            style={{
              fontFamily: SORA,
              fontSize: 12,
              padding: '10px 14px',
              borderRadius: 6,
              border: `1px solid ${color}40`,
              background: `${color}10`,
              color,
              cursor: testSending ? 'wait' : 'pointer',
              opacity: !connection?.providerAvailable ? 0.45 : 1,
            }}
          >
            {testSending ? 'Enviando teste...' : 'Enviar teste'}
          </button>
        </div>
      </div>
      {testResult && (
        <div
          style={{
            marginTop: 12,
            fontFamily: MONO,
            fontSize: 12,
            color: 'var(--app-text-primary)',
            padding: '10px 12px',
            borderRadius: 6,
            background: BG_ELEVATED,
            border: `1px solid ${BORDER}`,
          }}
        >
          {testResult}
        </div>
      )}
    </div>
  );
}

function EmailTemplatesPanel({
  onSelect,
}: {
  onSelect: (template: EmailTemplatePreset) => void;
}) {
  return (
    <div
      style={{
        background: BG_CARD,
        borderRadius: 6,
        padding: 20,
        border: `1px solid ${BORDER}`,
      }}
    >
      <div
        style={{
          fontFamily: SORA,
          fontSize: 10,
          color: 'var(--app-text-tertiary)',
          marginBottom: 16,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
        }}
      >
        {kloelT(`Templates de Mensagem`)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {EMAIL_TEMPLATE_PRESETS.map((template) => (
          <button
            type="button"
            key={template.id}
            onClick={() => onSelect(template)}
            style={{
              textAlign: 'left',
              background: BG_ELEVATED,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: '12px 14px',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 12,
                color: 'var(--app-text-primary)',
                marginBottom: 4,
              }}
            >
              {template.label}
            </div>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 11,
                color: 'var(--app-text-secondary)',
                marginBottom: 6,
              }}
            >
              {template.subject}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: 'var(--app-text-tertiary)',
                lineHeight: 1.5,
              }}
            >
              {template.html}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
