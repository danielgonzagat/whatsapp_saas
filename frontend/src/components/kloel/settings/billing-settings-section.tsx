'use client';

import { Button } from '@/components/ui/button';
import { type SalesReportSummary, billingApi, tokenStorage } from '@/lib/api';
import {
  Activity,
  AlertTriangle,
  Check,
  CreditCard,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SettingsCard,
  SettingsHeader,
  SettingsInset,
  SettingsModal,
  SettingsNotice,
  SettingsStatusPill,
  kloelSettingsClass,
} from './contract';

interface BillingSettingsSectionProps {
  subscriptionStatus: 'none' | 'trial' | 'active' | 'expired' | 'suspended';
  trialDaysLeft: number;
  creditsBalance: number;
  hasCard: boolean;
  onActivateTrial: () => void;
  scrollToCreditCard?: boolean;
}

function formatMoney(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'R$ 0,00';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function subscriptionTone(status: BillingSettingsSectionProps['subscriptionStatus']) {
  if (status === 'active') return 'success';
  if (status === 'trial') return 'warning';
  if (status === 'expired' || status === 'suspended') return 'danger';
  return 'neutral';
}

function subscriptionLabel(status: BillingSettingsSectionProps['subscriptionStatus']) {
  if (status === 'active') return 'Ativo';
  if (status === 'trial') return 'Teste ativo';
  if (status === 'expired') return 'Expirado';
  if (status === 'suspended') return 'Suspenso';
  return 'Inativo';
}

export function BillingSettingsSection({
  subscriptionStatus,
  trialDaysLeft,
  creditsBalance,
  hasCard,
  onActivateTrial,
  scrollToCreditCard = false,
}: BillingSettingsSectionProps) {
  const workspaceId = tokenStorage.getWorkspaceId();
  const [showConfirmTrialModal, setShowConfirmTrialModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [_billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [billingSuccess, setBillingSuccess] = useState('');
  const [cards, setCards] = useState<
    Array<{ id: string; last4?: string; brand?: string; expiry?: string; isDefault?: boolean }>
  >([]);
  const [salesPeriod, setSalesPeriod] = useState<'week' | 'month'>('week');
  const [salesReport, setSalesReport] = useState<SalesReportSummary | null>(null);
  const [showCardsFirst, setShowCardsFirst] = useState(scrollToCreditCard && !hasCard);

  const estimatedMessages = useMemo(
    () => Math.max(0, Math.floor(creditsBalance * 100)),
    [creditsBalance],
  );
  const creditPercent = useMemo(
    () => Math.max(0, Math.min(100, (creditsBalance / 5) * 100)),
    [creditsBalance],
  );

  const loadPaymentMethods = useCallback(async () => {
    try {
      const response = await billingApi.getPaymentMethods();
      const paymentMethods =
        (response.data as Record<string, any> | undefined)?.paymentMethods || [];
      setCards(
        paymentMethods.map((pm: any) => ({
          id: pm.id,
          last4: pm.last4,
          brand: pm.brand ? String(pm.brand).toUpperCase() : 'CARD',
          expiry:
            pm.expMonth && pm.expYear
              ? `${String(pm.expMonth).padStart(2, '0')}/${String(pm.expYear).slice(-2)}`
              : '',
          isDefault: !!pm.isDefault,
        })),
      );
    } catch {
      setCards([]);
    }
  }, []);

  const loadSalesReport = useCallback(async () => {
    if (!workspaceId) {
      setSalesReport(null);
      return;
    }

    try {
      const response = await billingApi.getSalesReport(salesPeriod);
      setSalesReport((response.data as SalesReportSummary) || null);
    } catch {
      setSalesReport(null);
    }
  }, [salesPeriod, workspaceId]);

  useEffect(() => {
    void loadPaymentMethods();
  }, [loadPaymentMethods]);

  useEffect(() => {
    void loadSalesReport();
  }, [loadSalesReport]);

  useEffect(() => {
    setShowCardsFirst(scrollToCreditCard && !hasCard);
  }, [scrollToCreditCard, hasCard]);

  const startAddCardFlow = useCallback(async () => {
    setBillingLoading(true);
    setBillingError('');
    try {
      const returnUrl = typeof window !== 'undefined' ? window.location.href : undefined;
      const response = await billingApi.createSetupIntent(returnUrl);
      const url = (response.data as Record<string, any> | undefined)?.url;
      if (url) {
        window.location.href = url;
        return;
      }
      setBillingError('Nao foi possivel abrir o fluxo de cartao agora.');
    } catch {
      setBillingError('Nao foi possivel abrir o fluxo de cartao agora.');
    } finally {
      setBillingLoading(false);
    }
  }, []);

  const handleActivateTrialClick = useCallback(() => {
    if (cards.length === 0) {
      void startAddCardFlow();
      return;
    }
    setShowConfirmTrialModal(true);
  }, [cards.length, startAddCardFlow]);

  const handleConfirmTrial = useCallback(() => {
    setShowConfirmTrialModal(false);
    onActivateTrial();
  }, [onActivateTrial]);

  const handleSetDefault = useCallback(
    async (paymentMethodId: string) => {
      try {
        await billingApi.setDefaultPaymentMethod(paymentMethodId);
        setBillingSuccess('Cartao padrao atualizado.');
        await loadPaymentMethods();
      } catch {
        setBillingError('Nao foi possivel atualizar o cartao padrao.');
      }
    },
    [loadPaymentMethods],
  );

  const handleRemove = useCallback(
    async (paymentMethodId: string) => {
      try {
        await billingApi.removePaymentMethod(paymentMethodId);
        setBillingSuccess('Cartao removido.');
        await loadPaymentMethods();
      } catch {
        setBillingError('Nao foi possivel remover o cartao.');
      }
    },
    [loadPaymentMethods],
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className={kloelSettingsClass.sectionTitle}>Plano e cobranca</h3>
        <p className={`mt-1 ${kloelSettingsClass.sectionDescription}`}>
          O Kloel cria checkouts, processa cobrancas e opera a infraestrutura financeira
          internamente. Aqui voce cuida apenas da sua assinatura do Kloel.
        </p>
      </div>

      <SettingsNotice tone="info">
        O usuario nao precisa configurar operacao financeira externa para vender. Essa operacao e
        nativa do Kloel.
      </SettingsNotice>

      {billingError || billingSuccess ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            billingError
              ? 'border-[#E05252]/25 bg-[#E05252]/10 text-[#F7A8A8]'
              : 'border-[var(--app-border-primary)] bg-[var(--app-bg-card)] text-[var(--app-text-primary)]'
          }`}
        >
          {billingError || billingSuccess}
        </div>
      ) : null}

      <SettingsCard>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-semibold text-[var(--app-text-primary)]">Plano Basic</h4>
              <SettingsStatusPill tone={subscriptionTone(subscriptionStatus)}>
                {subscriptionLabel(subscriptionStatus)}
              </SettingsStatusPill>
            </div>
            <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
              Atendimento autonomo, operacao comercial e cobranca centralizados no Kloel.
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[var(--app-text-primary)]">R$ 97</p>
            <p className="text-xs text-[var(--app-text-secondary)]">/mes</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <SettingsInset className="p-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[#E85D30]" aria-hidden="true" />
              <p className="text-xs uppercase tracking-wide text-[var(--app-text-secondary)]">
                Creditos
              </p>
            </div>
            <p className="mt-2 text-xl font-semibold text-[var(--app-text-primary)]">
              US$ {creditsBalance.toFixed(2)}
            </p>
            <p className="text-xs text-[var(--app-text-secondary)]">
              Aproximadamente {estimatedMessages} mensagens disponiveis.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--app-bg-secondary)]">
              <div
                className="h-full rounded-full bg-[#E85D30]"
                style={{ width: `${creditPercent}%` }}
              />
            </div>
          </SettingsInset>

          <SettingsInset className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#E85D30]" aria-hidden="true" />
              <p className="text-xs uppercase tracking-wide text-[var(--app-text-secondary)]">
                Vendas processadas
              </p>
            </div>
            <p className="mt-2 text-xl font-semibold text-[var(--app-text-primary)]">
              {salesReport?.totalSales || 0}
            </p>
            <p className="text-xs text-[var(--app-text-secondary)]">
              {formatMoney(salesReport?.totalAmount || 0)} em{' '}
              {salesPeriod === 'week' ? '7 dias' : '30 dias'}.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant={salesPeriod === 'week' ? 'default' : 'outline'}
                onClick={() => setSalesPeriod('week')}
                className={
                  salesPeriod === 'week'
                    ? 'border-[var(--app-accent)] bg-[var(--app-bg-primary)] text-[var(--app-accent)] hover:bg-[var(--app-bg-primary)]'
                    : kloelSettingsClass.outlineButton
                }
              >
                7 dias
              </Button>
              <Button
                variant={salesPeriod === 'month' ? 'default' : 'outline'}
                onClick={() => setSalesPeriod('month')}
                className={
                  salesPeriod === 'month'
                    ? 'border-[var(--app-accent)] bg-[var(--app-bg-primary)] text-[var(--app-accent)] hover:bg-[var(--app-bg-primary)]'
                    : kloelSettingsClass.outlineButton
                }
              >
                30 dias
              </Button>
            </div>
          </SettingsInset>

          <SettingsInset className="p-4">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-[#E85D30]" aria-hidden="true" />
              <p className="text-xs uppercase tracking-wide text-[var(--app-text-secondary)]">
                Operacao financeira
              </p>
            </div>
            <p className="mt-2 text-sm font-semibold text-[var(--app-text-primary)]">
              Checkout, pagamento e repasse
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--app-text-secondary)]">
              O Kloel controla checkout, meios de pagamento, confirmacao e rotas de cobranca sem
              exigir configuracao manual do usuario.
            </p>
          </SettingsInset>
        </div>

        {creditsBalance < 1 ? (
          <SettingsNotice tone="warning" className="mt-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />O saldo operacional esta baixo.
            Revise sua assinatura e forma de pagamento para evitar interrupcoes.
          </SettingsNotice>
        ) : null}

        {subscriptionStatus === 'none' ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-bg-primary)] p-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-[var(--app-text-primary)]">
                  <Check className="h-4 w-4 text-[#E85D30]" aria-hidden="true" />
                  Checkout e cobranca operados pelo Kloel
                </div>
                <div className="flex items-center gap-2 text-[var(--app-text-primary)]">
                  <Check className="h-4 w-4 text-[#E85D30]" aria-hidden="true" />
                  Area de membros, afiliados e produtos no mesmo fluxo
                </div>
                <div className="flex items-center gap-2 text-[var(--app-text-secondary)]">
                  <Lock className="h-4 w-4 text-[var(--app-text-placeholder)]" aria-hidden="true" />
                  Adicione um cartao para iniciar o teste
                </div>
              </div>
            </div>

            <Button
              onClick={handleActivateTrialClick}
              className={`w-full ${kloelSettingsClass.primaryButton}`}
            >
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              Ativar teste gratis
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => setShowManageModal(true)}
              className={kloelSettingsClass.primaryButton}
            >
              Gerenciar assinatura
            </Button>
            <Button
              variant="outline"
              onClick={() => void startAddCardFlow()}
              className={kloelSettingsClass.outlineButton}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Adicionar cartao
            </Button>
          </div>
        )}
      </SettingsCard>

      <SettingsCard>
        <SettingsHeader
          title="Cartoes para assinatura"
          description="Metodo de pagamento da sua conta Kloel. Os clientes finais nao dependem dessas configuracoes."
        />

        {showCardsFirst ? (
          <SettingsNotice tone="info" className="mb-4">
            Adicione um cartao para liberar a ativacao do plano.
          </SettingsNotice>
        ) : null}

        {cards.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--app-border-primary)] bg-[var(--app-bg-primary)] px-4 py-8 text-center">
            <CreditCard
              className="mx-auto h-5 w-5 text-[var(--app-text-secondary)]"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium text-[var(--app-text-primary)]">
              Nenhum cartao cadastrado
            </p>
            <p className="mt-1 text-xs text-[var(--app-text-secondary)]">
              Cadastre um cartao para manter sua assinatura ativa.
            </p>
            <Button
              onClick={() => void startAddCardFlow()}
              className={`mt-4 ${kloelSettingsClass.primaryButton}`}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Adicionar cartao
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <SettingsInset
                key={card.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-primary)]">
                    <CreditCard className="h-4 w-4 text-[#E85D30]" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--app-text-primary)]">
                      {card.brand || 'CARD'} final {card.last4 || '0000'}
                    </p>
                    <p className="text-xs text-[var(--app-text-secondary)]">
                      {card.expiry || 'Sem validade informada'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {card.isDefault ? (
                    <SettingsStatusPill tone="success">Padrao</SettingsStatusPill>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => void handleSetDefault(card.id)}
                      className={kloelSettingsClass.outlineButton}
                    >
                      Definir padrao
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => void handleRemove(card.id)}
                    className={kloelSettingsClass.dangerButton}
                  >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    Remover
                  </Button>
                </div>
              </SettingsInset>
            ))}
          </div>
        )}
      </SettingsCard>

      {showConfirmTrialModal && (
        <SettingsModal className="max-w-sm">
          <h3 className="mb-2 text-lg font-semibold text-[var(--app-text-primary)]">
            Confirmar ativacao
          </h3>
          <p className="mb-4 text-sm text-[var(--app-text-secondary)]">
            Seu teste do Plano Basic sera iniciado agora. Durante o periodo de teste, o checkout e a
            cobranca dos seus clientes seguem operando pelo Kloel.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmTrialModal(false)}
              className={`flex-1 ${kloelSettingsClass.outlineButton}`}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmTrial}
              className={`flex-1 ${kloelSettingsClass.primaryButton}`}
            >
              Ativar agora
            </Button>
          </div>
        </SettingsModal>
      )}

      {showManageModal && (
        <SettingsModal className="max-w-sm">
          <h3 className="mb-3 text-lg font-semibold text-[var(--app-text-primary)]">
            Gerenciar assinatura
          </h3>
          <div className="space-y-3">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-bg-primary)] p-4 text-left transition-colors hover:border-[var(--app-border-primary)] hover:bg-[var(--app-bg-secondary)]"
              onClick={() => {
                setShowManageModal(false);
                void startAddCardFlow();
              }}
            >
              <span className="text-sm text-[var(--app-text-primary)]">
                Alterar forma de pagamento
              </span>
            </button>
            <div className="rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-bg-primary)] p-4 text-sm text-[var(--app-text-secondary)]">
              O Kloel renova sua assinatura com base no cartao padrao cadastrado. Se precisar
              ajustar limite ou revisar falhas de cobranca, atualize o cartao antes do vencimento.
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowManageModal(false)}
            className={`mt-4 w-full ${kloelSettingsClass.outlineButton}`}
          >
            Fechar
          </Button>
        </SettingsModal>
      )}
    </div>
  );
}
