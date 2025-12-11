'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Send, 
  Users, 
  Clock, 
  Play,
  Pause,
  MoreVertical,
  Plus,
  Search,
  Filter,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  TrendingUp,
  Trash2,
  Copy,
  Calendar,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  type: 'MASS' | 'DRIP' | 'TRIGGER';
  targetAudience?: string;
  messageTemplate?: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  stats?: {
    total: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    failed: number;
  };
  createdAt: string;
  updatedAt: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT: { label: 'Rascunho', color: 'text-slate-400 bg-slate-500/10', icon: <Clock className="w-4 h-4" /> },
  SCHEDULED: { label: 'Agendada', color: 'text-blue-400 bg-blue-500/10', icon: <Calendar className="w-4 h-4" /> },
  RUNNING: { label: 'Em execução', color: 'text-green-400 bg-green-500/10', icon: <Play className="w-4 h-4" /> },
  PAUSED: { label: 'Pausada', color: 'text-amber-400 bg-amber-500/10', icon: <Pause className="w-4 h-4" /> },
  COMPLETED: { label: 'Concluída', color: 'text-emerald-400 bg-emerald-500/10', icon: <CheckCircle className="w-4 h-4" /> },
  CANCELLED: { label: 'Cancelada', color: 'text-red-400 bg-red-500/10', icon: <XCircle className="w-4 h-4" /> },
};

