'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/ui/button';
import { Check, Loader2, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface TestKloelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Test kloel modal. */
export function TestKloelModal({ isOpen, onClose }: TestKloelModalProps) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const timer1 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer1.current) {
        clearTimeout(timer1.current);
      }
      if (timer2.current) {
        clearTimeout(timer2.current);
      }
    },
    [],
  );

  if (!isOpen) {
    return null;
  }

  const handleSendTest = () => {
    setStatus('sending');
    if (timer1.current) {
      clearTimeout(timer1.current);
    }
    timer1.current = setTimeout(() => {
      setStatus('sent');
      if (timer2.current) {
        clearTimeout(timer2.current);
      }
      timer2.current = setTimeout(() => {
        setStatus('idle');
        onClose();
      }, 2000);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {kloelT(`Enviar mensagem de teste`)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {status === 'sent' ? (
          <div className="flex flex-col items-center py-8">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Check className="h-8 w-8 text-green-600" aria-hidden="true" />
            </div>
            <p className="text-center text-gray-700">{kloelT(`Mensagem enviada com sucesso!`)}</p>
            <p className="mt-1 text-center text-sm text-gray-500">
              {kloelT(`Verifique seu WhatsApp.`)}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 rounded-2xl bg-gray-50 p-5">
              <p className="text-sm text-gray-600">
                {kloelT(`O Kloel enviara uma mensagem para o seu WhatsApp, para garantir que tudo esta
                funcionando corretamente.`)}
              </p>
            </div>

            <Button
              onClick={handleSendTest}
              disabled={status === 'sending'}
              className="w-full rounded-md bg-[#E0DDD8] py-6 text-[#0A0A0C] hover:bg-[#E0DDD8]"
            >
              {status === 'sending' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />

                  {kloelT(`Enviando...`)}
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" aria-hidden="true" />

                  {kloelT(`Enviar mensagem de teste`)}
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
