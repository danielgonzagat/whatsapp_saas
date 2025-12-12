'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  Phone, 
  Mail, 
  MessageCircle,
  TrendingUp,
  Clock,
  Filter,
  Search,
  MoreVertical,
  Star,
  Flame,
  Snowflake,
  Loader2,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import Link from 'next/link';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { getLeads, type Lead } from '@/lib/api';

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  hot: { label: 'Quente', color: 'text-red-400 bg-red-500/10', icon: <Flame className="w-4 h-4" /> },
  warm: { label: 'Morno', color: 'text-amber-400 bg-amber-500/10', icon: <Star className="w-4 h-4" /> },
  new: { label: 'Novo', color: 'text-blue-400 bg-blue-500/10', icon: <Users className="w-4 h-4" /> },
  cold: { label: 'Frio', color: 'text-slate-400 bg-slate-500/10', icon: <Snowflake className="w-4 h-4" /> },
  converted: { label: 'Convertido', color: 'text-emerald-400 bg-emerald-500/10', icon: <TrendingUp className="w-4 h-4" /> },
};

type LeadWithComputed = Omit<Lead, 'lastInteraction'> & { lastInteraction?: Date | null; totalMessages?: number };

const formatTimeAgo = (date?: Date | null) => {
  if (!date || Number.isNaN(date.getTime())) return 'sem dados';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'agora mesmo';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
};

