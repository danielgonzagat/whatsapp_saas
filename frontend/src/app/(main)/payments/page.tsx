'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  CreditCard, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Loader2,
  CheckCircle2,
  XCircle,
  Link as LinkIcon,
  ExternalLink,
  Power,
  DollarSign,
  Settings,
  ToggleLeft,
  ToggleRight,
  Copy,
  Zap
} from 'lucide-react';
import { 
  getAsaasStatus, 
  connectAsaas, 
  disconnectAsaas,
  getAsaasBalance,
  getExternalPaymentLinks,
  addExternalPaymentLink,
  toggleExternalPaymentLink,
  deleteExternalPaymentLink,
  type AsaasStatus,
  type ExternalPaymentLink,
  type ExternalPaymentSummary
} from '@/lib/api';

const WORKSPACE_ID = 'default-ws';

const platformConfig: Record<string, { name: string; color: string; logo: string }> = {
  hotmart: { name: 'Hotmart', color: 'bg-orange-500', logo: '🔥' },
  kiwify: { name: 'Kiwify', color: 'bg-green-500', logo: '🥝' },
  eduzz: { name: 'Eduzz', color: 'bg-blue-500', logo: '📚' },
  monetizze: { name: 'Monetizze', color: 'bg-purple-500', logo: '💰' },
  braip: { name: 'Braip', color: 'bg-pink-500', logo: '⚡' },
  other: { name: 'Outro', color: 'bg-slate-500', logo: '🔗' },
};

