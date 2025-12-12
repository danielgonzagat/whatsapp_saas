'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  TrendingUp, 
  DollarSign, 
  CreditCard, 
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Calendar,
  RefreshCw,
  Wallet,
  ArrowDownRight,
  Loader2,
  Plus,
  Link as LinkIcon,
  BarChart3,
} from 'lucide-react';
import { getWalletBalance, getWalletTransactions, type WalletBalance, type WalletTransaction, createPaymentLink, type PaymentLinkResponse } from '@/lib/api';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { CenterStage, Section, UniversalComposer, ContextCapsule, StageHeadline, STAGE_HEADLINES } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';

// -------------- DESIGN TOKENS --------------
const COLORS = {
  bg: colors.background.obsidian,
  surface: colors.background.surface1,
  surfaceHover: colors.background.surface2,
  green: colors.brand.green,
  textPrimary: colors.text.primary,
  textSecondary: colors.text.secondary,
  border: colors.divider,
};

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  confirmed: { 
    label: 'Confirmado', 
    color: 'text-emerald-400 bg-emerald-500/10', 
    icon: <CheckCircle2 className="w-4 h-4" /> 
  },
  pending: { 
    label: 'Pendente', 
    color: 'text-amber-400 bg-amber-500/10', 
    icon: <Clock className="w-4 h-4" /> 
  },
  failed: { 
    label: 'Falhou', 
    color: 'text-red-400 bg-red-500/10', 
    icon: <XCircle className="w-4 h-4" /> 
  },
};

const typeConfig: Record<string, { label: string; icon: React.ReactNode; isPositive: boolean }> = {
  sale: { label: 'Venda', icon: <ArrowUpRight className="w-4 h-4" />, isPositive: true },
  withdrawal: { label: 'Saque', icon: <ArrowDownRight className="w-4 h-4" />, isPositive: false },
  refund: { label: 'Reembolso', icon: <ArrowDownRight className="w-4 h-4" />, isPositive: false },
  fee: { label: 'Taxa', icon: <CreditCard className="w-4 h-4" />, isPositive: false },
};

