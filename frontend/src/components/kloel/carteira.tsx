'use client';

import { useState, useCallback, CSSProperties, ReactNode } from 'react';
import { colors, typography, motion, radius } from '@/lib/design-tokens';

/*
  KLOEL — Carteira (Wallet)

  Painel financeiro completo com 5 abas:
  Saldo, Extrato, Movimentacoes, Saques, Antecipacoes

  Mock data para demonstracao.
  Usa design tokens do Monitor.
*/

// ════════════════════════════════════════════
// ICONS (inline SVG components)
// ════════════════════════════════════════════

function IC({ d, size = 16, color = 'currentColor' }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  wallet: 'M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 12a1 1 0 1 1 0 2 1 1 0 0 1 0-2z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  calendar: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 2v4M8 2v4M3 10h18',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  zap: 'M13 2L3 14h9l-1 10 10-12h-9l1-10z',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 16v-4M12 8h.01',
};

// ════════════════════════════════════════════
// MOCK DATA
// ════════════════════════════════════════════

const BALANCE = {
  available: 12847.50,
  pending: 3420.00,
  blocked: 850.00,
  total: 17117.50,
  lastUpdated: '2026-03-27T14:32:00',
};

const MONTH_DAYS = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  value: 400 + Math.sin(i * 0.4) * 200 + i * 30 + Math.random() * 100,
}));

const TRANSACTIONS = [
  { id: 'tx-001', date: '2026-03-27', type: 'sale', description: 'Venda #4821 — Plano Pro Mensal', amount: 197.00, status: 'completed' },
  { id: 'tx-002', date: '2026-03-27', type: 'sale', description: 'Venda #4820 — Plano Starter', amount: 67.00, status: 'completed' },
  { id: 'tx-003', date: '2026-03-26', type: 'withdrawal', description: 'Saque para Banco Inter •••4521', amount: -2500.00, status: 'completed' },
  { id: 'tx-004', date: '2026-03-26', type: 'sale', description: 'Venda #4819 — Plano Enterprise', amount: 497.00, status: 'pending' },
  { id: 'tx-005', date: '2026-03-25', type: 'refund', description: 'Reembolso #4812 — Plano Starter', amount: -67.00, status: 'completed' },
  { id: 'tx-006', date: '2026-03-25', type: 'sale', description: 'Venda #4818 — Plano Pro Anual', amount: 1970.00, status: 'completed' },
  { id: 'tx-007', date: '2026-03-24', type: 'commission', description: 'Comissao afiliado — Venda #4815', amount: 39.40, status: 'completed' },
  { id: 'tx-008', date: '2026-03-24', type: 'sale', description: 'Venda #4817 — Plano Pro Mensal', amount: 197.00, status: 'completed' },
  { id: 'tx-009', date: '2026-03-23', type: 'withdrawal', description: 'Saque para Nubank •••7832', amount: -5000.00, status: 'completed' },
  { id: 'tx-010', date: '2026-03-23', type: 'sale', description: 'Venda #4816 — Plano Starter', amount: 67.00, status: 'completed' },
  { id: 'tx-011', date: '2026-03-22', type: 'sale', description: 'Venda #4815 — Plano Pro Mensal', amount: 197.00, status: 'completed' },
  { id: 'tx-012', date: '2026-03-21', type: 'anticipation', description: 'Antecipacao aprovada — R$ 3.200', amount: 3200.00, status: 'completed' },
];

const WITHDRAWALS = [
  { id: 'w-001', date: '2026-03-26', bank: 'Banco Inter', account: '•••4521', amount: 2500.00, status: 'completed', pix: 'email@exemplo.com' },
  { id: 'w-002', date: '2026-03-23', bank: 'Nubank', account: '•••7832', amount: 5000.00, status: 'completed', pix: '***.***.***-00' },
  { id: 'w-003', date: '2026-03-18', bank: 'Banco Inter', account: '•••4521', amount: 3000.00, status: 'completed', pix: 'email@exemplo.com' },
  { id: 'w-004', date: '2026-03-12', bank: 'Nubank', account: '•••7832', amount: 4200.00, status: 'completed', pix: '***.***.***-00' },
];

