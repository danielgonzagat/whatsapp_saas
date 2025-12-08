'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Smartphone, 
  QrCode, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Loader2,
  Signal,
  SignalZero,
  Wifi,
  WifiOff,
  Power,
  MessageCircle
} from 'lucide-react';
import { getWhatsAppStatus, initiateWhatsAppConnection, getWhatsAppQR, disconnectWhatsApp, type WhatsAppConnectionStatus } from '@/lib/api';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { ChatHero } from '@/components/shell';
import type { ChatMode } from '@/components/shell';

// -------------- DESIGN TOKENS --------------
const COLORS = {
  bg: '#050608',
  surface: '#111317',
  surfaceHover: '#181B20',
  green: '#28E07B',
  greenHover: '#1FC66A',
  textPrimary: '#F5F5F7',
  textSecondary: '#A0A3AA',
  border: 'rgba(255,255,255,0.06)',
};

export default function WhatsAppConnectionPage() {
  const workspaceId = useWorkspaceId();
  const router = useRouter();
  
  const [status, setStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await getWhatsAppStatus(workspaceId);
      setStatus(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load WhatsApp status:', err);
      setStatus({ connected: false });
    }
  }, [workspaceId]);

  const loadQR = useCallback(async () => {
    try {
      const data = await getWhatsAppQR(workspaceId);
      if (data.qrCode) {
        setQrCode(data.qrCode);
      }
      if (data.connected) {
        setConnecting(false);
        loadStatus();
      }
    } catch (err) {
      console.error('Failed to load QR:', err);
    }
  }, [loadStatus, workspaceId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Poll for QR updates when connecting
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (connecting && !status?.connected) {
      interval = setInterval(loadQR, 3000);
    }
    return () => clearInterval(interval);
  }, [connecting, status?.connected, loadQR]);

  const handleConnect = async () => {
    setLoading(true);
    setConnecting(true);
    setError(null);
    setQrCode(null);

    try {
      await initiateWhatsAppConnection(workspaceId);
      setTimeout(loadQR, 2000);
    } catch (err) {
      console.error('Failed to initiate connection:', err);
      setError('Falha ao iniciar conexão. Tente novamente.');
      setConnecting(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await disconnectWhatsApp(workspaceId);
      setStatus({ connected: false });
      setQrCode(null);
      setConnecting(false);
    } catch (err) {
      console.error('Failed to disconnect:', err);
      setError('Falha ao desconectar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Handle chat message
  const handleChatSend = (message: string, mode: ChatMode) => {
    const encodedMessage = encodeURIComponent(message);
    router.push(`/chat?q=${encodedMessage}&mode=${mode}`);
  };

  // Dynamic action chips
  const actionChips = status?.connected ? [
    { id: 'test', label: 'Testar conexão', icon: Signal, prompt: 'Teste a conexão do meu WhatsApp e me diga se está tudo funcionando' },
    { id: 'send', label: 'Enviar mensagem', icon: MessageCircle, prompt: 'Envie uma mensagem de teste para' },
  ] : [
    { id: 'help', label: 'Como conectar?', icon: QrCode, prompt: 'Me ajude a conectar meu WhatsApp Business' },
    { id: 'tips', label: 'Dicas de uso', icon: Smartphone, prompt: 'Quais são as melhores práticas para usar o WhatsApp Business?' },
  ];

  return (
    <div 
      className="min-h-full"
      style={{ backgroundColor: COLORS.bg }}
    >
      {/* Hero Section with Chat */}
      <div className="px-6 py-8">
        <ChatHero
          heroTitle={status?.connected ? "Seu WhatsApp está conectado!" : "Vamos conectar seu WhatsApp?"}
          heroSubtitle={status?.connected 
            ? `Conectado como ${status.phone || 'número não identificado'}` 
            : "Escaneie o QR Code para começar a receber clientes"}
          actionChips={actionChips}
          onSend={handleChatSend}
          showModeSelector={false}
        />
      </div>

      <div className="px-6 pb-8 max-w-4xl mx-auto space-y-6">
        {/* Status Card */}
        <div 
          className="rounded-2xl p-6"
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${status?.connected ? COLORS.green : COLORS.border}`,
          }}
        >
          <div className="flex items-center gap-6">
            <div 
              className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{
                backgroundColor: status?.connected ? `${COLORS.green}20` : COLORS.surfaceHover,
              }}
            >
              {status?.connected ? (
                <Wifi className="w-10 h-10" style={{ color: COLORS.green }} />
              ) : (
                <WifiOff className="w-10 h-10" style={{ color: COLORS.textSecondary }} />
              )}
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-bold" style={{ color: COLORS.textPrimary }}>
                  {status?.connected ? 'Conectado' : 'Desconectado'}
                </h2>
                <span 
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: status?.connected ? `${COLORS.green}20` : COLORS.surfaceHover,
                    color: status?.connected ? COLORS.green : COLORS.textSecondary,
                  }}
                >
                  {status?.connected ? (
                    <>
                      <Signal className="w-3 h-3" />
                      Online
                    </>
                  ) : (
                    <>
                      <SignalZero className="w-3 h-3" />
                      Offline
                    </>
                  )}
                </span>
              </div>

              {status?.connected && status.phone && (
                <div className="space-y-1">
                  <p style={{ color: COLORS.textSecondary }}>
                    <span style={{ color: COLORS.textSecondary }}>Número:</span>{' '}
                    <span className="font-mono" style={{ color: COLORS.textPrimary }}>{status.phone}</span>
                  </p>
                  {status.pushName && (
                    <p style={{ color: COLORS.textSecondary }}>
                      <span>Nome:</span>{' '}
                      <span style={{ color: COLORS.textPrimary }}>{status.pushName}</span>
                    </p>
                  )}
                </div>
              )}

              {!status?.connected && !connecting && (
                <p style={{ color: COLORS.textSecondary }}>
                  Conecte seu WhatsApp para começar a atender clientes automaticamente
                </p>
              )}
            </div>

            {status?.connected ? (
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 font-medium rounded-xl transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.2)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#EF4444',
                }}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Power className="w-5 h-5" />
                )}
                Desconectar
              </button>
            ) : !connecting && (
              <button
                onClick={handleConnect}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 font-medium rounded-xl transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: COLORS.green,
                  color: COLORS.bg,
                }}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <QrCode className="w-5 h-5" />
                )}
                Conectar WhatsApp
              </button>
            )}
          </div>
        </div>

        {/* QR Code Section */}
        {connecting && !status?.connected && (
          <div 
            className="rounded-2xl p-8"
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div className="max-w-md mx-auto text-center">
              <h3 
                className="text-xl font-bold mb-2"
                style={{ color: COLORS.textPrimary }}
              >
                Escaneie o QR Code
              </h3>
              <p 
                className="mb-6"
                style={{ color: COLORS.textSecondary }}
              >
                Abra o WhatsApp no seu celular, vá em Aparelhos Conectados e escaneie o código abaixo
              </p>

              <div className="bg-white rounded-2xl p-6 inline-block mb-6">
                {qrCode ? (
                  <img 
                    src={qrCode} 
                    alt="QR Code WhatsApp" 
                    className="w-64 h-64"
                  />
                ) : (
                  <div className="w-64 h-64 flex flex-col items-center justify-center">
                    <Loader2 className="w-12 h-12 text-slate-400 animate-spin mb-4" />
                    <p className="text-slate-600 text-sm">Gerando QR Code...</p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {[
                  { step: '1', text: 'Abra o WhatsApp no seu celular' },
                  { step: '2', text: 'Vá em Configurações → Aparelhos Conectados' },
                  { step: '3', text: 'Toque em Conectar Aparelho e escaneie' },
                ].map((item) => (
                  <div 
                    key={item.step}
                    className="flex items-center gap-3 text-left rounded-xl p-4"
                    style={{ backgroundColor: COLORS.surfaceHover }}
                  >
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${COLORS.green}20` }}
                    >
                      <span className="font-bold text-sm" style={{ color: COLORS.green }}>{item.step}</span>
                    </div>
                    <p className="text-sm" style={{ color: COLORS.textSecondary }}>
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  setConnecting(false);
                  setQrCode(null);
                }}
                className="mt-6 transition-colors"
                style={{ color: COLORS.textSecondary }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div 
            className="rounded-xl p-4 flex items-center gap-3"
            style={{
              backgroundColor: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
          >
            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Features */}
        {status?.connected && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: MessageCircle, title: 'Atendimento 24/7', desc: 'A KLOEL responde automaticamente a qualquer hora', color: COLORS.green },
              { icon: CheckCircle2, title: 'Vendas Automáticas', desc: 'Identifica oportunidades e envia links de pagamento', color: '#3B82F6' },
              { icon: Signal, title: 'Sync em Tempo Real', desc: 'Todas as conversas sincronizadas instantaneamente', color: '#A855F7' },
            ].map((feature) => (
              <div 
                key={feature.title}
                className="rounded-xl p-5"
                style={{
                  backgroundColor: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${feature.color}20` }}
                >
                  <feature.icon className="w-6 h-6" style={{ color: feature.color }} />
                </div>
                <h3 className="font-semibold mb-2" style={{ color: COLORS.textPrimary }}>{feature.title}</h3>
                <p className="text-sm" style={{ color: COLORS.textSecondary }}>{feature.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
