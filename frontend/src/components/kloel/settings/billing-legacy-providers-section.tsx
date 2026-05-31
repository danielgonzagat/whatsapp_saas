'use client';

import { kloelT } from '@/lib/i18n/t';
import { AlertTriangle, ArrowRight, Info, Zap } from 'lucide-react';
import Link from 'next/link';
import { SettingsCard, SettingsHeader, SettingsNotice } from './contract';

/** Payment provider routing notice section. */
export function BillingLegacyProvidersSection() {
  return (
    <SettingsCard>
      <SettingsHeader
        title={kloelT(`Roteamento de pagamentos`)}
        description={kloelT(
          `PIX e boleto usam Mercado Pago. Cartao e recebimento de conta continuam em Stripe Connect.`,
        )}
      />

      <div className="space-y-3">
        <SettingsNotice tone="info">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {kloelT(`Asaas — Migrado para Stripe Connect`)}
              </p>
              <p className="mt-1 text-xs opacity-85">
                {kloelT(
                  `A integracao com Asaas foi migrada para Stripe Connect. Gerencie suas contas de recebimento e saques diretamente no painel Kloel.`,
                )}
              </p>
              <Link
                href="/settings?section=billing"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:opacity-80"
              >
                {kloelT(`Ver conta de recebimento`)}
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </SettingsNotice>

        <SettingsNotice tone="warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{kloelT(`Mercado Pago — PIX e boleto`)}</p>
              <p className="mt-1 text-xs opacity-85">
                {kloelT(
                  `Mercado Pago processa PIX e boleto no checkout do Kloel. Cartao de credito continua no Stripe.`,
                )}
              </p>
            </div>
          </div>
        </SettingsNotice>

        <SettingsNotice tone="neutral">
          <div className="flex items-start gap-3">
            <Zap className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{kloelT(`Cartao e links de checkout`)}</p>
              <p className="mt-1 text-xs opacity-85">
                {kloelT(
                  `Stripe fica restrito ao cartao. Links de checkout podem oferecer PIX e boleto quando o plano estiver configurado com Mercado Pago.`,
                )}
              </p>
            </div>
          </div>
        </SettingsNotice>
      </div>
    </SettingsCard>
  );
}
