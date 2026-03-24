'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWalletTransactions } from '@/hooks/useWallet';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { OrbitalLoader } from '@/components/kloel/cosmos/OrbitalLoader';
import { StarField } from '@/components/kloel/cosmos/StarField';
import { colors, typography, motion } from '@/lib/design-tokens';

type FilterType = 'all' | 'credit' | 'debit';

export default function ExtratoPage() {
  const router = useRouter();
  const { transactions, isLoading } = useWalletTransactions();
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');

  const allTx = transactions || [];

  const filtered = allTx.filter((tx: any) => {
    const isCredit = tx.type === 'credit' || tx.type === 'sale' || (tx.amount || 0) > 0;
    if (filter === 'credit' && !isCredit) return false;
    if (filter === 'debit' && isCredit) return false;
    if (search) {
      const text = `${tx.description || ''} ${tx.title || ''} ${tx.type || ''}`.toLowerCase();
      if (!text.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const totalCredit = allTx
    .filter((tx: any) => tx.type === 'credit' || tx.type === 'sale' || (tx.amount || 0) > 0)
    .reduce((s: number, tx: any) => s + Math.abs(tx.amount || tx.value || 0), 0);
  const totalDebit = allTx
    .filter((tx: any) => tx.type === 'debit' || tx.type === 'withdrawal' || (tx.amount || 0) < 0)
    .reduce((s: number, tx: any) => s + Math.abs(tx.amount || tx.value || 0), 0);

  return (
    <div style={{ padding: 32, position: 'relative', minHeight: '100vh', background: colors.background.void }}>
      <StarField density={30} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960 }}>
        <button
          onClick={() => router.push('/carteira')}
          style={{
            background: 'none',
            border: 'none',
            color: colors.accent.webb,
            fontFamily: typography.fontFamily.sans,
            fontSize: 12,
            cursor: 'pointer',
            padding: 0,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          &#8592; Voltar para Carteira
        </button>

        <PageTitle
          title="Extrato"
          sub={`${allTx.length} transacoes registradas`}
        />

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <Card>
            <Lbl>Total Entradas</Lbl>
            <Val size={22} color={colors.state.success}>
              R$ {totalCredit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
          </Card>
          <Card>
            <Lbl>Total Saidas</Lbl>
            <Val size={22} color={colors.state.error}>
              R$ {totalDebit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
          </Card>
          <Card>
            <Lbl>Saldo Liquido</Lbl>
            <Val size={22}>
              R$ {(totalCredit - totalDebit).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
          </Card>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              placeholder="Buscar transacao..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 16px 10px 38px',
                background: colors.background.nebula,
                border: `1px solid ${colors.border.space}`,
                borderRadius: 10,
                color: colors.text.starlight,
                fontFamily: typography.fontFamily.sans,
                fontSize: 14,
                outline: 'none',
              }}
            />
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.4 }}>&#128269;</span>
          </div>
          {(['all', 'credit', 'debit'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '10px 16px',
                background: filter === f ? 'rgba(78, 122, 224, 0.12)' : 'transparent',
                border: `1px solid ${filter === f ? colors.accent.webb : colors.border.space}`,
                borderRadius: 10,
                color: filter === f ? colors.accent.webb : colors.text.moonlight,
                fontFamily: typography.fontFamily.display,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
              }}
            >
              {f === 'all' ? 'Todas' : f === 'credit' ? 'Entradas' : 'Saidas'}
            </button>
          ))}
        </div>

        {/* Transaction List */}
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <OrbitalLoader size={36} />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, color: colors.text.dust, fontFamily: typography.fontFamily.sans, fontSize: 14 }}>
              {search ? 'Nenhuma transacao encontrada para essa busca.' : 'Nenhuma transacao registrada.'}
            </div>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border.void}` }}>
                  {['Data', 'Descricao', 'Tipo', 'Valor'].map((h) => (
                    <th key={h} style={{
                      padding: '12px 16px',
                      fontFamily: typography.fontFamily.display,
                      fontSize: 11,
                      fontWeight: 600,
                      color: colors.text.dust,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.08em',
                      textAlign: 'left',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx: any, i: number) => {
                  const isCredit = tx.type === 'credit' || tx.type === 'sale' || (tx.amount || 0) > 0;
                  return (
                    <tr key={tx.id || tx._id || i} style={{ borderBottom: `1px solid ${colors.border.void}` }}>
                      <td style={{ padding: '12px 16px', fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.moonlight }}>
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('pt-BR') : tx.date || '--'}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.starlight }}>
                        {tx.description || tx.title || tx.type || 'Transacao'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          fontFamily: typography.fontFamily.display,
                          color: isCredit ? colors.state.success : colors.state.error,
                          background: isCredit ? 'rgba(45, 212, 160, 0.1)' : 'rgba(224, 82, 82, 0.1)',
                          textTransform: 'uppercase' as const,
                        }}>
                          {isCredit ? 'entrada' : 'saida'}
                        </span>
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        fontFamily: typography.fontFamily.display,
                        fontSize: 14,
                        fontWeight: 600,
                        color: isCredit ? colors.state.success : colors.state.error,
                      }}>
                        {isCredit ? '+' : '-'} R$ {Math.abs(tx.amount || tx.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
