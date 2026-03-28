'use client';

import { useState, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════
   KLOEL — Carteira (Wallet) — Pixel-Perfect Prototype
   ═══════════════════════════════════════════════════════ */

// ════════════════════════════════════════════
// INLINE SVG ICONS
// ════════════════════════════════════════════

const IC: Record<string, (s: number) => React.ReactElement> = {
  wallet: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
      <circle cx="16" cy="12" r="1" />
    </svg>
  ),
  trend: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  trendD: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  ),
  download: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  upload: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  clock: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  check: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  x: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  search: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  filter: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  spark: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L9 12l-7 1 5 5-1 6 6-3 6 3-1-6 5-5-7-1z" />
    </svg>
  ),
  lock: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  bank: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M3 10h18" />
      <path d="M12 2L2 10h20L12 2z" />
      <line x1="6" y1="14" x2="6" y2="17" />
      <line x1="10" y1="14" x2="10" y2="17" />
      <line x1="14" y1="14" x2="14" y2="17" />
      <line x1="18" y1="14" x2="18" y2="17" />
    </svg>
  ),
  zap: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  arrowUp: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  ),
  arrowDown: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  ),
  copy: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  calendar: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  shield: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  pix: (s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 4.5L12 9l4.5-4.5" />
      <path d="M16.5 19.5L12 15l-4.5 4.5" />
      <path d="M4.5 7.5L9 12l-4.5 4.5" />
      <path d="M19.5 16.5L15 12l4.5-4.5" />
    </svg>
  ),
};

// ════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════

interface Transaction {
  id: string;
  date: string;
  type: string;
  desc: string;
  amount: number;
  status: string;
}

interface Withdrawal {
  id: string;
  date: string;
  bank: string;
  account: string;
  amount: number;
  status: string;
  pix: string;
}

interface Anticipation {
  id: string;
  date: string;
  amount: number;
  fee: number;
  net: number;
  status: string;
  installments: number;
}

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

