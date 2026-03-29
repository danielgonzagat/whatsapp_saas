'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWalletBalance, useWalletTransactions, useWalletChart, useWalletMonthly, useWalletWithdrawals, useWalletAnticipations } from '@/hooks/useWallet';

/*
  KLOEL — CARTEIRA
  "Cada centavo que entra. Cada centavo que sai. Tudo visivel."
*/

const IC: Record<string, (s: number) => React.ReactElement> = {
  wallet: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="1" y="5" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>,
  trend: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  trendD: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>,
  download: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  upload: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  clock: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  check: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  search: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  filter: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  spark: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  lock: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  bank: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M3 22h18"/><path d="M6 18V11"/><path d="M10 18V11"/><path d="M14 18V11"/><path d="M18 18V11"/><path d="M12 2L2 8h20L12 2z"/></svg>,
  zap: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  arrowUp: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>,
  arrowDown: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>,
  copy: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  calendar: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  shield: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  pix: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M17.7 14.3l-3-3c-.4-.4-1-.4-1.4 0l-2.6 2.6c-.4.4-1 .4-1.4 0l-3-3c-.4-.4-.4-1 0-1.4l3-3c.4-.4.4-1 0-1.4l-3-3c-.4-.4-1-.4-1.4 0l-3 3c-.4.4-.4 1 0 1.4l3 3c.4.4.4 1 0 1.4l-3 3c-.4.4-.4 1 0 1.4l3 3c.4.4 1 .4 1.4 0l3-3c.4-.4 1-.4 1.4 0l3 3c.4.4 1 .4 1.4 0l3-3c.4-.4.4-1 0-1.4z" opacity=".6"/></svg>,
};

/* ═══ DEFAULT (EMPTY) DATA ═══ */
const BALANCE = { available: 0, pending: 0, blocked: 0, total: 0 };
const TRANSACTIONS: { id: string; type: string; desc: string; amount: number; status: string; method: string; date: string; time: string; fee: number }[] = [];
const WITHDRAWALS: any[] = [];
const ANTICIPATIONS: any[] = [];

const MONTH_DAYS: { day: number; income: number; expense: number }[] = [];

/* ═══ HELPERS ═══ */
const TYPE_CONFIG: Record<string, { label: string; color: string; icon: (s: number) => React.ReactElement; sign: string }> = {
  sale: { label: "Venda", color: "#E85D30", icon: IC.arrowDown, sign: "+" },
  commission: { label: "Comissao", color: "#10B981", icon: IC.arrowDown, sign: "+" },
  withdrawal: { label: "Saque", color: "#6E6E73", icon: IC.arrowUp, sign: "" },
  refund: { label: "Reembolso", color: "#EF4444", icon: IC.arrowUp, sign: "" },
  anticipation: { label: "Antecipacao", color: "#3B82F6", icon: IC.spark, sign: "+" },
};
const STATUS_COLOR: Record<string, string> = { completed: "#E85D30", pending: "#F59E0B", processing: "#3B82F6", failed: "#EF4444" };
const STATUS_LABEL: Record<string, string> = { completed: "Concluido", pending: "Pendente", processing: "Processando", failed: "Falhou" };

