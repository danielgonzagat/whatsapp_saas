'use client';

import { useRouter } from 'next/navigation';
import { SectionPage } from '@/components/kloel/SectionPage';
import { ToolCard } from '@/components/kloel/ToolCard';

const TOOLS = [
  {
    icon: '\u{1F91D}',
    title: 'Programa de Afiliados',
    desc: 'Crie seu programa de afiliados e tenha parceiros vendendo seus produtos com comissoes automaticas.',
    badge: 'Popular',
  },
  {
    icon: '\u{1F4C4}',
    title: 'Paginas Dinamicas',
    desc: 'Crie paginas de vendas personalizadas que se adaptam ao perfil do visitante automaticamente.',
  },
  {
    icon: '\u{1F503}',
    title: 'Paginas Alternativas',
    desc: 'Teste diferentes versoes da sua pagina de vendas com testes A/B integrados.',
    badge: 'A/B Test',
  },
  {
    icon: '\u{2B50}',
    title: 'Recomenda',
    desc: 'Sistema de recomendacao inteligente que sugere produtos complementares aos seus clientes.',
  },
  {
    icon: '\u{1F4E6}',
    title: 'Order Bump',
    desc: 'Adicione ofertas complementares no checkout e aumente o ticket medio de cada venda.',
    badge: 'Receita +',
  },
  {
    icon: '\u{1F4E3}',
    title: 'Material de Divulgacao',
    desc: 'Banners, criativos e materiais prontos para seus afiliados divulgarem seus produtos.',
  },
  {
    icon: '\u{1F3A8}',
    title: 'Criador de Paginas',
    desc: 'Editor visual drag-and-drop para criar landing pages, paginas de captura e paginas de vendas.',
  },
  {
    icon: '\u{1F6D2}',
    title: 'Aparencia do Pagamento',
    desc: 'Personalize a aparencia do checkout com sua marca, cores e elementos visuais.',
  },
  {
    icon: '\u{1F3AF}',
    title: 'Funil de Vendas',
    desc: 'Monte funis de vendas completos com upsell, downsell e cross-sell automatizados.',
    badge: 'Estrategia',
  },
  {
    icon: '\u{1F3A5}',
    title: 'Webinario',
    desc: 'Realize webinarios ao vivo ou automaticos para apresentar e vender seus produtos.',
  },
  {
    icon: '\u{1F451}',
    title: 'Kloel Club',
    desc: 'Area de membros exclusiva para entregar conteudo premium aos seus alunos e clientes.',
    badge: 'Premium',
  },
  {
    icon: '\u{1F6E1}\u{FE0F}',
    title: 'Estrategia de Retencao',
    desc: 'Ferramentas para reduzir cancelamentos e manter seus clientes engajados por mais tempo.',
  },
];

const routeMap: Record<string, string> = {
  'Programa de Afiliados': '/parcerias/afiliados',
  'Material de Divulgacao': '/parcerias/afiliados',
  'Criador de Paginas': '/marketing/site',
  'Funil de Vendas': '/funnels',
  'Kloel Club': '/produtos/area-membros',
};

const comingSoon = new Set([
  'Paginas Dinamicas',
  'Paginas Alternativas',
  'Recomenda',
  'Order Bump',
  'Aparencia do Pagamento',
  'Webinario',
  'Estrategia de Retencao',
]);

export default function ImpulsionePage() {
  const router = useRouter();

  return (
    <SectionPage
      title="Impulsione suas Vendas"
      icon="\u{1F680}"
      description="12 ferramentas projetadas para aumentar conversoes e escalar sua receita"
      back={() => router.push('/ferramentas')}
      tags={['Afiliados', 'Paginas', 'Checkout', 'Funil', 'Conteudo']}
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
              onClick={hasRoute ? () => router.push(route) : isSoon ? () => alert(`"${tool.title}" estara disponivel em breve.`) : undefined}
            />
          );
        })}
      </div>
    </SectionPage>
  );
}