const TRANSACTIONS: Transaction[] = [
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

const WITHDRAWALS: Withdrawal[] = [
  { id: 'w-001', date: '2026-03-26', bank: 'Banco Inter', account: '•••4521', amount: 2500.0, status: 'completed', pix: 'email@exemplo.com' },
  { id: 'w-002', date: '2026-03-23', bank: 'Nubank', account: '•••7832', amount: 5000.0, status: 'completed', pix: '***.***.***-00' },
  { id: 'w-003', date: '2026-03-18', bank: 'Banco Inter', account: '•••4521', amount: 3000.0, status: 'completed', pix: 'email@exemplo.com' },
  { id: 'w-004', date: '2026-03-12', bank: 'Nubank', account: '•••7832', amount: 4200.0, status: 'completed', pix: '***.***.***-00' },
];

const ANTICIPATIONS: Anticipation[] = [
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

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: (s: number) => React.ReactElement; sign: string }> = {
  sale: { label: 'Venda', color: '#E0DDD8', icon: IC.arrowUp, sign: '+' },
  withdrawal: { label: 'Saque', color: '#E85D30', icon: IC.upload, sign: '-' },
  refund: { label: 'Reembolso', color: '#E85D30', icon: IC.arrowDown, sign: '-' },
  commission: { label: 'Comissao', color: '#6E6E73', icon: IC.check, sign: '+' },
  anticipation: { label: 'Antecipacao', color: '#E0DDD8', icon: IC.zap, sign: '+' },
};

const STATUS_COLOR: Record<string, string> = {
  completed: '#6E6E73',
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
// WITHDRAW MODAL
// ════════════════════════════════════════════

function WithdrawModal({ open, onClose, amount, setAmount }: { open: boolean; onClose: () => void; amount: string; setAmount: (v: string) => void }) {
  const [selectedBank, setSelectedBank] = useState(0);
  const banks = [
    { name: 'Banco Inter', account: '•••4521', pix: 'email@exemplo.com' },
    { name: 'Nubank', account: '•••7832', pix: '***.***.***-00' },
  ];

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div
        style={{ background: '#111113', border: '1px solid #222226', borderRadius: 8, padding: 28, width: '100%', maxWidth: 480, position: 'relative' }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 16, fontWeight: 600, color: '#E0DDD8' }}>Solicitar Saque</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#6E6E73' }}>
            {IC.x(18)}
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 6 }}>Valor do Saque</div>
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
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: '#3A3A3F', marginTop: 4 }}>Disponivel: R$ {Fmt(BALANCE.available)}</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 6 }}>Conta Destino</div>
          {banks.map((b, i) => (
            <div
              key={i}
              onClick={() => setSelectedBank(i)}
              style={{
                padding: '12px 14px', background: selectedBank === i ? 'rgba(232,93,48,0.06)' : '#0A0A0C',
                border: `1px solid ${selectedBank === i ? 'rgba(232,93,48,0.3)' : '#222226'}`,
                borderRadius: 6, fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#E0DDD8',
                cursor: 'pointer', marginBottom: i < banks.length - 1 ? 8 : 0,
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <span style={{ color: '#6E6E73' }}>{IC.bank(14)}</span>
              {b.name} — {b.account} (PIX: {b.pix})
            </div>
          ))}
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

function AntecipateModal({ open, onClose, amount, setAmount }: { open: boolean; onClose: () => void; amount: string; setAmount: (v: string) => void }) {
  const feeRate = 0.025;
  const numVal = parseFloat(amount.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
  const fee = numVal * feeRate;
  const net = numVal - fee;

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div
        style={{ background: '#111113', border: '1px solid #222226', borderRadius: 8, padding: 28, width: '100%', maxWidth: 480, position: 'relative' }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 16, fontWeight: 600, color: '#E0DDD8' }}>Solicitar Antecipacao</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#6E6E73' }}>
            {IC.x(18)}
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 6 }}>Valor para Antecipar</div>
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
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: '#3A3A3F', marginTop: 4 }}>Recebiveis disponiveis: R$ {Fmt(BALANCE.pending)}</div>
        </div>

        {/* Fee calculator */}
        <div style={{ background: '#0A0A0C', border: '1px solid #222226', borderRadius: 6, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: '#6E6E73' }}>Taxa estimada (2.5%)</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#E8A44D' }}>- R$ {Fmt(fee)}</span>
          </div>
          <div style={{ height: 1, background: '#19191C', marginBottom: 8 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#E0DDD8', fontWeight: 600 }}>Valor liquido</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#E0DDD8', fontWeight: 600 }}>R$ {Fmt(net > 0 ? net : 0)}</span>
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
            Confirmar Antecipacao
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB COMPONENTS
// ════════════════════════════════════════════

function TabSaldo({ availableTick }: { availableTick: number }) {
  const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const recent = TRANSACTIONS.slice(0, 5);
  const maxDay = Math.max(...MONTH_DAYS.map((d) => d.value));

  return (
    <div style={{ animation: 'kloel-fade-in 0.3s ease' }}>
      {/* Balance cards: 2fr 1fr 1fr 1fr */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
        {/* Available — large */}
        <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ color: '#E85D30' }}>{IC.wallet(16)}</span>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Saldo Disponivel</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 32, fontWeight: 600, color: '#E0DDD8', letterSpacing: '-0.02em', marginBottom: 4 }}>
            R$ {Fmt(availableTick)}
          </div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: '#3A3A3F' }}>
            pronto para saque — atualizado {new Date(BALANCE.lastUpdated).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Pending */}
        <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ color: '#E8A44D' }}>{IC.clock(14)}</span>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Pendente</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 600, color: '#E8A44D', letterSpacing: '-0.02em' }}>
            R$ {Fmt(BALANCE.pending)}
          </div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, color: '#3A3A3F', marginTop: 4 }}>aguardando liberacao</div>
        </div>

        {/* Blocked */}
        <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ color: '#6E6E73' }}>{IC.lock(14)}</span>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Bloqueado</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 600, color: '#6E6E73', letterSpacing: '-0.02em' }}>
            R$ {Fmt(BALANCE.blocked)}
          </div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, color: '#3A3A3F', marginTop: 4 }}>chargebacks</div>
        </div>

        {/* Total */}
        <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ color: '#E85D30' }}>{IC.shield(14)}</span>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Total</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 600, color: '#E0DDD8', letterSpacing: '-0.02em' }}>
            R$ {Fmt(BALANCE.total)}
          </div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, color: '#3A3A3F', marginTop: 4 }}>consolidado</div>
        </div>
      </div>

      {/* Revenue chart */}
      <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#E85D30' }}>{IC.trend(14)}</span>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Receita Diaria (30 dias)</span>
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#6E6E73' }}>
            max: R$ {Fmt(maxDay)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 100, padding: '0 4px 4px 4px', background: '#0A0A0C', borderRadius: 4 }}>
          {MONTH_DAYS.map((d, i) => {
            const h = (d.value / maxDay) * 100;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${h}%`,
                  background: i === MONTH_DAYS.length - 1 ? '#E85D30' : 'rgba(232,93,48,0.25)',
                  borderRadius: '2px 2px 0 0',
                  minWidth: 2,
                  transition: 'height 0.3s ease',
                }}
                title={`Dia ${d.day}: R$ ${Fmt(d.value)}`}
              />
            );
          })}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
        <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 14 }}>
          Transacoes Recentes
        </div>
        {recent.map((tx, i) => {
          const cfg = TYPE_CONFIG[tx.type] || TYPE_CONFIG.sale;
          const isCredit = tx.amount > 0;
          return (
            <div key={tx.id} className="kloel-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 4px', borderBottom: i < recent.length - 1 ? '1px solid #19191C' : 'none', borderRadius: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: cfg.color, opacity: 0.6 }}>{cfg.icon(14)}</span>
                <div>
                  <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#E0DDD8' }}>{tx.desc}</div>
                  <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, color: '#3A3A3F', marginTop: 2 }}>{fmtDate(tx.date)}</div>
                </div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 500, color: isCredit ? '#E0DDD8' : '#E85D30' }}>
                {cfg.sign} R$ {Fmt(Math.abs(tx.amount))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabExtrato({ search, setSearch, filterType, setFilterType }: { search: string; setSearch: (v: string) => void; filterType: string; setFilterType: (v: string) => void }) {
  const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const filtered = TRANSACTIONS.filter((tx) => {
    const matchType = filterType === 'all' || tx.type === filterType;
    const matchSearch = !search || tx.desc.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const badge = (color: string): React.CSSProperties => ({
    fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color,
    padding: '2px 8px', borderRadius: 4,
    background: color === '#6E6E73' ? 'rgba(110,110,115,0.08)' : color === '#E8A44D' ? 'rgba(232,164,77,0.08)' : 'rgba(232,93,48,0.06)',
    letterSpacing: '0.04em', textTransform: 'uppercase' as const,
  });

  return (
    <div style={{ animation: 'kloel-fade-in 0.3s ease' }}>
      {/* Search / filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#3A3A3F' }}>{IC.search(14)}</span>
          <input
            type="text"
            placeholder="Buscar transacao..."
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px 10px 36px', background: '#111113', border: '1px solid #222226', borderRadius: 6,
              color: '#E0DDD8', fontFamily: "'Sora', sans-serif", fontSize: 13, outline: 'none', boxSizing: 'border-box' as const,
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#3A3A3F' }}>{IC.filter(14)}</span>
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
              onClick={() => setFilterType(f.id)}
              style={{
                fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: filterType === f.id ? 600 : 400,
                color: filterType === f.id ? '#E85D30' : '#6E6E73',
                background: filterType === f.id ? 'rgba(232,93,48,0.06)' : 'transparent',
                border: `1px solid ${filterType === f.id ? 'rgba(232,93,48,0.3)' : '#222226'}`,
                borderRadius: 4, padding: '5px 12px', cursor: 'pointer', transition: 'all 150ms ease',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction table */}
      <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 4 }}>
        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 14px', borderBottom: '1px solid #19191C' }}>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Descricao</span>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Data</span>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Status</span>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const, textAlign: 'right' }}>Valor</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center' as const, padding: 32, color: '#3A3A3F', fontFamily: "'Sora', sans-serif", fontSize: 13 }}>
            Nenhuma transacao encontrada.
          </div>
        ) : (
          filtered.map((tx, i) => {
            const cfg = TYPE_CONFIG[tx.type] || TYPE_CONFIG.sale;
            const isCredit = tx.amount > 0;
            return (
              <div key={tx.id} className="kloel-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 14px', borderBottom: i < filtered.length - 1 ? '1px solid #19191C' : 'none', borderRadius: 4, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: cfg.color, opacity: 0.6 }}>{cfg.icon(14)}</span>
                  <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#E0DDD8' }}>{tx.desc}</span>
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#6E6E73' }}>{fmtDate(tx.date)}</span>
                <span style={badge(STATUS_COLOR[tx.status] || '#6E6E73')}>{STATUS_LABEL[tx.status] || tx.status}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 500, color: isCredit ? '#E0DDD8' : '#E85D30', textAlign: 'right' }}>
                  {cfg.sign} R$ {Fmt(Math.abs(tx.amount))}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TabMovimentacoes() {
  const income = TRANSACTIONS.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outgoing = TRANSACTIONS.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = income - outgoing;
  const maxDay = Math.max(...MONTH_DAYS.map((d) => d.value));

  return (
    <div style={{ animation: 'kloel-fade-in 0.3s ease' }}>
      {/* 3 stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ color: '#E0DDD8' }}>{IC.arrowUp(14)}</span>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Entradas</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 600, color: '#E0DDD8', letterSpacing: '-0.02em' }}>
            R$ {Fmt(income)}
          </div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, color: '#3A3A3F', marginTop: 4 }}>
            {TRANSACTIONS.filter((t) => t.type === 'sale').length} vendas
          </div>
        </div>

        <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ color: '#E85D30' }}>{IC.arrowDown(14)}</span>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Saidas</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 600, color: '#E85D30', letterSpacing: '-0.02em' }}>
            R$ {Fmt(outgoing)}
          </div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, color: '#3A3A3F', marginTop: 4 }}>
            {TRANSACTIONS.filter((t) => t.type === 'refund').length} reembolsos + {TRANSACTIONS.filter((t) => t.type === 'withdrawal').length} saques
          </div>
        </div>

        <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ color: '#E85D30' }}>{IC.trend(14)}</span>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Liquido</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 600, color: '#E0DDD8', letterSpacing: '-0.02em' }}>
            R$ {Fmt(net)}
          </div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, color: '#3A3A3F', marginTop: 4 }}>entradas - saidas</div>
        </div>
      </div>

      {/* Daily chart */}
      <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#E85D30' }}>{IC.calendar(14)}</span>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Volume Diario (30 dias)</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, padding: '0 4px 4px 4px', background: '#0A0A0C', borderRadius: 4 }}>
          {MONTH_DAYS.map((d, i) => {
            const h = (d.value / maxDay) * 100;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${h}%`,
                  background: i === MONTH_DAYS.length - 1 ? '#E85D30' : 'rgba(232,93,48,0.25)',
                  borderRadius: '2px 2px 0 0',
                  minWidth: 2,
                  transition: 'height 0.3s ease',
                }}
                title={`Dia ${d.day}: R$ ${Fmt(d.value)}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TabSaques({ onWithdraw }: { onWithdraw: () => void }) {
  const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const badge = (color: string): React.CSSProperties => ({
    fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color,
    padding: '2px 8px', borderRadius: 4,
    background: color === '#6E6E73' ? 'rgba(110,110,115,0.08)' : 'rgba(232,93,48,0.06)',
    letterSpacing: '0.04em', textTransform: 'uppercase' as const,
  });

  return (
    <div style={{ animation: 'kloel-fade-in 0.3s ease' }}>
      {/* Header with CTA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 14, color: '#E0DDD8', fontWeight: 600 }}>Saldo disponivel para saque</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 600, color: '#E0DDD8', marginTop: 4 }}>
            R$ {Fmt(BALANCE.available)}
          </div>
        </div>
        <button className="kloel-btn" onClick={onWithdraw} style={{
          fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 600, color: '#0A0A0C', background: '#E85D30',
          border: 'none', borderRadius: 6, padding: '10px 20px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: '#0A0A0C' }}>{IC.upload(14)}</span>
          Solicitar Saque
        </button>
      </div>

      {/* Withdrawals table */}
      <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 4 }}>
        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '10px 14px', borderBottom: '1px solid #19191C' }}>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Banco / Conta</span>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Data</span>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Chave PIX</span>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Status</span>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const, textAlign: 'right' }}>Valor</span>
        </div>

        {WITHDRAWALS.map((w, i) => (
          <div key={w.id} className="kloel-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '12px 14px', borderBottom: i < WITHDRAWALS.length - 1 ? '1px solid #19191C' : 'none', borderRadius: 4, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#E85D30', opacity: 0.6 }}>{IC.bank(14)}</span>
              <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#E0DDD8' }}>{w.bank} {w.account}</span>
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#6E6E73' }}>{fmtDate(w.date)}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#3A3A3F' }}>{IC.pix(12)}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6E6E73' }}>{w.pix}</span>
            </div>
            <span style={badge(STATUS_COLOR[w.status] || '#6E6E73')}>{STATUS_LABEL[w.status] || w.status}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 500, color: '#E0DDD8', textAlign: 'right' }}>
              R$ {Fmt(w.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabAntecipacoes({ onAntecipate }: { onAntecipate: () => void }) {
  const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const totalAnticipated = ANTICIPATIONS.reduce((s, a) => s + a.amount, 0);
  const totalFees = ANTICIPATIONS.reduce((s, a) => s + a.fee, 0);
  const totalNet = ANTICIPATIONS.reduce((s, a) => s + a.net, 0);

  const badge = (color: string): React.CSSProperties => ({
    fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color,
    padding: '2px 8px', borderRadius: 4,
    background: color === '#6E6E73' ? 'rgba(110,110,115,0.08)' : 'rgba(232,93,48,0.06)',
    letterSpacing: '0.04em', textTransform: 'uppercase' as const,
  });

  return (
    <div style={{ animation: 'kloel-fade-in 0.3s ease' }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ color: '#E85D30' }}>{IC.zap(14)}</span>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Total Antecipado</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 600, color: '#E0DDD8', letterSpacing: '-0.02em' }}>
            R$ {Fmt(totalAnticipated)}
          </div>
        </div>

        <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ color: '#E8A44D' }}>{IC.spark(14)}</span>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Total em Taxas</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 600, color: '#E8A44D', letterSpacing: '-0.02em' }}>
            R$ {Fmt(totalFees)}
          </div>
        </div>

        <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ color: '#E0DDD8' }}>{IC.check(14)}</span>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 11, fontWeight: 500, color: '#6E6E73', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Valor Liquido</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 600, color: '#E0DDD8', letterSpacing: '-0.02em' }}>
            R$ {Fmt(totalNet)}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
        <div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 14, color: '#E0DDD8', fontWeight: 600 }}>Recebiveis disponiveis para antecipacao</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 600, color: '#E0DDD8', marginTop: 4 }}>
            R$ {Fmt(BALANCE.pending)}
          </div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: '#3A3A3F', marginTop: 4 }}>Taxa estimada: 2.5% — Deposito em ate 1 dia util</div>
        </div>
        <button className="kloel-btn" onClick={onAntecipate} style={{
          fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 600, color: '#0A0A0C', background: '#E85D30',
          border: 'none', borderRadius: 6, padding: '10px 20px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: '#0A0A0C' }}>{IC.zap(14)}</span>
          Solicitar Antecipacao
        </button>
      </div>

      {/* Anticipations table */}
      <div className="kloel-card" style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 4 }}>
        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr', padding: '10px 14px', borderBottom: '1px solid #19191C' }}>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Data</span>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Parcelas</span>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const, textAlign: 'right' }}>Valor Bruto</span>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const, textAlign: 'right' }}>Taxa</span>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const, textAlign: 'right' }}>Liquido</span>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const, textAlign: 'right' }}>Status</span>
        </div>

        {ANTICIPATIONS.map((a, i) => (
          <div key={a.id} className="kloel-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr', padding: '12px 14px', borderBottom: i < ANTICIPATIONS.length - 1 ? '1px solid #19191C' : 'none', borderRadius: 4, alignItems: 'center' }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#6E6E73' }}>{fmtDate(a.date)}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#E0DDD8' }}>{a.installments}x</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 500, color: '#E0DDD8', textAlign: 'right' }}>R$ {Fmt(a.amount)}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#E8A44D', textAlign: 'right' }}>- R$ {Fmt(a.fee)}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 500, color: '#E0DDD8', textAlign: 'right' }}>R$ {Fmt(a.net)}</span>
            <div style={{ textAlign: 'right' }}>
              <span style={badge(STATUS_COLOR[a.status] || '#6E6E73')}>{STATUS_LABEL[a.status] || a.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════

export default function KloelCarteira() {
  const [tab, setTab] = useState<'saldo' | 'extrato' | 'movimentacoes' | 'saques' | 'antecipacoes'>('saldo');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showAntecipateModal, setShowAntecipateModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [antecipateAmount, setAntecipateAmount] = useState('');
  const [availableTick, setAvailableTick] = useState(BALANCE.available);

  // Balance ticker animation
  useEffect(() => {
    const iv = setInterval(() => {
      setAvailableTick((prev) => {
        const delta = (Math.random() - 0.48) * 12;
        return Math.max(0, +(prev + delta).toFixed(2));
      });
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  const TABS: { id: typeof tab; label: string; icon: (s: number) => React.ReactElement }[] = [
    { id: 'saldo', label: 'Saldo', icon: IC.wallet },
    { id: 'extrato', label: 'Extrato', icon: IC.search },
    { id: 'movimentacoes', label: 'Movimentacoes', icon: IC.trend },
    { id: 'saques', label: 'Saques', icon: IC.upload },
    { id: 'antecipacoes', label: 'Antecipacoes', icon: IC.zap },
  ];

  return (
    <>
      {/* Google Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* CSS keyframes + scrollbar styles */}
      <style>{`
        @keyframes kloel-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes kloel-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .kloel-card:hover { border-color: #333338 !important; }
        .kloel-tab:hover { color: #E0DDD8 !important; }
        .kloel-btn:hover { opacity: 0.85; }
        .kloel-row:hover { background: rgba(255,255,255,0.015); }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0A0A0C; }
        ::-webkit-scrollbar-thumb { background: #222226; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #333338; }
      `}</style>

      <div style={{ padding: 32, minHeight: '100vh', background: '#0A0A0C', animation: 'kloel-fade-in 0.4s ease' }}>
        <div style={{ maxWidth: 1060, position: 'relative' }}>

          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontFamily: "'Sora', sans-serif", fontSize: 20, fontWeight: 600, color: '#E0DDD8', margin: 0, letterSpacing: '-0.01em' }}>
              Carteira
            </h1>
            <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#3A3A3F', margin: '4px 0 0 0' }}>
              Gerencie seu saldo, transacoes, saques e antecipacoes
            </p>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #19191C', marginBottom: 24 }}>
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  className="kloel-tab"
                  onClick={() => setTab(t.id)}
                  style={{
                    fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: active ? 600 : 400,
                    color: active ? '#E85D30' : '#6E6E73', background: 'transparent', border: 'none',
                    borderBottom: active ? '2px solid #E85D30' : '2px solid transparent',
                    padding: '10px 18px', cursor: 'pointer', transition: 'all 150ms ease',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{ color: active ? '#E85D30' : '#3A3A3F' }}>{t.icon(14)}</span>
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {tab === 'saldo' && <TabSaldo availableTick={availableTick} />}
          {tab === 'extrato' && <TabExtrato search={search} setSearch={setSearch} filterType={filterType} setFilterType={setFilterType} />}
          {tab === 'movimentacoes' && <TabMovimentacoes />}
          {tab === 'saques' && <TabSaques onWithdraw={() => setShowWithdrawModal(true)} />}
          {tab === 'antecipacoes' && <TabAntecipacoes onAntecipate={() => setShowAntecipateModal(true)} />}

        </div>
      </div>

      {/* Modals */}
      <WithdrawModal open={showWithdrawModal} onClose={() => setShowWithdrawModal(false)} amount={withdrawAmount} setAmount={setWithdrawAmount} />
      <AntecipateModal open={showAntecipateModal} onClose={() => setShowAntecipateModal(false)} amount={antecipateAmount} setAmount={setAntecipateAmount} />
    </>
  );
}
