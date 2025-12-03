'use client';

import { useState, useEffect } from 'react';
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
  Snowflake
} from 'lucide-react';

// Mock data - será substituído por API real
const mockLeads = [
  {
    id: '1',
    phone: '5511999887766',
    name: 'João Silva',
    email: 'joao@email.com',
    status: 'hot',
    lastIntent: 'purchase',
    totalMessages: 12,
    lastInteraction: new Date(Date.now() - 1000 * 60 * 30), // 30 min atrás
    metadata: { source: 'whatsapp', product: 'Curso IA' },
  },
  {
    id: '2',
    phone: '5511988776655',
    name: 'Maria Santos',
    status: 'warm',
    lastIntent: 'interest',
    totalMessages: 5,
    lastInteraction: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2h atrás
    metadata: { source: 'whatsapp' },
  },
  {
    id: '3',
    phone: '5511977665544',
    name: null,
    status: 'new',
    lastIntent: 'general',
    totalMessages: 2,
    lastInteraction: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5h atrás
    metadata: { source: 'whatsapp' },
  },
  {
    id: '4',
    phone: '5511966554433',
    name: 'Pedro Costa',
    status: 'converted',
    lastIntent: 'purchase',
    totalMessages: 18,
    lastInteraction: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 dia atrás
    metadata: { source: 'whatsapp', product: 'Mentoria', paidAmount: 2500 },
  },
];

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  hot: { label: 'Quente', color: 'text-red-400 bg-red-500/10', icon: <Flame className="w-4 h-4" /> },
  warm: { label: 'Morno', color: 'text-amber-400 bg-amber-500/10', icon: <Star className="w-4 h-4" /> },
  new: { label: 'Novo', color: 'text-blue-400 bg-blue-500/10', icon: <Users className="w-4 h-4" /> },
  cold: { label: 'Frio', color: 'text-slate-400 bg-slate-500/10', icon: <Snowflake className="w-4 h-4" /> },
  converted: { label: 'Convertido', color: 'text-emerald-400 bg-emerald-500/10', icon: <TrendingUp className="w-4 h-4" /> },
};

const formatTimeAgo = (date: Date) => {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'agora mesmo';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
};

export default function LeadsPage() {
  const [leads, setLeads] = useState(mockLeads);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

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
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-slate-400">Gerencie seus leads e oportunidades</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-violet-400" />
            </div>
            <span className="text-slate-400 text-sm">Total de Leads</span>
          </div>
          <p className="text-3xl font-bold text-white">{stats.total}</p>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <Flame className="w-5 h-5 text-red-400" />
            </div>
            <span className="text-slate-400 text-sm">Leads Quentes</span>
          </div>
          <p className="text-3xl font-bold text-white">{stats.hot}</p>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-slate-400 text-sm">Convertidos</span>
          </div>
          <p className="text-3xl font-bold text-white">{stats.converted}</p>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <span className="text-green-400 font-bold">R$</span>
            </div>
            <span className="text-slate-400 text-sm">Receita Total</span>
          </div>
          <p className="text-3xl font-bold text-white">
            {stats.totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-slate-400" />
          <select
            value={filterStatus || ''}
            onChange={(e) => setFilterStatus(e.target.value || null)}
            className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500"
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

      {/* Leads Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left px-6 py-4 text-slate-400 font-medium text-sm">Lead</th>
              <th className="text-left px-6 py-4 text-slate-400 font-medium text-sm">Status</th>
              <th className="text-left px-6 py-4 text-slate-400 font-medium text-sm">Intenção</th>
              <th className="text-left px-6 py-4 text-slate-400 font-medium text-sm">Mensagens</th>
              <th className="text-left px-6 py-4 text-slate-400 font-medium text-sm">Última Interação</th>
              <th className="text-right px-6 py-4 text-slate-400 font-medium text-sm">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => (
              <tr 
                key={lead.id} 
                className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-medium">
                      {(lead.name || lead.phone).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white font-medium">
                        {lead.name || 'Sem nome'}
                      </p>
                      <div className="flex items-center gap-2 text-slate-400 text-sm">
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
                  <span className="text-slate-300 text-sm capitalize">
                    {lead.lastIntent === 'purchase' && '🛒 Compra'}
                    {lead.lastIntent === 'interest' && '👀 Interesse'}
                    {lead.lastIntent === 'support' && '🔧 Suporte'}
                    {lead.lastIntent === 'general' && '💬 Geral'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-slate-300">
                    <MessageCircle className="w-4 h-4 text-slate-500" />
                    {lead.totalMessages}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <Clock className="w-4 h-4" />
                    {formatTimeAgo(lead.lastInteraction)}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                    <MoreVertical className="w-5 h-5 text-slate-400" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredLeads.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">Nenhum lead encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
