'use client';

import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';
import {
  Zap,
  Crown,
  Rocket,
  MessageCircle,
  Bot,
  Users,
  BarChart3,
  Headphones,
  Sparkles,
} from 'lucide-react';
import type React from 'react';

export interface PlanFeature {
  text: string;
  included: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  priceId?: string;
  icon: React.ElementType;
  features: PlanFeature[];
  popular?: boolean;
  cta: string;
}

export interface Benefit {
  icon: React.ElementType;
  title: string;
  description: string;
}

const FALLBACK_PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Para quem está começando a vender pelo WhatsApp',
    price: 97,
    icon: Zap,
    cta: 'Começar agora',
    features: [
      { text: '1.000 mensagens/mês', included: true },
      { text: '1 número WhatsApp', included: true },
      { text: 'IA de vendas básica', included: true },
      { text: 'Autopilot (100 respostas/mês)', included: true },
      { text: '3 fluxos de automação', included: true },
      { text: 'Suporte por email', included: true },
      { text: 'Campanhas ilimitadas', included: false },
      { text: 'API de integração', included: false },
      { text: 'Suporte prioritário', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Para negócios em crescimento que querem escalar',
    price: 297,
    icon: Crown,
    popular: true,
    cta: 'Escolher Pro',
    features: [
      { text: '10.000 mensagens/mês', included: true },
      { text: '3 números WhatsApp', included: true },
      { text: 'IA de vendas avançada', included: true },
      { text: 'Autopilot ilimitado', included: true },
      { text: 'Fluxos ilimitados', included: true },
      { text: 'Suporte por chat', included: true },
      { text: 'Campanhas ilimitadas', included: true },
      { text: 'API de integração', included: true },
      { text: 'Suporte prioritário', included: false },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Para empresas que precisam de escala e suporte dedicado',
    price: 997,
    icon: Rocket,
    cta: 'Falar com vendas',
    features: [
      { text: 'Mensagens ilimitadas', included: true },
      { text: 'Números ilimitados', included: true },
      { text: 'IA personalizada', included: true },
      { text: 'Autopilot ilimitado', included: true },
      { text: 'Fluxos ilimitados', included: true },
      { text: 'Suporte 24/7', included: true },
      { text: 'Campanhas ilimitadas', included: true },
      { text: 'API de integração', included: true },
      { text: 'Suporte prioritário', included: true },
    ],
  },
];

const FALLBACK_BENEFITS: Benefit[] = [
  { icon: MessageCircle, title: 'WhatsApp Oficial', description: 'Conexão direta com API oficial' },
  { icon: Bot, title: 'IA que Vende', description: 'Autopilot responde e fecha vendas' },
  { icon: Users, title: 'CRM Integrado', description: 'Gerencie leads automaticamente' },
  { icon: BarChart3, title: 'Analytics', description: 'Métricas em tempo real' },
  { icon: Headphones, title: 'Suporte Humano', description: 'Time pronto para ajudar' },
  { icon: Sparkles, title: 'Updates Gratuitos', description: 'Novas features todo mês' },
];

interface PricingApiResponse {
  plans?: Plan[];
  benefits?: Benefit[];
}

export function usePricingPlans() {
  const { data, error, isLoading } = useSWR<PricingApiResponse>(
    '/pricing/plans',
    swrFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    },
  );

  const plans = data?.plans?.length ? data.plans : FALLBACK_PLANS;
  const benefits = data?.benefits?.length ? data.benefits : FALLBACK_BENEFITS;
  const apiError = error ? (error as Error).message : null;

  return { plans, benefits, isLoading, error: apiError };
}
