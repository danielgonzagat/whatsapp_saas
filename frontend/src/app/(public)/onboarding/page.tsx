'use client';

import { kloelT } from '@/lib/i18n/t';
import { saveOnboardingProfile } from '@/lib/api/onboarding';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { Bot, CreditCard, Mail, MessageCircle, Package, ShoppingBag, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const ROLES = [
  {
    id: 'subscriber',
    title: 'Quero acessar minha assinatura',
    description: 'Já sou cliente e quero acompanhar meus pedidos e assinaturas.',
    icon: CreditCard,
  },
  {
    id: 'producer',
    title: 'Sou produtor',
    description: 'Quero vender meus produtos com a inteligência artificial do Kloel.',
    icon: ShoppingBag,
  },
  {
    id: 'affiliate',
    title: 'Sou Afiliado',
    description: 'Quero promover produtos e ganhar comissões com vendas automatizadas.',
    icon: Users,
  },
  {
    id: 'coproducer',
    title: 'Sou coprodutor',
    description: 'Quero acompanhar produtos, operação e divisão de receita.',
    icon: Package,
  },
  {
    id: 'agency',
    title: 'Sou agência',
    description: 'Quero operar canais e vendas de clientes em um só lugar.',
    icon: Bot,
  },
] as const;

const PRODUCT_TYPES = [
  { id: 'digital', label: 'Digital' },
  { id: 'physical', label: 'Físico' },
  { id: 'subscription', label: 'Assinatura' },
  { id: 'service', label: 'Serviço' },
] as const;

const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'instagram', label: 'Instagram', icon: Users },
  { id: 'messenger', label: 'Messenger', icon: MessageCircle },
  { id: 'email', label: 'E-mail', icon: Mail },
] as const;

const AI_USE_CASES = [
  { id: 'sales', label: 'Venda' },
  { id: 'support', label: 'Atendimento' },
  { id: 'recovery', label: 'Recuperação' },
] as const;

