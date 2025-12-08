'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Smartphone,
  Package,
  Zap,
  TrendingUp,
  MessageSquare,
  ShoppingBag,
  Wallet,
  Users,
  Settings,
  Link as LinkIcon,
} from 'lucide-react';
import { ChatHero, MissionCard, MissionGrid, StatCard } from '@/components/shell';
import { getKloelHealth, getWalletBalance, getMemoryStats, getWhatsAppStatus } from '@/lib/api';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import type { ChatMode } from '@/components/shell';

// -------------- DESIGN TOKENS --------------
const COLORS = {
  bg: '#050608',
  surface: '#111317',
  textSecondary: '#A0A3AA',
};

interface DashboardData {
  kloelOnline: boolean;
  walletTotal: string;
  walletPending: string;
  productsCount: number;
  whatsappConnected: boolean;
  whatsappPhone: string | null;
}

export default function DashboardPage() {
  const workspaceId = useWorkspaceId();
  const router = useRouter();
  
  const [data, setData] = useState<DashboardData>({
    kloelOnline: false,
    walletTotal: 'R$ 0,00',
    walletPending: 'R$ 0,00',
    productsCount: 0,
    whatsappConnected: false,
    whatsappPhone: null,
  });
  const [isLoading, setIsLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [kloelData, walletData, memoryData, whatsappData] = await Promise.allSettled([
        getKloelHealth(),
        getWalletBalance(workspaceId),
        getMemoryStats(workspaceId),
        getWhatsAppStatus(workspaceId),
      ]);

      setData({
        kloelOnline: kloelData.status === 'fulfilled' && kloelData.value.status === 'online',
        walletTotal: walletData.status === 'fulfilled' ? walletData.value.formattedTotal : 'R$ 0,00',
        walletPending: walletData.status === 'fulfilled' ? walletData.value.formattedPending : 'R$ 0,00',
        productsCount: memoryData.status === 'fulfilled' ? memoryData.value.products : 0,
        whatsappConnected: whatsappData.status === 'fulfilled' && whatsappData.value.connected,
        whatsappPhone: whatsappData.status === 'fulfilled' ? whatsappData.value.phone ?? null : null,
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Handle chat message
  const handleSend = (message: string, mode: ChatMode) => {
    // Navigate to chat with the message
    const encodedMessage = encodeURIComponent(message);
    router.push(`/chat?q=${encodedMessage}&mode=${mode}`);
  };

  // Dynamic action chips based on state
  const actionChips = [
    ...(data.whatsappConnected ? [] : [{
      id: 'connect-whatsapp',
      label: 'Conectar WhatsApp',
      icon: Smartphone,
      prompt: 'Me ajude a conectar meu WhatsApp Business',
    }]),
    ...(data.productsCount === 0 ? [{
      id: 'add-product',
      label: 'Cadastrar produto',
      icon: Package,
      prompt: 'Quero cadastrar meu primeiro produto',
    }] : []),
    {
      id: 'campaign',
      label: 'Criar campanha',
      icon: Zap,
      prompt: 'Quero criar uma campanha de WhatsApp para',
    },
    {
      id: 'analyze',
      label: 'Analisar vendas',
      icon: TrendingUp,
      prompt: 'Analise minhas vendas e sugira melhorias',
    },
  ].slice(0, 4);

  return (
    <div 
      className="min-h-full flex flex-col"
      style={{ backgroundColor: COLORS.bg }}
    >
      {/* Hero Section - Chat First */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <ChatHero
          heroTitle="Como posso ajudar o seu negócio hoje?"
          heroSubtitle={data.kloelOnline ? undefined : 'Conectando com a KLOEL...'}
          actionChips={actionChips}
          onSend={handleSend}
          isLoading={isLoading}
        />
      </div>

      {/* Stats Row */}
      <div className="px-6 pb-4">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={Smartphone}
            label="WhatsApp"
            value={data.whatsappConnected ? 'Conectado' : 'Desconectado'}
            onClick={() => router.push('/whatsapp')}
          />
          <StatCard
            icon={Wallet}
            label="Saldo"
            value={data.walletTotal}
            change={data.walletPending !== 'R$ 0,00' ? `+${data.walletPending}` : undefined}
            onClick={() => router.push('/sales')}
          />
          <StatCard
            icon={Package}
            label="Produtos"
            value={data.productsCount}
            onClick={() => router.push('/products')}
          />
          <StatCard
            icon={Users}
            label="Leads"
            value="—"
            onClick={() => router.push('/leads')}
          />
        </div>
      </div>

      {/* Mission Cards */}
      <div className="px-6 pb-8">
        <div className="max-w-4xl mx-auto">
          <h2 
            className="text-sm font-medium mb-4"
            style={{ color: COLORS.textSecondary }}
          >
            Missões para você
          </h2>
          <MissionGrid columns={3}>
            {!data.whatsappConnected && (
              <MissionCard
                icon={Smartphone}
                title="Conectar WhatsApp"
                description="Conecte seu WhatsApp Business para começar a receber mensagens"
                badge="Prioridade"
                badgeVariant="green"
                highlighted
                onClick={() => router.push('/whatsapp')}
              />
            )}
            {data.productsCount === 0 && (
              <MissionCard
                icon={Package}
                title="Cadastrar produtos"
                description="Adicione seus produtos para a IA poder vendê-los"
                badge={data.whatsappConnected ? 'Próximo passo' : undefined}
                onClick={() => router.push('/products')}
              />
            )}
            <MissionCard
              icon={Zap}
              title="Criar campanha"
              description="Envie mensagens em massa para seus contatos"
              onClick={() => router.push('/campaigns')}
            />
            <MissionCard
              icon={LinkIcon}
              title="Conectar pagamentos"
              description="Integre com Asaas ou Mercado Pago para receber"
              onClick={() => router.push('/integrations')}
            />
            <MissionCard
              icon={Settings}
              title="Personalizar IA"
              description="Configure o comportamento e tom da KLOEL"
              onClick={() => router.push('/chat')}
            />
          </MissionGrid>
        </div>
      </div>
    </div>
  );
}
