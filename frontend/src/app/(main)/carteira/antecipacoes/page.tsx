'use client';

import { useState } from 'react';
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

export default function AntecipacoesPage() {
  const router = useRouter();
  const { balance, isLoading: balLoading } = useWalletBalance();
  const { transactions, isLoading: txLoading } = useWalletTransactions();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isLoading = balLoading || txLoading;
  const bal = balance as any;

  const pending = bal?.pending ?? bal?.blocked ?? 0;
  const available = bal?.available ?? bal?.balance ?? bal?.amount ?? 0;
  const anticipatable = bal?.anticipatable ?? pending;

  // Fee: 3.5% is a common anticipation fee placeholder
  const feeRate = 0.035;
  const requestedAmount = parseFloat(amount) || 0;
  const fee = requestedAmount * feeRate;
  const netAmount = requestedAmount - fee;

  // Filter anticipation-related transactions
  const anticipationHistory = (transactions || []).filter(
    (tx: any) => tx.type === 'anticipation' || tx.type === 'antecipacao' || tx.category === 'anticipation',
  );

  const handleSubmit = async () => {
    if (requestedAmount <= 0 || requestedAmount > anticipatable) return;
    setSubmitting(true);
    // Placeholder: in production would call anticipation API
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      setAmount('');
    }, 1500);
  };

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
          title="Antecipacoes"
          sub="Solicite a antecipacao do saldo pendente"
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

        {/* Balance Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <Card style={{ padding: 24 }}>
            <Lbl>Saldo Disponivel</Lbl>
            <Val size={28} color={colors.state.success}>
              R$ {Number(available).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              ja liberado
            </div>
          </Card>
          <Card style={{ padding: 24 }}>
            <Lbl>Saldo Pendente</Lbl>
            <Val size={28} color={colors.accent.gold}>
              R$ {Number(pending).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              aguardando liberacao
            </div>
          </Card>
          <Card style={{ padding: 24 }}>
            <Lbl>Disponivel para Antecipacao</Lbl>
            <Val size={28} color={colors.accent.webb}>
              R$ {Number(anticipatable).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 4 }}>
              valor antecipavel
            </div>
          </Card>
        </div>

        {/* Anticipation Form */}
        <h2 style={{
          fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600,
          color: colors.text.starlight, marginBottom: 16,
        }}>
          Solicitar Antecipacao
        </h2>

        <Card style={{ marginBottom: 32 }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', margin: '0 auto 12px',
                background: 'rgba(45, 212, 160, 0.1)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.state.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div style={{ fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600, color: colors.state.success, marginBottom: 6 }}>
                Solicitacao enviada!
              </div>
              <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.dust, marginBottom: 16 }}>
                Sua antecipacao esta sendo processada. O valor sera creditado em breve.
              </div>
              <button
                onClick={() => setSubmitted(false)}
                style={{
                  padding: '8px 20px',
                  background: 'rgba(78, 122, 224, 0.08)',
                  border: `1px solid ${colors.border.space}`,
                  borderRadius: 8,
                  color: colors.accent.webb,
                  fontFamily: typography.fontFamily.display,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Nova solicitacao
              </button>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 20 }}>
                <label style={{
                  display: 'block',
                  fontFamily: typography.fontFamily.display,
                  fontSize: 12, fontWeight: 600, color: colors.text.moonlight,
                  marginBottom: 8, letterSpacing: '0.04em',
                }}>
                  Valor a antecipar (R$)
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  min="0"
                  max={anticipatable}
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: colors.background.nebula,
                    border: `1px solid ${colors.border.space}`,
                    borderRadius: 10,
                    color: colors.text.starlight,
                    fontFamily: typography.fontFamily.display,
                    fontSize: 18,
                    fontWeight: 600,
                    outline: 'none',
                    boxSizing: 'border-box' as const,
                  }}
                />
                {requestedAmount > anticipatable && (
                  <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.state.error, marginTop: 6 }}>
                    Valor excede o saldo antecipavel
                  </div>
                )}
              </div>

              {/* Fee Info */}
              {requestedAmount > 0 && requestedAmount <= anticipatable && (
                <Card style={{
                  marginBottom: 20,
                  background: 'rgba(201, 168, 76, 0.04)',
                  border: `1px solid rgba(201, 168, 76, 0.15)`,
                }}>
                  <Metric label="Valor solicitado" value={`R$ ${requestedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                  <Metric label={`Taxa de antecipacao (${(feeRate * 100).toFixed(1)}%)`} value={`- R$ ${fee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} color={colors.state.warning} />
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 0', marginTop: 4,
                  }}>
                    <span style={{ fontFamily: typography.fontFamily.display, fontSize: 14, fontWeight: 600, color: colors.text.starlight }}>
                      Valor liquido
                    </span>
                    <span style={{ fontFamily: typography.fontFamily.display, fontSize: 18, fontWeight: 700, color: colors.state.success }}>
                      R$ {netAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </Card>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || requestedAmount <= 0 || requestedAmount > anticipatable}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  background: requestedAmount > 0 && requestedAmount <= anticipatable ? colors.accent.webb : colors.background.nebula,
                  border: 'none',
                  borderRadius: 10,
                  color: requestedAmount > 0 && requestedAmount <= anticipatable ? '#fff' : colors.text.dust,
                  fontFamily: typography.fontFamily.display,
                  fontSize: 14, fontWeight: 600,
                  cursor: requestedAmount > 0 && requestedAmount <= anticipatable && !submitting ? 'pointer' : 'not-allowed',
                  transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Processando...' : 'Solicitar antecipacao'}
              </button>
            </div>
          )}
        </Card>

        {/* History */}
        <h2 style={{
          fontFamily: typography.fontFamily.display, fontSize: 16, fontWeight: 600,
          color: colors.text.starlight, marginBottom: 16,
        }}>
          Historico de Antecipacoes
        </h2>

        {anticipationHistory.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 24, color: colors.text.dust, fontFamily: typography.fontFamily.sans, fontSize: 14 }}>
              Nenhuma antecipacao solicitada ainda. As solicitacoes aparecerao aqui.
            </div>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {anticipationHistory.map((tx: any, i: number) => (
              <div
                key={tx.id || tx._id || i}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px',
                  borderBottom: i < anticipationHistory.length - 1 ? `1px solid ${colors.border.void}` : 'none',
                }}
              >
                <div>
                  <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.starlight }}>
                    {tx.description || 'Antecipacao'}
                  </div>
                  <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 11, color: colors.text.dust, marginTop: 2 }}>
                    {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('pt-BR') : tx.date || '--'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: typography.fontFamily.display, fontSize: 14, fontWeight: 600, color: colors.state.success }}>
                    R$ {Math.abs(tx.amount || tx.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                    fontFamily: typography.fontFamily.display,
                    color: tx.status === 'completed' || tx.status === 'paid' ? colors.state.success : colors.accent.gold,
                    background: tx.status === 'completed' || tx.status === 'paid' ? 'rgba(45, 212, 160, 0.1)' : 'rgba(201, 168, 76, 0.1)',
                    textTransform: 'uppercase' as const,
                  }}>
                    {tx.status || 'processando'}
                  </span>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
