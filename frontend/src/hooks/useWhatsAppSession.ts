'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  autostartCia,
  ciaApi,
  disconnectWhatsApp,
  getWhatsAppQR,
  getWhatsAppStatus,
  initiateWhatsAppConnection,
  logoutWhatsApp,
  tokenStorage,
  type WhatsAppConnectResponse,
  type WhatsAppConnectionStatus,
  whatsappApi,
} from '@/lib/api';

interface UseWhatsAppSessionOptions {
  enabled?: boolean;
  workspaceId?: string;
  onConnectionChange?: (connected: boolean) => void;
}

export function useWhatsAppSession({
  enabled = true,
  workspaceId: providedWorkspaceId,
  onConnectionChange,
}: UseWhatsAppSessionOptions = {}) {
  const authToken = tokenStorage.getToken() || '';
  const workspaceId = useMemo(
    () => providedWorkspaceId || tokenStorage.getWorkspaceId() || '',
    [providedWorkspaceId],
  );
  const [status, setStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const previousConnectedRef = useRef(false);
  const bootstrapGuardRef = useRef<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!enabled || !workspaceId || !authToken) return;

    try {
      const data = await getWhatsAppStatus(workspaceId);
      setStatus(data);
      setQrCode(data.qrCode || null);
      setConnecting(data.status === 'qr_pending' && !data.connected);
      setStatusMessage(
        data.connected
          ? 'Sessão ativa e sincronizada.'
          : data.status === 'qr_pending'
            ? 'Aguardando leitura do QR Code no aparelho.'
            : 'WhatsApp desconectado.',
      );
      setError(null);
    } catch (err) {
      console.error('Failed to load WhatsApp status:', err);
      setStatus({ connected: false, status: 'disconnected' });
      setStatusMessage('Não foi possível carregar o status agora.');
    }
  }, [authToken, enabled, workspaceId]);

  const loadQR = useCallback(async () => {
    if (!enabled || !workspaceId || !authToken) return;

    try {
      const data = await getWhatsAppQR(workspaceId);
      if (data.qrCode) {
        setQrCode(data.qrCode);
        setStatusMessage(data.message || 'Escaneie o QR Code para conectar.');
      }

      if (data.connected) {
        setStatusMessage('Sessão conectada com sucesso.');
        setConnecting(false);
        await loadStatus();
      }
    } catch (err) {
      console.error('Failed to load QR:', err);
      setError('Falha ao atualizar o QR Code. Tente novamente.');
      setConnecting(false);
    }
  }, [authToken, enabled, loadStatus, workspaceId]);

  const connect = useCallback(async () => {
    if (!workspaceId || !authToken) {
      setError('Workspace não carregado. Tente novamente.');
      return;
    }

    setLoading(true);
    setConnecting(true);
    setError(null);
    setQrCode(null);
    setStatusMessage(null);

    try {
      const currentStatus = await getWhatsAppStatus(workspaceId);
      if (currentStatus.connected) {
        setStatus(currentStatus);
        setConnecting(false);
        setStatusMessage('Sessão já estava conectada.');
        return;
      }

      if (currentStatus.status === 'qr_pending') {
        setStatus(currentStatus);
        setQrCode(currentStatus.qrCode || null);
        setStatusMessage(
          currentStatus.message || 'Escaneie o QR Code para conectar.',
        );
        setTimeout(() => {
          void loadQR();
        }, 500);
        return;
      }

      const response: WhatsAppConnectResponse =
        await initiateWhatsAppConnection(workspaceId);

      if (response.error || response.status === 'error') {
        setError(response.message || 'Falha ao iniciar conexão.');
        setConnecting(false);
        return;
      }

      if (response.status === 'already_connected') {
        setConnecting(false);
        setStatusMessage('Sessão já estava conectada.');
        await loadStatus();
        return;
      }

      if (response.status === 'qr_ready') {
        setQrCode(response.qrCode || response.qrCodeImage || null);
        setStatusMessage(response.message || 'Escaneie o QR Code para conectar.');
        return;
      }

      setTimeout(() => {
        void loadQR();
      }, 1500);
    } catch (err) {
      console.error('Failed to initiate connection:', err);
      setError('Falha ao iniciar conexão. Tente novamente.');
      setConnecting(false);
    } finally {
      setLoading(false);
    }
  }, [authToken, loadQR, loadStatus, workspaceId]);

  const disconnect = useCallback(async () => {
    if (!workspaceId || !authToken) {
      setError('Workspace não carregado.');
      return;
    }

    setLoading(true);
    try {
      await disconnectWhatsApp(workspaceId);
      setStatus({ connected: false, status: 'disconnected' });
      setQrCode(null);
      setConnecting(false);
      setIsPaused(false);
      setStatusMessage('Sessão desconectada.');
    } catch (err) {
      console.error('Failed to disconnect:', err);
      setError('Falha ao desconectar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [authToken, workspaceId]);

  const reset = useCallback(async () => {
    if (!workspaceId || !authToken) {
      setError('Workspace não carregado.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await logoutWhatsApp(workspaceId);
      setStatus({ connected: false, status: 'disconnected' });
      setQrCode(null);
      setConnecting(false);
      setIsPaused(false);
      setStatusMessage('Sessão resetada. Gere um novo QR Code para reconectar.');
    } catch (err) {
      console.error('Failed to reset WhatsApp session:', err);
      setError('Falha ao resetar a sessão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [authToken, workspaceId]);

  const pauseAutonomy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await whatsappApi.startBacklog('pause_autonomy');
      if (response.error) {
        throw new Error(response.error);
      }
      setIsPaused(true);
      setStatusMessage('IA pausada. O WhatsApp continua conectado.');
    } catch (err: any) {
      setError(err?.message || 'Falha ao pausar a IA.');
    } finally {
      setLoading(false);
    }
  }, []);

  const resumeAutonomy = useCallback(async () => {
    if (!workspaceId || !authToken) {
      setError('Workspace não carregado.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await autostartCia(workspaceId);
      setIsPaused(false);
      setStatusMessage('IA retomada. O atendimento automático voltou a agir.');
    } catch (err: any) {
      setError(err?.message || 'Falha ao retomar a IA.');
    } finally {
      setLoading(false);
    }
  }, [authToken, workspaceId]);

  const syncConnectedSessionRuntime = useCallback(async () => {
    if (!enabled || !workspaceId || !authToken || !status?.connected) return;

    const guardKey = workspaceId;
    if (bootstrapGuardRef.current === guardKey) {
      return;
    }
    bootstrapGuardRef.current = guardKey;

    try {
      const surface = await ciaApi.getSurface(workspaceId);
      const autonomy = (surface.error ? null : surface.data?.autonomy) as
        | Record<string, any>
        | null
        | undefined;

      const mode = String(autonomy?.mode || 'OFF').toUpperCase();
      const reason = String(autonomy?.reason || '');
      const isActive = ['LIVE', 'BACKLOG', 'FULL'].includes(mode);
      const isManualPause =
        reason === 'manual_pause' ||
        mode === 'HUMAN_ONLY' ||
        mode === 'SUSPENDED';

      setIsPaused(isManualPause);

      if (isActive || isManualPause) {
        return;
      }

      await autostartCia(workspaceId);
      setIsPaused(false);
      setStatusMessage('Sessão ativa. IA retomada automaticamente.');
    } catch (err) {
      console.error('Failed to sync CIA runtime for connected session:', err);
      bootstrapGuardRef.current = null;
    }
  }, [authToken, enabled, status?.connected, workspaceId]);

  useEffect(() => {
    if (!enabled || !workspaceId || !authToken) return;
    void loadStatus();
  }, [authToken, enabled, loadStatus, workspaceId]);

  useEffect(() => {
    if (!enabled || !workspaceId || !authToken) return;
    const interval = setInterval(() => {
      void loadStatus();
    }, 12000);
    return () => clearInterval(interval);
  }, [authToken, enabled, loadStatus, workspaceId]);

  useEffect(() => {
    if (!enabled || !workspaceId || !authToken || !connecting || status?.connected) return;
    const interval = setInterval(() => {
      void loadQR();
    }, 3000);
    return () => clearInterval(interval);
  }, [authToken, connecting, enabled, loadQR, status?.connected, workspaceId]);

  useEffect(() => {
    if (!status?.connected) {
      bootstrapGuardRef.current = null;
      return;
    }

    void syncConnectedSessionRuntime();
  }, [status?.connected, syncConnectedSessionRuntime]);

  useEffect(() => {
    bootstrapGuardRef.current = null;
  }, [workspaceId]);

  useEffect(() => {
    const connected = !!status?.connected;
    if (connected === previousConnectedRef.current) return;
    previousConnectedRef.current = connected;
    onConnectionChange?.(connected);
  }, [onConnectionChange, status?.connected]);

  return {
    workspaceId,
    status,
    connected: !!status?.connected,
    qrCode,
    loading,
    connecting,
    error,
    isPaused,
    statusMessage,
    connect,
    disconnect,
    reset,
    loadStatus,
    pauseAutonomy,
    resumeAutonomy,
  };
}

export default useWhatsAppSession;
