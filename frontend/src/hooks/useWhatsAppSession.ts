'use client';

import { kloelT } from '@/lib/i18n/t';
import { ensureAnonymousSession } from '@/lib/anonymous-session';
import {
  type WhatsAppConnectResponse,
  type WhatsAppConnectionStatus,
  authApi,
  autostartCia,
  ciaApi,
  disconnectWhatsApp,
  getWhatsAppQR,
  getWhatsAppStatus,
  initiateWhatsAppConnection,
  logoutWhatsApp,
  resolveWorkspaceFromAuthPayload,
  tokenStorage,
  whatsappApi,
} from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseWhatsAppSessionOptions {
  enabled?: boolean;
  workspaceId?: string;
  onConnectionChange?: (connected: boolean) => void;
}

const PENDING_QR_STATUSES = new Set([
  'qr_pending',
  'scan_qr_code',
  'starting',
  'opening',
  'connecting',
]);

function normalizeStatusKey(status?: string | null): string {
  return String(status || '')
    .trim()
    .toLowerCase();
}

function isPendingQrStatus(status?: string | null): boolean {
  return PENDING_QR_STATUSES.has(normalizeStatusKey(status));
}

function resolveStatusMessage(data: { connected: boolean; status?: string | null }): string {
  if (data.connected) {
    return SESSION_COPY.active;
  }
  if (isPendingQrStatus(data.status)) {
    return SESSION_COPY.waitingQr;
  }
  return SESSION_COPY.disconnected;
}

async function recoverAuthenticatedWorkspaceId(): Promise<string> {
  const me = await authApi.getMe();
  return resolveWorkspaceFromAuthPayload(me.data)?.id || '';
}

const CIA_ACTIVE_MODES = new Set(['LIVE', 'BACKLOG', 'FULL']);
const CIA_MANUAL_PAUSE_MODES = new Set(['HUMAN_ONLY', 'SUSPENDED']);

const SESSION_COPY = {
  active: kloelT(`Sessão ativa e sincronizada.`),
  waitingQr: kloelT(`Aguardando leitura do QR Code no aparelho.`),
  disconnected: kloelT(`WhatsApp desconectado.`),
  workspaceReload: kloelT(
    `Workspace não carregado. Recarregue a página para sincronizar sua conta.`,
  ),
  workspaceRetry: kloelT(`Workspace não carregado. Tente novamente.`),
  loadStatusFailed: kloelT(`Não foi possível carregar o status agora.`),
  scanQr: kloelT(`Escaneie o QR Code para conectar.`),
  connectedSuccess: kloelT(`Sessão conectada com sucesso.`),
  alreadyConnected: kloelT(`Sessão já estava conectada.`),
  connectFailed: kloelT(`Falha ao iniciar conexão.`),
  connectRetry: kloelT(`Falha ao iniciar conexão. Tente novamente.`),
  disconnectSuccess: kloelT(`Sessão desconectada.`),
  disconnectRetry: kloelT(`Falha ao desconectar. Tente novamente.`),
  resetSuccess: kloelT(`Sessão resetada. Gere um novo QR Code para reconectar.`),
  resetRetry: kloelT(`Falha ao resetar a sessão. Tente novamente.`),
  pauseSuccess: kloelT(`IA pausada. O WhatsApp continua conectado.`),
  pauseRetry: kloelT(`Falha ao pausar a IA.`),
  resumeSuccess: kloelT(`IA retomada. O atendimento automático voltou a agir.`),
  resumeRetry: kloelT(`Falha ao retomar a IA.`),
  runtimeResumeSuccess: kloelT(`Sessão ativa. A autonomia total foi retomada automaticamente.`),
  qrRefreshRetry: kloelT(`Falha ao atualizar o QR Code. Tente novamente.`),
} as const;

const SESSION_LOG = {
  recoverWorkspace: 'Failed to recover authenticated workspace:',
  recoverWorkspaceOnMount: 'Failed to recover workspace on session hook mount:',
  loadStatus: 'Failed to load WhatsApp status:',
  loadQr: 'Failed to load QR:',
  connect: 'Failed to initiate connection:',
  disconnect: 'Failed to disconnect:',
  reset: 'Failed to reset WhatsApp session:',
  syncRuntime: 'Failed to sync CIA runtime for connected session:',
} as const;

