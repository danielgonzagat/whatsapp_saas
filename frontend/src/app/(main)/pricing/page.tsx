'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Check, 
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
import { 
  CenterStage, 
  Section, 
  StageHeadline,
  Button,
} from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { createCheckoutSession, tokenStorage } from '@/lib/api';
import { useAuth } from '@/components/kloel/auth/auth-provider';

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  priceId?: string; // Asaas/Stripe price ID
  icon: React.ElementType;
  features: PlanFeature[];
  popular?: boolean;
  cta: string;
}

const PLANS: Plan[] = [
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

const BENEFITS = [
  { icon: MessageCircle, title: 'WhatsApp Oficial', description: 'Conexão direta com API oficial' },
  { icon: Bot, title: 'IA que Vende', description: 'Autopilot responde e fecha vendas' },
  { icon: Users, title: 'CRM Integrado', description: 'Gerencie leads automaticamente' },
  { icon: BarChart3, title: 'Analytics', description: 'Métricas em tempo real' },
  { icon: Headphones, title: 'Suporte Humano', description: 'Time pronto para ajudar' },
  { icon: Sparkles, title: 'Updates Gratuitos', description: 'Novas features todo mês' },
];

export default function PricingPage() {
  const router = useRouter();
  const { userEmail } = useAuth();
  const workspaceId = useWorkspaceId();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [error, setError] = useState<string | null>(null);

  const handleSelectPlan = async (plan: Plan) => {
    setIsLoading(plan.id);
    setError(null);
    
    try {
      const email = userEmail;
      if (!email) {
        router.push('/login?callbackUrl=/');
        return;
      }

      const token = tokenStorage.getToken() || undefined;
      
      // Map plan.id to backend plan format
      const planMap: Record<string, string> = {
        'starter': 'STARTER',
        'pro': 'PRO', 
        'enterprise': 'ENTERPRISE',
      };
      
      const backendPlan = planMap[plan.id] || plan.id.toUpperCase();
      
      // Create checkout session
      const result = await createCheckoutSession(workspaceId, backendPlan, email, token);
      
      if (result.url) {
        // Redirect to Stripe/Asaas checkout
        window.location.href = result.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('Error selecting plan:', err);
      setError(err.message || 'Falha ao criar sessão de pagamento');
      // Fallback: redirect to chat with upgrade request
      const message = encodeURIComponent(`Quero assinar o plano ${plan.name} (R$ ${plan.price}/mês)`);
      router.push(`/chat?q=${message}`);
    } finally {
      setIsLoading(null);
    }
  };

  const yearlyDiscount = 0.2; // 20% off
  const getPrice = (price: number) => {
    if (billingCycle === 'yearly') {
      return Math.round(price * (1 - yearlyDiscount));
    }
    return price;
  };

  return (
    <div 
      className="min-h-full pb-20"
      style={{ backgroundColor: colors.background.obsidian }}
    >
      {/* Hero */}
      <Section spacing="lg" className="text-center">
        <CenterStage size="XL">
          <StageHeadline
            headline="Escolha o plano ideal para seu negócio"
            highlight="ideal"
            subheadline="Comece grátis por 7 dias. Cancele quando quiser."
            size="xl"
          />

          {/* Billing toggle */}
          <div className="mt-8 flex items-center justify-center gap-4">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-[#222226] text-[#E0DDD8]'
                  : 'text-[#6E6E73] hover:text-[#E0DDD8]'
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                billingCycle === 'yearly'
                  ? 'bg-[#222226] text-[#E0DDD8]'
                  : 'text-[#6E6E73] hover:text-[#E0DDD8]'
              }`}
            >
              Anual
              <span 
                className="px-2 py-0.5 rounded-full text-xs"
                style={{ backgroundColor: colors.brand.green, color: colors.background.obsidian }}
              >
                -20%
              </span>
            </button>
          </div>
        </CenterStage>
      </Section>

      {/* Plans */}
      <Section spacing="md">
        <CenterStage size="L">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan) => {
              const Icon = plan.icon;
              const price = getPrice(plan.price);
              
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-md p-6 transition-all ${
                    plan.popular ? 'ring-2 ring-[#E85D30]' : ''
                  }`}
                  style={{
                    backgroundColor: colors.background.surface1,
                    border: `1px solid ${plan.popular ? colors.brand.green : colors.stroke}`,
                  }}
                >
                  {/* Popular badge */}
                  {plan.popular && (
                    <div 
                      className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: colors.brand.green, color: colors.background.obsidian }}
                    >
                      Mais popular
                    </div>
                  )}

                  {/* Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div 
                      className="w-10 h-10 rounded-md flex items-center justify-center"
                      style={{ backgroundColor: `${colors.brand.green}20` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: colors.brand.green }} />
                    </div>
                    <div>
                      <h3 className="font-semibold" style={{ color: colors.text.primary }}>
                        {plan.name}
                      </h3>
                      <p className="text-xs" style={{ color: colors.text.muted }}>
                        {plan.description}
                      </p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm" style={{ color: colors.text.muted }}>R$</span>
                      <span 
                        className="text-4xl font-bold"
                        style={{ color: colors.text.primary }}
                      >
                        {price}
                      </span>
                      <span className="text-sm" style={{ color: colors.text.muted }}>/mês</span>
                    </div>
                    {billingCycle === 'yearly' && (
                      <p className="text-xs mt-1" style={{ color: colors.brand.green }}>
                        R$ {price * 12}/ano (economia de R$ {plan.price * 12 - price * 12})
                      </p>
                    )}
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => handleSelectPlan(plan)}
                    disabled={isLoading === plan.id}
                    className={`w-full py-3 rounded-md font-medium transition-all ${
                      plan.popular 
                        ? 'hover:opacity-90' 
                        : 'hover:bg-[#19191C]'
                    }`}
                    style={{
                      backgroundColor: plan.popular ? colors.brand.green : 'transparent',
                      color: plan.popular ? colors.background.obsidian : colors.text.primary,
                      border: plan.popular ? 'none' : `1px solid ${colors.stroke}`,
                    }}
                  >
                    {isLoading === plan.id ? 'Carregando...' : plan.cta}
                  </button>

                  {/* Features */}
                  <div className="mt-6 space-y-3">
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div 
                          className={`w-5 h-5 rounded-full flex items-center justify-center ${
                            feature.included ? '' : 'opacity-40'
                          }`}
                          style={{ 
                            backgroundColor: feature.included 
                              ? `${colors.brand.green}20` 
                              : colors.background.surface2 
                          }}
                        >
                          <Check 
                            className="w-3 h-3" 
                            style={{ 
                              color: feature.included ? colors.brand.green : colors.text.muted 
                            }} 
                          />
                        </div>
                        <span 
                          className={`text-sm ${feature.included ? '' : 'line-through'}`}
                          style={{ 
                            color: feature.included ? colors.text.secondary : colors.text.muted 
                          }}
                        >
                          {feature.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CenterStage>
      </Section>

      {/* Benefits */}
      <Section spacing="lg">
        <CenterStage size="L">
          <h2 
            className="text-2xl font-bold text-center mb-8"
            style={{ color: colors.text.primary }}
          >
            Tudo que você precisa para vender mais
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {BENEFITS.map((benefit, idx) => {
              const Icon = benefit.icon;
              return (
                <div
                  key={idx}
                  className="p-4 rounded-md text-center"
                  style={{ backgroundColor: colors.background.surface1 }}
                >
                  <div 
                    className="w-12 h-12 rounded-md flex items-center justify-center mx-auto mb-3"
                    style={{ backgroundColor: `${colors.brand.cyan}15` }}
                  >
                    <Icon className="w-6 h-6" style={{ color: colors.brand.cyan }} />
                  </div>
                  <h3 className="font-semibold mb-1" style={{ color: colors.text.primary }}>
                    {benefit.title}
                  </h3>
                  <p className="text-xs" style={{ color: colors.text.muted }}>
                    {benefit.description}
                  </p>
                </div>
              );
            })}
          </div>
        </CenterStage>
      </Section>

      {/* FAQ / Guarantee */}
      <Section spacing="md">
        <CenterStage size="L">
          <div 
            className="p-6 rounded-md text-center"
            style={{ backgroundColor: colors.background.surface1 }}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: colors.text.primary }}>
              🛡️ Garantia de 7 dias
            </h3>
            <p className="text-sm" style={{ color: colors.text.secondary }}>
              Teste o KLOEL por 7 dias. Se não gostar, devolvemos 100% do seu dinheiro. 
              Sem perguntas, sem burocracia.
            </p>
          </div>
        </CenterStage>
      </Section>
    </div>
  );
}