const ANTICIPATIONS = [
  { id: 'a-001', date: '2026-03-21', amount: 3200.00, fee: 96.00, net: 3104.00, status: 'completed', installments: 6 },
  { id: 'a-002', date: '2026-03-10', amount: 5000.00, fee: 175.00, net: 4825.00, status: 'completed', installments: 10 },
  { id: 'a-003', date: '2026-02-28', amount: 2000.00, fee: 50.00, net: 1950.00, status: 'completed', installments: 4 },
];

// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function statusColor(s: string) {
  switch (s) {
    case 'completed': return colors.text.silver;
    case 'pending': return colors.ember.glow80;
    case 'failed': return colors.state.error;
    default: return colors.text.muted;
  }
}

function statusLabel(s: string) {
  switch (s) {
    case 'completed': return 'Concluido';
    case 'pending': return 'Pendente';
    case 'failed': return 'Falhou';
    case 'processing': return 'Processando';
    default: return s;
  }
}

function typeLabel(t: string) {
  switch (t) {
    case 'sale': return 'Venda';
    case 'withdrawal': return 'Saque';
    case 'refund': return 'Reembolso';
    case 'commission': return 'Comissao';
    case 'anticipation': return 'Antecipacao';
    default: return t;
  }
}

// ════════════════════════════════════════════
// SHARED STYLES
// ════════════════════════════════════════════

const S = {
  card: {
    background: colors.background.surface,
    border: `1px solid ${colors.border.space}`,
    borderRadius: 6,
    padding: 20,
  } as CSSProperties,
  label: {
    fontFamily: typography.fontFamily.sans,
    fontSize: 11,
    fontWeight: 500,
    color: colors.text.muted,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  } as CSSProperties,
  value: {
    fontFamily: typography.fontFamily.mono,
    fontSize: 26,
    fontWeight: 600,
    color: colors.text.silver,
    letterSpacing: '-0.02em',
  } as CSSProperties,
  smallValue: {
    fontFamily: typography.fontFamily.mono,
    fontSize: 14,
    fontWeight: 500,
    color: colors.text.silver,
  } as CSSProperties,
  sub: {
    fontFamily: typography.fontFamily.sans,
    fontSize: 12,
    color: colors.text.dim,
    marginTop: 4,
  } as CSSProperties,
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 0',
    borderBottom: `1px solid ${colors.border.void}`,
  } as CSSProperties,
  badge: (color: string) => ({
    fontFamily: typography.fontFamily.sans,
    fontSize: 10,
    fontWeight: 600,
    color,
    padding: '2px 8px',
    borderRadius: 4,
    background: color === colors.text.silver ? 'rgba(224,221,216,0.06)' : color === colors.ember.glow80 ? 'rgba(232,93,48,0.08)' : 'rgba(232,93,48,0.06)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  }) as CSSProperties,
  btn: (primary = false) => ({
    fontFamily: typography.fontFamily.sans,
    fontSize: 13,
    fontWeight: 600,
    color: primary ? '#0A0A0C' : colors.text.silver,
    background: primary ? colors.ember.primary : 'transparent',
    border: primary ? 'none' : `1px solid ${colors.border.space}`,
    borderRadius: 6,
    padding: '10px 20px',
    cursor: 'pointer',
    transition: `all ${motion.duration.fast} ${motion.easing.gravity}`,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  }) as CSSProperties,
  modalOverlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 9000,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
  } as CSSProperties,
  modalBox: {
    background: colors.background.elevated,
    border: `1px solid ${colors.border.space}`,
    borderRadius: 8,
    padding: 28,
    width: '100%',
    maxWidth: 480,
    position: 'relative' as const,
  } as CSSProperties,
};

// ════════════════════════════════════════════
// TAB CONFIG
// ════════════════════════════════════════════

