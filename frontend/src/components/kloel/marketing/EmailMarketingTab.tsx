'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useEmailMarketing } from './useEmailMarketing';
import {
  CH_CONFIG, SORA, MONO, BG_CARD, BG_ELEVATED, BORDER, EMBER, IC, ConnBadge,
  channelDataStats,
} from './MarketingShared';
import { useEmailPresets } from '@/hooks/useEmailPresets';
import type { ChannelRealData, MarketingConnectStatus, EmailTemplatePreset } from './MarketingTypes';

interface EmailMarketingTabProps {
  channelData: ChannelRealData | null;
  connectionStatus?: MarketingConnectStatus | null | undefined;
  mode?: string | undefined;
  defaultRecipientEmail?: string | null | undefined;
  onConnectEmail?: (() => void) | undefined;
  onDisconnectEmail?: (() => void) | undefined;
  onSendEmailTest?: (() => void) | undefined;
  connectingKey?: string | null | undefined;
  emailTestSending?: boolean | undefined;
  emailTestResult?: string | null | undefined;
}

const inputStyle: React.CSSProperties = {
  fontFamily: SORA, fontSize: 13, padding: '10px 14px', width: '100%',
  borderRadius: 6, border: `1px solid ${BORDER}`, background: BG_ELEVATED,
  color: 'var(--app-text-primary)', outline: 'none', boxSizing: 'border-box',
};
const sectionHeader: React.CSSProperties = {
  fontFamily: SORA, fontSize: 10, color: 'var(--app-text-tertiary)',
  marginBottom: 16, letterSpacing: '0.25em', textTransform: 'uppercase',
};
const cardBox: React.CSSProperties = {
  background: BG_CARD, borderRadius: 6, padding: 20, border: `1px solid ${BORDER}`,
};

