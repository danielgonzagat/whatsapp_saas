'use client';

import { initiateWhatsAppConnection } from '@/lib/api/whatsapp';
import { secureRandomFloat } from '@/lib/secure-random';
import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect } from 'react';
import {
  type WhatsAppSetupState,
  getErrorMessage,
  getErrorStatus,
  SESSION_EXPIRED_MESSAGE,
} from './WhatsAppExperience.helpers';

interface ConnectionShape {
  connected: boolean;
}

interface RequestQrResult {
  qrCode: string | null;
  connected: boolean;
  status?: string;
  message?: string;
}

type RequestQrCode = (opts?: { silent?: boolean }) => Promise<RequestQrResult | null>;

interface WhatsAppConnectionEffectsProps {
  mode?: string;
  workspaceId: string;
  savedSetup: WhatsAppSetupState;
  savedSetupKey: string;
  draft: WhatsAppSetupState;
  step: number;
  showWizard: boolean;
  isActivated: boolean;
  isWahaProvider: boolean;
  sessionExpired: boolean;
  effectiveConnection: ConnectionShape;
  hydratedRef: MutableRefObject<boolean>;
  hydratedSetupKeyRef: MutableRefObject<string | null>;
  autoStartRef: MutableRefObject<boolean>;
  advancedRef: MutableRefObject<boolean>;
  pollCountRef: MutableRefObject<number>;
  qrRequestInFlightRef: MutableRefObject<boolean>;
  requestQrCodeRef: MutableRefObject<RequestQrCode>;
  refreshConnection: () => Promise<unknown>;
  setDraft: Dispatch<SetStateAction<WhatsAppSetupState>>;
  setReconfiguring: Dispatch<SetStateAction<boolean>>;
  setStep: Dispatch<SetStateAction<number>>;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setQrCode: Dispatch<SetStateAction<string>>;
  setScanProgress: Dispatch<SetStateAction<number>>;
  setSessionExpired: Dispatch<SetStateAction<boolean>>;
  setActivated: Dispatch<SetStateAction<boolean>>;
  activated: boolean;
}

export function useWhatsAppConnectionEffects({
  mode,
  workspaceId,
  savedSetup,
  savedSetupKey,
  draft,
  step,
  showWizard,
  isActivated,
  isWahaProvider,
  sessionExpired,
  effectiveConnection,
  hydratedRef,
  hydratedSetupKeyRef,
  autoStartRef,
  advancedRef,
  pollCountRef,
  qrRequestInFlightRef,
  requestQrCodeRef,
  refreshConnection,
  setDraft,
  setReconfiguring,
  setStep,
  setBusyKey,
  setError,
  setQrCode,
  setScanProgress,
  setSessionExpired,
  setActivated,
  activated,
}: WhatsAppConnectionEffectsProps) {
  useEffect(() => {
    setReconfiguring(mode === 'reconfigure');
  }, [mode, setReconfiguring]);

  useEffect(() => {
    if (hydratedRef.current && hydratedSetupKeyRef.current === savedSetupKey) return;
    hydratedRef.current = true;
    hydratedSetupKeyRef.current = savedSetupKey;
    setDraft(savedSetup);
  }, [hydratedRef, hydratedSetupKeyRef, savedSetup, savedSetupKey, setDraft]);

  useEffect(() => {
    if (effectiveConnection.connected) {
      qrRequestInFlightRef.current = false;
      setQrCode('');
      setSessionExpired(false);
    }
  }, [effectiveConnection.connected, qrRequestInFlightRef, setQrCode, setSessionExpired]);

  useEffect(() => {
    if (!showWizard) {
      advancedRef.current = false;
      return;
    }
    if (!effectiveConnection.connected) {
      setStep(0);
      return;
    }
    if (!draft.selectedProducts.length) {
      setStep(1);
      return;
    }
    if (!isActivated) {
      setStep(Math.min(3, Math.max(1, draft.lastCompletedStep + 1)));
    }
  }, [
    advancedRef,
    draft.lastCompletedStep,
    draft.selectedProducts.length,
    effectiveConnection.connected,
    isActivated,
    setStep,
    showWizard,
  ]);

  useEffect(() => {
    if (
      !showWizard ||
      step !== 0 ||
      effectiveConnection.connected ||
      autoStartRef.current ||
      !isWahaProvider ||
      sessionExpired
    ) {
      return;
    }
    autoStartRef.current = true;
    void (async () => {
      setBusyKey('connect');
      setError(null);
      setSessionExpired(false);
      setScanProgress((current) => Math.max(current, 12));
      try {
        await initiateWhatsAppConnection(workspaceId);
        void requestQrCodeRef.current({ silent: true });
        await refreshConnection();
      } catch (err: unknown) {
        if (getErrorStatus(err) === 401) {
          setSessionExpired(true);
          setError(SESSION_EXPIRED_MESSAGE);
          return;
        }
        setError(getErrorMessage(err, 'Não foi possível iniciar a sessão do WhatsApp.'));
      } finally {
        setBusyKey(null);
      }
    })();
  }, [
    autoStartRef,
    effectiveConnection.connected,
    isWahaProvider,
    refreshConnection,
    requestQrCodeRef,
    sessionExpired,
    setBusyKey,
    setError,
    setScanProgress,
    setSessionExpired,
    showWizard,
    step,
    workspaceId,
  ]);

  useEffect(() => {
    if (
      !showWizard ||
      step !== 0 ||
      effectiveConnection.connected ||
      !isWahaProvider ||
      sessionExpired
    ) {
      autoStartRef.current = false;
      pollCountRef.current = 0;
      qrRequestInFlightRef.current = false;
      return;
    }
    const intervalId = window.setInterval(() => {
      pollCountRef.current += 1;
      setScanProgress((current) => Math.min(92, Math.max(18, current + secureRandomFloat() * 5)));
      void refreshConnection().catch((err: unknown) => {
        if (getErrorStatus(err) === 401) {
          setSessionExpired(true);
          setError(SESSION_EXPIRED_MESSAGE);
          window.clearInterval(intervalId);
        }
      });
      if (!qrRequestInFlightRef.current) {
        void (async () => {
          const qr = await requestQrCodeRef.current({ silent: true });
          if (!qr?.qrCode && !qr?.connected && pollCountRef.current % 6 === 0) {
            autoStartRef.current = false;
          }
        })();
      }
    }, 1200);
    return () => {
      qrRequestInFlightRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [
    autoStartRef,
    effectiveConnection.connected,
    isWahaProvider,
    pollCountRef,
    qrRequestInFlightRef,
    refreshConnection,
    requestQrCodeRef,
    sessionExpired,
    setError,
    setScanProgress,
    setSessionExpired,
    showWizard,
    step,
  ]);

  useEffect(() => {
    if (!showWizard || step !== 0 || !effectiveConnection.connected || advancedRef.current) return;
    advancedRef.current = true;
    setScanProgress(100);
    const timeoutId = window.setTimeout(() => {
      setStep(
        draft.selectedProducts.length ? Math.min(3, Math.max(1, draft.lastCompletedStep + 1)) : 1,
      );
    }, 150);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    advancedRef,
    draft.lastCompletedStep,
    draft.selectedProducts.length,
    effectiveConnection.connected,
    setScanProgress,
    setStep,
    showWizard,
    step,
  ]);

  useEffect(() => {
    if (!activated) return;
    const timeoutId = window.setTimeout(() => {
      setActivated(false);
      setReconfiguring(false);
    }, 1500);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activated, setActivated, setReconfiguring]);
}
