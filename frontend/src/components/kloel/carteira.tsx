'use client';

import { useState, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════
   KLOEL — Carteira (Wallet)
   Visual prototype — hardcoded Kloel design tokens
   #0A0A0C bg, #111113 cards, #222226 borders, #E85D30 ember
   Sora + JetBrains Mono fonts
   ═══════════════════════════════════════════════════════ */

// ════════════════════════════════════════════
// INLINE SVG ICONS
// ════════════════════════════════════════════

const IC: Record<string, (s: number) => JSX.Element> = {
  wallet: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
      <circle cx="16" cy="12" r="1" />
    </svg>
  ),
  list: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  activity: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  send: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  zap: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  eye: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  eyeOff: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ),
  arrowUp: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
    </svg>
  ),
  arrowDown: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
    </svg>
  ),
  check: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  x: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  info: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  clock: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  filter: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  download: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  calendar: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
};

// ════════════════════════════════════════════
// MOCK DATA
// ════════════════════════════════════════════

const BALANCE = {
  available: 12847.5,
  pending: 3420.0,
  blocked: 850.0,
  total: 17117.5,
  lastUpdated: '2026-03-27T14:32:00',
};

const TRANSACTIONS = [
  { id: 'tx-001', date: '2026-03-27', type: 'sale', desc: 'Venda #4821 — Plano Pro Mensal', amount: 197.0, status: 'completed' },
  { id: 'tx-002', date: '2026-03-27', type: 'sale', desc: 'Venda #4820 — Plano Starter', amount: 67.0, status: 'completed' },
  { id: 'tx-003', date: '2026-03-26', type: 'withdrawal', desc: 'Saque para Banco Inter •••4521', amount: -2500.0, status: 'completed' },
  { id: 'tx-004', date: '2026-03-26', type: 'sale', desc: 'Venda #4819 — Plano Enterprise', amount: 497.0, status: 'pending' },
  { id: 'tx-005', date: '2026-03-25', type: 'refund', desc: 'Reembolso #4812 — Plano Starter', amount: -67.0, status: 'completed' },
  { id: 'tx-006', date: '2026-03-25', type: 'sale', desc: 'Venda #4818 — Plano Pro Anual', amount: 1970.0, status: 'completed' },
  { id: 'tx-007', date: '2026-03-24', type: 'commission', desc: 'Comissao afiliado — Venda #4815', amount: 39.4, status: 'completed' },
  { id: 'tx-008', date: '2026-03-24', type: 'sale', desc: 'Venda #4817 — Plano Pro Mensal', amount: 197.0, status: 'completed' },
  { id: 'tx-009', date: '2026-03-23', type: 'withdrawal', desc: 'Saque para Nubank •••7832', amount: -5000.0, status: 'completed' },
  { id: 'tx-010', date: '2026-03-23', type: 'sale', desc: 'Venda #4816 — Plano Starter', amount: 67.0, status: 'completed' },
  { id: 'tx-011', date: '2026-03-22', type: 'sale', desc: 'Venda #4815 — Plano Pro Mensal', amount: 197.0, status: 'completed' },
  { id: 'tx-012', date: '2026-03-21', type: 'anticipation', desc: 'Antecipacao aprovada — R$ 3.200', amount: 3200.0, status: 'completed' },
];

const WITHDRAWALS = [
  { id: 'w-001', date: '2026-03-26', bank: 'Banco Inter', account: '•••4521', amount: 2500.0, status: 'completed', pix: 'email@exemplo.com' },
  { id: 'w-002', date: '2026-03-23', bank: 'Nubank', account: '•••7832', amount: 5000.0, status: 'completed', pix: '***.***.***-00' },
  { id: 'w-003', date: '2026-03-18', bank: 'Banco Inter', account: '•••4521', amount: 3000.0, status: 'completed', pix: 'email@exemplo.com' },
  { id: 'w-004', date: '2026-03-12', bank: 'Nubank', account: '•••7832', amount: 4200.0, status: 'completed', pix: '***.***.***-00' },
];

const ANTICIPATIONS = [
  { id: 'a-001', date: '2026-03-21', amount: 3200.0, fee: 96.0, net: 3104.0, status: 'completed', installments: 6 },
  { id: 'a-002', date: '2026-03-10', amount: 5000.0, fee: 175.0, net: 4825.0, status: 'completed', installments: 10 },
  { id: 'a-003', date: '2026-02-28', amount: 2000.0, fee: 50.0, net: 1950.0, status: 'completed', installments: 4 },
];

