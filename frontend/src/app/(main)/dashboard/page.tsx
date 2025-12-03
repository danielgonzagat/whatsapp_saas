'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { 
  MessageSquareText, 
  Users, 
  Wallet, 
  Package, 
  ArrowRight, 
  Sparkles,
  Smartphone,
  CheckCircle2,
  XCircle,
  Loader2,
  TrendingUp,
  RefreshCw,
  Brain
} from 'lucide-react';
import { getKloelHealth, getWalletBalance, getMemoryStats, getWhatsAppStatus, type WalletBalance, type WhatsAppConnectionStatus, type KloelHealth } from '@/lib/api';

const WORKSPACE_ID = 'default-ws';

interface DashboardData {
  kloel: KloelHealth | null;
  wallet: WalletBalance | null;
  memory: { totalItems: number; products: number; knowledge: number } | null;
  whatsapp: WhatsAppConnectionStatus | null;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    kloel: null,
    wallet: null,
    memory: null,
    whatsapp: null,
  });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [kloelData, walletData, memoryData, whatsappData] = await Promise.allSettled([
        getKloelHealth(),
        getWalletBalance(WORKSPACE_ID),
        getMemoryStats(WORKSPACE_ID),
        getWhatsAppStatus(WORKSPACE_ID),
      ]);

      const offlineStatus: KloelHealth = { status: 'offline', identity: '' };
      setData({
        kloel: kloelData.status === 'fulfilled' ? kloelData.value : offlineStatus,
        wallet: walletData.status === 'fulfilled' ? walletData.value : null,
        memory: memoryData.status === 'fulfilled' ? memoryData.value : null,
        whatsapp: whatsappData.status === 'fulfilled' ? whatsappData.value : null,
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const formatCurrency = (value: number) => 
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400">Visão geral do seu negócio</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 transition-colors"
        >
          <RefreshCw className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* KLOEL CTA */}
      <Link 
        href="/chat"
        className="block p-6 rounded-xl bg-gradient-to-r from-[#00FFA3]/20 to-[#00D4FF]/20 border border-[#00FFA3]/30 hover:border-[#00FFA3] transition-all group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-[#00FFA3] to-[#00D4FF] flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">Converse com a KLOEL</h2>
                {data.kloel?.status === 'online' ? (
                  <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    Online
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-full">
                    Offline
                  </span>
                )}
              </div>
              <p className="text-gray-400 mt-1">
                Sua IA especialista em vendas pelo WhatsApp está pronta para ajudar
              </p>
            </div>
          </div>
          <ArrowRight className="w-6 h-6 text-[#00FFA3] group-hover:translate-x-1 transition-transform" />
        </div>
      </Link>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* WhatsApp Status */}
        <Link href="/whatsapp" className="block">
          <div className={`bg-[#1A1A24] border p-5 rounded-xl hover:bg-[#1A1A24]/80 transition-colors ${
            data.whatsapp?.connected ? 'border-emerald-500/30' : 'border-[#2A2A3E]'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                data.whatsapp?.connected ? 'bg-emerald-500/20' : 'bg-slate-700/50'
              }`}>
                <Smartphone className={`w-5 h-5 ${data.whatsapp?.connected ? 'text-emerald-400' : 'text-slate-500'}`} />
              </div>
              {data.whatsapp?.connected ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-slate-500" />
              )}
            </div>
            <p className="text-gray-400 text-sm">WhatsApp</p>
            <h3 className={`text-lg font-bold mt-1 ${data.whatsapp?.connected ? 'text-emerald-400' : 'text-slate-400'}`}>
              {data.whatsapp?.connected ? 'Conectado' : 'Desconectado'}
            </h3>
            {data.whatsapp?.phone && (
              <p className="text-slate-500 text-xs mt-1">{data.whatsapp.phone}</p>
            )}
          </div>
        </Link>

        {/* Wallet Balance */}
        <Link href="/sales" className="block">
          <div className="bg-[#1A1A24] border border-[#2A2A3E] p-5 rounded-xl hover:bg-[#1A1A24]/80 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-[#00FFA3]/20 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-[#00FFA3]" />
              </div>
            </div>
            <p className="text-gray-400 text-sm">Saldo Total</p>
            <h3 className="text-2xl font-bold text-white mt-1">
              {data.wallet ? data.wallet.formattedTotal : 'R$ 0,00'}
            </h3>
            {data.wallet && data.wallet.pending > 0 && (
              <p className="text-amber-400 text-xs mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {data.wallet.formattedPending} pendente
              </p>
            )}
          </div>
        </Link>

        {/* Products */}
        <Link href="/products" className="block">
          <div className="bg-[#1A1A24] border border-[#2A2A3E] p-5 rounded-xl hover:bg-[#1A1A24]/80 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-[#00D4FF]/20 flex items-center justify-center">
                <Package className="w-5 h-5 text-[#00D4FF]" />
              </div>
            </div>
            <p className="text-gray-400 text-sm">Produtos</p>
            <h3 className="text-2xl font-bold text-white mt-1">
              {data.memory?.products ?? 0}
            </h3>
          </div>
        </Link>

        {/* Memory */}
        <Link href="/products" className="block">
          <div className="bg-[#1A1A24] border border-[#2A2A3E] p-5 rounded-xl hover:bg-[#1A1A24]/80 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                <Brain className="w-5 h-5 text-violet-400" />
              </div>
            </div>
            <p className="text-gray-400 text-sm">Itens na Memória</p>
            <h3 className="text-2xl font-bold text-white mt-1">
              {data.memory?.totalItems ?? 0}
            </h3>
          </div>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#1A1A24] border border-[#2A2A3E] p-5 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4">🚀 Começar agora</h3>
          <ul className="space-y-3">
            <li>
              <Link 
                href="/whatsapp" 
                className={`flex items-center gap-3 transition-colors ${
                  data.whatsapp?.connected 
                    ? 'text-emerald-400 cursor-default' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  data.whatsapp?.connected 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-[#2A2A3E]'
                }`}>
                  {data.whatsapp?.connected ? <CheckCircle2 className="w-4 h-4" /> : '1'}
                </span>
                Conecte seu WhatsApp
                {data.whatsapp?.connected && <span className="text-xs text-emerald-400/70 ml-auto">Conectado</span>}
              </Link>
            </li>
            <li>
              <Link 
                href="/products" 
                className={`flex items-center gap-3 transition-colors ${
                  (data.memory?.products ?? 0) > 0 
                    ? 'text-emerald-400 cursor-default' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  (data.memory?.products ?? 0) > 0 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-[#2A2A3E]'
                }`}>
                  {(data.memory?.products ?? 0) > 0 ? <CheckCircle2 className="w-4 h-4" /> : '2'}
                </span>
                Adicione seus produtos
                {(data.memory?.products ?? 0) > 0 && (
                  <span className="text-xs text-emerald-400/70 ml-auto">{data.memory?.products} produto(s)</span>
                )}
              </Link>
            </li>
            <li>
              <Link href="/chat" className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors">
                <span className="w-6 h-6 rounded-full bg-[#2A2A3E] flex items-center justify-center text-xs">3</span>
                Configure a KLOEL com seu negócio
              </Link>
            </li>
            <li>
              <Link href="/sales" className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors">
                <span className="w-6 h-6 rounded-full bg-[#2A2A3E] flex items-center justify-center text-xs">4</span>
                Comece a receber vendas automáticas!
              </Link>
            </li>
          </ul>
        </div>

        <div className="bg-[#1A1A24] border border-[#2A2A3E] p-5 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4">📊 Resumo</h3>
          
          <div className="space-y-4">
            {data.wallet && data.wallet.total > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Saldo Disponível</span>
                  <span className="text-[#00FFA3] font-semibold">{data.wallet.formattedAvailable}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Saldo Pendente</span>
                  <span className="text-amber-400 font-semibold">{data.wallet.formattedPending}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-700 pt-4">
                  <span className="text-white font-medium">Total</span>
                  <span className="text-white font-bold text-lg">{data.wallet.formattedTotal}</span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-slate-500">
                <Wallet className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm">Nenhuma venda ainda</p>
                <p className="text-xs mt-1">
                  As vendas da KLOEL aparecerão aqui
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              data.kloel?.status === 'online' ? 'bg-emerald-400' : 'bg-red-400'
            } animate-pulse`} />
            <span className="text-slate-300 font-medium">Sistema KLOEL</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className={`${data.kloel?.status === 'online' ? 'text-emerald-400' : 'text-red-400'}`}>
              {data.kloel?.status === 'online' ? '✓ Backend Online' : '✗ Backend Offline'}
            </span>
            <span className={`${data.whatsapp?.connected ? 'text-emerald-400' : 'text-slate-500'}`}>
              {data.whatsapp?.connected ? '✓ WhatsApp' : '○ WhatsApp'}
            </span>
            <span className={`${(data.memory?.products ?? 0) > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
              {(data.memory?.products ?? 0) > 0 ? '✓ Produtos' : '○ Produtos'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
