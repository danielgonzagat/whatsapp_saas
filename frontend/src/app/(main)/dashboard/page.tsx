'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Smartphone,
  Package,
  Zap,
  TrendingUp,
  Wallet,
  Users,
  Settings,
  Link as LinkIcon,
  Bot,
} from 'lucide-react';
import { 
  CenterStage, 
  Section, 
  UniversalComposer, 
  ContextCapsule,
  StatCard, 
  ActionCard,
  Grid,
  Flex,
} from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { getKloelHealth, getWalletBalance, getMemoryStats, getWhatsAppStatus } from '@/lib/api';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';

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
  const handleSend = (message: string) => {
    const encodedMessage = encodeURIComponent(message);
    router.push(`/chat?q=${encodedMessage}`);
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
    {
      id: 'autopilot',
      label: 'Ativar Autopilot',
      icon: Bot,
      prompt: 'Ative o autopilot para responder automaticamente',
    },
  ].slice(0, 5);

  return (
    <div className="min-h-full flex flex-col">
      {/* Hero Section - Chat First */}
      <Section spacing="lg" className="flex-1 flex flex-col items-center justify-center">
        <CenterStage size="L" className="text-center">
          {/* Status Capsule */}
          <div className="mb-8">
            <ContextCapsule 
              page="dashboard"
              autopilotActive={false}
              focus={data.kloelOnline ? undefined : 'Conectando...'}
            />
          </div>

          {/* Hero Title */}
          <h1 
            className="text-4xl md:text-5xl font-bold mb-3"
            style={{ color: colors.text.primary }}
          >
            Como posso ajudar{' '}
            <span style={{ color: colors.brand.green }}>
              seu negócio
            </span>{' '}
            hoje?
          </h1>
          
          <p 
            className="text-lg mb-10"
            style={{ color: colors.text.secondary }}
          >
            Diga o que você precisa — eu cuido do resto.
          </p>

          {/* Universal Composer */}
          <UniversalComposer
            placeholder="Diga o que você quer que eu faça pelo seu WhatsApp e suas vendas…"
            chips={actionChips}
            onSend={handleSend}
            isLoading={isLoading}
          />
        </CenterStage>
      </Section>

      {/* Stats Row */}
      <Section spacing="sm">
        <CenterStage size="XL">
          <Grid cols={4} gap={4}>
            <StatCard
              icon={Smartphone}
              label="WhatsApp"
              value={data.whatsappConnected ? 'Conectado' : 'Desconectado'}
            />
            <StatCard
              icon={Wallet}
              label="Saldo"
              value={data.walletTotal}
              change={data.walletPending !== 'R$ 0,00' ? { value: 12, label: 'pendente' } : undefined}
            />
            <StatCard
              icon={Package}
              label="Produtos"
              value={data.productsCount}
            />
            <StatCard
              icon={Users}
              label="Leads"
              value="—"
            />
          </Grid>
        </CenterStage>
      </Section>

      {/* Mission Cards */}
      <Section spacing="md">
        <CenterStage size="XL">
          <h2 
            className="text-sm font-medium mb-4"
            style={{ color: colors.text.muted }}
          >
            Missões para você
          </h2>
          <Grid cols={3} gap={4}>
            {!data.whatsappConnected && (
              <ActionCard
                icon={Smartphone}
                title="Conectar WhatsApp"
                description="Conecte seu WhatsApp Business para começar a receber mensagens"
                accent="green"
                onClick={() => router.push('/whatsapp')}
              />
            )}
            {data.productsCount === 0 && (
              <ActionCard
                icon={Package}
                title="Cadastrar produtos"
                description="Adicione seus produtos para a IA poder vendê-los"
                accent="cyan"
                onClick={() => router.push('/products')}
              />
            )}
            <ActionCard
              icon={Zap}
              title="Criar campanha"
              description="Envie mensagens em massa para seus contatos"
              onClick={() => router.push('/campaigns')}
            />
            <ActionCard
              icon={LinkIcon}
              title="Conectar pagamentos"
              description="Integre com Asaas ou Mercado Pago para receber"
              onClick={() => router.push('/integrations')}
            />
            <ActionCard
              icon={Settings}
              title="Personalizar IA"
              description="Configure o comportamento e tom da KLOEL"
              onClick={() => router.push('/chat')}
            />
          </Grid>
        </CenterStage>
      </Section>
    </div>
  );
}
