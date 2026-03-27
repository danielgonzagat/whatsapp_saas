'use client';

import { AccountSettingsSection } from '@/components/kloel/settings/account-settings-section';

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0C] p-6 md:p-10">
      <h1 className="mb-6 text-2xl font-semibold text-white">Configurações</h1>
      <AccountSettingsSection />
    </div>
  );
}
