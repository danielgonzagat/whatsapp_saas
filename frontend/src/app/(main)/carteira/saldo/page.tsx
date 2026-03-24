'use client';

import { useRouter } from 'next/navigation';
import { useWalletBalance } from '@/hooks/useWallet';
import { Card } from '@/components/kloel/Card';
import { PageTitle } from '@/components/kloel/PageTitle';
import { Lbl } from '@/components/kloel/Lbl';
import { Val } from '@/components/kloel/Val';
import { Metric } from '@/components/kloel/Metric';
import { OrbitalLoader } from '@/components/kloel/cosmos/OrbitalLoader';
import { StarField } from '@/components/kloel/cosmos/StarField';
import { colors, typography, motion } from '@/lib/design-tokens';

export default function SaldoPage() {
  const router = useRouter();
  const { balance, isLoading } = useWalletBalance();
  const bal = balance as any;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: colors.background.void }}>
        <OrbitalLoader size={36} />
      </div>
    );
  }

  const available = bal?.available ?? bal?.balance ?? bal?.amount ?? 0;
  const pending = bal?.pending ?? bal?.blocked ?? 0;
  const locked = bal?.locked ?? 0;
  const total = available + pending + locked;
  const lastUpdated = bal?.updatedAt ? new Date(bal.updatedAt).toLocaleString('pt-BR') : '--';

  return (
    <div style={{ padding: 32, position: 'relative', minHeight: '100vh', background: colors.background.void }}>
      <StarField density={30} />
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
          title="Saldo Detalhado"
          sub={`Ultima atualizacao: ${lastUpdated}`}
        />

        {/* Main Balance */}
        <Card style={{ padding: 32, marginBottom: 24, textAlign: 'center' }}>
          <Lbl>Saldo Total</Lbl>
          <div style={{ marginTop: 8 }}>
            <Val size={42} color={colors.text.starlight}>
              R$ {Number(total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
          </div>
        </Card>

        {/* Breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
          <Card style={{ padding: 24, borderTop: `3px solid ${colors.state.success}` }}>
            <Lbl>Disponivel</Lbl>
            <Val size={24} color={colors.state.success}>
              R$ {Number(available).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 6 }}>
              Pode ser sacado imediatamente
            </div>
          </Card>
          <Card style={{ padding: 24, borderTop: `3px solid ${colors.accent.gold}` }}>
            <Lbl>Pendente</Lbl>
            <Val size={24} color={colors.accent.gold}>
              R$ {Number(pending).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 6 }}>
              Aguardando periodo de garantia
            </div>
          </Card>
          <Card style={{ padding: 24, borderTop: `3px solid ${colors.accent.nebula}` }}>
            <Lbl>Bloqueado</Lbl>
            <Val size={24} color={colors.accent.nebula}>
              R$ {Number(locked).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Val>
            <div style={{ fontSize: 12, color: colors.text.dust, fontFamily: typography.fontFamily.sans, marginTop: 6 }}>
              Em disputa ou estorno
            </div>
          </Card>
        </div>

        {/* Additional Info */}
        <Card style={{ padding: 24 }}>
          <Lbl>Detalhes</Lbl>
          <div style={{ marginTop: 8 }}>
            <Metric label="Moeda" value={bal?.currency || 'BRL'} />
            <Metric label="Conta" value={bal?.accountId || bal?.account || '--'} />
            <Metric label="Tipo" value={bal?.accountType || 'Produtor'} />
            {bal?.nextRelease && (
              <Metric label="Proxima liberacao" value={new Date(bal.nextRelease).toLocaleDateString('pt-BR')} color={colors.accent.gold} />
            )}
          </div>
        </Card>

        {/* Action */}
        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <button
            onClick={() => router.push('/carteira/saques')}
            style={{
              padding: '12px 24px',
              background: colors.accent.webb,
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontFamily: typography.fontFamily.display,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Solicitar Saque
          </button>
          <button
            onClick={() => router.push('/carteira/extrato')}
            style={{
              padding: '12px 24px',
              background: colors.background.nebula,
              border: `1px solid ${colors.border.space}`,
              borderRadius: 10,
              color: colors.text.starlight,
              fontFamily: typography.fontFamily.display,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Ver Extrato
          </button>
        </div>
      </div>
    </div>
  );
}
