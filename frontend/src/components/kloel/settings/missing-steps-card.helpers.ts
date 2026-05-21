import { kloelT } from '@/lib/i18n/t';
import {
  CreditCard,
  FileText,
  HelpCircle,
  MessageSquare,
  Package,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';

interface MissingStepsInput {
  hasCheckout: boolean;
  hasFaq: boolean;
  hasFiles: boolean;
  hasOpeningMessage: boolean;
  hasProducts: boolean;
  hasVoiceTone: boolean;
  hasWhatsApp: boolean;
}

interface MissingStep {
  done: boolean;
  icon: LucideIcon;
  label: string;
}

export function buildMissingSteps({
  hasCheckout,
  hasFaq,
  hasFiles,
  hasOpeningMessage,
  hasProducts,
  hasVoiceTone,
  hasWhatsApp,
}: MissingStepsInput): MissingStep[] {
  return [
    { label: kloelT(`Cadastrar produtos`), done: hasProducts, icon: Package },
    { label: kloelT(`Enviar arquivos`), done: hasFiles, icon: FileText },
    { label: kloelT(`Configurar planos de checkout`), done: hasCheckout, icon: CreditCard },
    { label: kloelT(`Definir tom de voz`), done: hasVoiceTone, icon: MessageSquare },
    { label: kloelT(`Adicionar perguntas frequentes`), done: hasFaq, icon: HelpCircle },
    { label: kloelT(`Configurar mensagem de abertura`), done: hasOpeningMessage, icon: MessageSquare },
    { label: kloelT(`Conectar WhatsApp`), done: hasWhatsApp, icon: Smartphone },
  ];
}
