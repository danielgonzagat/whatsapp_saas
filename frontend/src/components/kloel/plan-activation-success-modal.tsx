'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/ui/button';
import { Check, MessageSquare, Settings, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface PlanActivationSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTestKloel: () => void;
  onOpenSettings: () => void;
  onChatWithKloel: () => void;
}

/** Plan activation success modal. */
export function PlanActivationSuccessModal({
  isOpen,
  onClose,
  onTestKloel,
  onOpenSettings,
  onChatWithKloel,
}: PlanActivationSuccessModalProps) {
  const [showCheck, setShowCheck] = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setShowCheck(false);
      if (checkTimer.current) {
        clearTimeout(checkTimer.current);
      }
      checkTimer.current = setTimeout(() => setShowCheck(true), 300);
    }
    return () => {
      if (checkTimer.current) {
        clearTimeout(checkTimer.current);
      }
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        {/* Animated Checkmark - Apple Fitness Style */}
        <div className="mb-8 flex justify-center">
          <div className="relative flex h-24 w-24 items-center justify-center">
            {/* Outer ring */}
            <svg className="absolute h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#E5E7EB" strokeWidth="6" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#22C55E"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${showCheck ? 283 : 0} 283`}
                className="transition-all duration-1000 ease-out"
                style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
              />
            </svg>
            {/* Checkmark */}
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full bg-green-500 transition-all duration-500 ${
                showCheck ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
              }`}
            >
              <Check className="h-8 w-8 text-white" strokeWidth={3} aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="mb-8 text-center">
          <h2 className="mb-2 text-2xl font-semibold text-gray-900">
            
            {kloelT(`Plano Basic ativado com sucesso!`)}
          </h2>
          <p className="text-gray-500">
            
            {kloelT(`O Kloel esta pronto para atender seus clientes no WhatsApp.`)}
          </p>
        </div>

        <div className="space-y-3">
          <Button
            onClick={() => {
              onClose();
              onTestKloel();
            }}
            className="w-full rounded-xl bg-gray-900 py-6 text-white hover:bg-gray-800"
          >
            <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
            
            {kloelT(`Testar o Kloel agora`)}
          </Button>
          <Button
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            variant="outline"
            className="w-full rounded-xl border-gray-200 py-6"
          >
            <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
            
            {kloelT(`Ir para configuracoes do Kloel`)}
          </Button>
          <Button
            onClick={() => {
              onClose();
              onChatWithKloel();
            }}
            variant="ghost"
            className="w-full rounded-xl py-6 text-gray-600 hover:bg-gray-50"
          >
            <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
            
            {kloelT(`Conversar com meu Kloel`)}
          </Button>
        </div>
      </div>
    </div>
  );
}
