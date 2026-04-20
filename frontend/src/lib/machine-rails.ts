/** Machine shell key type. */
export type MachineShellKey =
  | 'dashboard'
  | 'produtos'
  | 'sites'
  | 'marketing'
  | 'anuncios'
  | 'vendas'
  | 'carteira'
  | 'parcerias';

/** Machine rail link shape. */
export interface MachineRailLink {
  /** Label property. */
  label: string;
  /** Href property. */
  href: string;
  /** Hint property. */
  hint: string;
}

/** Machine rail config shape. */
export interface MachineRailConfig {
  /** Label property. */
  label: string;
  /** Title property. */
  title: string;
  /** Summary property. */
  summary: string;
  /** Capabilities property. */
  capabilities: string[];
  /** Links property. */
  links: MachineRailLink[];
}

/** Machine_rails. */
export const MACHINE_RAILS: Record<MachineShellKey, MachineRailConfig> = {
  dashboard: {
    label: 'Mapa da Maquina',
    title: 'A operacao do Kloel comeca daqui',
    summary:
      'Use o Dashboard como ponto de partida da maquina inteira: conecte canais, publique a oferta, acompanhe vendas e retome leads sem sair do fluxo certo.',
    capabilities: ['Kloel IA', 'Leads', 'Inbox', 'Cobrancas Avulsas'],
    links: [
      {
        label: 'Criar produto',
        href: '/products/new',
        hint: 'Oferta, checkout e monetizacao',
      },
      {
        label: 'Conectar canais',
        href: '/marketing/whatsapp',
        hint: 'WhatsApp, Instagram, Facebook e Email',
      },
      {
        label: 'Publicar site',
        href: '/sites/criar',
        hint: 'Pagina, dominio, apps e publicacao',
      },
      {
        label: 'Ver vendas',
        href: '/vendas',
        hint: 'Pedidos, assinaturas, pipeline e carteira',
      },
    ],
  },
  produtos: {
    label: 'Motor Comercial',
    title: 'Seu produto precisa sair com maquina acoplada',
    summary:
      'Produto nao e so cadastro. Aqui voce acopla recomendacao, bump, cupom, checkout, coproducao e o caminho de publicacao da oferta.',
    capabilities: [
      'Recomenda',
      'Order Bump',
      'Aparencia do Pagamento',
      'Cupom de Recuperacao',
      'Urgencia e Escassez',
      'Coproducoes',
    ],
    links: [
      {
        label: 'Abrir checkouts',
        href: '/products?feature=checkout-appearance',
        hint: 'Visual, cupom, bump e urgencia',
      },
      {
        label: 'Publicar site',
        href: '/sites/criar',
        hint: 'Levar o produto para uma pagina real',
      },
      { label: 'Abrir marketing', href: '/marketing', hint: 'Distribuir a oferta pelos canais' },
      {
        label: 'Ver afiliados',
        href: '/parcerias/afiliados',
        hint: 'Programa, materiais e coproducao',
      },
    ],
  },
  sites: {
    label: 'Publicacao Comercial',
    title: 'Site publicado precisa fechar o ciclo da oferta',
    summary:
      'Criar pagina e so uma parte. O shell de Sites precisa empurrar voce para produto, checkout, dominio, apps e publicacao comercial do mesmo fluxo.',
    capabilities: ['Paginas Dinamicas', 'Paginas Alternativas', 'Criador de Paginas'],
    links: [
      { label: 'Criar landing', href: '/sites/criar', hint: 'Gerar a pagina comercial principal' },
      { label: 'Vincular produto', href: '/products', hint: 'Conectar oferta, preco e checkout' },
      {
        label: 'Gerenciar dominios',
        href: '/sites/dominios',
        hint: 'DNS, SSL e dominio principal',
      },
      { label: 'Instalar apps', href: '/sites/apps', hint: 'Apps, scripts e camadas extras' },
    ],
  },
  marketing: {
    label: 'Distribuicao',
    title: 'Marketing so vale quando vira distribuicao operacional',
    summary:
      'O shell de Marketing precisa ligar canal, campanha, broadcast, template, atendimento e leitura de resultado no mesmo corredor.',
    capabilities: [
      'WhatsApp Marketing',
      'Email Marketing',
      'Broadcast',
      'Templates de Mensagem',
      'Multicanal',
    ],
    links: [
      {
        label: 'Abrir WhatsApp',
        href: '/marketing/whatsapp',
        hint: 'Conectar, atender e disparar',
      },
      { label: 'Abrir Email', href: '/marketing/email', hint: 'Templates, testes e campanhas' },
      { label: 'Abrir Inbox', href: '/inbox', hint: 'Conversas, suporte e retomadas' },
      {
        label: 'Ver analytics',
        href: '/analytics',
        hint: 'Ler abandono, satisfacao e exportacoes',
      },
    ],
  },
  anuncios: {
    label: 'Aquisicao Paga',
    title: 'Ads precisa se conectar a pixel, analytics e retomada',
    summary:
      'Nao basta abrir dashboards de ads. O shell de Anuncios precisa costurar rastreamento, retargeting, analytics e acao comercial do time.',
    capabilities: ['Retargeting Inteligente', 'Pixel de Rastreamento', 'Analytics de Abandono'],
    links: [
      {
        label: 'Abrir rastreamento',
        href: '/anuncios/rastreamento',
        hint: 'Pixels, eventos e retargeting',
      },
      {
        label: 'Abrir marketing',
        href: '/marketing',
        hint: 'Levar audiencia para campanhas e canais',
      },
      {
        label: 'Abrir analytics',
        href: '/analytics?tab=abandonos',
        hint: 'Ler origem, abandono e resultado',
      },
      {
        label: 'Abrir billing',
        href: '/settings?section=billing',
        hint: 'Cobranca e estrutura financeira',
      },
    ],
  },
  vendas: {
    label: 'Receita e Operacao',
    title: 'Venda, repasse e cobranca precisam conversar',
    summary:
      'O shell de Vendas e o centro da operacao comercial. Daqui o usuario precisa seguir naturalmente para produto, carteira, parceiros e cobrancas.',
    capabilities: ['Estrategias de Vendas', 'Cobrancas Avulsas', 'Cobrancas Kloel'],
    links: [
      { label: 'Abrir produtos', href: '/products', hint: 'Oferta, checkout e catalogo' },
      {
        label: 'Abrir parceiros',
        href: '/parcerias/afiliados',
        hint: 'Afiliados, coproducao e materiais',
      },
      { label: 'Abrir carteira', href: '/carteira', hint: 'Saldo, saque e movimentacoes' },
      {
        label: 'Abrir billing',
        href: '/settings?section=billing',
        hint: 'Meio de cobranca e configuracao',
      },
    ],
  },
  carteira: {
    label: 'Dinheiro da Operacao',
    title: 'Carteira fecha o ciclo financeiro do workspace',
    summary:
      'Saldo, saque, repasse e cobranca nao podem ficar isolados. A carteira precisa ser o espelho financeiro das vendas, parcerias e billing.',
    capabilities: ['Cobrancas Kloel', 'Cobrancas Avulsas', 'Envio de Relatorios'],
    links: [
      { label: 'Abrir vendas', href: '/vendas', hint: 'Origem do faturamento e pedidos' },
      {
        label: 'Abrir parceiros',
        href: '/parcerias/afiliados',
        hint: 'Comissoes, repasses e coproducao',
      },
      {
        label: 'Abrir billing',
        href: '/settings?section=billing',
        hint: 'Dados bancarios e cobranca',
      },
      {
        label: 'Abrir analytics',
        href: '/analytics?tab=exportacoes',
        hint: 'Exportar e conferir o financeiro',
      },
    ],
  },
  parcerias: {
    label: 'Rede Comercial',
    title: 'Parceria precisa virar distribuicao e receita visivel',
    summary:
      'O shell de Parcerias nao pode ficar isolado como cadastro. Ele precisa empurrar o usuario para produto, vendas, carteira e configuracao da operacao.',
    capabilities: [
      'Programa de Afiliados',
      'Material de Divulgacao',
      'Coproducoes',
      'Central de Colaboradores',
    ],
    links: [
      { label: 'Abrir produtos', href: '/products', hint: 'Produtos e checkouts para divulgar' },
      { label: 'Abrir vendas', href: '/vendas', hint: 'Resultado dos parceiros e vendas geradas' },
      { label: 'Abrir carteira', href: '/carteira', hint: 'Comissao, repasse e saque' },
      {
        label: 'Abrir billing',
        href: '/settings?section=billing',
        hint: 'Estrutura de pagamento do workspace',
      },
    ],
  },
};

/** Get machine rail. */
export function getMachineRail(shell: MachineShellKey) {
  return MACHINE_RAILS[shell];
}
