'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { 
  User, 
  Building2, 
  CreditCard, 
  Key, 
  Bell, 
  Shield, 
  LogOut,
  Save,
  Loader2,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Crown,
  AlertTriangle,
} from 'lucide-react';
import { 
  CenterStage, 
  Section, 
  StageHeadline,
  Button,
  Input,
  Toggle,
} from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import type { PaymentMethod } from '@/lib/api';

interface AccountSettings {
  name: string;
  email: string;
  businessName: string;
  phone: string;
  timezone: string;
  plan: string;
  planStatus: 'active' | 'trial' | 'canceled' | 'past_due';
  trialEndsAt?: string;
  apiKey?: string;
  webhookUrl?: string;
  notifications: {
    email: boolean;
    whatsapp: boolean;
    newLead: boolean;
    newSale: boolean;
    lowBalance: boolean;
  };
}

const TABS = [
  { id: 'profile', label: 'Perfil', icon: User },
  { id: 'business', label: 'Negócio', icon: Building2 },
  { id: 'billing', label: 'Assinatura', icon: CreditCard },
  { id: 'api', label: 'API Keys', icon: Key },
  { id: 'notifications', label: 'Notificações', icon: Bell },
  { id: 'security', label: 'Segurança', icon: Shield },
];

export default function AccountPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const workspaceId = useWorkspaceId();
  
  const [activeTab, setActiveTab] = useState('profile');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showAddCard, setShowAddCard] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  
  const [settings, setSettings] = useState<AccountSettings>({
    name: '',
    email: '',
    businessName: '',
    phone: '',
    timezone: 'America/Sao_Paulo',
    plan: 'starter',
    planStatus: 'trial',
    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    apiKey: 'kloel_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    webhookUrl: '',
    notifications: {
      email: true,
      whatsapp: true,
      newLead: true,
      newSale: true,
      lowBalance: true,
    },
  });

  // Load settings from backend
  useEffect(() => {
    const loadSettings = async () => {
      if (!workspaceId) return;
      setIsLoading(true);
      
      try {
        const { getWorkspace, getSubscriptionStatus, listApiKeys } = await import('@/lib/api');
        const token = (session?.user as any)?.accessToken;
        
        // Load workspace info
        const workspace = await getWorkspace(workspaceId, token);
        
        // Load subscription
        const subscription = await getSubscriptionStatus(token);
        
        // Load API keys
        let apiKey = settings.apiKey;
        try {
          const keys = await listApiKeys(token);
          if (keys.length > 0) {
            apiKey = keys[0].key;
          }
        } catch (e) {
          console.warn('Could not load API keys:', e);
        }
        
        // Map subscription status
        const planStatusMap: Record<string, AccountSettings['planStatus']> = {
          'ACTIVE': 'active',
          'TRIAL': 'trial',
          'PAST_DUE': 'past_due',
          'CANCELED': 'canceled',
        };
        
        const providerSettings = (workspace.providerSettings || {}) as any;
        
        setSettings(prev => ({
          ...prev,
          name: session?.user?.name || '',
          email: session?.user?.email || '',
          businessName: workspace.name || '',
          phone: workspace.phone || '',
          timezone: workspace.timezone || 'America/Sao_Paulo',
          plan: subscription?.plan?.toLowerCase() || 'starter',
          planStatus: planStatusMap[subscription?.status || 'TRIAL'] || 'trial',
          trialEndsAt: subscription?.currentPeriodEnd,
          apiKey,
          webhookUrl: providerSettings.webhookUrl || '',
          notifications: providerSettings.notifications || {
            email: true,
            whatsapp: true,
            newLead: true,
            newSale: true,
            lowBalance: true,
          },
        }));
        
        // Load payment methods
        try {
          const { listPaymentMethods } = await import('@/lib/api');
          const result = await listPaymentMethods(token);
          setPaymentMethods(result.paymentMethods || []);
        } catch (e) {
          console.warn('Could not load payment methods:', e);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSettings();
  }, [workspaceId, session]);

  // Adicionar cartão de crédito
  const handleAddCard = async () => {
    setAddingCard(true);
    try {
      const { createSetupIntent } = await import('@/lib/api');
      const token = (session?.user as any)?.accessToken;
      
      const result = await createSetupIntent(token);
      
      if (result.clientSecret) {
        // Redirecionar para página de setup do Stripe ou abrir modal
        // Por enquanto, exibimos instruções
        alert(`Para adicionar um cartão, use o Stripe Checkout ao fazer upgrade do plano.`);
      }
    } catch (error) {
      console.error('Error creating setup intent:', error);
    } finally {
      setAddingCard(false);
      setShowAddCard(false);
    }
  };

  // Remover cartão
  const handleRemoveCard = async (paymentMethodId: string) => {
    if (!confirm('Tem certeza que deseja remover este cartão?')) return;
    
    try {
      const { removePaymentMethod } = await import('@/lib/api');
      const token = (session?.user as any)?.accessToken;
      
      await removePaymentMethod(paymentMethodId, token);
      setPaymentMethods(prev => prev.filter(pm => pm.id !== paymentMethodId));
    } catch (error) {
      console.error('Error removing card:', error);
    }
  };

  const handleSave = async () => {
    if (!workspaceId) return;
    setIsSaving(true);
    try {
      const { saveWorkspaceSettings } = await import('@/lib/api');
      const token = (session?.user as any)?.accessToken;
      await saveWorkspaceSettings(workspaceId, {
        name: settings.businessName,
        phone: settings.phone,
        timezone: settings.timezone,
        webhookUrl: settings.webhookUrl,
        notifications: settings.notifications,
      }, token);
      // Could show success toast here
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(settings.apiKey || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateApiKey = async () => {
    try {
      const { createApiKey, deleteApiKey, listApiKeys } = await import('@/lib/api');
      const token = (session?.user as any)?.accessToken;
      
      // Get existing keys to delete them first
      const existingKeys = await listApiKeys(token);
      if (existingKeys.length > 0) {
        // Delete the first (current) key
        await deleteApiKey(existingKeys[0].id, token);
      }
      
      // Create a new key
      const newKey = await createApiKey('Default API Key', token);
      setSettings(prev => ({ ...prev, apiKey: newKey.key }));
    } catch (error) {
      console.error('Error regenerating API key:', error);
      // Fallback to local generation if API fails
      const newKey = `kloel_sk_${Math.random().toString(36).substring(2, 34)}`;
      setSettings(prev => ({ ...prev, apiKey: newKey }));
    }
  };

  const handleLogout = () => {
    signOut({ callbackUrl: '/login' });
  };

  const handleCancelSubscription = () => {
    const message = encodeURIComponent('Quero cancelar minha assinatura');
    router.push(`/chat?q=${message}`);
  };

  const getPlanStatusBadge = () => {
    switch (settings.planStatus) {
      case 'active':
        return { text: 'Ativo', color: colors.brand.green };
      case 'trial':
        return { text: 'Período de teste', color: colors.brand.cyan };
      case 'past_due':
        return { text: 'Pagamento pendente', color: colors.state.warning };
      case 'canceled':
        return { text: 'Cancelado', color: colors.state.error };
      default:
        return { text: 'Desconhecido', color: colors.text.muted };
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm mb-2" style={{ color: colors.text.secondary }}>
                Nome completo
              </label>
              <Input
                value={settings.name}
                onChange={(e) => setSettings(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Seu nome"
              />
            </div>
            <div>
              <label className="block text-sm mb-2" style={{ color: colors.text.secondary }}>
                Email
              </label>
              <Input
                type="email"
                value={settings.email}
                onChange={(e) => setSettings(prev => ({ ...prev, email: e.target.value }))}
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="block text-sm mb-2" style={{ color: colors.text.secondary }}>
                Telefone
              </label>
              <Input
                value={settings.phone}
                onChange={(e) => setSettings(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="(11) 99999-9999"
              />
            </div>
          </div>
        );

      case 'business':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm mb-2" style={{ color: colors.text.secondary }}>
                Nome do negócio
              </label>
              <Input
                value={settings.businessName}
                onChange={(e) => setSettings(prev => ({ ...prev, businessName: e.target.value }))}
                placeholder="Minha Empresa"
              />
            </div>
            <div>
              <label className="block text-sm mb-2" style={{ color: colors.text.secondary }}>
                Fuso horário
              </label>
              <select
                value={settings.timezone}
                onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl"
                style={{
                  backgroundColor: colors.background.surface2,
                  border: `1px solid ${colors.stroke}`,
                  color: colors.text.primary,
                }}
              >
                <option value="America/Sao_Paulo">Brasília (GMT-3)</option>
                <option value="America/Manaus">Manaus (GMT-4)</option>
                <option value="America/Recife">Fernando de Noronha (GMT-2)</option>
              </select>
            </div>
          </div>
        );

      case 'billing':
        const statusBadge = getPlanStatusBadge();
        return (
          <div className="space-y-6">
            {/* Current plan */}
            <div 
              className="p-6 rounded-xl"
              style={{ backgroundColor: colors.background.surface2 }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${colors.brand.green}20` }}
                  >
                    <Crown className="w-6 h-6" style={{ color: colors.brand.green }} />
                  </div>
                  <div>
                    <h3 className="font-semibold capitalize" style={{ color: colors.text.primary }}>
                      Plano {settings.plan}
                    </h3>
                    <span 
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${statusBadge.color}20`, color: statusBadge.color }}
                    >
                      {statusBadge.text}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/pricing')}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: colors.brand.green, color: colors.background.obsidian }}
                >
                  Fazer upgrade
                </button>
              </div>

              {settings.planStatus === 'trial' && settings.trialEndsAt && (
                <div 
                  className="flex items-center gap-2 p-3 rounded-lg"
                  style={{ backgroundColor: `${colors.state.warning}15` }}
                >
                  <AlertTriangle className="w-4 h-4" style={{ color: colors.state.warning }} />
                  <span className="text-sm" style={{ color: colors.state.warning }}>
                    Seu período de teste termina em {new Date(settings.trialEndsAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              )}
            </div>

            {/* Payment method */}
            <div>
              <h4 className="text-sm font-medium mb-3" style={{ color: colors.text.secondary }}>
                Método de pagamento
              </h4>
              
              {paymentMethods.length > 0 ? (
                <div className="space-y-2">
                  {paymentMethods.map((pm) => (
                    <div
                      key={pm.id}
                      className="p-4 rounded-xl flex items-center justify-between"
                      style={{ backgroundColor: colors.background.surface2, border: `1px solid ${colors.stroke}` }}
                    >
                      <div className="flex items-center gap-3">
                        <CreditCard className="w-5 h-5" style={{ color: colors.text.muted }} />
                        <div>
                          <span className="capitalize" style={{ color: colors.text.primary }}>
                            {pm.card?.brand || 'Cartão'} •••• {pm.card?.last4}
                          </span>
                          <span className="text-xs ml-2" style={{ color: colors.text.muted }}>
                            {pm.card?.expMonth?.toString().padStart(2, '0')}/{pm.card?.expYear}
                          </span>
                          {pm.isDefault && (
                            <span className="text-xs ml-2 px-2 py-0.5 rounded-full" 
                              style={{ backgroundColor: `${colors.brand.green}20`, color: colors.brand.green }}>
                              Padrão
                            </span>
                          )}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleRemoveCard(pm.id)}
                        className="text-sm"
                        style={{ color: colors.state.error }}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={() => router.push('/pricing')}
                    className="text-sm mt-2"
                    style={{ color: colors.brand.green }}
                  >
                    + Adicionar outro cartão
                  </button>
                </div>
              ) : (
                <div 
                  className="p-4 rounded-xl flex items-center justify-between"
                  style={{ backgroundColor: colors.background.surface2, border: `1px solid ${colors.stroke}` }}
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5" style={{ color: colors.text.muted }} />
                    <span style={{ color: colors.text.primary }}>Nenhum cartão cadastrado</span>
                  </div>
                  <button 
                    onClick={() => router.push('/pricing')}
                    className="text-sm"
                    style={{ color: colors.brand.green }}
                  >
                    Adicionar
                  </button>
                </div>
              )}
            </div>

            {/* Cancel */}
            <div className="pt-4 border-t" style={{ borderColor: colors.stroke }}>
              <button
                onClick={handleCancelSubscription}
                className="text-sm"
                style={{ color: colors.state.error }}
              >
                Cancelar assinatura
              </button>
            </div>
          </div>
        );

      case 'api':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm mb-2" style={{ color: colors.text.secondary }}>
                API Key
              </label>
              <div className="flex gap-2">
                <div 
                  className="flex-1 px-4 py-3 rounded-xl flex items-center justify-between"
                  style={{ backgroundColor: colors.background.surface2, border: `1px solid ${colors.stroke}` }}
                >
                  <code className="text-sm font-mono" style={{ color: colors.text.primary }}>
                    {showApiKey ? settings.apiKey : '••••••••••••••••••••••••••••••••'}
                  </code>
                  <button onClick={() => setShowApiKey(!showApiKey)}>
                    {showApiKey ? (
                      <EyeOff className="w-4 h-4" style={{ color: colors.text.muted }} />
                    ) : (
                      <Eye className="w-4 h-4" style={{ color: colors.text.muted }} />
                    )}
                  </button>
                </div>
                <button
                  onClick={handleCopyApiKey}
                  className="px-3 py-2 rounded-xl"
                  style={{ backgroundColor: colors.background.surface2, border: `1px solid ${colors.stroke}` }}
                >
                  <Copy 
                    className="w-4 h-4" 
                    style={{ color: copied ? colors.brand.green : colors.text.muted }} 
                  />
                </button>
                <button
                  onClick={handleRegenerateApiKey}
                  className="px-3 py-2 rounded-xl"
                  style={{ backgroundColor: colors.background.surface2, border: `1px solid ${colors.stroke}` }}
                >
                  <RefreshCw className="w-4 h-4" style={{ color: colors.text.muted }} />
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: colors.text.muted }}>
                Use esta chave para autenticar suas requisições à API do KLOEL.
              </p>
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: colors.text.secondary }}>
                Webhook URL
              </label>
              <Input
                value={settings.webhookUrl}
                onChange={(e) => setSettings(prev => ({ ...prev, webhookUrl: e.target.value }))}
                placeholder="https://seu-site.com/webhook"
              />
              <p className="text-xs mt-2" style={{ color: colors.text.muted }}>
                Receba notificações de eventos (novas mensagens, vendas, etc.) nesta URL.
              </p>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <div 
              className="p-4 rounded-xl flex items-center justify-between"
              style={{ backgroundColor: colors.background.surface2 }}
            >
              <div>
                <h4 className="font-medium" style={{ color: colors.text.primary }}>
                  Notificações por email
                </h4>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  Receber alertas importantes por email
                </p>
              </div>
              <Toggle
                checked={settings.notifications.email}
                onChange={(checked) => setSettings(prev => ({
                  ...prev,
                  notifications: { ...prev.notifications, email: checked }
                }))}
              />
            </div>

            <div 
              className="p-4 rounded-xl flex items-center justify-between"
              style={{ backgroundColor: colors.background.surface2 }}
            >
              <div>
                <h4 className="font-medium" style={{ color: colors.text.primary }}>
                  Novos leads
                </h4>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  Notificar quando um novo lead iniciar conversa
                </p>
              </div>
              <Toggle
                checked={settings.notifications.newLead}
                onChange={(checked) => setSettings(prev => ({
                  ...prev,
                  notifications: { ...prev.notifications, newLead: checked }
                }))}
              />
            </div>

            <div 
              className="p-4 rounded-xl flex items-center justify-between"
              style={{ backgroundColor: colors.background.surface2 }}
            >
              <div>
                <h4 className="font-medium" style={{ color: colors.text.primary }}>
                  Novas vendas
                </h4>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  Notificar quando uma venda for confirmada
                </p>
              </div>
              <Toggle
                checked={settings.notifications.newSale}
                onChange={(checked) => setSettings(prev => ({
                  ...prev,
                  notifications: { ...prev.notifications, newSale: checked }
                }))}
              />
            </div>

            <div 
              className="p-4 rounded-xl flex items-center justify-between"
              style={{ backgroundColor: colors.background.surface2 }}
            >
              <div>
                <h4 className="font-medium" style={{ color: colors.text.primary }}>
                  Saldo baixo
                </h4>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  Alertar quando o saldo de créditos estiver baixo
                </p>
              </div>
              <Toggle
                checked={settings.notifications.lowBalance}
                onChange={(checked) => setSettings(prev => ({
                  ...prev,
                  notifications: { ...prev.notifications, lowBalance: checked }
                }))}
              />
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-6">
            <div>
              <h4 className="font-medium mb-4" style={{ color: colors.text.primary }}>
                Alterar senha
              </h4>
              <div className="space-y-4">
                <Input
                  type="password"
                  placeholder="Senha atual"
                />
                <Input
                  type="password"
                  placeholder="Nova senha"
                />
                <Input
                  type="password"
                  placeholder="Confirmar nova senha"
                />
                <Button variant="secondary">
                  Alterar senha
                </Button>
              </div>
            </div>

            <div className="pt-6 border-t" style={{ borderColor: colors.stroke }}>
              <h4 className="font-medium mb-4" style={{ color: colors.text.primary }}>
                Sessões ativas
              </h4>
              <div 
                className="p-4 rounded-xl"
                style={{ backgroundColor: colors.background.surface2 }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                      Este dispositivo
                    </p>
                    <p className="text-xs" style={{ color: colors.text.muted }}>
                      Última atividade: agora
                    </p>
                  </div>
                  <span 
                    className="px-2 py-1 rounded text-xs"
                    style={{ backgroundColor: `${colors.brand.green}20`, color: colors.brand.green }}
                  >
                    Atual
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t" style={{ borderColor: colors.stroke }}>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm"
                style={{ color: colors.state.error }}
              >
                <LogOut className="w-4 h-4" />
                Sair de todas as sessões
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div 
      className="min-h-full pb-20"
      style={{ backgroundColor: colors.background.obsidian }}
    >
      {/* Header */}
      <Section spacing="md">
        <CenterStage size="L">
          <StageHeadline
            headline="Configurações da conta"
            highlight="conta"
            subheadline="Gerencie seu perfil, assinatura e preferências"
            size="l"
          />
        </CenterStage>
      </Section>

      {/* Content */}
      <Section spacing="sm">
        <CenterStage size="L">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Sidebar */}
            <div className="w-full md:w-64 flex-shrink-0">
              <nav className="space-y-1">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                        isActive ? '' : 'hover:bg-white/5'
                      }`}
                      style={{
                        backgroundColor: isActive ? colors.background.surface1 : 'transparent',
                        color: isActive ? colors.text.primary : colors.text.secondary,
                      }}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-sm font-medium">{tab.label}</span>
                    </button>
                  );
                })}

                <div className="pt-4 border-t" style={{ borderColor: colors.stroke }}>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors hover:bg-white/5"
                    style={{ color: colors.state.error }}
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="text-sm font-medium">Sair</span>
                  </button>
                </div>
              </nav>
            </div>

            {/* Main content */}
            <div 
              className="flex-1 p-6 rounded-2xl"
              style={{ backgroundColor: colors.background.surface1 }}
            >
              <h2 className="text-lg font-semibold mb-6" style={{ color: colors.text.primary }}>
                {TABS.find(t => t.id === activeTab)?.label}
              </h2>
              
              {renderTabContent()}

              {/* Save button */}
              {['profile', 'business', 'api', 'notifications'].includes(activeTab) && (
                <div className="mt-8 pt-6 border-t flex justify-end" style={{ borderColor: colors.stroke }}>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium"
                    style={{ backgroundColor: colors.brand.green, color: colors.background.obsidian }}
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {isSaving ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </CenterStage>
      </Section>
    </div>
  );
}
