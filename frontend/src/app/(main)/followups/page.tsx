'use client';

import { useEffect, useState, useCallback } from 'react';
import { 
  Calendar,
  Clock,
  Phone,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  User,
  Loader2,
} from 'lucide-react';
import { apiUrl } from '@/lib/http';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { useSession } from 'next-auth/react';

interface Followup {
  id: string;
  key: string;
  phone: string;
  contactId: string;
  message: string;
  scheduledFor: string;
  delayMinutes: number;
  status: 'pending' | 'executed' | 'cancelled';
  createdAt: string;
  executedAt?: string;
}

interface FollowupsResponse {
  total: number;
  followups: Followup[];
}

export default function FollowupsPage() {
  const workspaceId = useWorkspaceId();
  const { data: session } = useSession();
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFollowups = useCallback(async () => {
    if (!workspaceId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      const accessToken = (session?.user as any)?.accessToken;
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const res = await fetch(apiUrl('/kloel/followups'), {
        headers,
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      const data: FollowupsResponse = await res.json();
      setFollowups(data.followups || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      console.error('Erro ao carregar follow-ups:', err);
      setError('Não foi possível carregar os follow-ups. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, session]);

  useEffect(() => {
    loadFollowups();
    // Atualizar a cada 30 segundos
    const interval = setInterval(loadFollowups, 30000);
    return () => clearInterval(interval);
  }, [loadFollowups]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'executed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'executed':
        return 'Executado';
      case 'cancelled':
        return 'Cancelado';
      default:
        return 'Pendente';
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const formatPhone = (phone: string) => {
    if (!phone) return '-';
    // Formata telefone brasileiro
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Calendar className="w-8 h-8 text-purple-400" />
              Follow-ups Programados
            </h1>
            <p className="text-gray-400 mt-1">
              Acompanhe todos os follow-ups agendados pela IA
            </p>
          </div>
          <button
            onClick={loadFollowups}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-5 border border-gray-700/50">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                <Calendar className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Total</p>
                <p className="text-2xl font-bold text-white">{total}</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-5 border border-gray-700/50">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Pendentes</p>
                <p className="text-2xl font-bold text-white">
                  {followups.filter(f => f.status === 'pending').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-5 border border-gray-700/50">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Executados</p>
                <p className="text-2xl font-bold text-white">
                  {followups.filter(f => f.status === 'executed').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && followups.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && followups.length === 0 && !error && (
          <div className="text-center py-20">
            <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-300 mb-2">
              Nenhum follow-up agendado
            </h3>
            <p className="text-gray-500">
              A IA agenda follow-ups automaticamente durante as conversas
            </p>
          </div>
        )}

        {/* Follow-ups Table */}
        {followups.length > 0 && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700/50">
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Status</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Telefone</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Mensagem</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Agendado para</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {followups.map((followup) => (
                    <tr 
                      key={followup.id} 
                      className="border-b border-gray-700/30 hover:bg-gray-700/20 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(followup.status)}
                          <span className="text-sm text-gray-300">
                            {getStatusLabel(followup.status)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-gray-300 font-mono">
                            {formatPhone(followup.phone)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 max-w-xs">
                          <MessageSquare className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          <span className="text-sm text-gray-300 truncate" title={followup.message}>
                            {followup.message || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-300">
                          {formatDate(followup.scheduledFor)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-400">
                          {formatDate(followup.createdAt)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