const formatDateTime = (date: Date) =>
  date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function LeadsPage() {
  const workspaceId = useWorkspaceId();
  const [leads, setLeads] = useState<LeadWithComputed[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLeads(workspaceId, {
        status: filterStatus || undefined,
        search: searchTerm || undefined,
      });
      const normalized: LeadWithComputed[] = data.map((lead) => {
        const lastInteractionDate = lead.lastInteraction
          ? new Date(lead.lastInteraction)
          : lead.updatedAt
            ? new Date(lead.updatedAt)
            : lead.createdAt
              ? new Date(lead.createdAt)
              : null;

        return {
          ...lead,
          status: lead.status || 'new',
          lastIntent: lead.lastIntent || 'general',
          totalMessages: lead.totalMessages ?? lead.metadata?.totalMessages ?? 0,
          lastInteraction: lastInteractionDate && !Number.isNaN(lastInteractionDate.getTime()) ? lastInteractionDate : null,
        };
      });

      setLeads(normalized);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load leads', err);
      setError('Falha ao carregar leads');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [workspaceId, filterStatus, searchTerm]);

  useEffect(() => {
    const debounce = setTimeout(fetchLeads, 400);
    return () => clearTimeout(debounce);
  }, [fetchLeads]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchLeads();
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      lead.phone.includes(searchTerm) || 
      lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = !filterStatus || lead.status === filterStatus;
    
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: leads.length,
    hot: leads.filter(l => l.status === 'hot').length,
    converted: leads.filter(l => l.status === 'converted').length,
    totalRevenue: leads.reduce((sum, l) => sum + (l.metadata?.paidAmount || 0), 0),
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Leads</h1>
          <p className="text-[#666666]">Gerencie seus leads e oportunidades</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {loading && leads.length === 0 ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="bg-white rounded-xl p-4 border border-[#E5E5E5] animate-pulse">
              <div className="h-10 bg-[#F5F5F5] rounded-lg mb-4" />
              <div className="h-6 bg-[#F5F5F5] rounded w-1/2" />
            </div>
          ))
        ) : (
          <>
            <div className="bg-white rounded-xl p-4 border border-[#E5E5E5]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-violet-400" />
                </div>
                <span className="text-[#666666] text-sm">Total de Leads</span>
              </div>
              <p className="text-3xl font-bold text-[#1A1A1A]">{stats.total}</p>
            </div>

            <div className="bg-white rounded-xl p-4 border border-[#E5E5E5]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <Flame className="w-5 h-5 text-red-400" />
                </div>
                <span className="text-[#666666] text-sm">Leads Quentes</span>
              </div>
              <p className="text-3xl font-bold text-[#1A1A1A]">{stats.hot}</p>
            </div>

            <div className="bg-white rounded-xl p-4 border border-[#E5E5E5]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="text-[#666666] text-sm">Convertidos</span>
              </div>
              <p className="text-3xl font-bold text-[#1A1A1A]">{stats.converted}</p>
            </div>

            <div className="bg-white rounded-xl p-4 border border-[#E5E5E5]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <span className="text-green-400 font-bold">R$</span>
                </div>
                <span className="text-[#666666] text-sm">Receita Total</span>
              </div>
              <p className="text-3xl font-bold text-[#1A1A1A]">
                {stats.totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 md:justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999999]" />
            <input
              type="text"
              placeholder="Buscar por nome, telefone ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-[#E5E5E5] rounded-lg pl-10 pr-4 py-2 text-[#1A1A1A] placeholder-[#999999] focus:outline-none focus:border-[#1A1A1A]"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-[#666666]" />
            <select
              value={filterStatus || ''}
              onChange={(e) => setFilterStatus(e.target.value || null)}
              className="bg-white border border-[#E5E5E5] rounded-lg px-3 py-2 text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
            >
              <option value="">Todos os status</option>
              <option value="hot">Quentes</option>
              <option value="warm">Mornos</option>
              <option value="new">Novos</option>
              <option value="cold">Frios</option>
              <option value="converted">Convertidos</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[#666666] text-sm">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={loading || isRefreshing}
              className="p-2 rounded-lg bg-white border border-[#E5E5E5] hover:border-[#1A1A1A] transition-colors disabled:opacity-60"
              title="Recarregar leads"
            >
              <RefreshCw className={`w-4 h-4 ${loading || isRefreshing ? 'animate-spin text-violet-400' : 'text-[#666666]'}`} />
            </button>
            {lastUpdated && (
              <span className="text-[#666666]">Atualizado {formatTimeAgo(lastUpdated)}</span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      {/* Leads Table */}
      <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E5E5E5]">
              <th className="text-left px-6 py-4 text-[#666666] font-medium text-sm">Lead</th>
              <th className="text-left px-6 py-4 text-[#666666] font-medium text-sm">Status</th>
              <th className="text-left px-6 py-4 text-[#666666] font-medium text-sm">Intenção</th>
              <th className="text-left px-6 py-4 text-[#666666] font-medium text-sm">Mensagens</th>
              <th className="text-left px-6 py-4 text-[#666666] font-medium text-sm">Última Interação</th>
              <th className="text-right px-6 py-4 text-[#666666] font-medium text-sm">Ações</th>
            </tr>
          </thead>
            <tbody>
            {loading && leads.length === 0 && (
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={idx} className="border-b border-[#E5E5E5]">
                  <td className="px-6 py-4" colSpan={6}>
                    <div className="h-10 bg-[#F5F5F5] rounded animate-pulse" />
                  </td>
                </tr>
              ))
            )}

            {!loading && filteredLeads.map((lead) => (
                <tr 
                  key={lead.id} 
                  className="border-b border-[#E5E5E5] hover:bg-[#F5F5F5] transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-medium">
                        {(lead.name || lead.phone).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[#1A1A1A] font-medium">
                          {lead.name || 'Sem nome'}
                        </p>
                        <div className="flex items-center gap-2 text-[#666666] text-sm">
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[lead.status]?.color}`}>
                      {statusConfig[lead.status]?.icon}
                      {statusConfig[lead.status]?.label}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[#666666] text-sm capitalize">
                      {lead.lastIntent === 'purchase' && '🛒 Compra'}
                      {lead.lastIntent === 'interest' && '👀 Interesse'}
                      {lead.lastIntent === 'support' && '🔧 Suporte'}
                      {(!lead.lastIntent || lead.lastIntent === 'general') && '💬 Geral'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-[#666666]">
                      <MessageCircle className="w-4 h-4 text-[#999999]" />
                      {lead.totalMessages}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-[#666666] text-sm">
                      <Clock className="w-4 h-4" />
                      {formatTimeAgo(lead.lastInteraction as Date | null)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/chat?q=${encodeURIComponent(lead.phone ?? '')}`}
                        className="p-2 rounded-lg hover:bg-[#E5E5E5] transition-colors text-[#666666]"
                        title="Abrir conversa no chat"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={async () => {
                          if (!lead.phone) return;
                          try {
                            await navigator.clipboard.writeText(lead.phone);
                            setCopiedId(lead.id);
                            setTimeout(() => setCopiedId((current) => (current === lead.id ? null : current)), 1500);
                          } catch (err) {
                            console.error('Clipboard copy failed', err);
                          }
                        }}
                        className="p-2 rounded-lg hover:bg-[#E5E5E5] transition-colors text-[#666666]"
                        title="Copiar telefone"
                      >
                        {copiedId === lead.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
        </table>

          {!loading && filteredLeads.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-[#666666] mb-3">Nenhum lead encontrado</p>
              <div className="flex items-center justify-center gap-3 text-sm text-[#666666]">
                <Link href="/chat?q=importar%20minha%20lista%20de%20leads" className="text-violet-300 hover:text-violet-200 underline">Pedir para o KLOEL importar</Link>
                <span className="text-slate-600">•</span>
                <Link href="/autopilot" className="text-violet-300 hover:text-violet-200 underline">Configurar Autopilot</Link>
              </div>
          </div>
        )}
      </div>
    </div>
  );
}
