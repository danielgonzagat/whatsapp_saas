'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { BillingSettingsSection } from '@/components/kloel/settings/billing-settings-section';
import { billingApi } from '@/lib/api';

export default function BillingPage() {
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    'none' | 'trial' | 'active' | 'expired' | 'suspended'
  >('none');
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [hasCard, setHasCard] = useState(false);

  useEffect(() => {
    billingApi.getSubscription().then((res) => {
      if (res.data) {
        setSubscriptionStatus(res.data.status ?? 'none');
        setTrialDaysLeft(res.data.trialDaysLeft ?? 0);
        setCreditsBalance(res.data.creditsBalance ?? 0);
      }
    }).catch((err) => console.error('[Billing] Error:', err.message || err));

    billingApi.getPaymentMethods().then((res) => {
      if (res.data?.paymentMethods?.length) {
        setHasCard(true);
      }
    }).catch((err) => console.error('[Billing] Error:', err.message || err));
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0C] p-6 md:p-10">
      <h1 className="mb-6 text-2xl font-semibold text-white">Pagamento</h1>
      <BillingSettingsSection
        subscriptionStatus={subscriptionStatus}
        trialDaysLeft={trialDaysLeft}
        creditsBalance={creditsBalance}
        hasCard={hasCard}
        onActivateTrial={() => {
          billingApi.activateTrial().catch((err) => console.error('[Billing] Error:', err.message || err));
        }}
      />
    </div>
  );
}
