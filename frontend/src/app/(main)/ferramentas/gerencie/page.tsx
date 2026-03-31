'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { SectionPage } from '@/components/kloel/SectionPage';
import { ToolCard } from '@/components/kloel/ToolCard';

const TOOLS = [
  {
    icon: '\u{25B6}\u{FE0F}',
    title: 'Kloel Player',
    desc: 'Player de video seguro e personalizado para entregar seu conteudo com protecao contra download.',
    badge: 'Seguro',
  },
  {
    icon: '\u{1F465}',
    title: 'Central de Colaboradores',
    desc: 'Gerencie permissoes, funcoes e acessos de todos os membros da sua equipe.',
  },
  {
    icon: '\u{1F4D6}',
    title: 'Protecao de Ebooks',
    desc: 'Sistema de protecao DRM para seus ebooks e materiais digitais contra pirataria.',
  },
  {
    icon: '\u{1F4CB}',
    title: 'eNotas',
    desc: 'Emissao automatica de notas fiscais para cada venda realizada na plataforma.',
    badge: 'NF-e',
  },
  {
    icon: '\u{1F4B3}',
    title: 'Configuracoes de Pagamento',
    desc: 'Configure metodos de pagamento, parcelamento, moedas e gateways aceitos.',
  },
  {
    icon: '\u{1F517}',
    title: 'Widget de Pagamento',
    desc: 'Incorpore botoes e formularios de pagamento em qualquer site externo.',
  },
  {
    icon: '\u{1F4E7}',
    title: 'Envio de Relatorios',
    desc: 'Agende o envio automatico de relatorios por email para voce e sua equipe.',
  },
  {
    icon: '\u{1F50D}',
    title: 'Pixel de Rastreamento',
    desc: 'Instale pixels do Facebook, Google e TikTok para rastrear conversoes e otimizar anuncios.',
    badge: 'Ads',
  },
  {
    icon: '\u{1F4CA}',
    title: 'Relatorios Exportados',
    desc: 'Exporte relatorios detalhados em CSV e PDF para analise externa e contabilidade.',
  },
  {
    icon: '\u{1F91D}',
    title: 'Coproducoes',
    desc: 'Gerencie parcerias de coproducao com divisao automatica de receita entre produtores.',
  },
  {
    icon: '\u{1F4C8}',
    title: 'Estrategias de Vendas',
    desc: 'Templates e frameworks de estrategias comprovadas para maximizar suas vendas.',
    badge: 'Novo',
  },
  {
    icon: '\u{1F680}',
    title: 'Launchpad',
    desc: 'Gerencie lancamentos com grupos de WhatsApp automatizados. Crie launchers e distribua grupos em sequencia.',
    badge: 'Launch',
  },
];

const routeMap: Record<string, string> = {
  'Central de Colaboradores': '/parcerias/colaboradores',
  'Pixel de Rastreamento': '/analytics',
  'Coproducoes': '/parcerias/colaboradores',
  'Kloel Player': '/produtos/area-membros',
  'Configuracoes de Pagamento': '/settings',
  'Envio de Relatorios': '/analytics',
  'Relatorios Exportados': '/analytics',
  'Estrategias de Vendas': '/vendas',
  'Launchpad': '/ferramentas/launchpad',
};

const comingSoon = new Set([
  'Protecao de Ebooks',
  'eNotas',
  'Widget de Pagamento',
]);

export default function GerenciePage() {
  const router = useRouter();

  return (
    <SectionPage
      title="Gerencie seu Negocio"
      icon="\u{2699}\u{FE0F}"
      description="11 ferramentas essenciais para gerenciar pagamentos, equipe e operacoes"
      back={() => router.push('/ferramentas')}
      tags={['Pagamento', 'Equipe', 'Relatorios', 'Rastreamento', 'Integracao']}
    >
      {/* Em desenvolvimento banner */}
      <div style={{
        background: 'rgba(232, 93, 48, 0.06)',
        border: '1px solid rgba(232, 93, 48, 0.15)',
        borderRadius: 6,
        padding: '14px 20px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{ fontSize: 16 }}>{'\u{1F6A7}'}</span>
        <span style={{ fontSize: 13, color: '#E85D30', fontWeight: 500 }}>
          Em desenvolvimento — algumas ferramentas estarao disponiveis em breve.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {TOOLS.map((tool) => {
          const route = routeMap[tool.title];
          const isSoon = comingSoon.has(tool.title);
          const hasRoute = !!route;
          return (
            <ToolCard
              key={tool.title}
              icon={tool.icon}
              title={tool.title}
              desc={tool.desc}
              badge={isSoon ? 'Em breve' : tool.badge}
              disabled={isSoon}
              onClick={hasRoute ? () => router.push(route) : isSoon ? () => router.push(`/ferramentas/em-breve?tool=${encodeURIComponent(tool.title)}`) : undefined}
            />
          );
        })}
      </div>
    </SectionPage>
  );
}