function Fmt(v: number) { return Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

/* ═══ EXTRACTED COMPONENTS ═══ */

type BalanceData = { available: number; pending: number; blocked: number; total: number };
type TransactionItem = { id: string; type: string; desc: string; amount: number; status: string; method: string; date: string; time: string; fee: number };

/* --- WithdrawModal --- */
function WithdrawModal({ open, onClose, available, withdrawAmount, onWithdrawAmountChange }: {
  open: boolean;
  onClose: () => void;
  available: number;
  withdrawAmount: string;
  onWithdrawAmountChange: (v: string) => void;
}) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{ background: "#0A0A0C", border: "1px solid #222226", borderRadius: 6, width: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #19191C", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#E0DDD8" }}>Solicitar saque</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#3A3A3F", cursor: "pointer" }}>{IC.x(16)}</button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 16, marginBottom: 20 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Disponivel para saque</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 700, color: "#E85D30" }}>R$ {Fmt(available)}</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 6 }}>Valor do saque</label>
            <div style={{ display: "flex", alignItems: "center", background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: "12px 16px" }}>
              <span style={{ fontSize: 14, color: "#6E6E73", marginRight: 8 }}>R$</span>
              <input value={withdrawAmount} onChange={e => onWithdrawAmountChange(e.target.value)} placeholder="0,00" autoFocus style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#E0DDD8", fontSize: 18, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 6 }}>Conta destino</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[{ bank: "Nubank", acc: "****4521", type: "PIX" }, { bank: "Banco do Brasil", acc: "****7890", type: "TED" }].map((b, i) => (
                <label key={b.bank} style={{ display: "flex", alignItems: "center", gap: 10, background: i === 0 ? "rgba(232,93,48,0.04)" : "#111113", border: `1px solid ${i === 0 ? "rgba(232,93,48,0.15)" : "#222226"}`, borderRadius: 6, padding: "10px 14px", cursor: "pointer" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${i === 0 ? "#E85D30" : "#3A3A3F"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {i === 0 && <div style={{ width: 8, height: 8, borderRadius: 2, background: "#E85D30" }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#E0DDD8", display: "block" }}>{b.bank}</span>
                    <span style={{ fontSize: 10, color: "#3A3A3F" }}>{b.acc} — {b.type}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#3B82F6", display: "flex" }}>{IC.shield(14)}</span>
            <span style={{ fontSize: 11, color: "#6E6E73" }}>Saques via PIX sao processados em ate 2 minutos. TED em ate 1 dia util.</span>
          </div>
          <button onClick={onClose} style={{ width: "100%", padding: "14px 24px", background: "#E85D30", color: "#0A0A0C", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>Solicitar saque</button>
        </div>
      </div>
    </div>
  );
}

/* --- AntecipateModal --- */
function AntecipateModal({ open, onClose, pending, antecipateAmount, onAntecipateAmountChange }: {
  open: boolean;
  onClose: () => void;
  pending: number;
  antecipateAmount: string;
  onAntecipateAmountChange: (v: string) => void;
}) {
  if (!open) return null;
  const amount = parseFloat(antecipateAmount) || 0;
  const fee = amount * 0.03;
  const net = amount - fee;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{ background: "#0A0A0C", border: "1px solid #222226", borderRadius: 6, width: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #19191C", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#E0DDD8" }}>Antecipar recebiveis</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#3A3A3F", cursor: "pointer" }}>{IC.x(16)}</button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 16, marginBottom: 20 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Disponivel para antecipacao</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 700, color: "#E0DDD8" }}>R$ {Fmt(pending)}</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 6 }}>Valor a antecipar</label>
            <div style={{ display: "flex", alignItems: "center", background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: "12px 16px" }}>
              <span style={{ fontSize: 14, color: "#6E6E73", marginRight: 8 }}>R$</span>
              <input value={antecipateAmount} onChange={e => onAntecipateAmountChange(e.target.value)} placeholder="0,00" autoFocus style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#E0DDD8", fontSize: 18, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }} />
            </div>
          </div>
          {amount > 0 && (
            <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #19191C" }}>
                <span style={{ fontSize: 12, color: "#6E6E73" }}>Valor solicitado</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#E0DDD8" }}>R$ {Fmt(amount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #19191C" }}>
                <span style={{ fontSize: 12, color: "#6E6E73" }}>Taxa (3.0%)</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#EF4444" }}>- R$ {Fmt(fee)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 2px" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#E0DDD8" }}>Voce recebe</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color: "#E85D30" }}>R$ {Fmt(net)}</span>
              </div>
            </div>
          )}
          <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#E85D30", display: "flex" }}>{IC.zap(14)}</span>
            <span style={{ fontSize: 11, color: "#6E6E73" }}>Antecipacao processada instantaneamente. Saldo disponivel em segundos.</span>
          </div>
          <button onClick={onClose} style={{ width: "100%", padding: "14px 24px", background: amount > 0 ? "#E85D30" : "#19191C", color: amount > 0 ? "#0A0A0C" : "#3A3A3F", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: amount > 0 ? "pointer" : "default", fontFamily: "'Sora',sans-serif" }}>Antecipar agora</button>
        </div>
      </div>
    </div>
  );
}

/* --- TabSaldo --- */
function TabSaldo({ bal, revenueChart, txList, onOpenWithdraw, onOpenAntecipate, onNavigateExtrato }: {
  bal: BalanceData;
  revenueChart: number[];
  txList: TransactionItem[];
  onOpenWithdraw: () => void;
  onOpenAntecipate: () => void;
  onNavigateExtrato: () => void;
}) {
  const revenueWeek = revenueChart.some((v: number) => v > 0) ? revenueChart : [3200, 4100, 5200, 4800, 7200, 6800, 8100];
  return (<>
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
      <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 24, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "#E85D30" }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Saldo disponivel</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 32, fontWeight: 700, color: "#E85D30", display: "block", marginBottom: 4 }}>R$ {Fmt(bal.available)}</span>
        <span style={{ fontSize: 11, color: "#3A3A3F" }}>Pronto para saque</span>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onOpenWithdraw} style={{ flex: 1, padding: "10px 16px", background: "#E85D30", color: "#0A0A0C", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Sora',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{IC.upload(12)} Sacar</button>
          <button onClick={onOpenAntecipate} style={{ flex: 1, padding: "10px 16px", background: "none", border: "1px solid #222226", borderRadius: 6, color: "#6E6E73", fontSize: 12, cursor: "pointer", fontFamily: "'Sora',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{IC.spark(12)} Antecipar</button>
        </div>
      </div>
      <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 18 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>A receber</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 600, color: "#F59E0B" }}>R$ {Fmt(bal.pending)}</span>
        <span style={{ fontSize: 11, color: "#3A3A3F", display: "block", marginTop: 4 }}>Aguardando liberacao</span>
      </div>
      <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 18 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Bloqueado</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 600, color: "#3A3A3F" }}>R$ {Fmt(bal.blocked)}</span>
        <span style={{ fontSize: 11, color: "#3A3A3F", display: "block", marginTop: 4 }}>Em garantia</span>
      </div>
      <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 18 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Total acumulado</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 600, color: "#E0DDD8" }}>R$ {Fmt(bal.total)}</span>
        <span style={{ fontSize: 11, color: "#3A3A3F", display: "block", marginTop: 4 }}>Todas as origens</span>
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 20 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#E0DDD8", display: "block", marginBottom: 16 }}>Receita — Ultimos 7 dias</span>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
          {revenueWeek.map((v, i) => { const max = Math.max(...revenueWeek); return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#3A3A3F" }}>{(v / 1000).toFixed(1)}k</span>
              <div style={{ width: "100%", height: `${(v / max) * 70}px`, background: i === revenueWeek.length - 1 ? "#E85D30" : "#E85D3040", borderRadius: "3px 3px 0 0" }} />
            </div>
          ); })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"].map(d => (<span key={d} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#3A3A3F", flex: 1, textAlign: "center" }}>{d}</span>))}
        </div>
      </div>
      <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 20 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#E0DDD8", display: "block", marginBottom: 14 }}>Ultimas transacoes</span>
        {txList.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center" }}>
            <span style={{ fontSize: 12, color: "#3A3A3F" }}>Nenhuma transacao encontrada</span>
          </div>
        ) : txList.slice(0, 5).map((t, i) => { const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.sale; return (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < 4 ? "1px solid #19191C" : "none" }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: `${cfg.color}12`, display: "flex", alignItems: "center", justifyContent: "center", color: cfg.color, flexShrink: 0 }}>{cfg.icon(12)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, color: "#E0DDD8", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.desc}</span>
              <span style={{ fontSize: 10, color: "#3A3A3F" }}>{t.date} {t.time}</span>
            </div>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 600, color: t.amount > 0 ? cfg.color : "#6E6E73" }}>{t.amount > 0 ? "+" : ""}R$ {Fmt(t.amount)}</span>
          </div>
        ); })}
        <button onClick={onNavigateExtrato} style={{ width: "100%", marginTop: 10, padding: "8px 14px", background: "none", border: "1px solid #222226", borderRadius: 6, color: "#6E6E73", fontSize: 11, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>Ver extrato completo</button>
      </div>
    </div>
  </>);
}