export default function SalesPage() {
  const workspaceId = useWorkspaceId();
  const router = useRouter();
  
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [balanceData, transactionsData] = await Promise.all([
        getWalletBalance(workspaceId),
        getWalletTransactions(workspaceId),
      ]);
      setBalance(balanceData);
      setTransactions(transactionsData);
    } catch (error) {
      console.error('Failed to load sales data:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const formatCurrency = (value: number) => 
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Calculate stats from transactions
  const confirmedTransactions = transactions.filter(t => t.status === 'confirmed' && t.type === 'sale');
  const pendingTransactions = transactions.filter(t => t.status === 'pending' && t.type === 'sale');
  const stats = {
    totalRevenue: confirmedTransactions.reduce((sum, t) => sum + (t.netAmount || t.amount), 0),
    pendingAmount: pendingTransactions.reduce((sum, t) => sum + (t.netAmount || t.amount), 0),
    totalSales: confirmedTransactions.length,
    totalPending: pendingTransactions.length,
  };

  // Handle chat message
  const handleChatSend = (message: string) => {
    const encodedMessage = encodeURIComponent(message);
    router.push(`/chat?q=${encodedMessage}`);
  };

  // Dynamic action chips
  const actionChips = [
    { id: 'link', label: 'Criar link', icon: LinkIcon, prompt: 'Crie um link de pagamento para' },
    { id: 'analyze', label: 'Analisar vendas', icon: BarChart3, prompt: 'Analise minhas vendas da última semana e sugira melhorias' },
    { id: 'withdraw', label: 'Sacar saldo', icon: Wallet, prompt: 'Como faço para sacar meu saldo disponível?' },
    { id: 'report', label: 'Relatório', icon: TrendingUp, prompt: 'Gere um relatório completo das minhas vendas' },
  ];

  return (
    <div 
      className="min-h-full"
      style={{ backgroundColor: COLORS.bg }}
    >
      {/* Hero Section with Chat */}
      <Section spacing="md" className="flex flex-col items-center">
        <CenterStage size="L" className="text-center">
          <div className="mb-6">
            <ContextCapsule 
              page="sales"
              items={balance ? [{ label: 'Saldo', value: balance.formattedTotal }] : []}
            />
          </div>
          <StageHeadline
            headline={STAGE_HEADLINES.sales.headline}
            highlight={STAGE_HEADLINES.sales.highlight}
            subheadline={balance ? `Saldo disponível: ${balance.formattedTotal}` : 'Carregando dados de vendas...'}
            size="l"
          />
          <UniversalComposer
            placeholder="Pergunte sobre suas vendas ou crie um link de pagamento..."
            chips={actionChips}
            onSend={handleChatSend}
            size="compact"
          />
        </CenterStage>
      </Section>

      <div className="px-6 pb-8 max-w-5xl mx-auto space-y-6">
        {/* Actions Row */}
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg transition-colors"
            style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} style={{ color: COLORS.textSecondary }} />
          </button>

          <button
            onClick={() => setShowPaymentModal(true)}
            className="flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors"
            style={{ backgroundColor: COLORS.green, color: COLORS.bg }}
          >
            <Plus className="w-5 h-5" />
            Criar Link de Pagamento
          </button>
        </div>

        {/* Balance Cards */}
        {balance && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div 
              className="rounded-xl p-6"
              style={{ 
                backgroundColor: COLORS.surface, 
                border: `1px solid ${COLORS.green}`,
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${COLORS.green}20` }}
                >
                  <DollarSign className="w-6 h-6" style={{ color: COLORS.green }} />
                </div>
                <span 
                  className="text-xs px-2 py-1 rounded-full"
                  style={{ backgroundColor: `${COLORS.green}20`, color: COLORS.green }}
                >
                  Disponível para saque
                </span>
              </div>
              <p className="text-sm mb-1" style={{ color: COLORS.textSecondary }}>Saldo Disponível</p>
              <p className="text-3xl font-bold" style={{ color: COLORS.textPrimary }}>{balance.formattedAvailable}</p>
            </div>

            <div 
              className="rounded-xl p-6"
              style={{ backgroundColor: COLORS.surface, border: `1px solid rgba(234,179,8,0.3)` }}
            >
              <div className="flex items-center justify-between mb-4">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(234,179,8,0.2)' }}
                >
                  <Clock className="w-6 h-6" style={{ color: '#EAB308' }} />
                </div>
                <span 
                  className="text-xs px-2 py-1 rounded-full"
                  style={{ backgroundColor: 'rgba(234,179,8,0.2)', color: '#EAB308' }}
                >
                  Aguardando confirmação
                </span>
              </div>
              <p className="text-sm mb-1" style={{ color: COLORS.textSecondary }}>Saldo Pendente</p>
              <p className="text-3xl font-bold" style={{ color: COLORS.textPrimary }}>{balance.formattedPending}</p>
            </div>

            <div 
              className="rounded-xl p-6"
              style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            >
              <div className="flex items-center justify-between mb-4">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(168,85,247,0.2)' }}
                >
                  <Wallet className="w-6 h-6" style={{ color: '#A855F7' }} />
                </div>
              </div>
              <p className="text-sm mb-1" style={{ color: COLORS.textSecondary }}>Total Acumulado</p>
              <p className="text-3xl font-bold" style={{ color: COLORS.textPrimary }}>{balance.formattedTotal}</p>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div 
            className="rounded-xl p-5"
            style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="w-5 h-5" style={{ color: COLORS.green }} />
              <p className="text-sm" style={{ color: COLORS.textSecondary }}>Vendas Confirmadas</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: COLORS.textPrimary }}>{stats.totalSales}</p>
          </div>

          <div 
            className="rounded-xl p-5"
            style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5" style={{ color: '#EAB308' }} />
              <p className="text-sm" style={{ color: COLORS.textSecondary }}>Vendas Pendentes</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: COLORS.textPrimary }}>{stats.totalPending}</p>
          </div>

          <div 
            className="rounded-xl p-5"
            style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-5 h-5" style={{ color: COLORS.green }} />
              <p className="text-sm" style={{ color: COLORS.textSecondary }}>Receita Confirmada</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: COLORS.textPrimary }}>{formatCurrency(stats.totalRevenue)}</p>
          </div>

          <div 
            className="rounded-xl p-5"
            style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <div className="flex items-center gap-3 mb-2">
              <CreditCard className="w-5 h-5" style={{ color: '#A855F7' }} />
              <p className="text-sm" style={{ color: COLORS.textSecondary }}>Total Transações</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: COLORS.textPrimary }}>{transactions.length}</p>
          </div>
        </div>

        {/* Transactions List */}
        <div 
          className="rounded-xl"
          style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
        >
          <div 
            className="px-6 py-4 border-b flex items-center justify-between"
            style={{ borderColor: COLORS.border }}
          >
            <h3 className="font-semibold" style={{ color: COLORS.textPrimary }}>Últimas Transações</h3>
            <div 
              className="flex items-center gap-2 rounded-lg p-1"
              style={{ backgroundColor: COLORS.surfaceHover }}
            >
              {(['day', 'week', 'month'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: period === p ? COLORS.green : 'transparent',
                    color: period === p ? COLORS.bg : COLORS.textSecondary,
                  }}
                >
                  {p === 'day' && 'Hoje'}
                  {p === 'week' && 'Semana'}
                  {p === 'month' && 'Mês'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: COLORS.green }} />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12">
              <Wallet className="w-16 h-16 mx-auto mb-4" style={{ color: COLORS.textSecondary }} />
              <p className="text-lg" style={{ color: COLORS.textSecondary }}>Nenhuma transação ainda</p>
              <p className="text-sm mt-2" style={{ color: COLORS.textSecondary }}>
                As vendas realizadas pela KLOEL aparecerão aqui
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: COLORS.border }}>
              {transactions.map((tx) => {
                const typeInfo = typeConfig[tx.type] || typeConfig.sale;
                const statusInfo = statusConfig[tx.status] || statusConfig.pending;

                return (
                  <div 
                    key={tx.id} 
                    className="px-6 py-4 flex items-center justify-between transition-colors hover:bg-white/5"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        typeInfo.isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {typeInfo.icon}
                      </div>
                      <div>
                        <p className="font-medium" style={{ color: COLORS.textPrimary }}>{typeInfo.label}</p>
                        <p className="text-sm" style={{ color: COLORS.textSecondary }}>{tx.description || `ID: ${tx.id.slice(0, 8)}...`}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className={`font-semibold ${typeInfo.isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                          {typeInfo.isPositive ? '+' : '-'} {formatCurrency(tx.netAmount || tx.amount)}
                        </p>
                        {tx.grossAmount && tx.grossAmount !== tx.amount && (
                          <p className="text-xs" style={{ color: COLORS.textSecondary }}>
                            Bruto: {formatCurrency(tx.grossAmount)} | Taxas: {formatCurrency((tx.gatewayFee || 0) + (tx.kloelFee || 0))}
                          </p>
                        )}
                      </div>

                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                        {statusInfo.icon}
                        {statusInfo.label}
                      </span>

                      <div className="text-sm flex items-center gap-1 min-w-[100px]" style={{ color: COLORS.textSecondary }}>
                        <Calendar className="w-4 h-4" />
                        {formatDate(tx.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal onClose={() => setShowPaymentModal(false)} onSuccess={loadData} workspaceId={workspaceId} />
      )}
    </div>
  );
}

function PaymentModal({ onClose, onSuccess, workspaceId }: { onClose: () => void; onSuccess: () => void; workspaceId: string }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    productName: '',
    amount: '',
    customerPhone: '',
    customerName: '',
  });
  const [result, setResult] = useState<PaymentLinkResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await createPaymentLink(workspaceId, {
        productName: form.productName,
        amount: parseFloat(form.amount),
        customerPhone: form.customerPhone,
        customerName: form.customerName || undefined,
      });
      setResult(response);
      onSuccess();
    } catch (error) {
      console.error('Failed to create payment link:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#FAFAFA] rounded-2xl p-6 w-full max-w-md border border-[#E5E5E5]" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-[#1A1A1A] mb-4">Criar Link de Pagamento</h3>

        {result ? (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-emerald-400 text-center font-medium">Link criado com sucesso!</p>
            </div>
            {result.payment?.pixQrCodeUrl && (
              <div className="bg-[#F5F5F5] rounded-lg p-4 space-y-2 text-center">
                <p className="text-[#666666] text-xs">QR Code PIX</p>
                <img src={result.payment.pixQrCodeUrl} alt="QR Code PIX" className="mx-auto w-48 h-48" />
              </div>
            )}

            <div className="bg-[#F5F5F5] rounded-lg p-3 space-y-2">
              <p className="text-[#666666] text-xs">Link / Código PIX:</p>
              <p className="text-[#1A1A1A] text-sm break-all">
                {result.paymentLink || result.payment?.paymentLink || result.payment?.invoiceUrl || result.payment?.pixCopyPaste}
              </p>
              {result.payment?.pixCopyPaste && (
                <p className="text-[#666666] text-xs break-all">{result.payment.pixCopyPaste}</p>
              )}
            </div>
            <button
              onClick={() => {
                const text = result.paymentLink || result.payment?.paymentLink || result.payment?.invoiceUrl || result.payment?.pixCopyPaste || '';
                if (text) navigator.clipboard.writeText(text);
              }}
              className="w-full py-3 bg-[#1A1A1A] text-white font-medium rounded-lg hover:bg-[#333333]"
            >
              Copiar
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 bg-[#E5E5E5] text-[#1A1A1A] font-medium rounded-lg hover:bg-[#D5D5D5]"
            >
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[#666666] text-sm mb-1 block">Nome do Produto</label>
              <input
                type="text"
                required
                value={form.productName}
                onChange={e => setForm(f => ({ ...f, productName: e.target.value }))}
                className="w-full bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
                placeholder="Ex: Curso de IA"
              />
            </div>
            <div>
              <label className="text-[#666666] text-sm mb-1 block">Valor (R$)</label>
              <input
                type="number"
                required
                min="1"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
                placeholder="1200.00"
              />
            </div>
            <div>
              <label className="text-[#666666] text-sm mb-1 block">WhatsApp do Cliente</label>
              <input
                type="text"
                required
                value={form.customerPhone}
                onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))}
                className="w-full bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
                placeholder="5511999887766"
              />
            </div>
            <div>
              <label className="text-[#666666] text-sm mb-1 block">Nome do Cliente (opcional)</label>
              <input
                type="text"
                value={form.customerName}
                onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                className="w-full bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
                placeholder="João Silva"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#1A1A1A] text-white font-medium rounded-lg hover:bg-[#333333] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              Gerar Link PIX
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 bg-[#E5E5E5] text-[#1A1A1A] font-medium rounded-lg hover:bg-[#D5D5D5]"
            >
              Cancelar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
