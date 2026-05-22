import type { ChannelKey } from '../OfficialMarketingChannelPage.helpers';
import { buttonStyle, secondaryButtonStyle } from './shared-styles';

interface Props {
  channel: ChannelKey;
  accentColor: string;
  busy: string | null;
  connection: { connected?: boolean | undefined } | null;
  disconnectArmed: boolean;
  setupLoaded: boolean;
  canAdvance: boolean;
  onEmailToggle: (enabled: boolean) => void;
  onEmailTest: () => void;
  onTikTokConnect: (kind: 'creator' | 'advertiser') => void;
  onMetaConnect: () => void;
  onMetaDisconnect: () => void;
  onRefresh: () => void;
  onAdvanceStep: () => void;
}

export function ActionButtons({
  channel,
  accentColor,
  busy,
  connection,
  disconnectArmed,
  setupLoaded,
  canAdvance,
  onEmailToggle,
  onEmailTest,
  onTikTokConnect,
  onMetaConnect,
  onMetaDisconnect,
  onRefresh,
  onAdvanceStep,
}: Props) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
      {channel === 'email' ? (
        <>
          <button
            type="button"
            onClick={() => void onEmailToggle(true)}
            style={buttonStyle(accentColor)}
          >
            {busy === 'email' ? 'Ativando...' : 'Conectar Email'}
          </button>
          <button
            type="button"
            onClick={() => void onEmailTest()}
            style={secondaryButtonStyle}
          >
            {busy === 'email-test' ? 'Enviando...' : 'Enviar teste'}
          </button>
        </>
      ) : channel === 'tiktok' ? (
        <>
          <button
            type="button"
            onClick={() => void onTikTokConnect('creator')}
            style={buttonStyle(accentColor)}
          >
            {busy === 'tiktok-creator' ? 'Abrindo...' : 'Conectar conta TikTok'}
          </button>
          <button
            type="button"
            onClick={() => void onTikTokConnect('advertiser')}
            style={secondaryButtonStyle}
          >
            {busy === 'tiktok-advertiser' ? 'Abrindo...' : 'Conectar advertiser'}
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => void onMetaConnect()} style={buttonStyle(accentColor)}>
            {busy === 'meta'
              ? 'Abrindo...'
              : `Conectar ${channel === 'whatsapp' ? 'WhatsApp' : channel === 'instagram' ? 'Instagram' : 'Facebook'} via Meta oficial`}
          </button>
          {connection?.connected ? (
            <button
              type="button"
              onClick={() => void onMetaDisconnect()}
              style={secondaryButtonStyle}
            >
              {busy === 'meta-disconnect'
                ? 'Desconectando...'
                : disconnectArmed
                  ? 'Confirmar desconexão'
                  : 'Desconectar Meta'}
            </button>
          ) : null}
        </>
      )}
      <button type="button" onClick={() => void onRefresh()} style={secondaryButtonStyle}>
        Recarregar status
      </button>
      <button
        type="button"
        onClick={onAdvanceStep}
        disabled={!setupLoaded || !canAdvance}
        style={secondaryButtonStyle}
      >
        Avançar passo
      </button>
    </div>
  );
}