/* --- TabExtrato --- */
function TabExtrato({ txList, filterType, onFilterTypeChange, search, onSearchChange }: {
  txList: TransactionItem[];
  filterType: string;
  onFilterTypeChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const filtered = txList.filter(t => { if (filterType !== "todos" && t.type !== filterType) return false; if (search && !t.desc.toLowerCase().includes(search.toLowerCase())) return false; return true; });
  return (<>
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: "8px 14px" }}>
        <span style={{ color: "#3A3A3F" }}>{IC.search(14)}</span>
        <input value={search} onChange={e => onSearchChange(e.target.value)} placeholder="Buscar transacao..." style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#E0DDD8", fontSize: 12, fontFamily: "'Sora',sans-serif" }} />
      </div>
      {["todos", "sale", "commission", "withdrawal", "refund", "anticipation"].map(f => (
        <button key={f} onClick={() => onFilterTypeChange(f)} style={{ padding: "7px 12px", background: filterType === f ? "rgba(232,93,48,0.06)" : "#111113", border: `1px solid ${filterType === f ? "#E85D30" : "#222226"}`, borderRadius: 6, color: filterType === f ? "#E0DDD8" : "#6E6E73", fontSize: 10, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>
          {f === "todos" ? "Todos" : TYPE_CONFIG[f]?.label || f}
        </button>
      ))}
      <button style={{ padding: "7px 12px", background: "none", border: "1px solid #222226", borderRadius: 6, color: "#6E6E73", fontSize: 10, cursor: "pointer", fontFamily: "'Sora',sans-serif", display: "flex", alignItems: "center", gap: 4 }}>{IC.download(10)} CSV</button>
    </div>
    <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, overflow: "hidden" }}>
      {filtered.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: "#3A3A3F" }}>Nenhuma transacao encontrada</span>
        </div>
      ) : filtered.map((t, i) => { const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.sale; return (
        <div key={t.id} style={{ display: "grid", gridTemplateColumns: "36px 2fr 0.8fr 0.6fr 1fr 0.6fr", gap: 12, padding: "12px 16px", borderBottom: i < filtered.length - 1 ? "1px solid #19191C" : "none", alignItems: "center", transition: "background .1s" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#19191C")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: `${cfg.color}12`, display: "flex", alignItems: "center", justifyContent: "center", color: cfg.color }}>{cfg.icon(14)}</div>
          <div><span style={{ fontSize: 13, fontWeight: 500, color: "#E0DDD8", display: "block" }}>{t.desc}</span>{t.fee > 0 && <span style={{ fontSize: 10, color: "#3A3A3F" }}>Taxa: R$ {Fmt(t.fee)}</span>}</div>
          <span style={{ fontSize: 10, fontWeight: 600, color: cfg.color, background: `${cfg.color}12`, padding: "3px 8px", borderRadius: 4, textTransform: "uppercase", fontFamily: "'JetBrains Mono',monospace", textAlign: "center" }}>{cfg.label}</span>
          <span style={{ fontSize: 10, color: STATUS_COLOR[t.status], fontFamily: "'JetBrains Mono',monospace" }}>{STATUS_LABEL[t.status]}</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 600, color: t.amount > 0 ? cfg.color : "#6E6E73" }}>{t.amount > 0 ? "+" : ""}R$ {Fmt(t.amount)}</span>
          <span style={{ fontSize: 10, color: "#3A3A3F" }}>{t.date}<br/>{t.time}</span>
        </div>
      ); })}
    </div>
  </>);
}