const MONTH_DAYS = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  value: 400 + Math.sin(i * 0.4) * 200 + i * 30 + Math.random() * 100,
}));

// ════════════════════════════════════════════
// HELPER CONSTANTS
// ════════════════════════════════════════════

const TYPE_CONFIG = {
  sale: { label: 'Venda', color: '#E0DDD8', icon: IC.arrowUp, sign: '+' },
  withdrawal: { label: 'Saque', color: '#E85D30', icon: IC.send, sign: '-' },
  refund: { label: 'Reembolso', color: '#E85D30', icon: IC.arrowDown, sign: '-' },
  commission: { label: 'Comissao', color: '#A09C94', icon: IC.check, sign: '+' },
  anticipation: { label: 'Antecipacao', color: '#E0DDD8', icon: IC.zap, sign: '+' },
} as Record<string, { label: string; color: string; icon: (s: number) => JSX.Element; sign: string }>;

const STATUS_COLOR: Record<string, string> = {
  completed: '#A09C94',
  pending: '#E8A44D',
  failed: '#E85D30',
  processing: '#5DA0E8',
};

const STATUS_LABEL: Record<string, string> = {
  completed: 'Concluido',
  pending: 'Pendente',
  failed: 'Falhou',
  processing: 'Processando',
};

function Fmt(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════

function TempBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: '#A09C94' }}>{label}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#E0DDD8' }}>R$ {Fmt(value)}</span>
      </div>
      <div style={{ height: 6, background: '#1A1A1E', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function MiniChart({ data }: { data: { day: number; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80, padding: '0 4px 4px 4px', background: '#0A0A0C', borderRadius: 4, marginTop: 12 }}>
      {data.map((d, i) => {
        const h = (d.value / max) * 100;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h}%`,
              background: i === data.length - 1 ? '#E85D30' : 'rgba(232,93,48,0.3)',
              borderRadius: '2px 2px 0 0',
              minWidth: 2,
              transition: 'height 0.3s ease',
            }}
            title={`Dia ${d.day}: R$ ${Fmt(d.value)}`}
          />
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════
// WITHDRAW MODAL
// ════════════════════════════════════════════

function WithdrawModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [amount, setAmount] = useState('');

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div
        style={{ background: '#111113', border: '1px solid #222226', borderRadius: 8, padding: 28, width: '100%', maxWidth: 480, position: 'relative' }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 16, fontWeight: 600, color: '#E0DDD8' }}>Solicitar Saque</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#A09C94' }}>
            {IC.x(18)}
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6B6966', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 6 }}>Valor do Saque</div>
          <input
            type="text"
            placeholder="R$ 0,00"
            value={amount}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
            style={{
              width: '100%', padding: '12px 14px', background: '#0A0A0C', border: '1px solid #222226', borderRadius: 6,
              color: '#E0DDD8', fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 600, outline: 'none', boxSizing: 'border-box' as const,
            }}
          />
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: '#4A4845', marginTop: 4 }}>Disponivel: R$ {Fmt(BALANCE.available)}</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6B6966', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 6 }}>Conta Destino</div>
          <div style={{ padding: '12px 14px', background: '#0A0A0C', border: '1px solid #222226', borderRadius: 6, fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#E0DDD8' }}>
            Banco Inter — •••4521 (PIX: email@exemplo.com)
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 600, color: '#E0DDD8', background: 'transparent', border: '1px solid #222226', borderRadius: 6, padding: '10px 20px', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={() => { setAmount(''); onClose(); }}
            style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 600, color: '#0A0A0C', background: '#E85D30', border: 'none', borderRadius: 6, padding: '10px 20px', cursor: 'pointer' }}
          >
            Confirmar Saque
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// ANTICIPATE MODAL
// ════════════════════════════════════════════

function AntecipateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div
        style={{ background: '#111113', border: '1px solid #222226', borderRadius: 8, padding: 28, width: '100%', maxWidth: 480, position: 'relative' }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 16, fontWeight: 600, color: '#E0DDD8' }}>Solicitar Antecipacao</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#A09C94' }}>
            {IC.x(18)}
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6B6966', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 6 }}>Parcelas Disponiveis</div>
          <div style={{ padding: '14px', background: '#0A0A0C', border: '1px solid #222226', borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#E0DDD8' }}>
            R$ {Fmt(BALANCE.pending)} em recebiveis
          </div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: '#4A4845', marginTop: 4 }}>Taxa estimada: 2.5% (R$ {Fmt(BALANCE.pending * 0.025)})</div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: '#E0DDD8', marginTop: 8 }}>
            Valor liquido estimado: R$ {Fmt(BALANCE.pending * 0.975)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 600, color: '#E0DDD8', background: 'transparent', border: '1px solid #222226', borderRadius: 6, padding: '10px 20px', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={onClose}
            style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 600, color: '#0A0A0C', background: '#E85D30', border: 'none', borderRadius: 6, padding: '10px 20px', cursor: 'pointer' }}
          >
            Confirmar Antecipacao
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════

export default function KloelCarteira() {
  const [tab, setTab] = useState<'saldo' | 'extrato' | 'movimentacoes' | 'saques' | 'antecipacoes'>('saldo');
  const [showBalance, setShowBalance] = useState(true);
  const [filter, setFilter] = useState('all');
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [antecipateModal, setAntecipateModal] = useState(false);
  const [ticker, setTicker] = useState(BALANCE.available);

  // Balance ticker animation
  useEffect(() => {
    const iv = setInterval(() => {
      setTicker((prev) => {
        const delta = (Math.random() - 0.48) * 12;
        return Math.max(0, +(prev + delta).toFixed(2));
      });
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  const filtered = filter === 'all' ? TRANSACTIONS : TRANSACTIONS.filter((t) => t.type === filter);

  const income = TRANSACTIONS.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outgoing = TRANSACTIONS.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = income - outgoing;
  const sales = TRANSACTIONS.filter((t) => t.type === 'sale').length;
  const refunds = TRANSACTIONS.filter((t) => t.type === 'refund').length;

  const TABS: { id: typeof tab; label: string; icon: (s: number) => JSX.Element }[] = [
    { id: 'saldo', label: 'Saldo', icon: IC.wallet },
    { id: 'extrato', label: 'Extrato', icon: IC.list },
    { id: 'movimentacoes', label: 'Movimentacoes', icon: IC.activity },
    { id: 'saques', label: 'Saques', icon: IC.send },
    { id: 'antecipacoes', label: 'Antecipacoes', icon: IC.zap },
  ];

  const LABEL: React.CSSProperties = {
    fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6B6966',
    letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 6,
  };
  const VALUE: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 600, color: '#E0DDD8', letterSpacing: '-0.02em',
  };
  const CARD: React.CSSProperties = {
    background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20,
  };
  const SUB: React.CSSProperties = {
    fontFamily: "'Sora', sans-serif", fontSize: 12, color: '#4A4845', marginTop: 4,
  };
  const SMALL_VALUE: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 500, color: '#E0DDD8',
  };
  const ROW: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #1A1A1E',
  };

  const badge = (color: string): React.CSSProperties => ({
    fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color,
    padding: '2px 8px', borderRadius: 4,
    background: color === '#A09C94' ? 'rgba(160,156,148,0.08)' : color === '#E8A44D' ? 'rgba(232,164,77,0.08)' : 'rgba(232,93,48,0.06)',
    letterSpacing: '0.04em', textTransform: 'uppercase' as const,
  });

  const btn = (primary = false): React.CSSProperties => ({
    fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 600,
    color: primary ? '#0A0A0C' : '#E0DDD8',
    background: primary ? '#E85D30' : 'transparent',
    border: primary ? 'none' : '1px solid #222226',
    borderRadius: 6, padding: '10px 20px', cursor: 'pointer',
    transition: 'all 150ms ease', display: 'inline-flex', alignItems: 'center', gap: 8,
  });

  const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <>
      {/* Google Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* CSS keyframes */}
      <style>{`
        @keyframes kloel-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes kloel-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .kloel-card:hover { border-color: #333338 !important; }
        .kloel-tab:hover { color: #E0DDD8 !important; }
        .kloel-btn:hover { opacity: 0.85; }
        .kloel-row:hover { background: rgba(255,255,255,0.015); }
      `}</style>

      <div style={{ padding: 32, minHeight: '100vh', background: '#0A0A0C', animation: 'kloel-fade-in 0.4s ease' }}>
        <div style={{ maxWidth: 1060, position: 'relative' }}>

          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontFamily: "'Sora', sans-serif", fontSize: 20, fontWeight: 600, color: '#E0DDD8', margin: 0, letterSpacing: '-0.01em' }}>
              Carteira
            </h1>
            <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#4A4845', margin: '4px 0 0 0' }}>
              Gerencie seu saldo, transacoes, saques e antecipacoes
            </p>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1A1A1E', marginBottom: 24 }}>
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  className="kloel-tab"
                  onClick={() => setTab(t.id)}
                  style={{
                    fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: active ? 600 : 400,
                    color: active ? '#E85D30' : '#6B6966', background: 'transparent', border: 'none',
                    borderBottom: active ? '2px solid #E85D30' : '2px solid transparent',
                    padding: '10px 18px', cursor: 'pointer', transition: 'all 150ms ease',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{ color: active ? '#E85D30' : '#4A4845' }}>{t.icon(14)}</span>
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* ──────────── TAB: SALDO ──────────── */}
          {tab === 'saldo' && (
            <div style={{ animation: 'kloel-fade-in 0.3s ease' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
                {/* Available */}
                <div className="kloel-card" style={CARD}>
                  <div style={LABEL}>Saldo Disponivel</div>
                  <div style={{ ...VALUE, color: '#E0DDD8' }}>
                    {showBalance ? `R$ ${Fmt(ticker)}` : 'R$ ••••••'}
                  </div>
                  <div style={SUB}>pronto para saque</div>
                </div>
                {/* Pending */}
                <div className="kloel-card" style={CARD}>
                  <div style={LABEL}>Saldo Pendente</div>
                  <div style={{ ...VALUE, color: '#E8A44D' }}>
                    {showBalance ? `R$ ${Fmt(BALANCE.pending)}` : 'R$ ••••••'}
                  </div>
                  <div style={SUB}>aguardando liberacao</div>
                </div>
                {/* Blocked */}
                <div className="kloel-card" style={CARD}>
                  <div style={LABEL}>Saldo Bloqueado</div>
                  <div style={{ ...VALUE, color: '#6B6966' }}>
                    {showBalance ? `R$ ${Fmt(BALANCE.blocked)}` : 'R$ ••••••'}
                  </div>
                  <div style={SUB}>contestacoes / chargebacks</div>
                </div>
              </div>

              {/* Total + toggle */}
              <div className="kloel-card" style={{ ...CARD, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={LABEL}>Saldo Total</div>
                  <div style={{ ...VALUE, fontSize: 32 }}>
                    {showBalance ? `R$ ${Fmt(BALANCE.total)}` : 'R$ ••••••'}
                  </div>
                  <div style={SUB}>Atualizado em {new Date(BALANCE.lastUpdated).toLocaleString('pt-BR')}</div>
                </div>
                <button className="kloel-btn" onClick={() => setShowBalance(!showBalance)} style={{ ...btn(), padding: '8px 14px' }}>
                  <span style={{ color: '#A09C94' }}>{showBalance ? IC.eye(16) : IC.eyeOff(16)}</span>
                  {showBalance ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>

              {/* Balance breakdown bars */}
              <div className="kloel-card" style={{ ...CARD, marginBottom: 20 }}>
                <div style={LABEL}>Composicao do Saldo</div>
                <div style={{ marginTop: 12 }}>
                  <TempBar label="Disponivel" value={BALANCE.available} max={BALANCE.total} color="#E85D30" />
                  <TempBar label="Pendente" value={BALANCE.pending} max={BALANCE.total} color="#E8A44D" />
                  <TempBar label="Bloqueado" value={BALANCE.blocked} max={BALANCE.total} color="#6B6966" />
                </div>
              </div>

              {/* Mini chart */}
              <div className="kloel-card" style={CARD}>
                <div style={LABEL}>Evolucao do Saldo (30 dias)</div>
                <MiniChart data={MONTH_DAYS} />
              </div>
            </div>
          )}

          {/* ──────────── TAB: EXTRATO ──────────── */}
          {tab === 'extrato' && (
            <div style={{ animation: 'kloel-fade-in 0.3s ease' }}>
              {/* Filters */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' as const }}>
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'sale', label: 'Vendas' },
                  { id: 'withdrawal', label: 'Saques' },
                  { id: 'refund', label: 'Reembolsos' },
                  { id: 'commission', label: 'Comissoes' },
                  { id: 'anticipation', label: 'Antecipacoes' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    style={{
                      fontFamily: "'Sora', sans-serif", fontSize: 12, fontWeight: filter === f.id ? 600 : 400,
                      color: filter === f.id ? '#E85D30' : '#6B6966',
                      background: filter === f.id ? 'rgba(232,93,48,0.06)' : 'transparent',
                      border: `1px solid ${filter === f.id ? 'rgba(232,93,48,0.3)' : '#222226'}`,
                      borderRadius: 4, padding: '6px 14px', cursor: 'pointer', transition: 'all 150ms ease',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Transaction list */}
              <div className="kloel-card" style={CARD}>
                {filtered.length === 0 ? (
                  <div style={{ textAlign: 'center' as const, padding: 32, color: '#4A4845', fontFamily: "'Sora', sans-serif", fontSize: 13 }}>
                    Nenhuma transacao encontrada para este filtro.
                  </div>
                ) : (
                  filtered.map((tx, i) => {
                    const cfg = TYPE_CONFIG[tx.type] || TYPE_CONFIG.sale;
                    const isCredit = tx.amount > 0;
                    return (
                      <div key={tx.id} className="kloel-row" style={{ ...ROW, borderBottom: i < filtered.length - 1 ? '1px solid #1A1A1E' : 'none', borderRadius: 4, padding: '14px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                          <div style={{ color: cfg.color, opacity: 0.7 }}>{cfg.icon(16)}</div>
                          <div>
                            <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#E0DDD8', marginBottom: 3 }}>{tx.desc}</div>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                              <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, color: '#4A4845' }}>{fmtDate(tx.date)}</span>
                              <span style={badge(STATUS_COLOR[tx.status] || '#6B6966')}>{STATUS_LABEL[tx.status] || tx.status}</span>
                              <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, color: '#4A4845', padding: '1px 6px', background: '#0A0A0C', borderRadius: 3 }}>
                                {cfg.label}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div style={{ ...SMALL_VALUE, color: isCredit ? '#E0DDD8' : '#E85D30', textAlign: 'right' as const, minWidth: 100 }}>
                          {cfg.sign} R$ {Fmt(Math.abs(tx.amount))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ──────────── TAB: MOVIMENTACOES ──────────── */}
          {tab === 'movimentacoes' && (
            <div style={{ animation: 'kloel-fade-in 0.3s ease' }}>
              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
                <div className="kloel-card" style={CARD}>
                  <div style={LABEL}>Entradas</div>
                  <div style={{ ...VALUE, fontSize: 20, color: '#E0DDD8' }}>R$ {Fmt(income)}</div>
                  <div style={SUB}>{sales} vendas</div>
                </div>
                <div className="kloel-card" style={CARD}>
                  <div style={LABEL}>Saidas</div>
                  <div style={{ ...VALUE, fontSize: 20, color: '#E85D30' }}>R$ {Fmt(outgoing)}</div>
                  <div style={SUB}>{refunds} reembolsos</div>
                </div>
                <div className="kloel-card" style={CARD}>
                  <div style={LABEL}>Liquido</div>
                  <div style={{ ...VALUE, fontSize: 20 }}>R$ {Fmt(net)}</div>
                  <div style={SUB}>entradas - saidas</div>
                </div>
                <div className="kloel-card" style={CARD}>
                  <div style={LABEL}>Ticket Medio</div>
                  <div style={{ ...VALUE, fontSize: 20 }}>R$ {Fmt(sales > 0 ? income / sales : 0)}</div>
                  <div style={SUB}>por venda</div>
                </div>
              </div>

              {/* Daily chart */}
              <div className="kloel-card" style={CARD}>
                <div style={LABEL}>Volume Diario (30 dias)</div>
                <MiniChart data={MONTH_DAYS} />
              </div>

              {/* By type breakdown */}
              <div className="kloel-card" style={{ ...CARD, marginTop: 14 }}>
                <div style={LABEL}>Movimentacoes por Tipo</div>
                <div style={{ marginTop: 12 }}>
                  {(['sale', 'withdrawal', 'refund', 'commission', 'anticipation'] as const).map((type) => {
                    const cfg = TYPE_CONFIG[type];
                    const count = TRANSACTIONS.filter((t) => t.type === type).length;
                    const total = TRANSACTIONS.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
                    if (count === 0) return null;
                    return (
                      <div key={type} className="kloel-row" style={{ ...ROW, padding: '10px 4px', borderRadius: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: cfg.color, opacity: 0.6 }}>{cfg.icon(14)}</span>
                          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#E0DDD8' }}>{cfg.label}</span>
                          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, color: '#4A4845' }}>({count})</span>
                        </div>
                        <span style={SMALL_VALUE}>R$ {Fmt(total)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ──────────── TAB: SAQUES ──────────── */}
          {tab === 'saques' && (
            <div style={{ animation: 'kloel-fade-in 0.3s ease' }}>
              {/* Header with CTA */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 14, color: '#E0DDD8', fontWeight: 600 }}>
                    Saldo disponivel para saque
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 600, color: '#E0DDD8', marginTop: 4 }}>
                    R$ {Fmt(BALANCE.available)}
                  </div>
                </div>
                <button className="kloel-btn" style={btn(true)} onClick={() => setWithdrawModal(true)}>
                  <span style={{ color: '#0A0A0C' }}>{IC.send(14)}</span>
                  Solicitar Saque
                </button>
              </div>

              {/* Withdrawal history */}
              <div className="kloel-card" style={CARD}>
                <div style={LABEL}>Historico de Saques</div>
                {WITHDRAWALS.map((w, i) => (
                  <div key={w.id} className="kloel-row" style={{ ...ROW, borderBottom: i < WITHDRAWALS.length - 1 ? '1px solid #1A1A1E' : 'none', borderRadius: 4, padding: '14px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <div style={{ color: '#E85D30', opacity: 0.6 }}>{IC.send(16)}</div>
                      <div>
                        <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#E0DDD8', marginBottom: 3 }}>
                          {w.bank} {w.account}
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, color: '#4A4845' }}>{fmtDate(w.date)}</span>
                          <span style={badge(STATUS_COLOR[w.status] || '#6B6966')}>{STATUS_LABEL[w.status] || w.status}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4A4845' }}>PIX: {w.pix}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ ...SMALL_VALUE, textAlign: 'right' as const, minWidth: 100 }}>
                      R$ {Fmt(w.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ──────────── TAB: ANTECIPACOES ──────────── */}
          {tab === 'antecipacoes' && (
            <div style={{ animation: 'kloel-fade-in 0.3s ease' }}>
              {/* Info box */}
              <div className="kloel-card" style={{ ...CARD, marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ color: '#E85D30', marginTop: 2 }}>{IC.info(18)}</div>
                <div>
                  <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#E0DDD8', fontWeight: 600, marginBottom: 4 }}>
                    Antecipacao de Recebiveis
                  </div>
                  <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: '#6B6966', lineHeight: 1.6 }}>
                    Receba antecipadamente o valor das suas vendas parceladas. A taxa varia de 1.5% a 3.5% dependendo do prazo das parcelas. O valor liquido e depositado em ate 1 dia util.
                  </div>
                </div>
              </div>

              {/* CTA */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 14, color: '#E0DDD8', fontWeight: 600 }}>
                    Recebiveis disponiveis para antecipacao
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 600, color: '#E0DDD8', marginTop: 4 }}>
                    R$ {Fmt(BALANCE.pending)}
                  </div>
                </div>
                <button className="kloel-btn" style={btn(true)} onClick={() => setAntecipateModal(true)}>
                  <span style={{ color: '#0A0A0C' }}>{IC.zap(14)}</span>
                  Solicitar Antecipacao
                </button>
              </div>

              {/* History */}
              <div className="kloel-card" style={CARD}>
                <div style={LABEL}>Historico de Antecipacoes</div>
                {ANTICIPATIONS.map((a, i) => (
                  <div key={a.id} className="kloel-row" style={{ ...ROW, borderBottom: i < ANTICIPATIONS.length - 1 ? '1px solid #1A1A1E' : 'none', borderRadius: 4, padding: '14px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <div style={{ color: '#E85D30', opacity: 0.6 }}>{IC.zap(16)}</div>
                      <div>
                        <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#E0DDD8', marginBottom: 3 }}>
                          {a.installments} parcelas antecipadas
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, color: '#4A4845' }}>{fmtDate(a.date)}</span>
                          <span style={badge(STATUS_COLOR[a.status] || '#6B6966')}>{STATUS_LABEL[a.status] || a.status}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#E8A44D' }}>taxa: R$ {Fmt(a.fee)}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' as const }}>
                      <div style={{ ...SMALL_VALUE, marginBottom: 2 }}>R$ {Fmt(a.amount)}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6B6966' }}>liq. R$ {Fmt(a.net)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Modals */}
      <WithdrawModal open={withdrawModal} onClose={() => setWithdrawModal(false)} />
      <AntecipateModal open={antecipateModal} onClose={() => setAntecipateModal(false)} />
    </>
  );
}