export default function CampaignsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const workspaceId = (session as any)?.user?.workspaceId || '';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Form state for new campaign
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    type: 'MASS' as 'MASS' | 'DRIP' | 'TRIGGER',
    messageTemplate: '',
    targetAudience: 'all',
    scheduledAt: '',
  });

  const fetchCampaigns = useCallback(async () => {
    if (!token || !workspaceId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/campaigns?workspaceId=${workspaceId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) throw new Error('Falha ao carregar campanhas');
      
      const data = await res.json();
      setCampaigns(Array.isArray(data) ? data : data.campaigns || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const createCampaign = async () => {
    if (!token || !workspaceId || !newCampaign.name) return;
    setActionLoading('create');

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/campaigns`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workspaceId,
            ...newCampaign,
          }),
        }
      );

      if (!res.ok) throw new Error('Falha ao criar campanha');
      
      setShowCreateModal(false);
      setNewCampaign({
        name: '',
        description: '',
        type: 'MASS',
        messageTemplate: '',
        targetAudience: 'all',
        scheduledAt: '',
      });
      fetchCampaigns();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const launchCampaign = async (campaignId: string) => {
    if (!token || !workspaceId) return;
    setActionLoading(campaignId);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/campaigns/${campaignId}/launch`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ workspaceId }),
        }
      );

      if (!res.ok) throw new Error('Falha ao lançar campanha');
      fetchCampaigns();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const pauseCampaign = async (campaignId: string) => {
    if (!token || !workspaceId) return;
    setActionLoading(campaignId);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/campaigns/${campaignId}/pause`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ workspaceId }),
        }
      );

      if (!res.ok) throw new Error('Falha ao pausar campanha');
      fetchCampaigns();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    if (!token || !workspaceId) return;
    if (!confirm('Tem certeza que deseja excluir esta campanha?')) return;
    
    setActionLoading(campaignId);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/campaigns/${campaignId}?workspaceId=${workspaceId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) throw new Error('Falha ao excluir campanha');
      fetchCampaigns();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      campaign.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !filterStatus || campaign.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: campaigns.length,
    running: campaigns.filter(c => c.status === 'RUNNING').length,
    completed: campaigns.filter(c => c.status === 'COMPLETED').length,
    totalSent: campaigns.reduce((acc, c) => acc + (c.stats?.sent || 0), 0),
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Campanhas</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Gerencie campanhas de mensagens em massa
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Campanha
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Send className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-400">Total de Campanhas</p>
              <p className="text-xl font-bold text-white">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Play className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-400">Em Execução</p>
              <p className="text-xl font-bold text-white">{stats.running}</p>
            </div>
          </div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-400">Concluídas</p>
              <p className="text-xl font-bold text-white">{stats.completed}</p>
            </div>
          </div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <MessageSquare className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-400">Mensagens Enviadas</p>
              <p className="text-xl font-bold text-white">{stats.totalSent.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar campanhas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>
        <select
          value={filterStatus || ''}
          onChange={(e) => setFilterStatus(e.target.value || null)}
          className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-zinc-700"
        >
          <option value="">Todos os status</option>
          {Object.entries(statusConfig).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <button
          onClick={fetchCampaigns}
          disabled={loading}
          className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-400">{error}</span>
        </div>
      )}

      {/* Campaigns List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="text-center py-12">
          <Send className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-zinc-400 mb-2">
            {campaigns.length === 0 ? 'Nenhuma campanha criada' : 'Nenhuma campanha encontrada'}
          </h3>
          <p className="text-sm text-zinc-500 mb-4">
            {campaigns.length === 0 
              ? 'Crie sua primeira campanha para começar a enviar mensagens em massa'
              : 'Tente ajustar os filtros de busca'
            }
          </p>
          {campaigns.length === 0 && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Criar Campanha
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCampaigns.map(campaign => {
            const status = statusConfig[campaign.status] || statusConfig.DRAFT;
            const progress = campaign.stats 
              ? Math.round((campaign.stats.sent / campaign.stats.total) * 100) 
              : 0;

            return (
              <div
                key={campaign.id}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{campaign.name}</h3>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        {status.icon}
                        {status.label}
                      </span>
                    </div>
                    {campaign.description && (
                      <p className="text-sm text-zinc-400">{campaign.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {campaign.status === 'DRAFT' && (
                      <button
                        onClick={() => launchCampaign(campaign.id)}
                        disabled={actionLoading === campaign.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                      >
                        {actionLoading === campaign.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                        Lançar
                      </button>
                    )}
                    {campaign.status === 'RUNNING' && (
                      <button
                        onClick={() => pauseCampaign(campaign.id)}
                        disabled={actionLoading === campaign.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                      >
                        {actionLoading === campaign.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Pause className="w-4 h-4" />
                        )}
                        Pausar
                      </button>
                    )}
                    {campaign.status === 'PAUSED' && (
                      <button
                        onClick={() => launchCampaign(campaign.id)}
                        disabled={actionLoading === campaign.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                      >
                        {actionLoading === campaign.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                        Retomar
                      </button>
                    )}
                    <button
                      onClick={() => deleteCampaign(campaign.id)}
                      disabled={actionLoading === campaign.id}
                      className="p-1.5 text-zinc-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stats */}
                {campaign.stats && campaign.stats.total > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-zinc-400">Progresso</span>
                      <span className="text-white font-medium">
                        {campaign.stats.sent.toLocaleString()} / {campaign.stats.total.toLocaleString()} ({progress}%)
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-6 mt-3 text-xs">
                      <span className="text-zinc-400">
                        <span className="text-green-400 font-medium">{campaign.stats.delivered}</span> entregues
                      </span>
                      <span className="text-zinc-400">
                        <span className="text-blue-400 font-medium">{campaign.stats.read}</span> lidas
                      </span>
                      <span className="text-zinc-400">
                        <span className="text-purple-400 font-medium">{campaign.stats.replied}</span> respondidas
                      </span>
                      {campaign.stats.failed > 0 && (
                        <span className="text-zinc-400">
                          <span className="text-red-400 font-medium">{campaign.stats.failed}</span> falhas
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Meta */}
                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <span>Tipo: {campaign.type}</span>
                  {campaign.scheduledAt && (
                    <span>Agendada: {format(new Date(campaign.scheduledAt), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                  )}
                  <span>Criada: {format(new Date(campaign.createdAt), "dd/MM/yyyy", { locale: ptBR })}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-xl font-bold text-white">Nova Campanha</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Nome da Campanha</label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Black Friday 2024"
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Descrição</label>
                <textarea
                  value={newCampaign.description}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descreva o objetivo da campanha..."
                  rows={2}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Tipo</label>
                <select
                  value={newCampaign.type}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-600"
                >
                  <option value="MASS">Envio em Massa</option>
                  <option value="DRIP">Sequência (Drip)</option>
                  <option value="TRIGGER">Por Gatilho</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Mensagem</label>
                <textarea
                  value={newCampaign.messageTemplate}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, messageTemplate: e.target.value }))}
                  placeholder="Digite a mensagem que será enviada..."
                  rows={4}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 resize-none"
                />
                <p className="text-xs text-zinc-500 mt-1">Use {'{nome}'} para personalizar com o nome do contato</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Público-alvo</label>
                <select
                  value={newCampaign.targetAudience}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, targetAudience: e.target.value }))}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-600"
                >
                  <option value="all">Todos os Contatos</option>
                  <option value="leads_hot">Leads Quentes</option>
                  <option value="leads_warm">Leads Mornos</option>
                  <option value="customers">Clientes</option>
                  <option value="inactive">Inativos (30+ dias)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Agendar para</label>
                <input
                  type="datetime-local"
                  value={newCampaign.scheduledAt}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, scheduledAt: e.target.value }))}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-600"
                />
                <p className="text-xs text-zinc-500 mt-1">Deixe vazio para enviar manualmente</p>
              </div>
            </div>
            <div className="p-6 border-t border-zinc-800 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={createCampaign}
                disabled={!newCampaign.name || actionLoading === 'create'}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading === 'create' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Criar Campanha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
