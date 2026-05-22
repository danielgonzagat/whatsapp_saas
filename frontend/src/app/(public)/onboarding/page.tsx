'use client';
import { colors } from '@/lib/design-tokens';

import { saveOnboardingProfile } from '@/lib/api/onboarding';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { OnboardingHero } from './OnboardingHero';
import { OnboardingForm } from './OnboardingForm';

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

    await completeOnboarding();
    router.push('/');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: colors.background.void }}>
      <OnboardingForm
        selected={selected}
        onSelect={setSelected}
        productType={productType}
        onProductTypeChange={setProductType}
        primaryChannel={primaryChannel}
        onPrimaryChannelChange={setPrimaryChannel}
        hasProduct={hasProduct}
        onHasProductChange={setHasProduct}
        hasCheckout={hasCheckout}
        onHasCheckoutChange={setHasCheckout}
        aiUseCase={aiUseCase}
        onAiUseCaseChange={setAiUseCase}
        loading={loading}
        error={error}
        onContinue={handleContinue}
      />
      <OnboardingHero />
    </div>
  );
}
