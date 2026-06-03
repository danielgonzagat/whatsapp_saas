'use client';

import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect } from 'react';
import {
  type WhatsAppSetupState,
  getErrorStatus,
  SESSION_EXPIRED_MESSAGE,
} from './WhatsAppExperience.helpers';

interface ConnectionShape {
  connected: boolean;
}

interface RequestMetaStatusResult {
  connected: boolean;
  status?: string | undefined;
  message?: string | undefined;
}

type RequestMetaStatus = (opts?: { silent?: boolean }) => Promise<RequestMetaStatusResult | null>;

interface WhatsAppConnectionEffectsProps {
  mode?: string | undefined;
  savedSetup: WhatsAppSetupState;
  savedSetupKey: string;
  draft: WhatsAppSetupState;
  step: number;
  showWizard: boolean;
  isActivated: boolean;
  sessionExpired: boolean;
  effectiveConnection: ConnectionShape;
  hydratedRef: MutableRefObject<boolean>;
  hydratedSetupKeyRef: MutableRefObject<string | null>;
  advancedRef: MutableRefObject<boolean>;
  pollCountRef: MutableRefObject<number>;
  metaStatusRequestInFlightRef: MutableRefObject<boolean>;
  requestMetaStatusRef: MutableRefObject<RequestMetaStatus>;
  refreshConnection: () => Promise<unknown>;
  setDraft: Dispatch<SetStateAction<WhatsAppSetupState>>;
  setReconfiguring: Dispatch<SetStateAction<boolean>>;
  setStep: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setSessionExpired: Dispatch<SetStateAction<boolean>>;
  setActivated: Dispatch<SetStateAction<boolean>>;
  activated: boolean;
}

export function useWhatsAppConnectionEffects({
  mode,
  savedSetup,
  savedSetupKey,
  draft,
  step,
  showWizard,
  isActivated,
  sessionExpired,
  effectiveConnection,
  hydratedRef,
  hydratedSetupKeyRef,
  advancedRef,
  pollCountRef,
  metaStatusRequestInFlightRef,
  requestMetaStatusRef,
  refreshConnection,
  setDraft,
  setReconfiguring,
  setStep,
  setError,
  setSessionExpired,
  setActivated,
  activated,
}: WhatsAppConnectionEffectsProps) {
  useEffect(() => {
    setReconfiguring(mode === 'reconfigure');
  }, [mode, setReconfiguring]);

  useEffect(() => {
    if (hydratedRef.current && hydratedSetupKeyRef.current === savedSetupKey) {return;}
    hydratedRef.current = true;
    hydratedSetupKeyRef.current = savedSetupKey;
    setDraft(savedSetup);
  }, [hydratedRef, hydratedSetupKeyRef, savedSetup, savedSetupKey, setDraft]);

  useEffect(() => {
    if (effectiveConnection.connected) {
      metaStatusRequestInFlightRef.current = false;
      setSessionExpired(false);
    }
  }, [effectiveConnection.connected, metaStatusRequestInFlightRef, setSessionExpired]);

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
    if (!showWizard || step !== 0 || effectiveConnection.connected || sessionExpired) {
      return;
    }
    void requestMetaStatusRef.current({ silent: true });
  }, [effectiveConnection.connected, requestMetaStatusRef, sessionExpired, showWizard, step]);

  useEffect(() => {
    if (!showWizard || step !== 0 || effectiveConnection.connected || sessionExpired) {
      pollCountRef.current = 0;
      metaStatusRequestInFlightRef.current = false;
      return;
    }
    const intervalId = window.setInterval(() => {
      pollCountRef.current += 1;
      void refreshConnection().catch((err: unknown) => {
        if (getErrorStatus(err) === 401) {
          setSessionExpired(true);
          setError(SESSION_EXPIRED_MESSAGE);
          window.clearInterval(intervalId);
        }
      });
      if (!metaStatusRequestInFlightRef.current) {
        void requestMetaStatusRef.current({ silent: true });
      }
    }, 12000);
    return () => {
      metaStatusRequestInFlightRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [
    effectiveConnection.connected,
    metaStatusRequestInFlightRef,
    pollCountRef,
    refreshConnection,
    requestMetaStatusRef,
    sessionExpired,
    setError,
    setSessionExpired,
    showWizard,
    step,
  ]);

  useEffect(() => {
    if (!showWizard || step !== 0 || !effectiveConnection.connected || advancedRef.current) {return;}
    advancedRef.current = true;
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
    setStep,
    showWizard,
    step,
  ]);

  useEffect(() => {
    if (!activated) {return;}
    const timeoutId = window.setTimeout(() => {
      setActivated(false);
      setReconfiguring(false);
    }, 1500);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activated, setActivated, setReconfiguring]);
}
