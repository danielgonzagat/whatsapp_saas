'use client';

import { useState, useRef, useEffect } from 'react';
import { Building2, MessageSquare, Smartphone, Check, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
  onClose: () => void;
  onTeachProducts: () => void;
  onConnectWhatsApp: () => void;
}

export function OnboardingModal({
  isOpen,
  onComplete,
  onClose,
  onTeachProducts,
  onConnectWhatsApp,
}: OnboardingModalProps) {
  const [step, setStep] = useState(1);
  const [businessData, setBusinessData] = useState({
    name: '',
    niche: '',
    objective: '',
  });
  const [isCompleted, setIsCompleted] = useState(false);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (finishTimer.current) clearTimeout(finishTimer.current);
    },
    [],
  );

  if (!isOpen) return null;

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    }
  };

  const handleTeach = () => {
    onTeachProducts();
    handleNext();
  };

  const handleConnectWhatsApp = () => {
    onConnectWhatsApp();
  };

  const handleFinish = () => {
    setIsCompleted(true);
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = setTimeout(() => {
      onComplete();
    }, 2000);
  };

  const progress = (step / 3) * 100;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-md bg-white p-8">
        <button
          onClick={onClose}
          className="absolute left-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Progress Bar */}
        <div className="mb-8 mt-4">
          <div className="mb-2 flex justify-between text-xs text-gray-500">
            <span>Passo {step} de 3</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-[#E0DDD8] transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {isCompleted ? (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <Check className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold text-gray-900">Onboarding concluido!</h2>
            <p className="text-gray-500">Bem-vindo ao Kloel.</p>
          </div>
        ) : (
          <>
            {step === 1 && (
              <div className="space-y-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                  <Building2 className="h-7 w-7 text-gray-700" />
                </div>
                <div>
                  <h2 className="mb-2 text-2xl font-semibold text-gray-900">Vamos comecar</h2>
                  <p className="text-gray-500">Conte-nos um pouco sobre o seu negocio.</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-gray-700">Nome da empresa</Label>
                    <Input
                      placeholder="Ex: Minha Loja Digital"
                      value={businessData.name}
                      onChange={(e) => setBusinessData({ ...businessData, name: e.target.value })}
                      className="rounded-md border-gray-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-gray-700">Nicho do negocio</Label>
                    <Input
                      placeholder="Ex: E-commerce, Infoprodutos, Servicos"
                      value={businessData.niche}
                      onChange={(e) => setBusinessData({ ...businessData, niche: e.target.value })}
                      className="rounded-md border-gray-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-gray-700">Objetivo principal com o Kloel</Label>
                    <Select
                      value={businessData.objective}
                      onValueChange={(v: string) =>
                        setBusinessData({ ...businessData, objective: v })
                      }
                    >
                      <SelectTrigger className="rounded-md border-gray-200">
                        <SelectValue placeholder="Selecione seu objetivo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="automate">
                          Automatizar atendimento no WhatsApp
                        </SelectItem>
                        <SelectItem value="sales">Aumentar vendas no automatico</SelectItem>
                        <SelectItem value="support">Melhorar suporte ao cliente</SelectItem>
                        <SelectItem value="scale">Escalar o negocio sem equipe</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={handleNext}
                  disabled={!businessData.name || !businessData.niche || !businessData.objective}
                  className="w-full rounded-md bg-[#E0DDD8] py-6 text-[#0A0A0C] hover:bg-[#E0DDD8]"
                >
                  Avancar
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                  <MessageSquare className="h-7 w-7 text-gray-700" />
                </div>
                <div>
                  <h2 className="mb-2 text-2xl font-semibold text-gray-900">Ensinar o Kloel</h2>
                  <p className="text-gray-500">Tudo comeca aqui. Basta conversar.</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-6 text-center">
                  <p className="mb-4 text-sm text-gray-600">
                    Clique no botao abaixo para inserir automaticamente um prompt completo que vai
                    ensinar o Kloel sobre seus produtos e servicos.
                  </p>
                  <Button
                    onClick={handleTeach}
                    variant="outline"
                    className="rounded-md border-gray-300 bg-white px-6 py-5"
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Ensinar sobre os meus produtos
                  </Button>
                </div>
                <Button
                  onClick={handleNext}
                  className="w-full rounded-md bg-[#E0DDD8] py-6 text-[#0A0A0C] hover:bg-[#E0DDD8]"
                >
                  Avancar
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100">
                  <Smartphone className="h-7 w-7 text-green-700" />
                </div>
                <div>
                  <h2 className="mb-2 text-2xl font-semibold text-gray-900">
                    Conectar WhatsApp oficial
                  </h2>
                  <p className="text-gray-500">Ultima etapa para comecar a vender.</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-6 text-center">
                  <p className="mb-4 text-sm text-gray-600">
                    Conecte seu WhatsApp Business pela Meta oficial para que o Kloel possa atender
                    seus clientes automaticamente.
                  </p>
                  <Button
                    onClick={handleConnectWhatsApp}
                    className="rounded-md bg-green-600 px-6 py-5 hover:bg-green-700"
                  >
                    <Smartphone className="mr-2 h-4 w-4" />
                    Conectar com Meta
                  </Button>
                </div>
                <Button
                  onClick={handleFinish}
                  variant="outline"
                  className="w-full rounded-md border-gray-200 py-6 bg-transparent"
                >
                  Concluir onboarding
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
