'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWalletTransactions } from '@/hooks/useWallet';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { Metric } from '@/components/kloel/Metric';
import { OrbitalLoader } from '@/components/kloel/cosmos/OrbitalLoader';
import { StarField } from '@/components/kloel/cosmos/StarField';
import { colors, typography } from '@/lib/design-tokens';

export default function MovimentacoesPage() {
  const router = useRouter();
  const { transactions, isLoading } = useWalletTransactions();

  // Filter transactions to current month
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthTransactions = useMemo(() => {
    return (transactions || []).filter((tx: any) => {
      const txDate = tx.createdAt || tx.date;
      if (!txDate) return true; // include if no date
      const d = new Date(txDate);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
  }, [transactions, currentMonth, currentYear]);

  const totalIn = monthTransactions.reduce((sum: number, tx: any) => {
    const amount = tx.amount || tx.value || 0;
    const isCredit = tx.type === 'credit' || tx.type === 'sale' || tx.type === 'refund_reversal' || amount > 0;
    return isCredit ? sum + Math.abs(amount) : sum;
  }, 0);

  const totalOut = monthTransactions.reduce((sum: number, tx: any) => {
    const amount = tx.amount || tx.value || 0;
    const isDebit = tx.type === 'debit' || tx.type === 'withdrawal' || tx.type === 'refund' || tx.type === 'fee' || amount < 0;
    return isDebit ? sum + Math.abs(amount) : sum;
  }, 0);

  const net = totalIn - totalOut;

  const monthName = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

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
          title="Movimentacoes do Mes"
          sub={`Transacoes de ${monthName}`}
          right={
            <button
              onClick={() => router.push('/carteira')}
              style={{
                padding: '8px 16px',
                background: 'rgba(78, 122, 224, 0.08)',
                border: `1px solid ${colors.border.space}`,
                borderRadius: 8,
                color: colors.accent.webb,
                fontFamily: typography.fontFamily.display,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Voltar para Carteira
            </button>
          }
        />

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
          <Card style={{ padding: 24 }}>
            <Lbl>Total de Entradas</Lbl>
            <Val size={28} color={colors.state.success}>
              R$ {totalIn.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              creditos no periodo
            </div>
          </Card>
          <Card style={{ padding: 24 }}>
            <Lbl>Total de Saidas</Lbl>
            <Val size={28} color={colors.state.error}>
              R$ {totalOut.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              debitos no periodo
            </div>
          </Card>
          <Card style={{ padding: 24 }}>
            <Lbl>Saldo Liquido</Lbl>
            <Val size={28} color={net >= 0 ? colors.state.success : colors.state.error}>
              {net >= 0 ? '+' : '-'} R$ {Math.abs(net).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              entradas - saidas
            </div>
          </Card>
        </div>

        {/* Transaction Table */}
        <h2 style={{
          fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600,
          color: colors.text.starlight, marginBottom: 16,
        }}>
          Detalhamento ({monthTransactions.length} transacoes)
        </h2>

        {monthTransactions.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, position: 'relative' }}>
              <StarField density={20} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ marginBottom: 12 }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.text.dust} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <div style={{ fontFamily: typography.fontFamily.display, fontSize: 15, fontWeight: 600, color: colors.text.moonlight, marginBottom: 6 }}>
                  Nenhuma movimentacao neste mes
                </div>
                <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.dust }}>
                  As transacoes aparecerao aqui conforme vendas e movimentacoes forem registradas.
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border.void}` }}>
                  {['Descricao', 'Tipo', 'Data', 'Valor'].map((h) => (
                    <th key={h} style={{
                      padding: '12px 16px', fontFamily: typography.fontFamily.display,
                      fontSize: 11, fontWeight: 600, color: colors.text.dust,
                      textTransform: 'uppercase' as const, letterSpacing: '0.08em', textAlign: 'left',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthTransactions.map((tx: any, i: number) => {
                  const amount = tx.amount || tx.value || 0;
                  const isCredit = tx.type === 'credit' || tx.type === 'sale' || tx.type === 'refund_reversal' || amount > 0;
                  return (
                    <tr key={tx.id || tx._id || i} style={{ borderBottom: `1px solid ${colors.border.void}` }}>
                      <td style={{ padding: '12px 16px', fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.starlight }}>
                        {tx.description || tx.title || tx.type || 'Transacao'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          fontFamily: typography.fontFamily.display,
                          color: isCredit ? colors.state.success : colors.state.error,
                          background: isCredit ? 'rgba(45, 212, 160, 0.1)' : 'rgba(224, 82, 82, 0.1)',
                          textTransform: 'uppercase' as const,
                        }}>
                          {isCredit ? 'entrada' : 'saida'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.dust }}>
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('pt-BR') : tx.date || '--'}
                      </td>
                      <td style={{
                        padding: '12px 16px', fontFamily: typography.fontFamily.display, fontSize: 13, fontWeight: 600,
                        color: isCredit ? colors.state.success : colors.state.error,
                      }}>
                        {isCredit ? '+' : '-'} R$ {Math.abs(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
