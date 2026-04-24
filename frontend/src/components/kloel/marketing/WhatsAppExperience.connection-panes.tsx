'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';

export { QRCodePane } from './WhatsAppExperience.qr-pane';

const E = '#E85D30';
const V = KLOEL_THEME.bgPrimary;
const G = '#10B981';
const S = KLOEL_THEME.textSecondary;
const C = KLOEL_THEME.bgCard;
const U = KLOEL_THEME.bgSecondary;
const B = KLOEL_THEME.borderPrimary;
const F = "'Sora', system-ui, sans-serif";
const M = "'JetBrains Mono', monospace";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConnectionSnapshot {
  status?: unknown;
  rawStatus?: unknown;
  phoneNumber?: unknown;
  pushName?: unknown;
  phoneNumberId?: unknown;
  provider?: unknown;
}

export interface LiveStatusShape {
  status?: string | null;
  connected?: boolean;
  phone?: string | null;
  pushName?: string | null;
  phoneNumberId?: string | null;
  degradedReason?: string | null;
  provider?: string | null;
}

export interface MarketingWhatsAppConnection {
  provider?: string;
  connected?: boolean;
  status?: string;
  authUrl?: string;
  phoneNumberId?: string | null;
  whatsappBusinessId?: string | null;
  phoneNumber?: string | null;
  pushName?: string | null;
  degradedReason?: string | null;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function resolveEffectiveProvider(
  liveProvider: string | undefined,
  connectionProvider: string | undefined,
  workspaceProvider: unknown,
  sessionProvider: unknown,
  phoneNumberId: unknown,
): { providerToken: string; isWahaProvider: boolean; effectiveProvider: string } {
  const providerToken = String(
    liveProvider || connectionProvider || workspaceProvider || sessionProvider || '',
  )
    .trim()
    .toLowerCase();
  const isWahaProvider =
    providerToken === 'whatsapp-api' ||
    providerToken === 'waha' ||
    providerToken === 'whatsapp-web-agent';
  const effectiveProvider = isWahaProvider ? 'whatsapp-api' : 'meta-cloud';
  return { providerToken, isWahaProvider, effectiveProvider };
}

export function buildEffectiveConnection(params: {
  sessionSnapshot: ConnectionSnapshot;
  liveStatus?: LiveStatusShape;
  connection?: MarketingWhatsAppConnection;
  effectiveProvider: string;
  isWahaProvider: boolean;
}) {
  const { sessionSnapshot, liveStatus, connection, effectiveProvider, isWahaProvider } = params;
  const snapshotStatus = String(
    sessionSnapshot.status || sessionSnapshot.rawStatus || connection?.status || 'disconnected',
  ).toLowerCase();
  const snapshotConnected = snapshotStatus === 'connected' || snapshotStatus === 'working';
  const remoteConnected = isWahaProvider
    ? snapshotConnected
    : connection?.connected === true || snapshotConnected;
  const connected = liveStatus?.connected === true || remoteConnected;
  const statusBase = isWahaProvider ? snapshotStatus : connection?.status;
  const status = String(
    liveStatus?.status || statusBase || snapshotStatus || 'disconnected',
  ).toLowerCase();

  return {
    provider: effectiveProvider,
    connected,
    status,
    phoneNumber: String(
      liveStatus?.phone || sessionSnapshot.phoneNumber || connection?.phoneNumber || '',
    ),
    pushName: String(
      liveStatus?.pushName || sessionSnapshot.pushName || connection?.pushName || '',
    ),
    phoneNumberId: String(
      liveStatus?.phoneNumberId || sessionSnapshot.phoneNumberId || connection?.phoneNumberId || '',
    ),
    degradedReason: String(liveStatus?.degradedReason || connection?.degradedReason || ''),
  };
}

export function resolveStatusLabel(status: string, connected: boolean): string {
  if (connected) {
    return 'Ativo';
  }
  if (status === 'connection_incomplete') {
    return 'Configuração pendente';
  }
  return 'Desconectado';
}

export function resolveProfileName(pushName: unknown, operator?: string | null): string {
  if (typeof pushName === 'string' && pushName.trim()) {
    return pushName;
  }
  if (typeof operator === 'string' && operator.trim()) {
    return operator;
  }
  return 'Aguardando perfil';
}

export function resolveConnectedPhone(phoneNumber: unknown, phoneNumberId: unknown): string {
  if (typeof phoneNumber === 'string' && phoneNumber.trim()) {
    return phoneNumber;
  }
  if (typeof phoneNumberId === 'string' && phoneNumberId.trim()) {
    return phoneNumberId;
  }
  return 'Aguardando número';
}

// ── UI components ─────────────────────────────────────────────────────────────

export function Steps({ current, steps }: { current: number; steps: readonly string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {steps.map((step, index) => (
        <div
          key={step}
          style={{
            display: 'flex',
            alignItems: 'center',
            flex: index < steps.length - 1 ? 1 : 'none',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: M,
              flexShrink: 0,
              transition: 'all .3s',
              background: index <= current ? E : U,
              color: index <= current ? V : KLOEL_THEME.textPlaceholder,
              border: index === current ? `2px solid ${E}` : '2px solid transparent',
              boxShadow: index === current ? `0 0 12px ${E}40` : 'none',
            }}
          >
            {index + 1}
          </div>
          {index < steps.length - 1 ? (
            <div
              style={{
                flex: 1,
                height: 2,
                background: index < current ? E : U,
                margin: '0 8px',
                transition: 'background .3s',
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function NonWahaProviderHint() {
  return (
    <div
      style={{
        maxWidth: 420,
        margin: '0 auto',
        border: `1px solid ${B}`,
        borderRadius: 6,
        padding: '18px 20px',
        background: C,
        color: S,
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      {kloelT(`O provider ativo deste workspace nao esta em WAHA. O QR Code so aparece quando o runtime do
      WhatsApp opera em`)}{' '}
      <span style={{ color: E, fontWeight: 600 }}>WAHA</span>
      {kloelT(`. Atualize o provider
      do backend e recarregue esta tela para iniciar a conexao por QR.`)}
    </div>
  );
}

export function ConnectedCelebration() {
  return (
    <div style={{ animation: 'celebrate .5s ease both' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: `${G}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          fontSize: 28,
        }}
      >
        ✓
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, color: G, fontFamily: F }}>
        {kloelT(`WhatsApp conectado com sucesso!`)}
      </p>
    </div>
  );
}

export function ActivatedScreen() {
  return (
    <div
      style={{
        background: V,
        minHeight: '100%',
        color: KLOEL_THEME.textPrimary,
        fontFamily: F,
        borderRadius: 12,
      }}
    >
      <style>{`
          @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes loading { from { transform: translateX(-100%); } to { transform: translateX(0); } }
          .fade-in { animation: fadeUp .5s ease both; }
        `}</style>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
        <div className="fade-in" style={{ textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{kloelT(`Kloel`)}</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: G, marginBottom: 8, fontFamily: F }}>
            {kloelT(`IA Ativada!`)}
          </h2>
          <p style={{ fontSize: 13, color: S, marginBottom: 24, fontFamily: F }}>
            {kloelT(`Redirecionando para o painel do WhatsApp...`)}
          </p>
          <div
            style={{
              width: 200,
              height: 3,
              background: U,
              borderRadius: 2,
              margin: '0 auto',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                background: G,
                borderRadius: 2,
                animation: 'loading 1.5s ease forwards',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
