'use client';

export const dynamic = 'force-dynamic';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SectionPage } from '@/components/kloel/SectionPage';
import { ToolCard } from '@/components/kloel/ToolCard';
import { Card } from '@/components/kloel/Card';
import { Val } from '@/components/kloel/Val';
import { colors, typography, motion } from '@/lib/design-tokens';

type Category = 'all' | 'impulsione' | 'recupere' | 'fale' | 'gerencie';
type Role = 'all' | 'produtor' | 'afiliado';

interface Tool {
  icon: string;
  title: string;
  desc: string;
  badge?: string;
  category: Category;
  roles: Role[];
}

const ALL_TOOLS: Tool[] = [
  // ── IMPULSIONE (12) ──
  { icon: '\u{1F91D}', title: 'Programa de Afiliados', desc: 'Crie seu programa de afiliados e tenha parceiros vendendo seus produtos com comissoes automaticas.', badge: 'Popular', category: 'impulsione', roles: ['produtor'] },
  { icon: '\u{1F4C4}', title: 'Paginas Dinamicas', desc: 'Paginas de vendas personalizadas que se adaptam ao perfil do visitante.', category: 'impulsione', roles: ['produtor'] },
  { icon: '\u{1F503}', title: 'Paginas Alternativas', desc: 'Teste diferentes versoes da sua pagina de vendas com testes A/B.', badge: 'A/B Test', category: 'impulsione', roles: ['produtor'] },
  { icon: '\u{2B50}', title: 'Recomenda', desc: 'Sistema de recomendacao inteligente que sugere produtos complementares.', category: 'impulsione', roles: ['produtor'] },
  { icon: '\u{1F4E6}', title: 'Order Bump', desc: 'Ofertas complementares no checkout para aumentar o ticket medio.', badge: 'Receita +', category: 'impulsione', roles: ['produtor'] },
  { icon: '\u{1F4E3}', title: 'Material de Divulgacao', desc: 'Banners, criativos e materiais prontos para afiliados divulgarem.', category: 'impulsione', roles: ['produtor', 'afiliado'] },
  { icon: '\u{1F3A8}', title: 'Criador de Paginas', desc: 'Editor visual drag-and-drop para landing pages e paginas de vendas.', category: 'impulsione', roles: ['produtor'] },
  { icon: '\u{1F6D2}', title: 'Aparencia do Pagamento', desc: 'Personalize a aparencia do checkout com sua marca e cores.', category: 'impulsione', roles: ['produtor'] },
  { icon: '\u{1F3AF}', title: 'Funil de Vendas', desc: 'Monte funis completos com upsell, downsell e cross-sell.', badge: 'Estrategia', category: 'impulsione', roles: ['produtor'] },
  { icon: '\u{1F3A5}', title: 'Webinario', desc: 'Webinarios ao vivo ou automaticos para vender seus produtos.', category: 'impulsione', roles: ['produtor'] },
  { icon: '\u{1F451}', title: 'Kloel Club', desc: 'Area de membros exclusiva para conteudo premium.', badge: 'Premium', category: 'impulsione', roles: ['produtor'] },
  { icon: '\u{1F6E1}\u{FE0F}', title: 'Estrategia de Retencao', desc: 'Ferramentas para reduzir cancelamentos e manter clientes.', category: 'impulsione', roles: ['produtor'] },

  // ── RECUPERE (10) ──
  { icon: '\u{1F4E9}', title: 'Recuperacao de Carrinho', desc: 'Recupere vendas perdidas com mensagens automaticas para quem abandonou o checkout.', badge: 'Recupere', category: 'recupere', roles: ['produtor'] },
  { icon: '\u{1F514}', title: 'Notificacoes Push', desc: 'Envie notificacoes push para re-engajar visitantes que sairam do site.', category: 'recupere', roles: ['produtor'] },
  { icon: '\u{1F4AC}', title: 'Chatbot de Vendas', desc: 'Bot de conversacao para qualificar leads e recuperar vendas via chat.', badge: 'IA', category: 'recupere', roles: ['produtor'] },
  { icon: '\u{1F4E7}', title: 'Email de Recuperacao', desc: 'Sequencia automatica de emails para leads que nao compraram.', category: 'recupere', roles: ['produtor'] },
  { icon: '\u{1F4F1}', title: 'SMS Automatico', desc: 'Envie SMS de recuperacao e lembretes para leads e clientes.', category: 'recupere', roles: ['produtor'] },
  { icon: '\u{1F504}', title: 'Retargeting Inteligente', desc: 'Crie audiencias de retargeting automaticas para suas campanhas de ads.', category: 'recupere', roles: ['produtor', 'afiliado'] },
  { icon: '\u{23F0}', title: 'Urgencia e Escassez', desc: 'Adicione contadores regressivos e alertas de estoque limitado.', category: 'recupere', roles: ['produtor'] },
  { icon: '\u{1F3AB}', title: 'Cupom de Recuperacao', desc: 'Gere cupons automaticos para incentivo de compra apos abandono.', category: 'recupere', roles: ['produtor'] },
  { icon: '\u{1F4CA}', title: 'Analytics de Abandono', desc: 'Analise detalhada de onde e por que seus leads desistem da compra.', category: 'recupere', roles: ['produtor'] },
  { icon: '\u{1F300}', title: 'Automacao de Retorno', desc: 'Fluxos automaticos para trazer de volta leads inativos.', category: 'recupere', roles: ['produtor'] },

  // ── FALE (9) ──
  { icon: '\u{1F4F2}', title: 'WhatsApp Marketing', desc: 'Envie campanhas em massa pelo WhatsApp com mensagens personalizadas.', badge: 'WhatsApp', category: 'fale', roles: ['produtor', 'afiliado'] },
  { icon: '\u{1F916}', title: 'Kloel IA', desc: 'Assistente de IA que atende seus leads 24/7 com inteligencia conversacional.', badge: 'IA', category: 'fale', roles: ['produtor'] },
  { icon: '\u{1F4E8}', title: 'Email Marketing', desc: 'Crie e envie campanhas de email com templates profissionais.', category: 'fale', roles: ['produtor'] },
  { icon: '\u{1F4DE}', title: 'Central de Suporte', desc: 'Sistema de tickets e atendimento ao cliente integrado.', category: 'fale', roles: ['produtor'] },
  { icon: '\u{1F4E2}', title: 'Broadcast', desc: 'Envie mensagens em massa para listas segmentadas de contatos.', category: 'fale', roles: ['produtor'] },
  { icon: '\u{1F4DD}', title: 'Templates de Mensagem', desc: 'Biblioteca de templates aprovados para WhatsApp e email.', category: 'fale', roles: ['produtor', 'afiliado'] },
  { icon: '\u{1F4CB}', title: 'Pesquisa de Satisfacao', desc: 'Colete feedback automatico apos cada interacao ou compra.', category: 'fale', roles: ['produtor'] },
  { icon: '\u{1F5D3}\u{FE0F}', title: 'Agendamento de Envio', desc: 'Programe mensagens e campanhas para envio futuro automatico.', category: 'fale', roles: ['produtor'] },
  { icon: '\u{1F310}', title: 'Multicanal', desc: 'Gerencie conversas de WhatsApp, email, Instagram e Telegram em um so lugar.', badge: 'Omnichannel', category: 'fale', roles: ['produtor'] },

  // ── GERENCIE (11) ──
  { icon: '\u{25B6}\u{FE0F}', title: 'Kloel Player', desc: 'Player de video seguro com protecao contra download e pirataria.', badge: 'Seguro', category: 'gerencie', roles: ['produtor'] },
  { icon: '\u{1F465}', title: 'Central de Colaboradores', desc: 'Gerencie permissoes, funcoes e acessos da equipe.', category: 'gerencie', roles: ['produtor'] },
  { icon: '\u{1F4D6}', title: 'Protecao de Ebooks', desc: 'Sistema DRM para proteger materiais digitais contra pirataria.', category: 'gerencie', roles: ['produtor'] },
  { icon: '\u{1F4CB}', title: 'eNotas', desc: 'Emissao automatica de notas fiscais para cada venda.', badge: 'NF-e', category: 'gerencie', roles: ['produtor'] },
  { icon: '\u{1F4B3}', title: 'Configuracoes de Pagamento', desc: 'Configure metodos de pagamento, parcelamento e gateways.', category: 'gerencie', roles: ['produtor'] },
  { icon: '\u{1F517}', title: 'Widget de Pagamento', desc: 'Incorpore formularios de pagamento em sites externos.', category: 'gerencie', roles: ['produtor', 'afiliado'] },
  { icon: '\u{1F4E7}', title: 'Envio de Relatorios', desc: 'Envio automatico de relatorios por email para sua equipe.', category: 'gerencie', roles: ['produtor'] },
  { icon: '\u{1F50D}', title: 'Pixel de Rastreamento', desc: 'Pixels do Facebook, Google e TikTok para rastrear conversoes.', badge: 'Ads', category: 'gerencie', roles: ['produtor', 'afiliado'] },
  { icon: '\u{1F4CA}', title: 'Relatorios Exportados', desc: 'Exporte relatorios em CSV e PDF para analise externa.', category: 'gerencie', roles: ['produtor'] },
  { icon: '\u{1F91D}', title: 'Coproducoes', desc: 'Parcerias de coproducao com divisao automatica de receita.', category: 'gerencie', roles: ['produtor'] },
  { icon: '\u{1F4C8}', title: 'Estrategias de Vendas', desc: 'Templates de estrategias comprovadas para maximizar vendas.', badge: 'Novo', category: 'gerencie', roles: ['produtor', 'afiliado'] },
];

