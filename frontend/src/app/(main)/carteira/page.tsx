'use client';

import { useRouter } from 'next/navigation';
import { useWalletBalance, useWalletTransactions } from '@/hooks/useWallet';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { Metric } from '@/components/kloel/Metric';
import { OrbitalLoader } from '@/components/kloel/cosmos/OrbitalLoader';
import { StarField } from '@/components/kloel/cosmos/StarField';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function CarteiraPage() {
  const router = useRouter();
  const { balance, isLoading: balLoading } = useWalletBalance();
  const { transactions, isLoading: txLoading } = useWalletTransactions();

  const isLoading = balLoading || txLoading;
  const bal = balance as any;

  const available = bal?.available ?? bal?.balance ?? bal?.amount ?? 0;
  const pending = bal?.pending ?? bal?.blocked ?? 0;
  const total = available + pending;

  const recentTx = (transactions || []).slice(0, 8);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: colors.background.void }}>
        <OrbitalLoader size={36} />
      </div>
    );
  }

  return (
    <div style={{ padding: 32, position: 'relative', minHeight: '100vh', background: colors.background.void }}>
      <StarField density={35} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960 }}>
        <PageTitle
          title="Carteira"
          sub="Gerencie seu saldo, transacoes e saques"
        />

        {/* Balance Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
          <Card style={{ padding: 24 }}>
            <Lbl>Saldo Disponivel</Lbl>
            <Val size={32} color={colors.state.success}>
              R$ {Number(available).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 6 }}>
              pronto para saque
            </div>
          </Card>
          <Card style={{ padding: 24 }}>
            <Lbl>Saldo Pendente</Lbl>
            <Val size={32} color={colors.accent.gold}>
              R$ {Number(pending).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 6 }}>
              aguardando liberacao
            </div>
          </Card>
          <Card style={{ padding: 24 }}>
            <Lbl>Saldo Total</Lbl>
            <Val size={32}>
              R$ {Number(total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 6 }}>
              disponivel + pendente
            </div>
          </Card>
        </div>

        {/* Quick Navigation */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
          {[
            { label: 'Ver Saldo Detalhado', href: '/carteira/saldo', icon: '\u{1F4B0}' },
            { label: 'Extrato Completo', href: '/carteira/extrato', icon: '\u{1F4CB}' },
            { label: 'Solicitar Saque', href: '/carteira/saques', icon: '\u{1F3E6}' },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => router.push(item.href)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '14px 20px',
                background: 'rgba(78, 122, 224, 0.06)',
                border: `1px solid ${colors.border.space}`,
                borderRadius: 10,
                color: colors.accent.webb,
                fontFamily: typography.fontFamily.display,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
              }}
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        {/* Mini Chart Placeholder */}
        <Card style={{ marginBottom: 32, padding: 24 }}>
          <Lbl>Evolucao do Saldo (30 dias)</Lbl>
          <div style={{
            height: 120,
            marginTop: 12,
            background: `linear-gradient(180deg, rgba(78, 122, 224, 0.06) 0%, transparent 100%)`,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 2,
            padding: '0 8px 8px 8px',
          }}>
            {Array.from({ length: 30 }, (_, i) => {
              const height = 20 + Math.sin(i * 0.3) * 15 + i * 2.5;
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${Math.min(100, height)}%`,
                    background: i === 29 ? colors.accent.webb : 'rgba(78, 122, 224, 0.3)',
                    borderRadius: '2px 2px 0 0',
                    minWidth: 2,
                  }}
                />
              );
            })}
          </div>
        </Card>

        {/* Recent Transactions */}
        <h2 style={{
          fontFamily: typography.fontFamily.display,
          fontSize: 16,
          fontWeight: 600,
          color: colors.text.starlight,
          marginBottom: 16,
        }}>
          Transacoes Recentes
        </h2>
        {recentTx.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 24, color: colors.text.dust, fontFamily: typography.fontFamily.sans, fontSize: 14 }}>
              Nenhuma transacao registrada ainda.
            </div>
          </Card>
        ) : (
          <Card style={{ padding: 0 }}>
            {recentTx.map((tx: any, i: number) => {
              const isCredit = tx.type === 'credit' || tx.type === 'sale' || tx.type === 'refund_reversal' || (tx.amount || 0) > 0;
              return (
                <div
                  key={tx.id || tx._id || i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 20px',
                    borderBottom: i < recentTx.length - 1 ? `1px solid ${colors.border.void}` : 'none',
                  }}
                >
                  <div>
                    <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.starlight }}>
                      {tx.description || tx.title || tx.type || 'Transacao'}
                    </div>
                    <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 11, color: colors.text.dust, marginTop: 2 }}>
                      {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('pt-BR') : tx.date || '--'}
                    </div>
                  </div>
                  <Metric
                    label=""
                    value={`${isCredit ? '+' : '-'} R$ ${Math.abs(tx.amount || tx.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    color={isCredit ? colors.state.success : colors.state.error}
                  />
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
