'use client';

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
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { Building2, Check, ChevronRight, MessageSquare, Smartphone, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
  onClose: () => void;
  onTeachProducts: () => void;
  onConnectWhatsApp: () => void;
}

const ACCENT_BUTTON_CLASS =
  'w-full rounded-[6px] border px-4 py-6 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BUTTON_CLASS =
  'w-full rounded-[6px] border px-4 py-6 text-sm font-medium transition-colors';

function iconPanelStyle() {
  return {
    background: KLOEL_THEME.bgSecondary,
    borderColor: KLOEL_THEME.borderPrimary,
  } as const;
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

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setBusinessData({
      name: '',
      niche: '',
      objective: '',
    });
    setIsCompleted(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (step < 3) {
      setStep((current) => current + 1);
    }
  };

  const handleTeach = () => {
    onTeachProducts();
    handleNext();
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <div
        className="relative w-full max-w-md overflow-hidden rounded-[24px] border p-8"
        style={{
          background: KLOEL_THEME.bgCard,
          borderColor: KLOEL_THEME.borderPrimary,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.42)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-[6px] border transition-colors"
          style={{
            background: KLOEL_THEME.bgSecondary,
            borderColor: KLOEL_THEME.borderPrimary,
            color: KLOEL_THEME.textSecondary,
          }}
          aria-label="Fechar"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="mb-8 mt-4">
          <div className="mb-2 flex justify-between text-[11px] uppercase tracking-[0.24em]">
            <span style={{ color: KLOEL_THEME.textTertiary }}>Passo {step} de 3</span>
            <span style={{ color: KLOEL_THEME.textTertiary }}>{Math.round(progress)}%</span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: KLOEL_THEME.bgSecondary }}
          >
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%`, background: KLOEL_THEME.accent }}
            />
          </div>
        </div>

        {isCompleted ? (
          <div className="flex flex-col items-center py-8 text-center">
            <div
              className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border"
              style={{
                background: KLOEL_THEME.bgSecondary,
                borderColor: KLOEL_THEME.borderPrimary,
                color: KLOEL_THEME.accent,
              }}
            >
              <Check className="h-10 w-10" aria-hidden="true" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold" style={{ color: KLOEL_THEME.textPrimary }}>
              Onboarding concluido!
            </h2>
            <p style={{ color: KLOEL_THEME.textSecondary }}>Bem-vindo ao Kloel.</p>
          </div>
        ) : null}

        {!isCompleted && step === 1 ? (
          <div className="space-y-6">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-[16px] border"
              style={{ ...iconPanelStyle(), color: KLOEL_THEME.textPrimary }}
            >
              <Building2 className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <h2 className="mb-2 text-2xl font-semibold" style={{ color: KLOEL_THEME.textPrimary }}>
                Vamos comecar
              </h2>
              <p style={{ color: KLOEL_THEME.textSecondary }}>
                Conte-nos um pouco sobre o seu negocio.
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm" style={{ color: KLOEL_THEME.textSecondary }}>
                  Nome da empresa
                </Label>
                <Input
                  placeholder="Ex: Minha Loja Digital"
                  value={businessData.name}
                  onChange={(event) =>
                    setBusinessData((current) => ({ ...current, name: event.target.value }))
                  }
                  className="rounded-[6px] border"
                  style={{
                    background: KLOEL_THEME.bgInput,
                    borderColor: KLOEL_THEME.borderInput,
                    color: KLOEL_THEME.textPrimary,
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm" style={{ color: KLOEL_THEME.textSecondary }}>
                  Nicho do negocio
                </Label>
                <Input
                  placeholder="Ex: E-commerce, Infoprodutos, Servicos"
                  value={businessData.niche}
                  onChange={(event) =>
                    setBusinessData((current) => ({ ...current, niche: event.target.value }))
                  }
                  className="rounded-[6px] border"
                  style={{
                    background: KLOEL_THEME.bgInput,
                    borderColor: KLOEL_THEME.borderInput,
                    color: KLOEL_THEME.textPrimary,
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm" style={{ color: KLOEL_THEME.textSecondary }}>
                  Objetivo principal com o Kloel
                </Label>
                <Select
                  value={businessData.objective}
                  onValueChange={(objective) =>
                    setBusinessData((current) => ({ ...current, objective }))
                  }
                >
                  <SelectTrigger
                    className="rounded-[6px] border"
                    style={{
                      background: KLOEL_THEME.bgInput,
                      borderColor: KLOEL_THEME.borderInput,
                      color: KLOEL_THEME.textPrimary,
                    }}
                  >
                    <SelectValue placeholder="Selecione seu objetivo" />
                  </SelectTrigger>
                  <SelectContent
                    className="border"
                    style={{
                      background: KLOEL_THEME.bgCard,
                      borderColor: KLOEL_THEME.borderPrimary,
                      color: KLOEL_THEME.textPrimary,
                    }}
                  >
                    <SelectItem value="automate">Automatizar atendimento no WhatsApp</SelectItem>
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
              className={ACCENT_BUTTON_CLASS}
              style={{
                background: KLOEL_THEME.accent,
                borderColor: KLOEL_THEME.accent,
                color: KLOEL_THEME.textOnAccent,
              }}
            >
              Avancar
              <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ) : null}

        {!isCompleted && step === 2 ? (
          <div className="space-y-6">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-[16px] border"
              style={{ ...iconPanelStyle(), color: KLOEL_THEME.textPrimary }}
            >
              <MessageSquare className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <h2 className="mb-2 text-2xl font-semibold" style={{ color: KLOEL_THEME.textPrimary }}>
                Ensinar o Kloel
              </h2>
              <p style={{ color: KLOEL_THEME.textSecondary }}>Tudo comeca aqui. Basta conversar.</p>
            </div>
            <div
              className="rounded-[18px] border p-6 text-center"
              style={{
                background: KLOEL_THEME.bgSecondary,
                borderColor: KLOEL_THEME.borderPrimary,
              }}
            >
              <p className="mb-4 text-sm" style={{ color: KLOEL_THEME.textSecondary }}>
                Clique no botao abaixo para inserir automaticamente um prompt completo que vai
                ensinar o Kloel sobre seus produtos e servicos.
              </p>
              <Button
                onClick={handleTeach}
                variant="outline"
                className="rounded-[6px] border px-6 py-5"
                style={{
                  background: KLOEL_THEME.bgCard,
                  borderColor: KLOEL_THEME.borderPrimary,
                  color: KLOEL_THEME.textPrimary,
                }}
              >
                <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
                Ensinar sobre os meus produtos
              </Button>
            </div>
            <Button
              onClick={handleNext}
              className={ACCENT_BUTTON_CLASS}
              style={{
                background: KLOEL_THEME.accent,
                borderColor: KLOEL_THEME.accent,
                color: KLOEL_THEME.textOnAccent,
              }}
            >
              Avancar
              <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ) : null}

        {!isCompleted && step === 3 ? (
          <div className="space-y-6">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-[16px] border"
              style={{ ...iconPanelStyle(), color: KLOEL_THEME.accent }}
            >
              <Smartphone className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <h2 className="mb-2 text-2xl font-semibold" style={{ color: KLOEL_THEME.textPrimary }}>
                Conectar canais Meta
              </h2>
              <p style={{ color: KLOEL_THEME.textSecondary }}>
                Ultima etapa para ativar sua operacao oficial.
              </p>
            </div>
            <div
              className="rounded-[18px] border p-6 text-center"
              style={{
                background: KLOEL_THEME.bgSecondary,
                borderColor: KLOEL_THEME.borderPrimary,
              }}
            >
              <p className="mb-4 text-sm" style={{ color: KLOEL_THEME.textSecondary }}>
                Conecte os canais oficiais da Meta para que o Kloel opere WhatsApp, Instagram e
                Messenger com a infraestrutura oficial.
              </p>
              <Button
                onClick={onConnectWhatsApp}
                className={ACCENT_BUTTON_CLASS}
                style={{
                  background: KLOEL_THEME.accent,
                  borderColor: KLOEL_THEME.accent,
                  color: KLOEL_THEME.textOnAccent,
                }}
              >
                <Smartphone className="mr-2 h-4 w-4" aria-hidden="true" />
                Conectar meus canais Meta
              </Button>
            </div>
            <Button
              onClick={handleFinish}
              variant="outline"
              className={SECONDARY_BUTTON_CLASS}
              style={{
                background: KLOEL_THEME.bgCard,
                borderColor: KLOEL_THEME.borderPrimary,
                color: KLOEL_THEME.textPrimary,
              }}
            >
              Concluir onboarding
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