/* --- TabMovimentacoes --- */
function TabMovimentacoes({ monthlyData }: {
  monthlyData: { daily?: { day: number; income: number; expense: number }[]; income?: number | null; expense?: number | null } | null;
}) {
  const monthDays = monthlyData?.daily?.length ? monthlyData.daily : MONTH_DAYS;
  const totalIn = monthlyData?.income ?? MONTH_DAYS.reduce((a, d) => a + d.income, 0);
  const totalOut = monthlyData?.expense ?? MONTH_DAYS.reduce((a, d) => a + d.expense, 0);
  const maxDay = Math.max(...monthDays.map(d => d.income), 1);
  return (<>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
      <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 18 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Entradas do mes</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 600, color: "#E85D30" }}>R$ {Fmt(totalIn)}</span>
      </div>
      <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 18 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Saidas do mes</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 600, color: "#6E6E73" }}>R$ {Fmt(totalOut)}</span>
      </div>
      <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 18 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Saldo do mes</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 600, color: "#E85D30" }}>R$ {Fmt(totalIn - totalOut)}</span>
      </div>
    </div>
    <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 20, marginBottom: 24 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: "#E0DDD8", display: "block", marginBottom: 16 }}>Receita diaria — Marco 2026</span>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 100 }}>
        {monthDays.map((d, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: "100%", height: `${(d.income / maxDay) * 90}px`, background: i === monthDays.length - 1 ? "#E85D30" : "#E85D3030", borderRadius: "2px 2px 0 0", minHeight: 2 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {["1","5","10","15","20","25","27"].map(n => <span key={n} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#3A3A3F" }}>{n}</span>)}
      </div>
    </div>
  </>);
}

/* --- TabSaques --- */
function TabSaques({ available, onOpenWithdraw, withdrawals }: {
  available: number;
  onOpenWithdraw: () => void;
  withdrawals: any[];
}) {
  return (<>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
      <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase" }}>Disponivel</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: "#E85D30" }}>R$ {Fmt(available)}</span>
      </div>
      <button onClick={onOpenWithdraw} style={{ padding: "10px 24px", background: "#E85D30", color: "#0A0A0C", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Sora',sans-serif", display: "flex", alignItems: "center", gap: 6 }}>{IC.upload(14)} Novo saque</button>
    </div>
    <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 0.8fr 1.2fr", gap: 12, padding: "10px 16px", borderBottom: "1px solid #19191C" }}>
        {["Valor", "Destino", "Metodo", "Status", "Data"].map(h => <span key={h} style={{ fontSize: 10, fontWeight: 600, color: "#3A3A3F", letterSpacing: ".06em", textTransform: "uppercase" }}>{h}</span>)}
      </div>
      {withdrawals.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: "#3A3A3F" }}>Nenhum saque realizado</span>
        </div>
      ) : withdrawals.map((w: any, i: number, arr: any[]) => (
        <div key={w.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 0.8fr 1.2fr", gap: 12, padding: "14px 16px", borderBottom: i < arr.length - 1 ? "1px solid #19191C" : "none", alignItems: "center" }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 600, color: "#E0DDD8" }}>R$ {Fmt(Math.abs(w.amount))}</span>
          <div><span style={{ fontSize: 12, color: "#E0DDD8", display: "block" }}>{w.bank || w.description || 'Saque'}</span><span style={{ fontSize: 10, color: "#3A3A3F" }}>{w.account || ''}</span></div>
          <span style={{ fontSize: 11, color: "#6E6E73" }}>{w.method || 'PIX'}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: STATUS_COLOR[w.status] || '#6E6E73', fontFamily: "'JetBrains Mono',monospace" }}>{STATUS_LABEL[w.status] || w.status}</span>
          <div><span style={{ fontSize: 11, color: "#6E6E73", display: "block" }}>{w.requested || (w.createdAt ? new Date(w.createdAt).toLocaleString('pt-BR') : '')}</span>{w.completed && <span style={{ fontSize: 10, color: "#3A3A3F" }}>Concluido: {w.completed}</span>}</div>
        </div>
      ))}
    </div>
  </>);
}

/* --- TabAntecipacoes --- */
function TabAntecipacoes({ pending, onOpenAntecipate, anticipations, antTotals }: {
  pending: number;
  onOpenAntecipate: () => void;
  anticipations: any[];
  antTotals: Record<string, number>;
}) {
  const antList = anticipations;
  const totalAnticipated = antTotals.totalAnticipated || 0;
  const totalFees = antTotals.totalFees || 0;
  return (<>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
      <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 16 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Antecipavel agora</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 600, color: "#E85D30" }}>R$ {Fmt(pending)}</span>
      </div>
      <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 16 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Total antecipado</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 600, color: "#E0DDD8" }}>R$ {Fmt(totalAnticipated)}</span>
      </div>
      <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 16 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#6E6E73", letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Taxas pagas</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 600, color: "#6E6E73" }}>R$ {Fmt(totalFees)}</span>
      </div>
      <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 16, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
        <button onClick={onOpenAntecipate} style={{ padding: "10px 24px", background: "#E85D30", color: "#0A0A0C", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Sora',sans-serif", display: "flex", alignItems: "center", gap: 6 }}>{IC.spark(14)} Antecipar agora</button>
      </div>
    </div>
    <div style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 0.6fr 1fr 0.7fr 0.6fr", gap: 12, padding: "10px 16px", borderBottom: "1px solid #19191C" }}>
        {["Valor original", "Taxa", "% Taxa", "Valor liquido", "Parcelas", "Data"].map(h => <span key={h} style={{ fontSize: 10, fontWeight: 600, color: "#3A3A3F", letterSpacing: ".06em", textTransform: "uppercase" }}>{h}</span>)}
      </div>
      {antList.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: "#3A3A3F" }}>Nenhuma antecipacao realizada</span>
        </div>
      ) : antList.map((a: any, i: number) => (
        <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 0.6fr 1fr 0.7fr 0.6fr", gap: 12, padding: "14px 16px", borderBottom: i < antList.length - 1 ? "1px solid #19191C" : "none", alignItems: "center" }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: "#E0DDD8" }}>R$ {Fmt(a.original || a.originalAmount || 0)}</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#EF4444" }}>- R$ {Fmt(a.fee || a.feeAmount || 0)}</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#6E6E73" }}>{a.feePct || a.feePercent || 3.0}%</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 600, color: "#E85D30" }}>R$ {Fmt(a.net || a.netAmount || 0)}</span>
          <span style={{ fontSize: 12, color: "#6E6E73" }}>{a.installments || '—'}x</span>
          <span style={{ fontSize: 11, color: "#3A3A3F" }}>{a.date || (a.createdAt ? new Date(a.createdAt).toLocaleDateString('pt-BR') : '')}</span>
        </div>
      ))}
    </div>
  </>);
}