export default function EmailMarketingTab({
  channelData, connectionStatus, mode, defaultRecipientEmail,
  onConnectEmail, onDisconnectEmail, onSendEmailTest,
  connectingKey, emailTestSending, emailTestResult,
}: EmailMarketingTabProps) {
  const ch = CH_CONFIG.email;
  const {
    connection, emailSubject, setEmailSubject, emailBody, setEmailBody,
    emailSending, emailResult, canSubmit, handleSend, handleSelectTemplate,
  } = useEmailMarketing({ connectionStatus, defaultRecipientEmail });

  const { presets: emailPresets, isLoading: presetsLoading } = useEmailPresets();

  const templateFocused = mode === 'templates';
  const connecting = connectingKey === 'email';
  const conn = connection;

  return (
    <div>
      {templateFocused && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 6, border: `1px solid ${ch.color}40`, background: `${ch.color}10`, color: 'var(--app-text-primary)', fontSize: 12, fontFamily: SORA }}>
          {kloelT(`Biblioteca de templates aberta. Escolha um modelo pronto para preencher o assunto e o corpo do email antes de enviar.`)}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <span style={{ color: ch.color }}>{ch.icon(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: 'var(--app-text-primary)' }}>{ch.label}</span>
        <ConnBadge connected={conn?.connected === true} />
      </div>

      <div style={{ ...cardBox, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={sectionHeader}>{kloelT(`Conexao de email`)}</div>
            <div style={{ fontFamily: SORA, fontSize: 15, color: 'var(--app-text-primary)', marginBottom: 4 }}>
              {conn?.providerAvailable ? 'Provider detectado e pronto para ativacao' : 'Nenhum provider de email configurado no backend'}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--app-text-secondary)', lineHeight: 1.6 }}>
              {kloelT(`Provider:`)} {conn?.provider || 'log'} {kloelT(`&middot; Remetente:`)} {conn?.fromName || 'KLOEL'} {kloelT(`&lt;`)}{conn?.fromEmail || 'noreply@kloel.com'}{kloelT(`&gt;`)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {conn?.connected ? (
              <button type="button" onClick={() => onDisconnectEmail?.()} disabled={connecting} style={{ fontFamily: SORA, fontSize: 12, padding: '10px 14px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG_ELEVATED, color: 'var(--app-text-primary)', cursor: connecting ? 'wait' : 'pointer', opacity: connecting ? 0.7 : 1 }}>
                {kloelT(`Desativar email`)}
              </button>
            ) : (
              <button type="button" onClick={() => onConnectEmail?.()} disabled={connecting || !conn?.providerAvailable} style={{ fontFamily: SORA, fontSize: 12, padding: '10px 14px', borderRadius: 6, border: 'none', background: conn?.providerAvailable ? ch.color : 'var(--app-text-placeholder)', color: 'var(--app-text-on-accent)', cursor: connecting ? 'wait' : 'pointer', opacity: connecting ? 0.7 : 1 }}>
                {connecting ? 'Ativando...' : 'Conectar Email'}
              </button>
            )}
            <button type="button" onClick={() => onSendEmailTest?.()} disabled={emailTestSending || !conn?.providerAvailable} style={{ fontFamily: SORA, fontSize: 12, padding: '10px 14px', borderRadius: 6, border: `1px solid ${ch.color}40`, background: `${ch.color}10`, color: ch.color, cursor: emailTestSending ? 'wait' : 'pointer', opacity: !conn?.providerAvailable ? 0.45 : 1 }}>
              {emailTestSending ? 'Enviando teste...' : 'Enviar teste'}
            </button>
          </div>
        </div>
        {emailTestResult && (
          <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 12, color: 'var(--app-text-primary)', padding: '10px 12px', borderRadius: 6, background: BG_ELEVATED, border: `1px solid ${BORDER}` }}>{emailTestResult}</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 24 }}>
        {channelDataStats(channelData).map((s) => (
          <div key={s.label} style={{ background: BG_CARD, borderRadius: 6, padding: 14, border: `1px solid ${BORDER}`, textAlign: 'center' }}>
            <div style={{ fontFamily: SORA, fontSize: 10, color: 'var(--app-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: MONO, fontSize: 20, color: 'var(--app-text-primary)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(260px,0.9fr)', gap: 16 }}>
        <div style={cardBox}>
          <div style={sectionHeader}>{kloelT(`Enviar Campanha`)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-secondary)', marginBottom: 6 }}>{kloelT(`Assunto`)}</div>
              <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder={kloelT(`Assunto do email...`)} style={inputStyle} onFocus={(e) => { e.currentTarget.style.borderColor = ch.color; }} onBlur={(e) => { e.currentTarget.style.borderColor = BORDER; }} />
            </div>
            <div>
              <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-secondary)', marginBottom: 6 }}>{kloelT(`Corpo HTML`)}</div>
              <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder={kloelT(`<h1>Seu HTML aqui...</h1>`)} rows={8} style={{ ...inputStyle, fontFamily: MONO, resize: 'vertical' } as React.CSSProperties} onFocus={(e) => { e.currentTarget.style.borderColor = ch.color; }} onBlur={(e) => { e.currentTarget.style.borderColor = BORDER; }} />
            </div>
            <button type="button" onClick={() => void handleSend()} disabled={!canSubmit} style={{ fontFamily: SORA, fontSize: 14, padding: '12px 32px', borderRadius: 6, border: 'none', background: canSubmit ? EMBER : 'var(--app-text-placeholder)', color: 'var(--app-text-on-accent)', cursor: canSubmit ? 'pointer' : 'not-allowed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
              {emailSending ? 'Enviando...' : <>{IC.send(16)} {kloelT(`Enviar`)}</>}
            </button>
            {emailResult && (
              <div style={{ fontFamily: MONO, fontSize: 13, padding: '10px 16px', borderRadius: 6, background: emailResult.failed === 0 ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${emailResult.failed === 0 ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`, color: emailResult.failed === 0 ? colors.semantic.success : colors.semantic.warning }}>
                {emailResult.sent} {kloelT(`enviados,`)} {emailResult.failed} falharam
              </div>
            )}
          </div>
        </div>

        <div style={cardBox}>
          <div style={sectionHeader}>{kloelT(`Templates de Mensagem`)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {presetsLoading ? (
              <div style={{ padding: 12, color: 'var(--app-text-muted)', fontSize: 12, textAlign: 'center' }}>
                {kloelT('Carregando templates...')}
              </div>
            ) : emailPresets.length === 0 ? (
              <div style={{ padding: 12, color: 'var(--app-text-muted)', fontSize: 12, textAlign: 'center' }}>
                {kloelT('Nenhum template disponível.')}
              </div>
            ) : (
              emailPresets.map((template: EmailTemplatePreset) => (
              <button type="button" key={template.id} onClick={() => handleSelectTemplate(template)} style={{ textAlign: 'left', background: BG_ELEVATED, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '12px 14px', cursor: 'pointer' }}>
                <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)', marginBottom: 4 }}>{template.label}</div>
                <div style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-secondary)', marginBottom: 6 }}>{template.subject}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-tertiary)', lineHeight: 1.5 }}>{template.html}</div>
              </button>
            ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
