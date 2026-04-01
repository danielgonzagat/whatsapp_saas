export type CapabilityCategory = 'impulsione' | 'recupere' | 'fale' | 'gerencie';
export type CapabilityRole = 'produtor' | 'afiliado';
export type CapabilityStatus = 'active' | 'partial' | 'planned';

export interface FrontendCapability {
  icon: string;
  title: string;
  desc: string;
  category: CapabilityCategory;
  roles: CapabilityRole[];
  status: CapabilityStatus;
  route?: string;
  badge?: string;
}

const PLANNED_CAPABILITY_ROUTE = '/ferramentas/em-breve';

export const CAPABILITY_CATEGORY_META: Record<
  CapabilityCategory,
  { icon: string; title: string; color: string }
> = {
  impulsione: { icon: '\u{1F680}', title: 'Impulsione', color: '#4E7AE0' },
  recupere: { icon: '\u{1F504}', title: 'Recupere', color: '#2DD4A0' },
  fale: { icon: '\u{1F4AC}', title: 'Fale', color: '#C9A84C' },
  gerencie: { icon: '\u{2699}\u{FE0F}', title: 'Gerencie', color: '#7B5EA7' },
};

export const FRONTEND_CAPABILITIES: FrontendCapability[] = [
  // Impulsione
  { icon: '\u{1F91D}', title: 'Programa de Afiliados', desc: 'Crie seu programa de afiliados e tenha parceiros vendendo seus produtos com comissoes automaticas.', badge: 'Popular', category: 'impulsione', roles: ['produtor'], status: 'active', route: '/parcerias/afiliados' },
  { icon: '\u{1F4C4}', title: 'Paginas Dinamicas', desc: 'Paginas de vendas personalizadas que se adaptam ao perfil do visitante.', category: 'impulsione', roles: ['produtor'], status: 'active', route: '/sites/criar?mode=dynamic' },
  { icon: '\u{1F503}', title: 'Paginas Alternativas', desc: 'Teste diferentes versoes da sua pagina de vendas com testes A/B.', badge: 'A/B Test', category: 'impulsione', roles: ['produtor'], status: 'active', route: '/sites/editar?mode=ab' },
  { icon: '\u{2B50}', title: 'Recomenda', desc: 'Sistema de recomendacao inteligente que sugere produtos complementares.', category: 'impulsione', roles: ['produtor'], status: 'active', route: '/products?feature=recommendation' },
  { icon: '\u{1F4E6}', title: 'Order Bump', desc: 'Ofertas complementares no checkout para aumentar o ticket medio.', badge: 'Receita +', category: 'impulsione', roles: ['produtor'], status: 'active', route: '/products?feature=order-bump' },
  { icon: '\u{1F4E3}', title: 'Material de Divulgacao', desc: 'Banners, criativos e materiais prontos para afiliados divulgarem.', category: 'impulsione', roles: ['produtor', 'afiliado'], status: 'active', route: '/parcerias/afiliados' },
  { icon: '\u{1F3A8}', title: 'Criador de Paginas', desc: 'Editor visual para landing pages, paginas de captura e paginas de vendas.', category: 'impulsione', roles: ['produtor'], status: 'active', route: '/sites/criar' },
  { icon: '\u{1F6D2}', title: 'Aparencia do Pagamento', desc: 'Personalize a aparencia do checkout com sua marca e cores.', category: 'impulsione', roles: ['produtor'], status: 'active', route: '/products?feature=checkout-appearance' },
  { icon: '\u{1F3AF}', title: 'Funil de Vendas', desc: 'Monte funis completos com upsell, downsell e cross-sell.', badge: 'Estrategia', category: 'impulsione', roles: ['produtor'], status: 'active', route: '/funnels' },
  { icon: '\u{1F3A5}', title: 'Webinario', desc: 'Webinarios ao vivo ou automaticos para vender seus produtos.', category: 'impulsione', roles: ['produtor'], status: 'active', route: '/webinarios' },
  { icon: '\u{1F451}', title: 'Kloel Club', desc: 'Area de membros exclusiva para conteudo premium.', badge: 'Premium', category: 'impulsione', roles: ['produtor'], status: 'active', route: '/produtos/area-membros' },
  { icon: '\u{1F6E1}\u{FE0F}', title: 'Estrategia de Retencao', desc: 'Ferramentas para reduzir cancelamentos e manter clientes.', category: 'impulsione', roles: ['produtor'], status: 'active', route: '/followups?source=marketing' },

  // Recupere
  { icon: '\u{1F4E9}', title: 'Recuperacao de Carrinho', desc: 'Recupere vendas perdidas com mensagens automaticas para quem abandonou o checkout.', badge: 'Recupere', category: 'recupere', roles: ['produtor'], status: 'active', route: '/followups?source=marketing' },
  { icon: '\u{1F514}', title: 'Notificacoes Push', desc: 'Envie notificacoes push para re-engajar visitantes que sairam do site.', category: 'recupere', roles: ['produtor'], status: 'planned' },
  { icon: '\u{1F4AC}', title: 'Chatbot de Vendas', desc: 'Bot de conversacao para qualificar leads e recuperar vendas via chat.', badge: 'IA', category: 'recupere', roles: ['produtor'], status: 'active', route: '/inbox' },
  { icon: '\u{1F4E7}', title: 'Email de Recuperacao', desc: 'Sequencia automatica de emails para leads que nao compraram.', category: 'recupere', roles: ['produtor'], status: 'active', route: '/campaigns' },
  { icon: '\u{1F4F1}', title: 'SMS Automatico', desc: 'Envie SMS de recuperacao e lembretes para leads e clientes.', category: 'recupere', roles: ['produtor'], status: 'planned' },
  { icon: '\u{1F504}', title: 'Retargeting Inteligente', desc: 'Crie audiencias de retargeting automaticas para suas campanhas de ads.', category: 'recupere', roles: ['produtor', 'afiliado'], status: 'active', route: '/anuncios/rastreamento?focus=retargeting' },
  { icon: '\u{23F0}', title: 'Urgencia e Escassez', desc: 'Adicione contadores regressivos e alertas de estoque limitado.', category: 'recupere', roles: ['produtor'], status: 'active', route: '/products?feature=urgency' },
  { icon: '\u{1F3AB}', title: 'Cupom de Recuperacao', desc: 'Gere cupons automaticos para incentivo de compra apos abandono.', category: 'recupere', roles: ['produtor'], status: 'active', route: '/products?feature=coupon' },
  { icon: '\u{1F4CA}', title: 'Analytics de Abandono', desc: 'Analise detalhada de onde e por que seus leads desistem da compra.', category: 'recupere', roles: ['produtor'], status: 'active', route: '/analytics?tab=abandonos' },
  { icon: '\u{1F300}', title: 'Automacao de Retorno', desc: 'Fluxos automaticos para trazer de volta leads inativos.', category: 'recupere', roles: ['produtor'], status: 'active', route: '/flow' },
  { icon: '\u{1F465}', title: 'Leads', desc: 'Gestao dedicada dos contatos e segmentos comerciais.', category: 'recupere', roles: ['produtor'], status: 'active', route: '/leads' },
  { icon: '\u{1F501}', title: 'Follow-ups', desc: 'Cadencias e retomadas manuais para nao perder leads mornos.', category: 'recupere', roles: ['produtor'], status: 'active', route: '/followups' },

  // Fale
  { icon: '\u{1F4F2}', title: 'WhatsApp Marketing', desc: 'Envie campanhas em massa pelo WhatsApp com mensagens personalizadas.', badge: 'WhatsApp', category: 'fale', roles: ['produtor', 'afiliado'], status: 'active', route: '/marketing/whatsapp' },
  { icon: '\u{1F916}', title: 'Kloel IA', desc: 'Assistente de IA que atende seus leads 24/7 com inteligencia conversacional.', badge: 'IA', category: 'fale', roles: ['produtor'], status: 'active', route: '/dashboard' },
  { icon: '\u{1F4E8}', title: 'Email Marketing', desc: 'Crie e envie campanhas de email com templates profissionais.', category: 'fale', roles: ['produtor'], status: 'active', route: '/marketing/email' },
  { icon: '\u{1F4DE}', title: 'Central de Suporte', desc: 'Sistema de tickets e atendimento ao cliente integrado.', category: 'fale', roles: ['produtor'], status: 'active', route: '/inbox' },
  { icon: '\u{1F4E2}', title: 'Broadcast', desc: 'Envie mensagens em massa para listas segmentadas de contatos.', category: 'fale', roles: ['produtor'], status: 'active', route: '/marketing/whatsapp?mode=broadcast' },
  { icon: '\u{1F4DD}', title: 'Templates de Mensagem', desc: 'Biblioteca de templates aprovados para WhatsApp e email.', category: 'fale', roles: ['produtor', 'afiliado'], status: 'active', route: '/marketing/email?mode=templates' },
  { icon: '\u{1F4CB}', title: 'Pesquisa de Satisfacao', desc: 'Colete feedback automatico apos cada interacao ou compra.', category: 'fale', roles: ['produtor'], status: 'active', route: '/analytics?tab=satisfacao' },
  { icon: '\u{1F5D3}\u{FE0F}', title: 'Agendamento de Envio', desc: 'Programe mensagens e campanhas para envio futuro automatico.', category: 'fale', roles: ['produtor'], status: 'active', route: '/campaigns' },
  { icon: '\u{1F310}', title: 'Multicanal', desc: 'Gerencie conversas de WhatsApp, email e Instagram em um so lugar.', badge: 'Omnichannel', category: 'fale', roles: ['produtor'], status: 'active', route: '/inbox' },
  { icon: '\u{1F4EC}', title: 'Inbox', desc: 'Central unica para atendimento, conversas, backlog e tomada de acao.', category: 'fale', roles: ['produtor'], status: 'active', route: '/inbox' },
  { icon: '\u{1F50A}', title: 'CIA', desc: 'Superficie de inteligencia operacional e assistencia de execucao.', category: 'fale', roles: ['produtor'], status: 'active', route: '/cia' },

  // Gerencie
  { icon: '\u{25B6}\u{FE0F}', title: 'Kloel Player', desc: 'Player de video seguro com protecao contra download e pirataria.', badge: 'Seguro', category: 'gerencie', roles: ['produtor'], status: 'active', route: '/produtos/area-membros' },
  { icon: '\u{1F465}', title: 'Central de Colaboradores', desc: 'Gerencie permissoes, funcoes e acessos da equipe.', category: 'gerencie', roles: ['produtor'], status: 'active', route: '/parcerias/colaboradores' },
  { icon: '\u{1F4D6}', title: 'Protecao de Ebooks', desc: 'Sistema DRM para proteger materiais digitais contra pirataria.', category: 'gerencie', roles: ['produtor'], status: 'planned' },
  { icon: '\u{1F4CB}', title: 'eNotas', desc: 'Emissao automatica de notas fiscais para cada venda.', badge: 'NF-e', category: 'gerencie', roles: ['produtor'], status: 'planned' },
  { icon: '\u{1F4B3}', title: 'Cobrancas Kloel', desc: 'Gerencie cobrancas, checkout e operacao financeira diretamente pelo Kloel.', category: 'gerencie', roles: ['produtor'], status: 'active', route: '/settings?section=billing' },
  { icon: '\u{1F517}', title: 'Widget de Pagamento', desc: 'Incorpore formularios de pagamento em sites externos.', category: 'gerencie', roles: ['produtor', 'afiliado'], status: 'planned' },
  { icon: '\u{1F4E7}', title: 'Envio de Relatorios', desc: 'Envio automatico de relatorios por email para sua equipe.', category: 'gerencie', roles: ['produtor'], status: 'active', route: '/analytics?tab=envio' },
  { icon: '\u{1F50D}', title: 'Pixel de Rastreamento', desc: 'Pixels do Facebook, Google e TikTok para rastrear conversoes.', badge: 'Ads', category: 'gerencie', roles: ['produtor', 'afiliado'], status: 'active', route: '/anuncios/rastreamento' },
  { icon: '\u{1F4CA}', title: 'Relatorios Exportados', desc: 'Exporte relatorios em CSV e PDF para analise externa.', category: 'gerencie', roles: ['produtor'], status: 'active', route: '/analytics?tab=exportacoes' },
  { icon: '\u{1F91D}', title: 'Coproducoes', desc: 'Parcerias de coproducao com divisao automatica de receita.', category: 'gerencie', roles: ['produtor'], status: 'active', route: '/products?feature=coproduction' },
  { icon: '\u{1F4C8}', title: 'Estrategias de Vendas', desc: 'Templates de estrategias comprovadas para maximizar vendas.', badge: 'Novo', category: 'gerencie', roles: ['produtor', 'afiliado'], status: 'active', route: '/vendas?tab=estrategias' },
  { icon: '\u{1F680}', title: 'Launchpad', desc: 'Gerencie lancamentos com grupos de WhatsApp automatizados.', badge: 'Launch', category: 'gerencie', roles: ['produtor'], status: 'active', route: '/ferramentas/launchpad' },
  { icon: '\u{1F4B8}', title: 'Cobrancas Avulsas', desc: 'Crie cobrancas diretas no fluxo interno do Kloel quando precisar vender fora do produto.', category: 'gerencie', roles: ['produtor'], status: 'active', route: '/payments' },
  { icon: '\u{1F3A5}', title: 'Video', desc: 'Geracao, perfis de voz e superfícies de video orientadas por IA.', category: 'gerencie', roles: ['produtor'], status: 'active', route: '/video' },
  { icon: '\u{1F578}\u{FE0F}', title: 'Scrapers', desc: 'Ferramentas de captura e enriquecimento para operacoes comerciais.', category: 'gerencie', roles: ['produtor'], status: 'active', route: '/scrapers' },
];