/* ═══ MAIN ═══ */
export default function KloelCarteira({ defaultTab = "saldo" }: { defaultTab?: string }) {
  const router = useRouter();

  const { balance: realBalance, isLoading: balanceLoading } = useWalletBalance();
  const { transactions: realTransactions, isLoading: txLoading } = useWalletTransactions();
  const { chart: realChart } = useWalletChart();
  const { monthly: realMonthly } = useWalletMonthly();
  const { withdrawals: realWithdrawals } = useWalletWithdrawals();
  const { anticipations: realAnticipations, totals: realAntTotals } = useWalletAnticipations();

  const bal = realBalance && (realBalance.available !== undefined) ? {
    available: realBalance.available ?? 0,
    pending: realBalance.pending ?? 0,
    blocked: realBalance.blocked ?? realBalance.locked ?? 0,
    total: realBalance.total ?? ((realBalance.available ?? 0) + (realBalance.pending ?? 0) + (realBalance.blocked ?? 0)),
  } : BALANCE;

  const txList = (realTransactions && realTransactions.length > 0) ? realTransactions.map((t: any) => ({
    id: t.id,
    type: t.type || 'sale',
    desc: t.description || t.desc || '',
    amount: t.amount,
    status: t.status || 'completed',
    method: t.method || '—',
    date: new Date(t.createdAt).toLocaleDateString('pt-BR'),
    time: new Date(t.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    fee: t.fee || 0,
  })) : TRANSACTIONS;

  const [tab, setTab] = useState(defaultTab);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("todos");
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showAntecipateModal, setShowAntecipateModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [antecipateAmount, setAntecipateAmount] = useState("");
  useEffect(() => { setTab(defaultTab); }, [defaultTab]);

  function handleTabChange(newTab: string) {
    setTab(newTab);
    setFilterType("todos");
    setSearch("");
    const routes: Record<string, string> = {
      saldo: '/carteira/saldo',
      extrato: '/carteira/extrato',
      movimentacoes: '/carteira/movimentacoes',
      saques: '/carteira/saques',
      antecipacoes: '/carteira/antecipacoes',
    };
    router.push(routes[newTab] || '/carteira');
  }

  const TABS = [
    { key: "saldo", label: "Saldo", icon: IC.wallet },
    { key: "extrato", label: "Extrato", icon: IC.calendar },
    { key: "movimentacoes", label: "Movimentacoes", icon: IC.trend },
    { key: "saques", label: "Saques", icon: IC.upload },
    { key: "antecipacoes", label: "Antecipacoes", icon: IC.spark },
  ];

  return (
    <div style={{ background: "#0A0A0C", minHeight: "100vh", fontFamily: "'Sora',sans-serif", color: "#E0DDD8", padding: 28 }}>
      <style>{`::selection{background:rgba(232,93,48,0.3)} input::placeholder{color:#3A3A3F!important} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#222226;border-radius:2px}`}</style>

      <WithdrawModal
        open={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        available={bal.available}
        withdrawAmount={withdrawAmount}
        onWithdrawAmountChange={setWithdrawAmount}
      />
      <AntecipateModal
        open={showAntecipateModal}
        onClose={() => setShowAntecipateModal(false)}
        pending={bal.pending}
        antecipateAmount={antecipateAmount}
        onAntecipateAmountChange={setAntecipateAmount}
      />

      <style>{`@keyframes kloel-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#E0DDD8", margin: 0, letterSpacing: "-0.02em" }}>Carteira</h1>
          <p style={{ fontSize: 13, color: "#3A3A3F", margin: "4px 0 0" }}>Seu dinheiro. Transparente.</p>
        </div>
      </div>

      {balanceLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: "#111113", border: "1px solid #222226", borderRadius: 6, padding: 18 }}>
              <div style={{ width: "60%", height: 10, background: "#19191C", borderRadius: 4, marginBottom: 12, animation: "kloel-pulse 1.5s ease-in-out infinite" }} />
              <div style={{ width: "40%", height: 22, background: "#19191C", borderRadius: 4, animation: "kloel-pulse 1.5s ease-in-out infinite" }} />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #19191C", marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => handleTabChange(t.key)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", background: "none", border: "none", borderBottom: tab === t.key ? "2px solid #E85D30" : "2px solid transparent", color: tab === t.key ? "#E0DDD8" : "#6E6E73", fontSize: 12, fontWeight: tab === t.key ? 600 : 400, cursor: "pointer", fontFamily: "'Sora',sans-serif", transition: "all .15s" }}>
            <span style={{ color: tab === t.key ? "#E85D30" : "#3A3A3F", display: "flex" }}>{t.icon(13)}</span> {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "saldo" && !balanceLoading && <TabSaldo bal={bal} revenueChart={realChart} txList={txList} onOpenWithdraw={() => setShowWithdrawModal(true)} onOpenAntecipate={() => setShowAntecipateModal(true)} onNavigateExtrato={() => handleTabChange("extrato")} />}
        {tab === "extrato" && <TabExtrato txList={txList} filterType={filterType} onFilterTypeChange={setFilterType} search={search} onSearchChange={setSearch} />}
        {tab === "movimentacoes" && <TabMovimentacoes monthlyData={realMonthly} />}
        {tab === "saques" && <TabSaques available={bal.available} onOpenWithdraw={() => setShowWithdrawModal(true)} withdrawals={realWithdrawals} />}
        {tab === "antecipacoes" && <TabAntecipacoes pending={bal.pending} onOpenAntecipate={() => setShowAntecipateModal(true)} anticipations={realAnticipations} antTotals={realAntTotals} />}
      </div>
    </div>
  );
}
