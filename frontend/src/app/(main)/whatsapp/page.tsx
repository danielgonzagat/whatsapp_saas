'use client';

import { useState, useEffect, useCallback } from 'react';
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

export default function WhatsAppConnectionPage() {
  const workspaceId = useWorkspaceId();
  
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
  }, [loadStatus]);

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
      // Start polling for QR
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Smartphone className="w-8 h-8 text-[#00FFA3]" />
            Conexão WhatsApp
          </h1>
          <p className="text-slate-400">Conecte seu WhatsApp para a KLOEL atender seus clientes</p>
        </div>

        <button
          onClick={loadStatus}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 transition-colors"
        >
          <RefreshCw className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status Card */}
      <div className={`rounded-2xl p-6 border ${
        status?.connected 
          ? 'bg-gradient-to-br from-emerald-500/20 to-[#00FFA3]/10 border-emerald-500/30' 
          : 'bg-slate-800/50 border-slate-700/50'
      }`}>
        <div className="flex items-center gap-6">
          <div className={`w-20 h-20 rounded-2xl flex items-center justify-center ${
            status?.connected ? 'bg-emerald-500/20' : 'bg-slate-700/50'
          }`}>
            {status?.connected ? (
              <Wifi className="w-10 h-10 text-emerald-400" />
            ) : (
              <WifiOff className="w-10 h-10 text-slate-500" />
            )}
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold text-white">
                {status?.connected ? 'Conectado' : 'Desconectado'}
              </h2>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                status?.connected 
                  ? 'bg-emerald-500/20 text-emerald-400' 
                  : 'bg-slate-700 text-slate-400'
              }`}>
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
                <p className="text-slate-400">
                  <span className="text-slate-500">Número:</span>{' '}
                  <span className="text-white font-mono">{status.phone}</span>
                </p>
                {status.pushName && (
                  <p className="text-slate-400">
                    <span className="text-slate-500">Nome:</span>{' '}
                    <span className="text-white">{status.pushName}</span>
                  </p>
                )}
              </div>
            )}

            {!status?.connected && !connecting && (
              <p className="text-slate-500">
                Conecte seu WhatsApp para começar a atender clientes automaticamente
              </p>
            )}
          </div>

          {status?.connected ? (
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-red-500/20 border border-red-500/30 text-red-400 font-medium rounded-xl hover:bg-red-500/30 transition-colors disabled:opacity-50"
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
              className="flex items-center gap-2 px-6 py-3 bg-[#00FFA3] text-black font-medium rounded-xl hover:bg-[#00FFA3]/90 transition-colors disabled:opacity-50"
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
        <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50">
          <div className="max-w-md mx-auto text-center">
            <h3 className="text-xl font-bold text-white mb-2">
              Escaneie o QR Code
            </h3>
            <p className="text-slate-400 mb-6">
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
              <div className="flex items-center gap-3 text-left bg-slate-700/30 rounded-xl p-4">
                <div className="w-8 h-8 rounded-full bg-[#00FFA3]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[#00FFA3] font-bold text-sm">1</span>
                </div>
                <p className="text-slate-300 text-sm">
                  Abra o <span className="text-white font-medium">WhatsApp</span> no seu celular
                </p>
              </div>

              <div className="flex items-center gap-3 text-left bg-slate-700/30 rounded-xl p-4">
                <div className="w-8 h-8 rounded-full bg-[#00FFA3]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[#00FFA3] font-bold text-sm">2</span>
                </div>
                <p className="text-slate-300 text-sm">
                  Vá em <span className="text-white font-medium">Configurações → Aparelhos Conectados</span>
                </p>
              </div>

              <div className="flex items-center gap-3 text-left bg-slate-700/30 rounded-xl p-4">
                <div className="w-8 h-8 rounded-full bg-[#00FFA3]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[#00FFA3] font-bold text-sm">3</span>
                </div>
                <p className="text-slate-300 text-sm">
                  Toque em <span className="text-white font-medium">Conectar Aparelho</span> e escaneie
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setConnecting(false);
                setQrCode(null);
              }}
              className="mt-6 text-slate-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Features */}
      {status?.connected && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="w-12 h-12 rounded-xl bg-[#00FFA3]/20 flex items-center justify-center mb-4">
              <MessageCircle className="w-6 h-6 text-[#00FFA3]" />
            </div>
            <h3 className="text-white font-semibold mb-2">Atendimento 24/7</h3>
            <p className="text-slate-400 text-sm">
              A KLOEL responde automaticamente a qualquer hora do dia ou da noite
            </p>
          </div>

          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="w-12 h-12 rounded-xl bg-[#00D4FF]/20 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-[#00D4FF]" />
            </div>
            <h3 className="text-white font-semibold mb-2">Vendas Automáticas</h3>
            <p className="text-slate-400 text-sm">
              Identifica oportunidades e envia links de pagamento automaticamente
            </p>
          </div>

          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center mb-4">
              <Signal className="w-6 h-6 text-violet-400" />
            </div>
            <h3 className="text-white font-semibold mb-2">Sync em Tempo Real</h3>
            <p className="text-slate-400 text-sm">
              Todas as conversas são sincronizadas e você pode acompanhar em tempo real
            </p>
          </div>
        </div>
      )}

      {/* Connection Tips */}
      <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-slate-300 font-medium mb-1">Dicas importantes</p>
            <ul className="text-slate-500 text-sm space-y-1">
              <li>• Mantenha seu celular conectado à internet para a sessão funcionar</li>
              <li>• A conexão pode expirar após algumas horas de inatividade</li>
              <li>• Você pode ter até 4 aparelhos conectados ao mesmo tempo no WhatsApp</li>
              <li>• Recomendamos usar um número dedicado para atendimento</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