/** Onboarding page. */
export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, workspace, completeOnboarding } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [productType, setProductType] = useState('digital');
  const [primaryChannel, setPrimaryChannel] = useState('whatsapp');
  const [hasProduct, setHasProduct] = useState(true);
  const [hasCheckout, setHasCheckout] = useState(false);
  const [aiUseCase, setAiUseCase] = useState('sales');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    if (!selected) {
      return;
    }
    if (!isAuthenticated || !workspace?.id) {
      router.push('/login?next=/onboarding');
      return;
    }

    setLoading(true);
    setError('');
    const result = await saveOnboardingProfile(workspace.id, {
      userType: selected,
      productType,
      primaryChannel,
      hasProduct,
      hasCheckout,
      aiUseCase,
    });
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    completeOnboarding();
    router.push('/');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0A0A0C' }}>
      {/* LEFT — Selection */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '48px 32px',
        }}
        className="lg:w-1/2 lg:px-16"
      >
        <div style={{ maxWidth: 420, margin: '0 auto', width: '100%' }}>
          {/* Logo */}
          <span
            style={{
              display: 'block',
              marginBottom: 48,
              fontFamily: "'Sora', sans-serif",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#E0DDD8',
            }}
          >
            KLOEL
          </span>

          {/* Heading */}
          <h1
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 28,
              fontWeight: 600,
              color: '#E0DDD8',
              letterSpacing: '0.02em',
              marginBottom: 8,
            }}
          >
            {kloelT(`Antes de tudo...`)}
          </h1>
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 15,
              color: '#6E6E73',
              marginBottom: 32,
              maxWidth: 360,
            }}
          >
            {kloelT(`Queremos te conhecer melhor para personalizar sua experiência com o Kloel.`)}
          </p>

          {/* Role Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ROLES.map((role) => {
              const Icon = role.icon;
              const isSelected = selected === role.id;
              return (
                <button
                  type="button"
                  key={role.id}
                  onClick={() => setSelected(role.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    width: '100%',
                    padding: '16px 20px',
                    borderRadius: 6,
                    border: `1px solid ${isSelected ? '#E85D30' : '#222226'}`,
                    background: isSelected ? 'rgba(232, 93, 48, 0.06)' : '#111113',
                    boxShadow: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      background: isSelected ? 'rgba(232, 93, 48, 0.12)' : '#19191C',
                      border: `1px solid ${isSelected ? 'rgba(232, 93, 48, 0.3)' : '#222226'}`,
                    }}
                  >
                    <Icon size={24} style={{ color: isSelected ? '#E85D30' : '#6E6E73' }} />
                  </div>
                  <div>
                    <p
                      style={{
                        fontFamily: "'Sora', sans-serif",
                        fontSize: 15,
                        fontWeight: 600,
                        color: '#E0DDD8',
                        margin: 0,
                      }}
                    >
                      {role.title}
                    </p>
                    <p
                      style={{
                        fontFamily: "'Sora', sans-serif",
                        fontSize: 13,
                        color: '#6E6E73',
                        margin: '2px 0 0',
                      }}
                    >
                      {role.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 24, display: 'grid', gap: 16 }}>
            <div>
              <p style={{ margin: '0 0 8px', color: '#E0DDD8', fontSize: 13, fontWeight: 600 }}>
                Tipo de produto
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                {PRODUCT_TYPES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setProductType(item.id)}
                    style={{
                      borderRadius: 6,
                      border: `1px solid ${productType === item.id ? '#E85D30' : '#222226'}`,
                      background: productType === item.id ? 'rgba(232, 93, 48, 0.08)' : '#111113',
                      color: '#E0DDD8',
                      padding: '10px 12px',
                      fontSize: 13,
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p style={{ margin: '0 0 8px', color: '#E0DDD8', fontSize: 13, fontWeight: 600 }}>
                Canal principal
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                {CHANNELS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPrimaryChannel(item.id)}
                      style={{
                        alignItems: 'center',
                        borderRadius: 6,
                        border: `1px solid ${primaryChannel === item.id ? '#E85D30' : '#222226'}`,
                        background:
                          primaryChannel === item.id ? 'rgba(232, 93, 48, 0.08)' : '#111113',
                        color: '#E0DDD8',
                        display: 'flex',
                        gap: 8,
                        justifyContent: 'center',
                        padding: '10px 12px',
                        fontSize: 13,
                      }}
                    >
                      <Icon size={15} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p style={{ margin: '0 0 8px', color: '#E0DDD8', fontSize: 13, fontWeight: 600 }}>
                Estrutura atual
              </p>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#E0DDD8',
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={hasProduct}
                  onChange={(event) => setHasProduct(event.target.checked)}
                />
                Já tenho produto
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#E0DDD8',
                  fontSize: 13,
                  marginTop: 8,
                }}
              >
                <input
                  type="checkbox"
                  checked={hasCheckout}
                  onChange={(event) => setHasCheckout(event.target.checked)}
                />
                Já tenho checkout
              </label>
            </div>

            <div>
              <p style={{ margin: '0 0 8px', color: '#E0DDD8', fontSize: 13, fontWeight: 600 }}>
                Uso inicial da IA
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                {AI_USE_CASES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAiUseCase(item.id)}
                    style={{
                      borderRadius: 6,
                      border: `1px solid ${aiUseCase === item.id ? '#E85D30' : '#222226'}`,
                      background: aiUseCase === item.id ? 'rgba(232, 93, 48, 0.08)' : '#111113',
                      color: '#E0DDD8',
                      padding: '10px 8px',
                      fontSize: 13,
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error ? (
            <p
              style={{
                marginTop: 16,
                color: '#F87171',
                fontSize: 13,
                fontFamily: "'Sora', sans-serif",
              }}
            >
              {error}
            </p>
          ) : null}

          {/* Continue Button */}
          <button
            type="button"
            onClick={handleContinue}
            disabled={!selected || loading}
            style={{
              marginTop: 32,
              width: '100%',
              padding: '14px 0',
              borderRadius: 6,
              border: 'none',
              background: selected ? '#E0DDD8' : '#19191C',
              color: selected ? '#0A0A0C' : '#3A3A3F',
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "'Sora', sans-serif",
              cursor: selected ? 'pointer' : 'default',
              transition: 'all 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              boxShadow: 'none',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Entrando...' : 'CONTINUAR'}
          </button>

          {/* Login Link */}
          <p
            style={{
              marginTop: 16,
              textAlign: 'center',
              fontSize: 14,
              color: '#6E6E73',
              fontFamily: "'Sora', sans-serif",
            }}
          >
            {kloelT(`Já tem uma conta?`)}{' '}
            <Link
              href="/login"
              style={{ fontWeight: 600, color: '#E0DDD8', textDecoration: 'none' }}
            >
              {kloelT(`Acesse já`)}
            </Link>
          </p>

          {/* Footer */}
          <div
            style={{
              marginTop: 48,
              display: 'flex',
              gap: 16,
              fontSize: 12,
              color: '#3A3A3F',
              fontFamily: "'Sora', sans-serif",
            }}
          >
            <Link href="/terms" style={{ color: '#3A3A3F', textDecoration: 'none' }}>
              {kloelT(`Central de ajuda`)}
            </Link>
            <span>•</span>
            <Link href="/terms" style={{ color: '#3A3A3F', textDecoration: 'none' }}>
              {kloelT(`Termos e condições`)}
            </Link>
          </div>
        </div>
      </div>

      {/* RIGHT — Cosmos Hero */}
      <div
        className="hidden lg:flex lg:w-1/2"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0A0C',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: 380,
            padding: '0 32px',
            textAlign: 'center',
          }}
        >
          {/* Accent bar */}
          <div
            style={{
              width: 64,
              height: 3,
              borderRadius: 99,
              background: '#E85D30',
              margin: '0 auto 32px',
            }}
          />
          <h2
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 32,
              fontWeight: 700,
              color: '#E0DDD8',
              lineHeight: 1.15,
              marginBottom: 16,
              letterSpacing: '0.02em',
            }}
          >
            {kloelT(`A melhor plataforma de Marketing Artificial`)}
          </h2>
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 15,
              color: '#6E6E73',
              lineHeight: 1.6,
            }}
          >
            {kloelT(`Kloel é muito mais que uma plataforma de marketing digital. É onde a inteligência
            artificial se adapta ao seu negócio para vender, atender e converter automaticamente.`)}
          </p>
        </div>
      </div>
    </div>
  );
}
