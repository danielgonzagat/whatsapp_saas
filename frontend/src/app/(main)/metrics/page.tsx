'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  MessageSquare,
  Users,
  Bot,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
  Activity,
  Zap,
  DollarSign,
  Target,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useSession } from 'next-auth/react';

interface Metrics {
  messages: {
    sent: number;
    received: number;
    delivered: number;
    read: number;
    failed: number;
    trend: number;
  };
  contacts: {
    total: number;
    new: number;
    active: number;
    trend: number;
  };
  autopilot: {
    enabled: boolean;
    messagesHandled: number;
    decisionsExecuted: number;
    conversionRate: number;
    trend: number;
  };
  sales: {
    total: number;
    value: number;
    pending: number;
    trend: number;
  };
  campaigns: {
    total: number;
    active: number;
    sent: number;
    delivered: number;
  };
  flows: {
    total: number;
    executions: number;
    successRate: number;
  };
  queues?: {
    autopilot: { waiting: number; active: number; failed: number };
    campaigns: { waiting: number; active: number; failed: number };
    flows: { waiting: number; active: number; failed: number };
  };
}

const defaultMetrics: Metrics = {
  messages: { sent: 0, received: 0, delivered: 0, read: 0, failed: 0, trend: 0 },
  contacts: { total: 0, new: 0, active: 0, trend: 0 },
  autopilot: { enabled: false, messagesHandled: 0, decisionsExecuted: 0, conversionRate: 0, trend: 0 },
  sales: { total: 0, value: 0, pending: 0, trend: 0 },
  campaigns: { total: 0, active: 0, sent: 0, delivered: 0 },
  flows: { total: 0, executions: 0, successRate: 0 },
};