export default function PaymentsPage() {
  const [asaasStatus, setAsaasStatus] = useState<AsaasStatus | null>(null);
  const [asaasBalance, setAsaasBalance] = useState<{ balance: number; pending: number; formattedBalance: string; formattedPending: string } | null>(null);
  const [links, setLinks] = useState<ExternalPaymentLink[]>([]);
  const [summary, setSummary] = useState<ExternalPaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAsaasModal, setShowAsaasModal] = useState(false);
  const [showAddLinkModal, setShowAddLinkModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [asaasData, linksData] = await Promise.all([
        getAsaasStatus(WORKSPACE_ID).catch(() => ({ connected: false })),
        getExternalPaymentLinks(WORKSPACE_ID).catch(() => ({ links: [], summary: { totalLinks: 0, activeLinks: 0, byPlatform: {}, totalValue: 0 } })),
      ]);
      
      setAsaasStatus(asaasData);
      setLinks(linksData.links);
      setSummary(linksData.summary);

      if (asaasData.connected) {
        const balance = await getAsaasBalance(WORKSPACE_ID).catch(() => null);
        setAsaasBalance(balance);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleLink = async (linkId: string) => {
    try {
      await toggleExternalPaymentLink(WORKSPACE_ID, linkId);
      loadData();
    } catch (error) {
      console.error('Failed to toggle link:', error);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!confirm('Tem certeza que deseja excluir este link?')) return;
    try {
      await deleteExternalPaymentLink(WORKSPACE_ID, linkId);
      loadData();
    } catch (error) {
      console.error('Failed to delete link:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatCurrency = (value: number) => 
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-[#00FFA3]" />
            Integrações de Pagamento
          </h1>
          <p className="text-slate-400">Conecte gateways e plataformas de pagamento</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Asaas Integration Card */}
      <div className={`rounded-2xl p-6 border ${
        asaasStatus?.connected 
          ? 'bg-gradient-to-br from-emerald-500/20 to-[#00FFA3]/10 border-emerald-500/30' 
          : 'bg-slate-800/50 border-slate-700/50'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
              asaasStatus?.connected ? 'bg-emerald-500/20' : 'bg-slate-700/50'
            }`}>
              <DollarSign className={`w-8 h-8 ${asaasStatus?.connected ? 'text-emerald-400' : 'text-slate-500'}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Asaas
                <span className={`text-xs px-2 py-1 rounded-full ${
                  asaasStatus?.connected 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-slate-700 text-slate-400'
                }`}>
                  {asaasStatus?.connected ? 'Conectado' : 'Desconectado'}
                </span>
              </h2>
              <p className="text-slate-400 text-sm">
                {asaasStatus?.connected 
                  ? `Conta: ${asaasStatus.accountName} (${asaasStatus.environment})` 
                  : 'Gateway de pagamentos PIX, Boleto e Cartão'}
              </p>
              {asaasBalance && asaasStatus?.connected && (
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-[#00FFA3] font-semibold">Saldo: {asaasBalance.formattedBalance}</span>
                  {asaasBalance.pending > 0 && (
                    <span className="text-amber-400 text-sm">Pendente: {asaasBalance.formattedPending}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowAsaasModal(true)}
            className={`flex items-center gap-2 px-6 py-3 font-medium rounded-xl transition-colors ${
              asaasStatus?.connected
                ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                : 'bg-[#00FFA3] text-black hover:bg-[#00FFA3]/90'
            }`}
          >
            {asaasStatus?.connected ? (
              <>
                <Settings className="w-5 h-5" />
                Gerenciar
              </>
            ) : (
              <>
                <Zap className="w-5 h-5" />
                Conectar
              </>
            )}
          </button>
        </div>
      </div>

      {/* External Payment Links */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-violet-400" />
              Links de Pagamento Externos
            </h3>
            <p className="text-slate-500 text-sm mt-1">
              Hotmart, Kiwify, Eduzz e outras plataformas
            </p>
          </div>
          <button
            onClick={() => setShowAddLinkModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500 text-white font-medium rounded-lg hover:bg-violet-400 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Adicionar Link
          </button>
        </div>

        {/* Summary Stats */}
        {summary && summary.totalLinks > 0 && (
          <div className="px-6 py-4 border-b border-slate-700/30 grid grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{summary.totalLinks}</p>
              <p className="text-slate-500 text-xs">Total Links</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-400">{summary.activeLinks}</p>
              <p className="text-slate-500 text-xs">Ativos</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-violet-400">{Object.keys(summary.byPlatform).length}</p>
              <p className="text-slate-500 text-xs">Plataformas</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#00FFA3]">{formatCurrency(summary.totalValue)}</p>
              <p className="text-slate-500 text-xs">Valor Total</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#00FFA3] animate-spin" />
          </div>
        ) : links.length === 0 ? (
          <div className="text-center py-12">
            <LinkIcon className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-lg">Nenhum link cadastrado</p>
            <p className="text-slate-500 text-sm mt-2">
              Adicione links de pagamento de plataformas como Hotmart, Kiwify, etc.
            </p>
            <button
              onClick={() => setShowAddLinkModal(true)}
              className="mt-4 px-4 py-2 bg-violet-500 text-white font-medium rounded-lg hover:bg-violet-400 transition-colors"
            >
              Adicionar Primeiro Link
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {links.map((link) => {
              const platform = platformConfig[link.platform] || platformConfig.other;
              return (
                <div 
                  key={link.id} 
                  className={`px-6 py-4 flex items-center justify-between hover:bg-slate-700/20 transition-colors ${
                    !link.isActive ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl ${platform.color} flex items-center justify-center text-2xl`}>
                      {platform.logo}
                    </div>
                    <div>
                      <p className="text-white font-medium">{link.productName}</p>
                      <p className="text-slate-500 text-sm flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${platform.color} bg-opacity-20`}>
                          {platform.name}
                        </span>
                        <span className="text-[#00FFA3] font-semibold">{formatCurrency(link.price)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => copyToClipboard(link.paymentUrl)}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 rounded-lg text-slate-400 hover:text-white hover:bg-slate-600/50 transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                      Copiar Link
                    </button>

                    <a
                      href={link.paymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 text-slate-400" />
                    </a>

                    <button
                      onClick={() => handleToggleLink(link.id)}
                      className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
                    >
                      {link.isActive ? (
                        <ToggleRight className="w-6 h-6 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-slate-500" />
                      )}
                    </button>

                    <button
                      onClick={() => handleDeleteLink(link.id)}
                      className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p className="text-slate-300 font-medium mb-1">Como funciona</p>
            <p className="text-slate-500 text-sm">
              A KLOEL usa esses links para enviar pagamentos aos clientes automaticamente durante as conversas.
              Você pode cadastrar links de Hotmart, Kiwify, Eduzz, ou qualquer outra plataforma.
              Os webhooks são configurados automaticamente para rastrear vendas.
            </p>
          </div>
        </div>
      </div>

      {/* Asaas Modal */}
      {showAsaasModal && (
        <AsaasModal 
          status={asaasStatus}
          onClose={() => setShowAsaasModal(false)} 
          onSuccess={loadData} 
        />
      )}

      {/* Add Link Modal */}
      {showAddLinkModal && (
        <AddLinkModal 
          onClose={() => setShowAddLinkModal(false)} 
          onSuccess={loadData} 
        />
      )}
    </div>
  );
}

function AsaasModal({ status, onClose, onSuccess }: { status: AsaasStatus | null; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    apiKey: '',
    environment: 'sandbox' as 'sandbox' | 'production',
  });

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await connectAsaas(WORKSPACE_ID, form.apiKey, form.environment);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Falha ao conectar');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Tem certeza que deseja desconectar do Asaas?')) return;
    setLoading(true);
    try {
      await disconnectAsaas(WORKSPACE_ID);
      onSuccess();
      onClose();
    } catch (err) {
      setError('Falha ao desconectar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#1A1A24] rounded-2xl p-6 w-full max-w-md border border-slate-700/50" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-[#00FFA3]" />
          {status?.connected ? 'Gerenciar Asaas' : 'Conectar Asaas'}
        </h3>

        {status?.connected ? (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Conectado</span>
              </div>
              <p className="text-slate-400 text-sm">
                Conta: {status.accountName}
              </p>
              <p className="text-slate-500 text-xs">
                Ambiente: {status.environment}
              </p>
            </div>

            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="w-full py-3 bg-red-500/20 border border-red-500/30 text-red-400 font-medium rounded-lg hover:bg-red-500/30 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              <Power className="w-5 h-5" />
              Desconectar
            </button>

            <button
              onClick={onClose}
              className="w-full py-3 bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-600"
            >
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="text-slate-400 text-sm mb-1 block">Chave de API</label>
              <input
                type="text"
                required
                value={form.apiKey}
                onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00FFA3] font-mono text-sm"
                placeholder="$aas_..."
              />
              <p className="text-slate-600 text-xs mt-1">
                Encontre sua API Key em Configurações → Integrações no Asaas
              </p>
            </div>

            <div>
              <label className="text-slate-400 text-sm mb-1 block">Ambiente</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, environment: 'sandbox' }))}
                  className={`py-3 rounded-lg font-medium transition-colors ${
                    form.environment === 'sandbox'
                      ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400'
                      : 'bg-slate-700/50 text-slate-400'
                  }`}
                >
                  🧪 Sandbox
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, environment: 'production' }))}
                  className={`py-3 rounded-lg font-medium transition-colors ${
                    form.environment === 'production'
                      ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                      : 'bg-slate-700/50 text-slate-400'
                  }`}
                >
                  🚀 Produção
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 p-3 rounded-lg">
                <XCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#00FFA3] text-black font-medium rounded-lg hover:bg-[#00FFA3]/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              Conectar
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-600"
            >
              Cancelar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function AddLinkModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    platform: 'hotmart' as ExternalPaymentLink['platform'],
    productName: '',
    price: '',
    paymentUrl: '',
    checkoutUrl: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await addExternalPaymentLink(WORKSPACE_ID, {
        platform: form.platform,
        productName: form.productName,
        price: parseFloat(form.price),
        paymentUrl: form.paymentUrl,
        checkoutUrl: form.checkoutUrl || undefined,
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to add link:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#1A1A24] rounded-2xl p-6 w-full max-w-md border border-slate-700/50" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <LinkIcon className="w-6 h-6 text-violet-400" />
          Adicionar Link de Pagamento
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-slate-400 text-sm mb-2 block">Plataforma</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(platformConfig).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, platform: key as ExternalPaymentLink['platform'] }))}
                  className={`py-3 rounded-lg font-medium transition-colors flex flex-col items-center gap-1 ${
                    form.platform === key
                      ? `${config.color} bg-opacity-30 border border-current`
                      : 'bg-slate-700/50 text-slate-400'
                  }`}
                >
                  <span className="text-xl">{config.logo}</span>
                  <span className="text-xs">{config.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-1 block">Nome do Produto</label>
            <input
              type="text"
              required
              value={form.productName}
              onChange={e => setForm(f => ({ ...f, productName: e.target.value }))}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-violet-500"
              placeholder="Ex: Curso de IA para Vendas"
            />
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-1 block">Preço (R$)</label>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-violet-500"
              placeholder="997.00"
            />
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-1 block">URL de Pagamento</label>
            <input
              type="url"
              required
              value={form.paymentUrl}
              onChange={e => setForm(f => ({ ...f, paymentUrl: e.target.value }))}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-violet-500"
              placeholder="https://pay.hotmart.com/..."
            />
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-1 block">URL do Checkout (opcional)</label>
            <input
              type="url"
              value={form.checkoutUrl}
              onChange={e => setForm(f => ({ ...f, checkoutUrl: e.target.value }))}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-violet-500"
              placeholder="https://hotmart.com/checkout/..."
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-violet-500 text-white font-medium rounded-lg hover:bg-violet-400 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            Adicionar Link
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-600"
          >
            Cancelar
          </button>
        </form>
      </div>
    </div>
  );
}
