'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWalletBalance, useWalletTransactions } from '@/hooks/useWallet';
import { apiFetch, tokenStorage } from '@/lib/api';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { Metric } from '@/components/kloel/Metric';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function SaquesPage() {
  const router = useRouter();
  const { balance, isLoading: balLoading } = useWalletBalance();
  const { transactions, isLoading: txLoading } = useWalletTransactions();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'pix' | 'bank'>('pix');
  const [pixKey, setPixKey] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const isLoading = balLoading || txLoading;
  const bal = balance as any;
  const available = bal?.available ?? bal?.balance ?? bal?.amount ?? 0;

  const withdrawals = (transactions || []).filter(
    (tx: any) => tx.type === 'withdrawal' || tx.type === 'payout' || tx.type === 'saque'
  );

  const handleSubmit = async () => {
    const numAmount = Number(amount.replace(',', '.'));
    if (!numAmount || numAmount <= 0 || numAmount > available) return;
    if (method === 'pix' && !pixKey.trim()) return;
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) return;
    try {
      await apiFetch(`/kloel/wallet/${encodeURIComponent(workspaceId)}/withdraw`, {
        method: 'POST',
        body: { amount: numAmount, method, pixKey },
      });
      setSubmitted(true);
    } catch (e) {
      console.error('Withdrawal failed', e);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: colors.background.void }}>
        <div style={{width:20,height:20,border:'2px solid transparent',borderTopColor:'#E85D30',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
      </div>
    );
  }

  return (
    <div style={{ padding: 32, position: 'relative', minHeight: '100vh', background: colors.background.void }}>
      
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 900 }}>
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
          title="Saques"
          sub="Solicite a transferencia do seu saldo disponivel"
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Withdrawal Form */}
          <Card style={{ padding: 28 }}>
            <Lbl>Saldo Disponivel para Saque</Lbl>
            <Val size={28} color={colors.state.success}>
              R$ {Number(available).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>

            {submitted ? (
              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>&#9989;</div>
                <div style={{
                  fontFamily: typography.fontFamily.display,
                  fontSize: 16,
                  fontWeight: 600,
                  color: colors.state.success,
                  marginBottom: 8,
                }}>
                  Saque solicitado com sucesso!
                </div>
                <div style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: 13,
                  color: colors.text.moonlight,
                  marginBottom: 20,
                }}>
                  R$ {Number(amount.replace(',', '.')).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} via {method === 'pix' ? 'PIX' : 'Transferencia Bancaria'}
                </div>
                <button
                  onClick={() => { setSubmitted(false); setAmount(''); setPixKey(''); }}
                  style={{
                    padding: '10px 20px',
                    background: colors.background.nebula,
                    border: `1px solid ${colors.border.space}`,
                    borderRadius: 6,
                    color: colors.text.starlight,
                    fontFamily: typography.fontFamily.display,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Novo Saque
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Method Toggle */}
                <div>
                  <Lbl>Metodo</Lbl>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {(['pix', 'bank'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMethod(m)}
                        style={{
                          flex: 1,
                          padding: '10px 16px',
                          background: method === m ? 'rgba(232, 93, 48, 0.12)' : 'transparent',
                          border: `1px solid ${method === m ? colors.accent.webb : colors.border.space}`,
                          borderRadius: 6,
                          color: method === m ? colors.accent.webb : colors.text.moonlight,
                          fontFamily: typography.fontFamily.display,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
                        }}
                      >
                        {m === 'pix' ? 'PIX' : 'Transferencia'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <Lbl>Valor (R$)</Lbl>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="0,00"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: colors.background.nebula,
                      border: `1px solid ${colors.border.space}`,
                      borderRadius: 6,
                      color: colors.text.starlight,
                      fontFamily: typography.fontFamily.display,
                      fontSize: 20,
                      fontWeight: 600,
                      outline: 'none',
                      marginTop: 4,
                    }}
                  />
                  <button
                    onClick={() => setAmount(String(available))}
                    style={{
                      marginTop: 6,
                      background: 'none',
                      border: 'none',
                      color: colors.accent.webb,
                      fontFamily: typography.fontFamily.sans,
                      fontSize: 12,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Sacar tudo
                  </button>
                </div>

                {/* PIX Key */}
                {method === 'pix' && (
                  <div>
                    <Lbl>Chave PIX</Lbl>
                    <input
                      type="text"
                      value={pixKey}
                      onChange={(e) => setPixKey(e.target.value)}
                      placeholder="CPF, email, telefone ou chave aleatoria"
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: colors.background.nebula,
                        border: `1px solid ${colors.border.space}`,
                        borderRadius: 6,
                        color: colors.text.starlight,
                        fontFamily: typography.fontFamily.sans,
                        fontSize: 14,
                        outline: 'none',
                        marginTop: 4,
                      }}
                    />
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!amount || Number(amount.replace(',', '.')) <= 0 || Number(amount.replace(',', '.')) > available}
                  style={{
                    padding: '14px 24px',
                    background: colors.accent.webb,
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    fontFamily: typography.fontFamily.display,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: (!amount || Number(amount.replace(',', '.')) <= 0) ? 0.5 : 1,
                    marginTop: 4,
                  }}
                >
                  Solicitar Saque
                </button>
              </div>
            )}
          </Card>

          {/* Withdrawal History */}
          <Card style={{ padding: 28 }}>
            <Lbl>Historico de Saques</Lbl>
            {withdrawals.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: 32,
                color: colors.text.dust,
                fontFamily: typography.fontFamily.sans,
                fontSize: 14,
              }}>
                Nenhum saque realizado ainda.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 12 }}>
                {withdrawals.map((tx: any, i: number) => (
                  <div
                    key={tx.id || tx._id || i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 0',
                      borderBottom: i < withdrawals.length - 1 ? `1px solid ${colors.border.void}` : 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.starlight }}>
                        {tx.description || 'Saque'}
                      </div>
                      <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 11, color: colors.text.dust, marginTop: 2 }}>
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('pt-BR') : '--'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: typography.fontFamily.display, fontSize: 14, fontWeight: 600, color: colors.text.starlight }}>
                        R$ {Math.abs(tx.amount || tx.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        fontFamily: typography.fontFamily.display,
                        color: tx.status === 'completed' || tx.status === 'paid' ? colors.state.success
                          : tx.status === 'pending' ? colors.accent.gold
                          : colors.text.dust,
                      }}>
                        {tx.status || 'processando'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
