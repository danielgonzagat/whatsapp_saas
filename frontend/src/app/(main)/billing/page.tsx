'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  getSubscriptionStatus,
  listPaymentMethods,
  createSetupIntent,
  setDefaultPaymentMethod,
  removePaymentMethod,
  createCheckoutSession,
  type PaymentMethod,
} from '@/lib/api';
import { 
  CreditCard, 
  Plus, 
  Trash2, 
  Star, 
  Crown, 
  Loader2,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  RefreshCw,
  X,
} from 'lucide-react';

interface SubscriptionStatus {
  plan: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  usage?: {
    messages: number;
    limit: number;
    percentage: number;
  };
}

export default function BillingPage() {
  const { data: session } = useSession();
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [methodToDelete, setMethodToDelete] = useState<string | null>(null);

  const token = (session as any)?.accessToken;
  const workspaceId = (session as any)?.user?.workspaceId || '';
  const userEmail = (session as any)?.user?.email || '';

  const fetchData = useCallback(async () => {
    if (!token) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [subStatus, pmList] = await Promise.all([
        getSubscriptionStatus(token),
        listPaymentMethods(token),
      ]);
      
      setSubscription(subStatus);
      setPaymentMethods(pmList.paymentMethods || []);
    } catch (err: any) {
      console.error('Erro ao carregar dados de billing:', err);
      setError(err.message || 'Erro ao carregar informações de cobrança');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddPaymentMethod = async () => {
    if (!token) return;
    
    setActionLoading('add');
    try {
      const intent = await createSetupIntent(token);
      if (intent.url) {
        window.location.href = intent.url;
      } else if (intent.clientSecret) {
        alert('Para adicionar cartão, configure o Stripe Elements com clientSecret');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao criar sessão de pagamento');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetDefault = async (paymentMethodId: string) => {
    if (!token) return;
    
    setActionLoading(paymentMethodId);
    try {
      await setDefaultPaymentMethod(paymentMethodId, token);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Erro ao definir cartão padrão');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async () => {
    if (!token || !methodToDelete) return;
    
    setActionLoading(methodToDelete);
    try {
      await removePaymentMethod(methodToDelete, token);
      setDeleteDialogOpen(false);
      setMethodToDelete(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Erro ao remover cartão');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpgrade = async (plan: string) => {
    if (!token || !workspaceId) return;
    
    setActionLoading(`upgrade-${plan}`);
    try {
      const checkout = await createCheckoutSession(workspaceId, plan, userEmail, token);
      if (checkout.url) {
        window.location.href = checkout.url;
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao criar sessão de checkout');
    } finally {
      setActionLoading(null);
    }
  };

  const getPlanIcon = (plan: string) => {
    switch (plan?.toLowerCase()) {
      case 'enterprise':
        return <Crown className="h-5 w-5 text-purple-500" />;
      case 'pro':
        return <Star className="h-5 w-5 text-yellow-500" />;
      default:
        return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClass = "px-2 py-1 text-xs font-medium rounded-full";
    switch (status?.toLowerCase()) {
      case 'active':
        return <span className={`${baseClass} bg-green-100 text-green-800`}>Ativo</span>;
      case 'trialing':
      case 'trial':
        return <span className={`${baseClass} bg-blue-100 text-blue-800`}>Período de Teste</span>;
      case 'past_due':
      case 'expired':
        return <span className={`${baseClass} bg-red-100 text-red-800`}>Pagamento Pendente</span>;
      case 'canceled':
        return <span className={`${baseClass} bg-gray-100 text-gray-800`}>Cancelado</span>;
      default:
        return <span className={`${baseClass} bg-gray-100 text-gray-800`}>{status}</span>;
    }
  };

  const getBrandIcon = (brand: string) => {
    const brandLower = brand?.toLowerCase();
    switch (brandLower) {
      case 'visa': return '💳 Visa';
      case 'mastercard': return '💳 Mastercard';
      case 'amex': return '💳 Amex';
      case 'elo': return '💳 Elo';
      default: return `💳 ${brand}`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Faturamento</h1>
          <p className="text-gray-400">
            Gerencie sua assinatura e métodos de pagamento
          </p>
        </div>
        <button 
          onClick={fetchData} 
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors text-white"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span className="text-red-400 flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Subscription Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-2">
            {getPlanIcon(subscription?.plan || 'starter')}
            <h2 className="text-xl font-semibold text-white">Sua Assinatura</h2>
          </div>
          <p className="text-gray-400 text-sm mt-1">Detalhes do seu plano atual</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-white capitalize">
                Plano {subscription?.plan || 'Starter'}
              </p>
              <p className="text-sm text-gray-400">
                {subscription?.cancelAtPeriodEnd 
                  ? 'Será cancelado ao fim do período' 
                  : 'Renovação automática ativada'}
              </p>
            </div>
            {getStatusBadge(subscription?.status || 'active')}
          </div>

          {subscription?.currentPeriodEnd && (
            <p className="text-sm text-gray-400">
              Próxima cobrança: {new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}
            </p>
          )}

          {subscription?.usage && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Mensagens este mês</span>
                <span className="text-white">{subscription.usage.messages.toLocaleString()} / {subscription.usage.limit.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    subscription.usage.percentage > 90 ? 'bg-red-500' : 
                    subscription.usage.percentage > 70 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(subscription.usage.percentage, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Upgrade Buttons */}
          <div className="flex gap-2 pt-4">
            {subscription?.plan?.toLowerCase() !== 'pro' && (
              <button 
                onClick={() => handleUpgrade('pro')}
                disabled={actionLoading === 'upgrade-pro'}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {actionLoading === 'upgrade-pro' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Star className="h-4 w-4" />
                )}
                Upgrade para Pro
              </button>
            )}
            {subscription?.plan?.toLowerCase() !== 'enterprise' && (
              <button 
                onClick={() => handleUpgrade('enterprise')}
                disabled={actionLoading === 'upgrade-enterprise'}
                className="flex items-center gap-2 px-4 py-2 border border-purple-500 text-purple-400 rounded-lg hover:bg-purple-500/10 transition-colors disabled:opacity-50"
              >
                {actionLoading === 'upgrade-enterprise' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Crown className="h-4 w-4" />
                )}
                Upgrade para Enterprise
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Payment Methods Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-white" />
              <h2 className="text-xl font-semibold text-white">Métodos de Pagamento</h2>
            </div>
            <p className="text-gray-400 text-sm mt-1">Gerencie seus cartões de crédito</p>
          </div>
          <button 
            onClick={handleAddPaymentMethod} 
            disabled={actionLoading === 'add'}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'add' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Adicionar Cartão
          </button>
        </div>
        <div className="p-6">
          {paymentMethods.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum método de pagamento cadastrado</p>
              <p className="text-sm">Adicione um cartão para manter sua assinatura ativa</p>
            </div>
          ) : (
            <div className="space-y-3">
              {paymentMethods.map((method) => (
                <div 
                  key={method.id}
                  className="flex items-center justify-between p-4 border border-gray-800 rounded-lg hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-lg">{getBrandIcon(method.card?.brand || 'card')}</span>
                    <div>
                      <p className="font-medium text-white">
                        •••• •••• •••• {method.card?.last4}
                        {method.isDefault && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded">Padrão</span>
                        )}
                      </p>
                      <p className="text-sm text-gray-400">
                        Expira em {method.card?.expMonth?.toString().padStart(2, '0')}/{method.card?.expYear}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!method.isDefault && (
                      <button 
                        onClick={() => handleSetDefault(method.id)}
                        disabled={actionLoading === method.id}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        {actionLoading === method.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Star className="h-4 w-4" />
                            Definir padrão
                          </>
                        )}
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setMethodToDelete(method.id);
                        setDeleteDialogOpen(true);
                      }}
                      disabled={actionLoading === method.id}
                      className="p-2 text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Help Links */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-800">
          <h2 className="text-xl font-semibold text-white">Precisa de ajuda?</h2>
        </div>
        <div className="p-6 space-y-2">
          <a href="/pricing" className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors">
            <ExternalLink className="h-4 w-4" />
            Comparar planos
          </a>
          <a href="mailto:suporte@kloel.com" className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors">
            <ExternalLink className="h-4 w-4" />
            Contatar suporte
          </a>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-white mb-2">Remover cartão?</h3>
            <p className="text-gray-400 mb-6">
              Tem certeza que deseja remover este cartão? Se for o único método de pagamento,
              sua assinatura pode ser suspensa.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setMethodToDelete(null);
                }}
                className="px-4 py-2 border border-gray-600 rounded-lg text-white hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleRemove}
                disabled={actionLoading === methodToDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {actionLoading === methodToDelete ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
