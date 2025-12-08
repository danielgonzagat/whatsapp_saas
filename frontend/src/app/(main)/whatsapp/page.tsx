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
import { 
  CenterStage, 
  Section, 
  Surface, 
  UniversalComposer, 
  ContextCapsule,
  StageHeadline,
  STAGE_HEADLINES,
  InfoCard,
  ActionCard,
  Grid,
  Button,
  Badge,
} from '@/components/kloel';
import { colors } from '@/lib/design-tokens';

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
  const handleChatSend = (message: string) => {
    const encodedMessage = encodeURIComponent(message);
    router.push(`/chat?q=${encodedMessage}`);
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
    <div className="min-h-full">
      {/* Hero Section with Chat */}
      <Section spacing="lg" className="flex flex-col items-center justify-center">
        <CenterStage size="L" className="text-center">
          {/* Status Capsule */}
          <div className="mb-8">
            <ContextCapsule 
              page="chat"
              items={[
                { 
                  label: 'WhatsApp', 
                  value: status?.connected ? 'Conectado' : 'Desconectado',
                  type: 'status'
                }
              ]}
            />
          </div>

          {/* Stage Headline */}
          {status?.connected ? (
            <StageHeadline
              headline="Seu WhatsApp está conectado!"
              highlight="conectado"
              subheadline={`Conectado como ${status.phone || 'número não identificado'}`}
              size="l"
            />
          ) : (
            <StageHeadline
              headline={STAGE_HEADLINES.whatsapp.headline}
              highlight={STAGE_HEADLINES.whatsapp.highlight}
              subheadline="Escaneie o QR Code para começar a receber clientes"
              size="l"
            />
          )}

          {/* Universal Composer */}
          <UniversalComposer
            placeholder="Pergunte qualquer coisa sobre sua conexão WhatsApp…"
            chips={actionChips}
            onSend={handleChatSend}
          />
        </CenterStage>
      </Section>

      {/* Main Content */}
      <Section spacing="md">
        <CenterStage size="L">
          {/* Status Card */}
          <Surface 
            variant="card" 
            padding="lg"
            className="mb-6"
          >
            <div className="flex items-center gap-6">
              <div 
                className="w-20 h-20 rounded-2xl flex items-center justify-center"
                style={{
                  backgroundColor: status?.connected ? `${colors.brand.green}20` : colors.background.surface2,
                }}
              >
                {status?.connected ? (
                  <Wifi className="w-10 h-10" style={{ color: colors.brand.green }} />
                ) : (
                  <WifiOff className="w-10 h-10" style={{ color: colors.text.muted }} />
                )}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-bold" style={{ color: colors.text.primary }}>
                    {status?.connected ? 'Conectado' : 'Desconectado'}
                  </h2>
                  <Badge variant={status?.connected ? 'success' : 'default'}>
                    {status?.connected ? (
                      <span className="flex items-center gap-1">
                        <Signal className="w-3 h-3" />
                        Online
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <SignalZero className="w-3 h-3" />
                        Offline
                      </span>
                    )}
                  </Badge>
                </div>

                {status?.connected && status.phone && (
                  <div className="space-y-1">
                    <p style={{ color: colors.text.secondary }}>
                      <span>Número:</span>{' '}
                      <span className="font-mono" style={{ color: colors.text.primary }}>{status.phone}</span>
                    </p>
                    {status.pushName && (
                      <p style={{ color: colors.text.secondary }}>
                        <span>Nome:</span>{' '}
                        <span style={{ color: colors.text.primary }}>{status.pushName}</span>
                      </p>
                    )}
                  </div>
                )}

                {!status?.connected && !connecting && (
                  <p style={{ color: colors.text.secondary }}>
                    Conecte seu WhatsApp para começar a atender clientes automaticamente
                  </p>
                )}
              </div>

              {status?.connected ? (
                <Button
                  variant="danger"
                  onClick={handleDisconnect}
                  isLoading={loading}
                  leftIcon={<Power className="w-5 h-5" />}
                >
                  Desconectar
                </Button>
              ) : !connecting && (
                <Button
                  variant="primary"
                  onClick={handleConnect}
                  isLoading={loading}
                  leftIcon={<QrCode className="w-5 h-5" />}
                >
                  Conectar WhatsApp
                </Button>
              )}
            </div>
          </Surface>

          {/* QR Code Section */}
          {connecting && !status?.connected && (
            <Surface variant="card" padding="lg" className="mb-6">
              <div className="max-w-md mx-auto text-center">
                <h3 
                  className="text-xl font-bold mb-2"
                  style={{ color: colors.text.primary }}
                >
                  Escaneie o QR Code
                </h3>
                <p 
                  className="mb-6"
                  style={{ color: colors.text.secondary }}
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
                      style={{ backgroundColor: colors.background.surface2 }}
                    >
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${colors.brand.green}20` }}
                      >
                        <span className="font-bold text-sm" style={{ color: colors.brand.green }}>{item.step}</span>
                      </div>
                      <p className="text-sm" style={{ color: colors.text.secondary }}>
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
                  style={{ color: colors.text.muted }}
                >
                  Cancelar
                </button>
              </div>
            </Surface>
          )}

          {/* Error Message */}
          {error && (
            <InfoCard variant="error" icon={XCircle} className="mb-6">
              {error}
            </InfoCard>
          )}

          {/* Features */}
          {status?.connected && (
            <Grid cols={3} gap={4}>
              <ActionCard
                icon={MessageCircle}
                title="Atendimento 24/7"
                description="A KLOEL responde automaticamente a qualquer hora"
                accent="green"
              />
              <ActionCard
                icon={CheckCircle2}
                title="Vendas Automáticas"
                description="Identifica oportunidades e envia links de pagamento"
                accent="cyan"
              />
              <ActionCard
                icon={Signal}
                title="Sync em Tempo Real"
                description="Todas as conversas sincronizadas instantaneamente"
                accent="cyan"
              />
            </Grid>
          )}
        </CenterStage>
      </Section>
    </div>
  );
}
