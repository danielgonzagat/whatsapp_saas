'use client';

import { kloelT, kloelError } from '@/lib/i18n/t';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import { CenterStage, Section, StageHeadline } from '@/components/kloel';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { createCheckoutSession, tokenStorage } from '@/lib/api';
import { colors } from '@/lib/design-tokens';
import { buildDashboardHref } from '@/lib/kloel-dashboard-context';
import { usePricingPlans, type Plan } from '@/hooks/usePricingPlans';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

function navigateCurrentWindow(url: string) {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}



/** Pricing page. */
export default function PricingPage() {
  const router = useRouter();
  const { userEmail } = useAuth();
  const workspaceId = useWorkspaceId();
  const { plans: PLANS, benefits: BENEFITS, isLoading: plansLoading, error: plansError } = usePricingPlans();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [_error, setError] = useState<string | null>(null);

  const buildPlanDashboardHref = (plan: Plan) =>
    buildDashboardHref({
      source: 'pricing',
      planId: plan.id,
      planName: plan.name,
      productName: 'Assinatura Kloel',
      purpose: 'pricing',
      draft: `Quero assinar o plano ${plan.name} (R$ ${plan.price}/mês). Me ajude a concluir isso agora.`,
    });

  const handleSelectPlan = async (plan: Plan) => {
    if (typeof window === 'undefined') {
      return;
    }

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
        starter: 'STARTER',
        pro: 'PRO',
        enterprise: 'ENTERPRISE',
      };

      const backendPlan = planMap[plan.id] || plan.id.toUpperCase();

      // Create checkout session
      const result = await createCheckoutSession(workspaceId, backendPlan, email, token);

      if (result.url) {
        // Validate the redirect URL is same-origin or a known Kloel domain
        const target = new URL(result.url, window.location.origin);
        const isKloelDomain =
          target.origin === window.location.origin ||
          target.hostname.endsWith('.kloel.com') ||
          target.hostname === 'kloel.com';
        if (!isKloelDomain) {
          throw kloelError('Redirecionamento bloqueado: destino externo desconhecido.');
        }
        navigateCurrentWindow(target.toString());
      } else {
        throw kloelError('No checkout URL returned');
      }
    } catch (err: unknown) {
      console.error('Error selecting plan:', err);
      setError(err instanceof Error ? err.message : 'Falha ao criar sessão de pagamento');
      // Fallback: redirect to chat with upgrade request
      router.push(buildPlanDashboardHref(plan));
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
    <div className="min-h-full pb-20" style={{ backgroundColor: colors.background.obsidian }}>
      {/* Hero */}
      <Section spacing="lg" className="text-center">
        <CenterStage size="XL">
          <StageHeadline
            headline={kloelT(`Escolha o plano ideal para seu negócio`)}
            highlight="ideal"
            subheadline={kloelT(`Comece grátis por 7 dias. Cancele quando quiser.`)}
            size="xl"
          />

          {/* Billing toggle */}
          <div className="mt-8 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-[var(--bg-border)] text-[var(--text-silver)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-silver)]'
              }`}
            >
              {kloelT(`Mensal`)}
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                billingCycle === 'yearly'
                  ? 'bg-[var(--bg-border)] text-[var(--text-silver)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-silver)]'
              }`}
            >
              {kloelT(`Anual`)}
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
          {plansLoading ? (
            <div className="text-center py-8" style={{ color: colors.text.muted }}>
              {kloelT('Carregando planos...')}
            </div>
          ) : PLANS.length === 0 ? (
            <div className="text-center py-8" style={{ color: colors.text.muted }}>
              {kloelT('Nenhum plano disponível no momento.')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan) => {
              const Icon = plan.icon;
              const price = getPrice(plan.price);

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-md p-6 transition-all ${
                    plan.popular ? 'ring-2 ring-[var(--ember-primary)]' : ''
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
                      style={{
                        backgroundColor: colors.brand.green,
                        color: colors.background.obsidian,
                      }}
                    >
                      {kloelT(`Mais popular`)}
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
                      <span className="text-sm" style={{ color: colors.text.muted }}>
                        {kloelT(`R$`)}
                      </span>
                      <span className="text-4xl font-bold" style={{ color: colors.text.primary }}>
                        {price}
                      </span>
                      <span className="text-sm" style={{ color: colors.text.muted }}>
                        /mês
                      </span>
                    </div>
                    {billingCycle === 'yearly' && (
                      <p className="text-xs mt-1" style={{ color: colors.brand.green }}>
                        {kloelT(`R$`)} {price * 12}/ano (economia de R${' '}
                        {plan.price * 12 - price * 12})
                      </p>
                    )}
                  </div>

                  {/* CTA */}
                  <button
                    type="button"
                    onClick={() => handleSelectPlan(plan)}
                    disabled={isLoading === plan.id}
                    className={`w-full py-3 rounded-md font-medium transition-all ${
                      plan.popular ? 'hover:opacity-90' : 'hover:bg-[var(--bg-elevated)]'
                    }`}
                    style={{
                      backgroundColor: plan.popular ? colors.brand.green : 'transparent',
                      color: plan.popular ? colors.background.obsidian : colors.text.primary,
                      border: plan.popular ? 'none' : `1px solid ${colors.stroke}`,
                    }}
                  >
                    {isLoading === plan.id ? 'Carregando...' : plan.cta}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(buildPlanDashboardHref(plan))}
                    className="mt-3 w-full rounded-md border px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--bg-elevated)]"
                    style={{
                      borderColor: colors.stroke,
                      color: colors.text.primary,
                      backgroundColor: 'transparent',
                    }}
                  >
                    {kloelT(`Falar com IA sobre este plano`)}
                  </button>

                  {/* Features */}
                  <div className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <div key={feature.text} className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center ${
                            feature.included ? '' : 'opacity-40'
                          }`}
                          style={{
                            backgroundColor: feature.included
                              ? `${colors.brand.green}20`
                              : colors.background.surface2,
                          }}
                        >
                          <Check
                            className="w-3 h-3"
                            style={{
                              color: feature.included ? colors.brand.green : colors.text.muted,
                            }}
                            aria-hidden="true"
                          />
                        </div>
                        <span
                          className={`text-sm ${feature.included ? '' : 'line-through'}`}
                          style={{
                            color: feature.included ? colors.text.secondary : colors.text.muted,
                          }}
                        >
                          {feature.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
            )})}
          </div>
          )}
        </CenterStage>
      </Section>

      {/* Benefits */}
      <Section spacing="lg">
        <CenterStage size="L">
          {plansError ? (
            <div
              className="text-center p-4 rounded-md mb-4"
              style={{
                color: colors.state.error,
                backgroundColor: `${colors.state.error}10`,
                border: `1px solid ${colors.state.error}30`,
              }}
            >
              {kloelT('Erro ao carregar informações.')}{' '}
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ color: colors.brand.green, textDecoration: 'underline' }}
              >
                {kloelT('Tentar novamente')}
              </button>
            </div>
          ) : null}

          <h2
            className="text-2xl font-bold text-center mb-8"
            style={{ color: colors.text.primary }}
          >
            {kloelT(`Tudo que você precisa para vender mais`)}
          </h2>

          {plansLoading ? null : BENEFITS.length === 0 ? null : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {BENEFITS.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <div
                  key={benefit.title}
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
              )
            })}
          </div>
          )}
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
              {kloelT(`Garantia de 7 dias`)}
            </h3>
            <p className="text-sm" style={{ color: colors.text.secondary }}>
              {kloelT(`Teste o KLOEL por 7 dias. Se não gostar, devolvemos 100% do seu dinheiro. Sem
              perguntas, sem burocracia.`)}
            </p>
          </div>
        </CenterStage>
      </Section>
    </div>
  );
}