export default function MetricsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const workspaceId = (session as any)?.user?.workspaceId || '';

  const [metrics, setMetrics] = useState<Metrics>(defaultMetrics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!token || !workspaceId) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch all metrics in parallel
      const [metricsRes, queuesRes] = await Promise.all([
        fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/analytics/metrics?workspaceId=${workspaceId}&period=${period}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        ),
        fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/ops/queues/stats?workspaceId=${workspaceId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        ).catch(() => null),
      ]);

      if (!metricsRes.ok) throw new Error('Falha ao carregar métricas');
      
      const metricsData = await metricsRes.json();
      let queuesData = null;
      
      if (queuesRes?.ok) {
        queuesData = await queuesRes.json();
      }

      setMetrics({
        ...defaultMetrics,
        ...metricsData,
        queues: queuesData,
      });
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId, period]);

  useEffect(() => {
    fetchMetrics();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const formatNumber = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
  };

  const formatCurrency = (n: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  };

  const TrendIndicator = ({ value }: { value: number }) => {
    if (value === 0) return null;
    const isPositive = value > 0;
    return (
      <span className={`flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
        {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Métricas</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Visão geral do desempenho do seu negócio
            {lastUpdated && (
              <span className="ml-2 text-zinc-500">
                • Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-zinc-700"
          >
            <option value="today">Hoje</option>
            <option value="week">Última Semana</option>
            <option value="month">Último Mês</option>
          </select>
          <button
            onClick={fetchMetrics}
            disabled={loading}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-400">{error}</span>
        </div>
      )}

      {loading && !metrics.messages.sent ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* Main Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Messages */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                </div>
                <TrendIndicator value={metrics.messages.trend} />
              </div>
              <h3 className="text-sm font-medium text-zinc-400 mb-1">Mensagens Enviadas</h3>
              <p className="text-3xl font-bold text-white">{formatNumber(metrics.messages.sent)}</p>
              <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                <span>{formatNumber(metrics.messages.delivered)} entregues</span>
                <span>{formatNumber(metrics.messages.read)} lidas</span>
              </div>
            </div>

            {/* Contacts */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <Users className="w-5 h-5 text-green-400" />
                </div>
                <TrendIndicator value={metrics.contacts.trend} />
              </div>
              <h3 className="text-sm font-medium text-zinc-400 mb-1">Total de Contatos</h3>
              <p className="text-3xl font-bold text-white">{formatNumber(metrics.contacts.total)}</p>
              <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                <span className="text-green-400">+{metrics.contacts.new} novos</span>
                <span>{metrics.contacts.active} ativos</span>
              </div>
            </div>

            {/* Autopilot */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <Bot className="w-5 h-5 text-purple-400" />
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${metrics.autopilot.enabled ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800 text-zinc-500'}`}>
                  {metrics.autopilot.enabled ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <h3 className="text-sm font-medium text-zinc-400 mb-1">Autopilot</h3>
              <p className="text-3xl font-bold text-white">{formatNumber(metrics.autopilot.messagesHandled)}</p>
              <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                <span>{metrics.autopilot.decisionsExecuted} decisões</span>
                <span>{metrics.autopilot.conversionRate.toFixed(1)}% conversão</span>
              </div>
            </div>

            {/* Sales */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                </div>
                <TrendIndicator value={metrics.sales.trend} />
              </div>
              <h3 className="text-sm font-medium text-zinc-400 mb-1">Vendas</h3>
              <p className="text-3xl font-bold text-white">{formatCurrency(metrics.sales.value)}</p>
              <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                <span>{metrics.sales.total} fechadas</span>
                <span>{metrics.sales.pending} pendentes</span>
              </div>
            </div>
          </div>

          {/* Secondary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {/* Campaigns */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <Target className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Campanhas</h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Total</span>
                  <span className="text-white font-medium">{metrics.campaigns.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Ativas</span>
                  <span className="text-green-400 font-medium">{metrics.campaigns.active}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Mensagens Enviadas</span>
                  <span className="text-white font-medium">{formatNumber(metrics.campaigns.sent)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Taxa de Entrega</span>
                  <span className="text-white font-medium">
                    {metrics.campaigns.sent > 0 
                      ? ((metrics.campaigns.delivered / metrics.campaigns.sent) * 100).toFixed(1) 
                      : 0}%
                  </span>
                </div>
              </div>
            </div>

            {/* Flows */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-cyan-500/10 rounded-lg">
                  <Zap className="w-5 h-5 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Fluxos</h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Total de Fluxos</span>
                  <span className="text-white font-medium">{metrics.flows.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Execuções</span>
                  <span className="text-white font-medium">{formatNumber(metrics.flows.executions)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Taxa de Sucesso</span>
                  <span className="text-green-400 font-medium">{metrics.flows.successRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* Queues (if available) */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-rose-500/10 rounded-lg">
                  <Activity className="w-5 h-5 text-rose-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Filas (Jobs)</h3>
              </div>
              {metrics.queues ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Autopilot</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-400">{metrics.queues.autopilot.waiting} espera</span>
                      <span className="text-xs text-green-400">{metrics.queues.autopilot.active} ativo</span>
                      {metrics.queues.autopilot.failed > 0 && (
                        <span className="text-xs text-red-400">{metrics.queues.autopilot.failed} falhas</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Campanhas</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-400">{metrics.queues.campaigns.waiting} espera</span>
                      <span className="text-xs text-green-400">{metrics.queues.campaigns.active} ativo</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Fluxos</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-400">{metrics.queues.flows.waiting} espera</span>
                      <span className="text-xs text-green-400">{metrics.queues.flows.active} ativo</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Dados de filas indisponíveis</p>
              )}
            </div>
          </div>

          {/* Message Stats Breakdown */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-6">Detalhamento de Mensagens</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-zinc-800/50 rounded-lg">
                <p className="text-2xl font-bold text-white">{formatNumber(metrics.messages.sent)}</p>
                <p className="text-sm text-zinc-400 mt-1">Enviadas</p>
              </div>
              <div className="text-center p-4 bg-zinc-800/50 rounded-lg">
                <p className="text-2xl font-bold text-blue-400">{formatNumber(metrics.messages.received)}</p>
                <p className="text-sm text-zinc-400 mt-1">Recebidas</p>
              </div>
              <div className="text-center p-4 bg-zinc-800/50 rounded-lg">
                <p className="text-2xl font-bold text-green-400">{formatNumber(metrics.messages.delivered)}</p>
                <p className="text-sm text-zinc-400 mt-1">Entregues</p>
              </div>
              <div className="text-center p-4 bg-zinc-800/50 rounded-lg">
                <p className="text-2xl font-bold text-purple-400">{formatNumber(metrics.messages.read)}</p>
                <p className="text-sm text-zinc-400 mt-1">Lidas</p>
              </div>
              <div className="text-center p-4 bg-zinc-800/50 rounded-lg">
                <p className="text-2xl font-bold text-red-400">{formatNumber(metrics.messages.failed)}</p>
                <p className="text-sm text-zinc-400 mt-1">Falhas</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