export function getCapabilitiesByCategory(category: CapabilityCategory) {
  return FRONTEND_CAPABILITIES.filter((capability) => capability.category === category);
}

export function getCategoryCounts(category: CapabilityCategory) {
  const items = getCapabilitiesByCategory(category);
  return {
    total: items.length,
    active: items.filter((item) => item.status === 'active').length,
    partial: items.filter((item) => item.status === 'partial').length,
    planned: items.filter((item) => item.status === 'planned').length,
  };
}

export function getCapabilityBadge(capability: FrontendCapability) {
  if (capability.status === 'planned') return 'Planejado';
  if (capability.badge) return capability.badge;
  if (capability.status === 'partial') return 'Parcial';
  return undefined;
}

export function findCapabilityByTitle(title?: string | null) {
  if (!title) return undefined;
  return FRONTEND_CAPABILITIES.find((capability) => capability.title === title);
}

export function getCapabilityHref(capability: FrontendCapability) {
  if (capability.route) return capability.route;
  if (capability.status === 'planned') {
    return `${PLANNED_CAPABILITY_ROUTE}?tool=${encodeURIComponent(capability.title)}`;
  }
  return undefined;
}

export function getRelatedActiveCapabilities(
  capability: FrontendCapability,
  limit = 3,
) {
  return FRONTEND_CAPABILITIES.filter((item) => {
    if (item.title === capability.title) return false;
    if (item.status !== 'active') return false;
    if (item.category !== capability.category) return false;
    return item.roles.some((role) => capability.roles.includes(role));
  }).slice(0, limit);
}

export const QUICK_NAV_CAPABILITIES = [
  { title: 'Ir para Inbox', href: '/inbox', keywords: ['inbox', 'atendimento', 'suporte'] },
  { title: 'Ir para Campanhas', href: '/campaigns', keywords: ['campanhas', 'campaigns', 'email'] },
  { title: 'Ir para Funnels', href: '/funnels', keywords: ['funil', 'funnels'] },
  { title: 'Ir para Follow-ups', href: '/followups', keywords: ['followups', 'retencao', 'carrinho'] },
  { title: 'Ir para Webinarios', href: '/webinarios', keywords: ['webinario', 'webinar'] },
  { title: 'Ir para Payments', href: '/payments', keywords: ['payments', 'pagamentos avulsos', 'cobrancas'] },
  { title: 'Ir para Video', href: '/video', keywords: ['video', 'voz', 'avatar'] },
  { title: 'Ir para Analytics', href: '/analytics', keywords: ['analytics', 'relatorios'] },
  { title: 'Ir para Autopilot', href: '/autopilot', keywords: ['autopilot', 'ia', 'agente'] },
];
