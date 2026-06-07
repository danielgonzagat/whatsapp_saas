import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
let sectionParam = '';

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(sectionParam),
}));

vi.mock('@/hooks/useResponsiveViewport', () => ({
  useResponsiveViewport: () => ({ isMobile: false }),
}));

vi.mock('@/hooks/useConnectAccounts', () => ({
  useSellerConnectAccount: () => ({
    sellerAccount: null,
    isLoading: false,
    error: null,
    mutate: vi.fn(),
  }),
}));

vi.mock('@/hooks/useKyc', () => ({
  useProfile: () => ({
    profile: {
      fullName: 'Codex Local',
      email: 'codex@example.test',
      phone: '',
      birthDate: '',
      avatarUrl: '',
    },
    isLoading: false,
    mutate: vi.fn(),
  }),
  useFiscalData: () => ({ fiscal: null, mutate: vi.fn() }),
  useKycDocuments: () => ({ documents: [], mutate: vi.fn() }),
  useBankAccount: () => ({ bankAccount: null, mutate: vi.fn() }),
  useKycStatus: () => ({ status: { status: 'pending' }, mutate: vi.fn() }),
  useKycCompletion: () => ({ completion: { percentage: 0, sections: [] }, mutate: vi.fn() }),
  useKycSubmit: () => ({ submitKyc: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  billingApi: {
    getSubscription: vi.fn(async () => ({ data: null })),
    getPaymentMethods: vi.fn(async () => ({ data: [] })),
    activateTrial: vi.fn(async () => ({ data: null })),
  },
}));

vi.mock('@/components/kloel/PulseLoader', () => ({ PulseLoader: () => null }));
vi.mock('@/components/kloel/settings/account-settings-section', () => ({ AccountSettingsSection: () => <section>Conta</section> }));
vi.mock('@/components/kloel/settings/activity-section', () => ({ ActivitySection: () => <section>Atividade</section> }));
vi.mock('@/components/kloel/settings/analytics-settings-section', () => ({ AnalyticsSettingsSection: () => <section>Analytics</section> }));
vi.mock('@/components/kloel/settings/billing-settings-section', () => ({ BillingSettingsSection: () => <section>Billing</section> }));
vi.mock('@/components/kloel/settings/brain-settings-section', () => ({ BrainSettingsSection: () => <section>Brain</section> }));
vi.mock('@/components/kloel/settings/crm-settings-section', () => ({ CrmSettingsSection: () => <section>CRM</section> }));
vi.mock('@/components/kloel/settings/system-alerts-card', () => ({ SystemAlertsCard: () => null }));

vi.mock('./ContaDadosPessoaisSection', () => ({ default: () => <section>Dados pessoais panel</section> }));
vi.mock('./ContaDadosFiscaisSection', () => ({ default: () => <section>Dados fiscais panel</section> }));
vi.mock('./ContaDocumentosSection', () => ({ default: () => <section>Documentos panel</section> }));
vi.mock('./ContaDadosBancariosSection', () => ({ default: () => <section>Dados bancarios panel</section> }));
vi.mock('./ContaSegurancaSection', () => ({ default: () => <section>Seguranca panel</section> }));
vi.mock('./ContaNotificacoesSection', () => ({ default: () => <section>Notificacoes panel</section> }));
vi.mock('./ContaPerfilPublicoSection', () => ({ default: () => <section>Perfil publico panel</section> }));
vi.mock('./ContaIdiomasSection', () => ({ default: () => <section>Idiomas panel</section> }));
vi.mock('./ContaAjudaSection', () => ({ default: () => <section>Ajuda panel</section> }));
vi.mock('./ContaSairSection', () => ({ default: () => <section>Sair panel</section> }));
vi.mock('./ContaConnectAccountCard', () => ({ ConnectAccountStatusCard: () => null }));
vi.mock('./ContaTeamSection', () => ({ TeamSection: () => <section>Equipe panel</section> }));
vi.mock('./ContaAppsSection', () => ({ ContaAppsSection: () => <section>Apps panel</section> }));
vi.mock('./ContaReferralSection', () => ({ ContaReferralSection: () => <section>Referral panel</section> }));
vi.mock('./ContaInfoSection', () => ({ ContaInfoSection: () => <section>Info panel</section> }));

import ContaView from './ContaView';

afterEach(() => {
  cleanup();
  replace.mockClear();
  sectionParam = '';
});

describe('ContaView', () => {
  it('exposes all real profile sections in the internal account navigation', () => {
    render(<ContaView />);

    for (const name of [
      'Dados pessoais',
      'Dados fiscais',
      'Documentos',
      'Dados bancarios',
      'Perfil publico',
      'Equipe',
      'Apps',
      'Seguranca',
      'Idiomas',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(name, 'i') })).toBeTruthy();
    }
  });

  it('exposes the receiving-account card as a billing link anchor', () => {
    render(<ContaView />);

    expect(document.getElementById('conta-recebimento')).toBeTruthy();
  });

  it('announces the active profile section in the sidebar', () => {
    render(<ContaView />);

    expect(screen.getByRole('button', { name: /dados pessoais/i }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: /dados fiscais/i }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});