function createSessionError(message: string) {
  return new Error(message);
}

function isCiaAutonomyActive(autonomy: Record<string, unknown> | null | undefined): boolean {
  const mode = String(autonomy?.mode || 'OFF').toUpperCase();
  const reason = String(autonomy?.reason || '');
  const isActive = CIA_ACTIVE_MODES.has(mode);
  const isManualPause = reason === 'manual_pause' || CIA_MANUAL_PAUSE_MODES.has(mode);
  return isActive && !isManualPause;
}

/** Use whats app session. */
export function useWhatsAppSession({
  enabled = true,
  workspaceId: providedWorkspaceId,
  onConnectionChange,
}: UseWhatsAppSessionOptions = {}) {
  const resolveAuthToken = useCallback(() => tokenStorage.getToken() || '', []);
  const resolveWorkspaceId = useCallback(
    () => providedWorkspaceId || tokenStorage.getWorkspaceId() || '',
    [providedWorkspaceId],
  );
  const [authToken, setAuthToken] = useState<string>(resolveAuthToken);
  const [workspaceId, setWorkspaceId] = useState<string>(resolveWorkspaceId);
  const [status, setStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const previousConnectedRef = useRef(false);
  const bootstrapGuardRef = useRef<string | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (connectTimerRef.current) {
        clearTimeout(connectTimerRef.current);
      }
    },
    [],
  );

  const refreshCredentials = useCallback(() => {
    const nextToken = resolveAuthToken();
    const nextWorkspaceId = resolveWorkspaceId();
    setAuthToken((prev) => (prev === nextToken ? prev : nextToken));
    setWorkspaceId((prev) => (prev === nextWorkspaceId ? prev : nextWorkspaceId));
    return {
      authToken: nextToken,
      workspaceId: nextWorkspaceId,
    };
  }, [resolveAuthToken, resolveWorkspaceId]);

  const tryRecoverAuthenticatedWorkspaceCredentials = useCallback(
    async (authTokenValue: string) => {
      try {
        const recoveredWorkspaceId = await recoverAuthenticatedWorkspaceId();
        if (recoveredWorkspaceId) {
          tokenStorage.setWorkspaceId(recoveredWorkspaceId);
          setWorkspaceId(recoveredWorkspaceId);
          return {
            authToken: authTokenValue,
            workspaceId: providedWorkspaceId || recoveredWorkspaceId,
          };
        }
      } catch (error) {
        console.error(SESSION_LOG.recoverWorkspace, error);
        tokenStorage.clear();
        setAuthToken('');
        setWorkspaceId('');
      }
      const refreshedAfterClear = refreshCredentials();
      if (refreshedAfterClear.authToken && !refreshedAfterClear.workspaceId) {
        throw createSessionError(SESSION_COPY.workspaceReload);
      }
      return null;
    },
    [providedWorkspaceId, refreshCredentials],
  );

  const fallbackToAnonymousCredentials = useCallback(async () => {
    const anonymous = await ensureAnonymousSession();
    const nextWorkspaceId = providedWorkspaceId || anonymous.workspaceId;
    setAuthToken(anonymous.token);
    setWorkspaceId(nextWorkspaceId);
    return {
      authToken: anonymous.token,
      workspaceId: nextWorkspaceId,
    };
  }, [providedWorkspaceId]);

  const ensureSessionCredentials = useCallback(async () => {
    const current = refreshCredentials();
    if (current.authToken && current.workspaceId) {
      return current;
    }

    if (current.authToken && !current.workspaceId) {
      const recovered = await tryRecoverAuthenticatedWorkspaceCredentials(current.authToken);
      if (recovered) {
        return recovered;
      }
    }

    return fallbackToAnonymousCredentials();
  }, [
    fallbackToAnonymousCredentials,
    refreshCredentials,
    tryRecoverAuthenticatedWorkspaceCredentials,
  ]);

  const requireSessionCredentials = useCallback(async () => {
    const current = await ensureSessionCredentials();
    if (!current.workspaceId || !current.authToken) {
      throw createSessionError(SESSION_COPY.workspaceRetry);
    }
    return current;
  }, [ensureSessionCredentials]);

  useEffect(() => {
    if (!enabled || !authToken || workspaceId) {
      return;
    }

    let cancelled = false;

    const recoverAuthenticatedWorkspace = async () => {
      try {
        const me = await authApi.getMe();
        const recoveredWorkspaceId = resolveWorkspaceFromAuthPayload(me.data)?.id || '';

        if (!cancelled && recoveredWorkspaceId) {
          tokenStorage.setWorkspaceId(recoveredWorkspaceId);
          setWorkspaceId(recoveredWorkspaceId);
        }
      } catch (error) {
        if (!cancelled) {
          console.error(SESSION_LOG.recoverWorkspaceOnMount, error);
        }
      }
    };

    void recoverAuthenticatedWorkspace();

    return () => {
      cancelled = true;
    };
  }, [authToken, enabled, workspaceId]);

  const loadStatus = useCallback(async () => {
    if (!enabled) {
      return;
    }
    const current = refreshCredentials();
    if (!current.workspaceId || !current.authToken) {
      return;
    }

    try {
      const data = await getWhatsAppStatus(current.workspaceId);
      setStatus(data);
      setQrCode(data.qrCode || null);
      setConnecting(isPendingQrStatus(data.status) && !data.connected);
      setStatusMessage(resolveStatusMessage(data));
      setError(null);
    } catch (err) {
      console.error(SESSION_LOG.loadStatus, err);
      setStatus({ connected: false, status: 'disconnected' });
      setStatusMessage(SESSION_COPY.loadStatusFailed);
    }
  }, [enabled, refreshCredentials]);

  const loadQR = useCallback(async () => {
    if (!enabled) {
      return;
    }
    const current = refreshCredentials();
    if (!current.workspaceId || !current.authToken) {
      return;
    }

    try {
      const data = await getWhatsAppQR(current.workspaceId);
      if (data.qrCode) {
        setQrCode(data.qrCode);
        setStatusMessage(data.message || SESSION_COPY.scanQr);
      }

      if (data.connected) {
        setStatusMessage(SESSION_COPY.connectedSuccess);
        setConnecting(false);
        await loadStatus();
      }
    } catch (err) {
      console.error(SESSION_LOG.loadQr, err);
      setError(SESSION_COPY.qrRefreshRetry);
      setConnecting(false);
    }
  }, [enabled, loadStatus, refreshCredentials]);

  const connect = useCallback(async () => {
    setLoading(true);
    setConnecting(true);
    setError(null);
    setQrCode(null);
    setStatusMessage(null);

    try {
      const current = await ensureSessionCredentials();
      const currentStatus = await getWhatsAppStatus(current.workspaceId);
      if (currentStatus.connected) {
        setStatus(currentStatus);
        setConnecting(false);
        setStatusMessage(SESSION_COPY.alreadyConnected);
        return;
      }

      if (isPendingQrStatus(currentStatus.status)) {
        setStatus(currentStatus);
        setQrCode(currentStatus.qrCode || null);
        setStatusMessage(currentStatus.message || SESSION_COPY.scanQr);
        if (connectTimerRef.current) {
          clearTimeout(connectTimerRef.current);
        }
        connectTimerRef.current = setTimeout(() => {
          void loadQR();
        }, 500);
        return;
      }

      const response: WhatsAppConnectResponse = await initiateWhatsAppConnection(
        current.workspaceId,
      );

      if (response.error || response.status === 'error') {
        setError(response.message || SESSION_COPY.connectFailed);
        setConnecting(false);
        return;
      }

      if (response.status === 'already_connected') {
        setConnecting(false);
        setStatusMessage(SESSION_COPY.alreadyConnected);
        await loadStatus();
        return;
      }

      if (response.status === 'qr_ready') {
        setQrCode(response.qrCode || response.qrCodeImage || null);
        setStatusMessage(response.message || SESSION_COPY.scanQr);
        return;
      }

      setTimeout(() => {
        void loadQR();
      }, 1500);
    } catch (err) {
      console.error(SESSION_LOG.connect, err);
      setError(SESSION_COPY.connectRetry);
      setConnecting(false);
    } finally {
      setLoading(false);
    }
  }, [ensureSessionCredentials, loadQR, loadStatus]);

  const disconnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await requireSessionCredentials();
      await disconnectWhatsApp(current.workspaceId);
      setStatus({ connected: false, status: 'disconnected' });
      setQrCode(null);
      setConnecting(false);
      setIsPaused(false);
      setStatusMessage(SESSION_COPY.disconnectSuccess);
    } catch (err) {
      console.error(SESSION_LOG.disconnect, err);
      setError(SESSION_COPY.disconnectRetry);
    } finally {
      setLoading(false);
    }
  }, [requireSessionCredentials]);

  const reset = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await requireSessionCredentials();
      await logoutWhatsApp(current.workspaceId);
      setStatus({ connected: false, status: 'disconnected' });
      setQrCode(null);
      setConnecting(false);
      setIsPaused(false);
      setStatusMessage(SESSION_COPY.resetSuccess);
    } catch (err) {
      console.error(SESSION_LOG.reset, err);
      setError(SESSION_COPY.resetRetry);
    } finally {
      setLoading(false);
    }
  }, [requireSessionCredentials]);

  const pauseAutonomy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await whatsappApi.startBacklog('pause_autonomy');
      if (response.error) {
        throw createSessionError(response.error);
      }
      setIsPaused(true);
      setStatusMessage(SESSION_COPY.pauseSuccess);
    } catch (err) {
      setError(err instanceof Error ? err.message : SESSION_COPY.pauseRetry);
    } finally {
      setLoading(false);
    }
  }, []);

  const resumeAutonomy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await requireSessionCredentials();
      await autostartCia(current.workspaceId);
      setIsPaused(false);
      setStatusMessage(SESSION_COPY.resumeSuccess);
    } catch (err) {
      setError(err instanceof Error ? err.message : SESSION_COPY.resumeRetry);
    } finally {
      setLoading(false);
    }
  }, [requireSessionCredentials]);

  const shouldSkipCiaRuntimeSync = useCallback((): boolean => {
    if (!enabled || !workspaceId || !authToken || !status?.connected) {
      return true;
    }
    if (bootstrapGuardRef.current === workspaceId) {
      return true;
    }
    return false;
  }, [authToken, enabled, status?.connected, workspaceId]);

  const resumeCiaAutomation = useCallback(async (activeWorkspaceId: string): Promise<void> => {
    const surface = await ciaApi.getSurface(activeWorkspaceId);
    const autonomy = (surface.error ? null : surface.data?.autonomy) as
      | Record<string, unknown>
      | null
      | undefined;

    setIsPaused(false);

    if (isCiaAutonomyActive(autonomy)) {
      return;
    }

    await autostartCia(activeWorkspaceId);
    setIsPaused(false);
    setStatusMessage(SESSION_COPY.runtimeResumeSuccess);
  }, []);

  const syncConnectedSessionRuntime = useCallback(async () => {
    if (shouldSkipCiaRuntimeSync()) {
      return;
    }

    bootstrapGuardRef.current = workspaceId;

    try {
      await resumeCiaAutomation(workspaceId);
    } catch (err) {
      console.error(SESSION_LOG.syncRuntime, err);
      bootstrapGuardRef.current = null;
    }
  }, [resumeCiaAutomation, shouldSkipCiaRuntimeSync, workspaceId]);

  useEffect(() => {
    refreshCredentials();
  }, [refreshCredentials]);

  useEffect(() => {
    const syncCredentials = () => {
      refreshCredentials();
    };

    window.addEventListener('storage', syncCredentials);
    window.addEventListener('kloel-storage-changed', syncCredentials);

    return () => {
      window.removeEventListener('storage', syncCredentials);
      window.removeEventListener('kloel-storage-changed', syncCredentials);
    };
  }, [refreshCredentials]);

  useEffect(() => {
    if (!enabled || !workspaceId || !authToken) {
      return;
    }
    void loadStatus();
  }, [authToken, enabled, loadStatus, workspaceId]);

  useEffect(() => {
    if (!enabled || !workspaceId || !authToken) {
      return;
    }
    const interval = setInterval(() => {
      void loadStatus();
    }, 12000);
    return () => clearInterval(interval);
  }, [authToken, enabled, loadStatus, workspaceId]);

  useEffect(() => {
    if (!enabled || !workspaceId || !authToken || !connecting || status?.connected) {
      return;
    }
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
    if (connected === previousConnectedRef.current) {
      return;
    }
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
