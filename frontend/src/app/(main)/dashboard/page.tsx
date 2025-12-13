'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Smartphone,
  Package,
  Zap,
  Wallet,
  Users,
  Link as LinkIcon,
  Bot,
  FileText,
  Brain,
} from 'lucide-react';
import { 
  CenterStage, 
  Section, 
  UniversalComposer, 
  ContextCapsule,
  StageHeadline,
  STAGE_HEADLINES,
  MissionCards,
  ProofCards,
  type MissionCardData,
  type ProofCardData,
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
      id: 'autopilot',
      label: 'Ativar Autopilot',
      icon: Bot,
      prompt: 'Ative o autopilot para responder automaticamente',
    },
    {
      id: 'pdf',
      label: 'Ensinar via PDF',
      icon: FileText,
      prompt: 'Quero ensinar meus produtos via PDF',
    },
  ].slice(0, 5);

  // Build missions based on current state
  const missions: MissionCardData[] = [
    ...(!data.whatsappConnected ? [{
      id: 'connect-whatsapp',
      title: 'Conectar WhatsApp',
      description: 'Conecte seu WhatsApp Business para começar a receber mensagens',
      icon: Smartphone,
      priority: true,
      action: () => router.push('/whatsapp'),
    }] : []),
    ...(data.productsCount === 0 ? [{
      id: 'add-products',
      title: 'Ensinar produtos via PDF',
      description: 'Adicione seus produtos para a IA poder vendê-los',
      icon: FileText,
      priority: !data.whatsappConnected ? false : true,
      action: () => router.push('/products'),
    }] : []),
    {
      id: 'create-funnel',
      title: 'Criar primeiro funil',
      description: 'Monte um funil de vendas automático',
      icon: Brain,
      action: () => router.push('/flow'),
    },
    {
      id: 'activate-autopilot',
      title: 'Ativar Autopilot',
      description: 'Deixe a IA responder e vender automaticamente',
      icon: Bot,
      action: () => router.push('/autopilot'),
    },
    {
      id: 'connect-payments',
      title: 'Conectar pagamentos',
      description: 'Integre com Asaas ou Mercado Pago para receber',
      icon: LinkIcon,
      action: () => router.push('/payments'),
    },
  ];

  // Build proofs (minimal status)
  const proofs: ProofCardData[] = [
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      value: data.whatsappConnected ? 'Conectado' : 'Desconectado',
      status: data.whatsappConnected ? 'good' : 'warning',
      icon: Smartphone,
    },
    {
      id: 'balance',
      label: 'Saldo',
      value: data.walletTotal,
      status: 'neutral',
      icon: Wallet,
    },
    {
      id: 'products',
      label: 'Memória',
      value: `${data.productsCount} itens`,
      status: data.productsCount > 0 ? 'good' : 'neutral',
      icon: Package,
    },
  ];

  return (
    <div className="min-h-full flex flex-col">
      {/* Stage XL - Dashboard/Home: central, much breathing room */}
      <Section spacing="lg" className="flex-1 flex flex-col items-center justify-center">
        <CenterStage size="XL" className="text-center">
          {/* Context Capsule */}
          <div className="mb-8 flex justify-center">
            <ContextCapsule 
              page="dashboard"
              autopilotActive={false}
              focus={data.kloelOnline ? undefined : 'Conectando...'}
            />
          </div>

          {/* Stage Headline */}
          <StageHeadline
            headline={STAGE_HEADLINES.dashboard.headline}
            highlight={STAGE_HEADLINES.dashboard.highlight}
            subheadline={STAGE_HEADLINES.dashboard.subheadline}
            size="xl"
          />

          {/* Universal Composer */}
          <div className="mt-10">
            <UniversalComposer
              placeholder="Diga o que você quer que eu faça pelo seu WhatsApp e suas vendas…"
              chips={actionChips}
              onSend={handleSend}
              isLoading={isLoading}
            />
          </div>
        </CenterStage>
      </Section>

      {/* Surface: Proofs (minimal status) */}
      <Section spacing="sm">
        <CenterStage size="L">
          <div className="flex justify-center">
            <ProofCards proofs={proofs} />
          </div>
        </CenterStage>
      </Section>

      {/* Surface: Mission Cards */}
      <Section spacing="md">
        <CenterStage size="L">
          <MissionCards
            title="Missões sugeridas"
            missions={missions}
            maxVisible={5}
          />
        </CenterStage>
      </Section>
    </div>
  );
}
