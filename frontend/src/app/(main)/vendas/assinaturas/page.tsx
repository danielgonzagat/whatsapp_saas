'use client';

import { useState } from 'react';
import { useSubscription, useBillingUsage, usePaymentMethods } from '@/hooks/useBilling';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { Metric } from '@/components/kloel/Metric';
import { OrbitalLoader } from '@/components/kloel/cosmos/OrbitalLoader';
import { StarField } from '@/components/kloel/cosmos/StarField';
import { colors, typography } from '@/lib/design-tokens';

export default function AssinaturasPage() {
  const { subscription, isLoading: subLoading } = useSubscription();
  const { usage, isLoading: usageLoading } = useBillingUsage();
  const { paymentMethods, isLoading: pmLoading } = usePaymentMethods();
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const handleCancelSubscription = async () => {
    if (!confirm('Tem certeza que deseja cancelar sua assinatura?')) return;
    setCancelling(true);
    try {
      await apiFetch('/billing/cancel', { method: 'POST' });
      setCancelled(true);
    } catch (e) {
      console.error('Cancel failed', e);
    } finally {
      setCancelling(false);
    }
  };

  const isLoading = subLoading || usageLoading || pmLoading;
  const sub = subscription as any;
  const usageData = usage as any;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: colors.background.void }}>
        <OrbitalLoader size={36} />
      </div>
    );
  }

  return (
    <div style={{ padding: 32, position: 'relative', minHeight: '100vh', background: colors.background.void }}>
      <StarField density={30} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 900 }}>
        <PageTitle
          title="Assinaturas"
          sub="Gerencie seu plano, uso e metodos de pagamento"
        />

        {/* Subscription Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 32 }}>
          <Card style={{ padding: 28 }}>
            <Lbl>Plano Atual</Lbl>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
              <Val size={28} color={colors.accent.webb}>
                {sub?.plan?.name || sub?.planName || sub?.plan || 'Sem plano ativo'}
              </Val>
              {sub?.status && (
                <span style={{
                  padding: '3px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: typography.fontFamily.display,
                  color: sub.status === 'active' || sub.status === 'trialing' ? colors.state.success : colors.state.warning,
                  background: sub.status === 'active' || sub.status === 'trialing' ? 'rgba(45, 212, 160, 0.1)' : 'rgba(224, 168, 78, 0.1)',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.04em',
                }}>
                  {sub.status === 'trialing' ? 'Trial' : sub.status}
                </span>
              )}
            </div>

            <div style={{ marginTop: 20 }}>
              {sub?.currentPeriodEnd && (
                <Metric
                  label="Proxima cobranca"
                  value={new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR')}
                />
              )}
              {sub?.price != null && (
                <Metric
                  label="Valor mensal"
                  value={`R$ ${Number(sub.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  color={colors.accent.gold}
                />
              )}
              {sub?.trialEnd && (
                <Metric
                  label="Fim do trial"
                  value={new Date(sub.trialEnd).toLocaleDateString('pt-BR')}
                  color={colors.state.warning}
                />
              )}
            </div>

            {/* Cancel Subscription */}
            {sub?.status === 'active' && !cancelled && (
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                style={{
                  marginTop: 20,
                  padding: '10px 20px',
                  background: 'transparent',
                  border: `1px solid ${colors.state?.warning || '#E0A84E'}`,
                  borderRadius: 8,
                  color: colors.state?.warning || '#E0A84E',
                  fontFamily: typography.fontFamily.display,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: cancelling ? 0.5 : 1,
                }}
              >
                {cancelling ? 'Cancelando...' : 'Cancelar Assinatura'}
              </button>
            )}
            {cancelled && (
              <div style={{ marginTop: 16, fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.state?.success || '#2DD4A0' }}>
                Assinatura cancelada com sucesso.
              </div>
            )}
          </Card>

          <Card style={{ padding: 28 }}>
            <Lbl>Metodos de Pagamento</Lbl>
            {paymentMethods.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: 20,
                color: colors.text.dust,
                fontFamily: typography.fontFamily.sans,
                fontSize: 13,
              }}>
                Nenhum metodo cadastrado
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {paymentMethods.map((pm: any, i: number) => (
                  <div
                    key={pm.id || i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      background: colors.background.nebula,
                      borderRadius: 8,
                      border: `1px solid ${colors.border.void}`,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>&#128179;</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: typography.fontFamily.display, fontSize: 13, fontWeight: 600, color: colors.text.starlight }}>
                        {pm.brand || pm.type || 'Cartao'} **** {pm.last4 || '****'}
                      </div>
                      {pm.expiryMonth && (
                        <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 11, color: colors.text.dust }}>
                          {pm.expiryMonth}/{pm.expiryYear}
                        </div>
                      )}
                    </div>
                    {pm.isDefault && (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: colors.accent.webb,
                        fontFamily: typography.fontFamily.display,
                      }}>
                        Padrao
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Usage Stats */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{
            fontFamily: typography.fontFamily.display,
            fontSize: 16,
            fontWeight: 600,
            color: colors.text.starlight,
            marginBottom: 16,
          }}>
            Consumo
          </h2>
          {!usageData ? (
            <Card>
              <div style={{ textAlign: 'center', padding: 24, color: colors.text.dust, fontFamily: typography.fontFamily.sans, fontSize: 14 }}>
                Dados de consumo indisponiveis.
              </div>
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {[
                { label: 'Mensagens Enviadas', value: usageData.messagesSent ?? usageData.messages ?? 0, limit: usageData.messagesLimit },
                { label: 'Conversas Ativas', value: usageData.activeConversations ?? usageData.conversations ?? 0, limit: usageData.conversationsLimit },
                { label: 'Contatos', value: usageData.contacts ?? 0, limit: usageData.contactsLimit },
                { label: 'Armazenamento', value: usageData.storageMB ? `${usageData.storageMB} MB` : (usageData.storage ?? '0 MB'), limit: usageData.storageLimit },
              ].map((item) => (
                <Card key={item.label}>
                  <Lbl>{item.label}</Lbl>
                  <Val size={22}>{item.value}</Val>
                  {item.limit && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{
                        height: 4,
                        borderRadius: 2,
                        background: colors.background.nebula,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          borderRadius: 2,
                          width: `${Math.min(100, (Number(String(item.value).replace(/[^\d]/g, '')) / Number(String(item.limit).replace(/[^\d]/g, ''))) * 100)}%`,
                          background: colors.accent.webb,
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                      <div style={{ fontSize: 11, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
                        de {item.limit}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