const CATEGORY_CARDS: { key: Category; icon: string; title: string; count: number; color: string }[] = [
  { key: 'impulsione', icon: '\u{1F680}', title: 'Impulsione', count: 12, color: colors.accent.webb },
  { key: 'recupere', icon: '\u{1F504}', title: 'Recupere', count: 10, color: colors.state.success },
  { key: 'fale', icon: '\u{1F4AC}', title: 'Fale', count: 9, color: colors.accent.gold },
  { key: 'gerencie', icon: '\u{2699}\u{FE0F}', title: 'Gerencie', count: 11, color: colors.accent.nebula },
];

export default function VerTodasPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [role, setRole] = useState<Role>('all');

  const filtered = useMemo(() => {
    return ALL_TOOLS.filter((tool) => {
      if (category !== 'all' && tool.category !== category) return false;
      if (role !== 'all' && !tool.roles.includes(role)) return false;
      if (search) {
        const text = `${tool.title} ${tool.desc} ${tool.badge || ''}`.toLowerCase();
        if (!text.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [search, category, role]);

  return (
    <SectionPage
      title="Todas as Ferramentas"
      icon="\u{1F4CB}"
      description={`${ALL_TOOLS.length} ferramentas para impulsionar, recuperar, comunicar e gerenciar`}
      back={() => router.push('/ferramentas')}
    >
      {/* Search + Role Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            placeholder="Buscar ferramenta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px 12px 40px',
              background: colors.background.nebula,
              border: `1px solid ${colors.border.space}`,
              borderRadius: 6,
              color: colors.text.starlight,
              fontFamily: typography.fontFamily.sans,
              fontSize: 14,
              outline: 'none',
            }}
          />
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, opacity: 0.4 }}>&#128269;</span>
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          style={{
            padding: '12px 16px',
            background: colors.background.nebula,
            border: `1px solid ${colors.border.space}`,
            borderRadius: 6,
            color: colors.text.starlight,
            fontFamily: typography.fontFamily.display,
            fontSize: 13,
            fontWeight: 600,
            outline: 'none',
            appearance: 'none' as const,
            minWidth: 160,
            cursor: 'pointer',
          }}
        >
          <option value="all">Todos os Perfis</option>
          <option value="produtor">Produtor</option>
          <option value="afiliado">Afiliado</option>
        </select>
      </div>

      {/* Category Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        {CATEGORY_CARDS.map((cat) => {
          const isActive = category === cat.key;
          return (
            <div
              key={cat.key}
              onClick={() => setCategory(isActive ? 'all' : cat.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                background: isActive ? `rgba(${cat.color === colors.accent.webb ? '78, 122, 224' : cat.color === colors.state.success ? '45, 212, 160' : cat.color === colors.accent.gold ? '201, 168, 76' : '123, 94, 167'}, 0.08)` : colors.background.space,
                border: `1px solid ${isActive ? cat.color : colors.border.space}`,
                borderRadius: 6,
                cursor: 'pointer',
                transition: `all ${motion.duration.normal} ${motion.easing.gravity}`,
              }}
            >
              <span style={{ fontSize: 22 }}>{cat.icon}</span>
              <div>
                <div style={{
                  fontFamily: typography.fontFamily.display,
                  fontSize: 14,
                  fontWeight: 600,
                  color: isActive ? cat.color : colors.text.starlight,
                }}>
                  {cat.title}
                </div>
                <div style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: 11,
                  color: colors.text.dust,
                }}>
                  {cat.count} ferramentas
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Results Count */}
      <div style={{
        fontFamily: typography.fontFamily.sans,
        fontSize: 13,
        color: colors.text.moonlight,
        marginBottom: 16,
      }}>
        {filtered.length} ferramenta{filtered.length !== 1 ? 's' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
        {category !== 'all' && ` em ${CATEGORY_CARDS.find(c => c.key === category)?.title}`}
        {role !== 'all' && ` para ${role === 'produtor' ? 'Produtor' : 'Afiliado'}`}
      </div>

      {/* Tools Grid */}
      {filtered.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: 32, color: colors.text.dust, fontFamily: typography.fontFamily.sans, fontSize: 14 }}>
            Nenhuma ferramenta encontrada para os filtros selecionados.
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map((tool) => {
            const routeMap: Record<string, string> = {
              'Programa de Afiliados': '/parcerias/afiliados',
              'Material de Divulgacao': '/parcerias/afiliados',
              'Criador de Paginas': '/marketing/site',
              'Funil de Vendas': '/funnels',
              'Kloel Club': '/produtos/area-membros',
              'Chatbot de Vendas': '/chat',
              'Email de Recuperacao': '/campaigns',
              'Analytics de Abandono': '/analytics',
              'Automacao de Retorno': '/flow',
              'WhatsApp Marketing': '/marketing/whatsapp',
              'Kloel IA': '/autopilot',
              'Email Marketing': '/campaigns',
              'Central de Suporte': '/inbox',
              'Broadcast': '/marketing/whatsapp',
              'Multicanal': '/inbox',
              'Central de Colaboradores': '/parcerias/colaboradores',
              'Pixel de Rastreamento': '/analytics',
              'Coproducoes': '/parcerias/colaboradores',
            };
            const comingSoon = new Set([
              'Paginas Dinamicas', 'Paginas Alternativas', 'Recomenda', 'Order Bump',
              'Aparencia do Pagamento', 'Webinario', 'Estrategia de Retencao',
              'Recuperacao de Carrinho', 'Notificacoes Push', 'SMS Automatico',
              'Retargeting Inteligente', 'Urgencia e Escassez', 'Cupom de Recuperacao',
              'Kloel Player', 'Protecao de Ebooks', 'eNotas', 'Configuracoes de Pagamento',
              'Widget de Pagamento', 'Envio de Relatorios', 'Relatorios Exportados',
              'Estrategias de Vendas', 'Templates de Mensagem', 'Pesquisa de Satisfacao',
              'Agendamento de Envio',
              'Funil de Vendas', 'Kloel Club', 'Material de Divulgacao',
              'Criador de Paginas', 'Programa de Afiliados',
            ]);
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
                disabled={!hasRoute && isSoon}
                onClick={hasRoute ? () => router.push(route) : isSoon ? () => alert(`"${tool.title}" estara disponivel em breve.`) : undefined}
              />
            );
          })}
        </div>
      )}
    </SectionPage>
  );
}