type TabId = 'saldo' | 'extrato' | 'movimentacoes' | 'saques' | 'antecipacoes';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'saldo', label: 'Saldo', icon: ICONS.wallet },
  { id: 'extrato', label: 'Extrato', icon: ICONS.list },
  { id: 'movimentacoes', label: 'Movimentacoes', icon: ICONS.activity },
  { id: 'saques', label: 'Saques', icon: ICONS.send },
  { id: 'antecipacoes', label: 'Antecipacoes', icon: ICONS.zap },
];

// ════════════════════════════════════════════
// MINI-CHART
// ════════════════════════════════════════════

function MiniChart({ data }: { data: { day: number; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value));
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 2,
      height: 80, padding: '0 4px 4px 4px',
      background: colors.background.void,
      borderRadius: 4,
      marginTop: 12,
    }}>
      {data.map((d, i) => {
        const h = (d.value / max) * 100;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h}%`,
              background: i === data.length - 1 ? colors.ember.primary : colors.ember.glow30,
              borderRadius: '2px 2px 0 0',
              minWidth: 2,
              transition: 'height 0.3s ease',
            }}
            title={`Dia ${d.day}: R$ ${fmt(d.value)}`}
          />
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════
// MODAL COMPONENT
// ════════════════════════════════════════════

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modalBox} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontFamily: typography.fontFamily.sans, fontSize: 16, fontWeight: 600, color: colors.text.silver }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: colors.text.muted }}>
            <IC d={ICONS.x} size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB: SALDO
// ════════════════════════════════════════════

function TabSaldo() {
  const [showBalance, setShowBalance] = useState(true);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {/* Available */}
        <div style={S.card}>
          <div style={S.label}>Saldo Disponivel</div>
          <div style={{ ...S.value, color: colors.text.silver }}>
            {showBalance ? `R$ ${fmt(BALANCE.available)}` : 'R$ ••••••'}
          </div>
          <div style={S.sub}>pronto para saque</div>
        </div>
        {/* Pending */}
        <div style={S.card}>
          <div style={S.label}>Saldo Pendente</div>
          <div style={{ ...S.value, color: colors.ember.glow80 }}>
            {showBalance ? `R$ ${fmt(BALANCE.pending)}` : 'R$ ••••••'}
          </div>
          <div style={S.sub}>aguardando liberacao</div>
        </div>
        {/* Blocked */}
        <div style={S.card}>
          <div style={S.label}>Saldo Bloqueado</div>
          <div style={{ ...S.value, color: colors.text.muted }}>
            {showBalance ? `R$ ${fmt(BALANCE.blocked)}` : 'R$ ••••••'}
          </div>
          <div style={S.sub}>contestacoes / chargebacks</div>
        </div>
      </div>

      {/* Total + toggle */}
      <div style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={S.label}>Saldo Total</div>
          <div style={{ ...S.value, fontSize: 32 }}>
            {showBalance ? `R$ ${fmt(BALANCE.total)}` : 'R$ ••••••'}
          </div>
          <div style={S.sub}>
            Atualizado em {new Date(BALANCE.lastUpdated).toLocaleString('pt-BR')}
          </div>
        </div>
        <button
          onClick={() => setShowBalance(!showBalance)}
          style={{ ...S.btn(), padding: '8px 14px' }}
        >
          <IC d={showBalance ? ICONS.eye : ICONS.eyeOff} size={16} />
          {showBalance ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>

      {/* Mini chart */}
      <div style={S.card}>
        <div style={S.label}>Evolucao do Saldo (30 dias)</div>
        <MiniChart data={MONTH_DAYS} />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB: EXTRATO
// ════════════════════════════════════════════

function TabExtrato() {
  const [filter, setFilter] = useState<string>('all');
  const filtered = filter === 'all' ? TRANSACTIONS : TRANSACTIONS.filter(t => t.type === filter);

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: 'Todos' },
          { id: 'sale', label: 'Vendas' },
          { id: 'withdrawal', label: 'Saques' },
          { id: 'refund', label: 'Reembolsos' },
          { id: 'commission', label: 'Comissoes' },
          { id: 'anticipation', label: 'Antecipacoes' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              fontFamily: typography.fontFamily.sans,
              fontSize: 12,
              fontWeight: filter === f.id ? 600 : 400,
              color: filter === f.id ? colors.ember.primary : colors.text.muted,
              background: filter === f.id ? colors.ember.bg : 'transparent',
              border: `1px solid ${filter === f.id ? colors.ember.glow30 : colors.border.space}`,
              borderRadius: 4,
              padding: '6px 14px',
              cursor: 'pointer',
              transition: `all ${motion.duration.fast} ease`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Transaction list */}
      <div style={S.card}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: colors.text.dim, fontFamily: typography.fontFamily.sans, fontSize: 13 }}>
            Nenhuma transacao encontrada para este filtro.
          </div>
        ) : (
          filtered.map((tx, i) => {
            const isCredit = tx.amount > 0;
            return (
              <div key={tx.id} style={{ ...S.row, borderBottom: i < filtered.length - 1 ? S.row.borderBottom : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.silver, marginBottom: 3 }}>
                    {tx.description}
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontFamily: typography.fontFamily.sans, fontSize: 11, color: colors.text.dim }}>
                      {fmtDate(tx.date)}
                    </span>
                    <span style={S.badge(statusColor(tx.status))}>
                      {statusLabel(tx.status)}
                    </span>
                    <span style={{
                      fontFamily: typography.fontFamily.sans, fontSize: 10, color: colors.text.dim,
                      padding: '1px 6px', background: colors.background.void, borderRadius: 3,
                    }}>
                      {typeLabel(tx.type)}
                    </span>
                  </div>
                </div>
                <div style={{
                  ...S.smallValue,
                  color: isCredit ? colors.text.silver : colors.ember.primary,
                  textAlign: 'right',
                  minWidth: 100,
                }}>
                  {isCredit ? '+' : '-'} R$ {fmt(Math.abs(tx.amount))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB: MOVIMENTACOES
// ════════════════════════════════════════════

function TabMovimentacoes() {
  const income = TRANSACTIONS.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outgoing = TRANSACTIONS.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = income - outgoing;
  const sales = TRANSACTIONS.filter(t => t.type === 'sale').length;
  const refunds = TRANSACTIONS.filter(t => t.type === 'refund').length;

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <div style={S.card}>
          <div style={S.label}>Entradas</div>
          <div style={{ ...S.value, fontSize: 20, color: colors.text.silver }}>R$ {fmt(income)}</div>
          <div style={S.sub}>{sales} vendas</div>
        </div>
        <div style={S.card}>
          <div style={S.label}>Saidas</div>
          <div style={{ ...S.value, fontSize: 20, color: colors.ember.primary }}>R$ {fmt(outgoing)}</div>
          <div style={S.sub}>{refunds} reembolsos</div>
        </div>
        <div style={S.card}>
          <div style={S.label}>Liquido</div>
          <div style={{ ...S.value, fontSize: 20 }}>R$ {fmt(net)}</div>
          <div style={S.sub}>entradas - saidas</div>
        </div>
        <div style={S.card}>
          <div style={S.label}>Ticket Medio</div>
          <div style={{ ...S.value, fontSize: 20 }}>R$ {fmt(sales > 0 ? income / sales : 0)}</div>
          <div style={S.sub}>por venda</div>
        </div>
      </div>

      {/* Daily chart */}
      <div style={S.card}>
        <div style={S.label}>Volume Diario (30 dias)</div>
        <MiniChart data={MONTH_DAYS} />
      </div>

      {/* By type breakdown */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.label}>Movimentacoes por Tipo</div>
        <div style={{ marginTop: 12 }}>
          {['sale', 'withdrawal', 'refund', 'commission', 'anticipation'].map(type => {
            const count = TRANSACTIONS.filter(t => t.type === type).length;
            const total = TRANSACTIONS.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);
            if (count === 0) return null;
            return (
              <div key={type} style={{ ...S.row, padding: '10px 0' }}>
                <div>
                  <span style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.silver }}>{typeLabel(type)}</span>
                  <span style={{ fontFamily: typography.fontFamily.sans, fontSize: 11, color: colors.text.dim, marginLeft: 8 }}>({count})</span>
                </div>
                <span style={S.smallValue}>R$ {fmt(total)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB: SAQUES
// ════════════════════════════════════════════

function TabSaques() {
  const [showModal, setShowModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const handleRequestWithdrawal = useCallback(() => {
    // Mock: just close
    setShowModal(false);
    setWithdrawAmount('');
  }, []);

  return (
    <div>
      {/* Header with CTA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 14, color: colors.text.silver, fontWeight: 600 }}>
            Saldo disponivel para saque
          </div>
          <div style={{ fontFamily: typography.fontFamily.mono, fontSize: 24, fontWeight: 600, color: colors.text.silver, marginTop: 4 }}>
            R$ {fmt(BALANCE.available)}
          </div>
        </div>
        <button style={S.btn(true)} onClick={() => setShowModal(true)}>
          <IC d={ICONS.send} size={14} color="#0A0A0C" />
          Solicitar Saque
        </button>
      </div>

      {/* Withdrawal history */}
      <div style={S.card}>
        <div style={S.label}>Historico de Saques</div>
        {WITHDRAWALS.map((w, i) => (
          <div key={w.id} style={{ ...S.row, borderBottom: i < WITHDRAWALS.length - 1 ? S.row.borderBottom : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.silver, marginBottom: 3 }}>
                {w.bank} {w.account}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: typography.fontFamily.sans, fontSize: 11, color: colors.text.dim }}>{fmtDate(w.date)}</span>
                <span style={S.badge(statusColor(w.status))}>{statusLabel(w.status)}</span>
                <span style={{ fontFamily: typography.fontFamily.mono, fontSize: 10, color: colors.text.dim }}>PIX: {w.pix}</span>
              </div>
            </div>
            <div style={{ ...S.smallValue, textAlign: 'right', minWidth: 100 }}>
              R$ {fmt(w.amount)}
            </div>
          </div>
        ))}
      </div>

      {/* Withdrawal modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Solicitar Saque">
        <div style={{ marginBottom: 16 }}>
          <div style={S.label}>Valor do Saque</div>
          <input
            type="text"
            placeholder="R$ 0,00"
            value={withdrawAmount}
            onChange={e => setWithdrawAmount(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 14px',
              background: colors.background.void,
              border: `1px solid ${colors.border.space}`,
              borderRadius: 6,
              color: colors.text.silver,
              fontFamily: typography.fontFamily.mono,
              fontSize: 18,
              fontWeight: 600,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={S.sub}>Disponivel: R$ {fmt(BALANCE.available)}</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={S.label}>Conta Destino</div>
          <div style={{
            padding: '12px 14px',
            background: colors.background.void,
            border: `1px solid ${colors.border.space}`,
            borderRadius: 6,
            fontFamily: typography.fontFamily.sans,
            fontSize: 13,
            color: colors.text.silver,
          }}>
            Banco Inter — •••4521 (PIX: email@exemplo.com)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button style={S.btn()} onClick={() => setShowModal(false)}>Cancelar</button>
          <button style={S.btn(true)} onClick={handleRequestWithdrawal}>Confirmar Saque</button>
        </div>
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB: ANTECIPACOES
// ════════════════════════════════════════════

function TabAntecipacoes() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div>
      {/* Info box */}
      <div style={{ ...S.card, marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ color: colors.ember.primary, marginTop: 2 }}>
          <IC d={ICONS.info} size={18} color={colors.ember.primary} />
        </div>
        <div>
          <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.silver, fontWeight: 600, marginBottom: 4 }}>
            Antecipacao de Recebiveis
          </div>
          <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 12, color: colors.text.muted, lineHeight: 1.6 }}>
            Receba antecipadamente o valor das suas vendas parceladas. A taxa varia de 1.5% a 3.5% dependendo do prazo das parcelas. O valor liquido e depositado em ate 1 dia util.
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 14, color: colors.text.silver, fontWeight: 600 }}>
            Recebiveis disponiveis para antecipacao
          </div>
          <div style={{ fontFamily: typography.fontFamily.mono, fontSize: 24, fontWeight: 600, color: colors.text.silver, marginTop: 4 }}>
            R$ {fmt(BALANCE.pending)}
          </div>
        </div>
        <button style={S.btn(true)} onClick={() => setShowModal(true)}>
          <IC d={ICONS.zap} size={14} color="#0A0A0C" />
          Solicitar Antecipacao
        </button>
      </div>

      {/* History */}
      <div style={S.card}>
        <div style={S.label}>Historico de Antecipacoes</div>
        {ANTICIPATIONS.map((a, i) => (
          <div key={a.id} style={{ ...S.row, borderBottom: i < ANTICIPATIONS.length - 1 ? S.row.borderBottom : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: typography.fontFamily.sans, fontSize: 13, color: colors.text.silver, marginBottom: 3 }}>
                {a.installments} parcelas antecipadas
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: typography.fontFamily.sans, fontSize: 11, color: colors.text.dim }}>{fmtDate(a.date)}</span>
                <span style={S.badge(statusColor(a.status))}>{statusLabel(a.status)}</span>
                <span style={{ fontFamily: typography.fontFamily.mono, fontSize: 10, color: colors.ember.glow80 }}>taxa: R$ {fmt(a.fee)}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...S.smallValue, marginBottom: 2 }}>R$ {fmt(a.amount)}</div>
              <div style={{ fontFamily: typography.fontFamily.mono, fontSize: 11, color: colors.text.muted }}>liq. R$ {fmt(a.net)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Solicitar Antecipacao">
        <div style={{ marginBottom: 16 }}>
          <div style={S.label}>Parcelas Disponiveis</div>
          <div style={{
            padding: '14px',
            background: colors.background.void,
            border: `1px solid ${colors.border.space}`,
            borderRadius: 6,
            fontFamily: typography.fontFamily.mono,
            fontSize: 14,
            color: colors.text.silver,
          }}>
            R$ {fmt(BALANCE.pending)} em recebiveis
          </div>
          <div style={S.sub}>Taxa estimada: 2.5% (R$ {fmt(BALANCE.pending * 0.025)})</div>
          <div style={{ ...S.sub, color: colors.text.silver, marginTop: 8 }}>
            Valor liquido estimado: R$ {fmt(BALANCE.pending * 0.975)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button style={S.btn()} onClick={() => setShowModal(false)}>Cancelar</button>
          <button style={S.btn(true)} onClick={() => setShowModal(false)}>Confirmar Antecipacao</button>
        </div>
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════

export default function KloelCarteira() {
  const [activeTab, setActiveTab] = useState<TabId>('saldo');

  return (
    <div style={{ padding: 32, minHeight: '100vh', background: colors.background.void }}>
      <div style={{ maxWidth: 1060, position: 'relative' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{
            fontFamily: typography.fontFamily.sans,
            fontSize: 20,
            fontWeight: 600,
            color: colors.text.silver,
            margin: 0,
            letterSpacing: '-0.01em',
          }}>
            Carteira
          </h1>
          <p style={{
            fontFamily: typography.fontFamily.sans,
            fontSize: 13,
            color: colors.text.dim,
            margin: '4px 0 0 0',
          }}>
            Gerencie seu saldo, transacoes, saques e antecipacoes
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: 0,
          borderBottom: `1px solid ${colors.border.void}`,
          marginBottom: 24,
        }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? colors.ember.primary : colors.text.muted,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? `2px solid ${colors.ember.primary}` : '2px solid transparent',
                  padding: '10px 18px',
                  cursor: 'pointer',
                  transition: `all ${motion.duration.fast} ease`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <IC d={tab.icon} size={14} color={active ? colors.ember.primary : colors.text.dim} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'saldo' && <TabSaldo />}
        {activeTab === 'extrato' && <TabExtrato />}
        {activeTab === 'movimentacoes' && <TabMovimentacoes />}
        {activeTab === 'saques' && <TabSaques />}
        {activeTab === 'antecipacoes' && <TabAntecipacoes />}
      </div>
    </div>
  );
}
