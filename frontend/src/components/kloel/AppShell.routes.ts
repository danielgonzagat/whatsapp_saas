import { useSearchParams } from 'next/navigation';
import { KLOEL_CHAT_ROUTE } from '@/lib/kloel-dashboard-context';
import { NAV } from './sidebar/sidebar-config';

const U0300__U036F_RE = /[\u0300-\u036f]/g;
const S_RE = /\s+/g;

export const VIEW_ROUTES: Record<string, string> = {
  home: '/dashboard',
  produtos: '/products',
  marketing: '/marketing',
  sites: '/sites',
  canvas: '/canvas',
  vendas: '/vendas',
  carteira: '/carteira',
  relatorio: '/analytics',
  parcerias: '/parcerias',
  ferramentas: '/ferramentas',
  anuncios: '/anuncios',
};

export const SUB_ROUTES: Record<string, string> = {
  'produtos-meus-produtos': '/products',
  'produtos-checkout': '/checkout',
  'produtos-area-de-membros': '/produtos/area-membros',
  'produtos-afiliar-se': '/produtos/afiliar-se',
  'marketing-conversas': '/marketing',
  'marketing-visao-geral': '/marketing',
  'marketing-whatsapp': '/marketing/whatsapp',
  'marketing-instagram': '/marketing/instagram',
  'marketing-tiktok': '/marketing/tiktok',
  'marketing-facebook': '/marketing/facebook',
  'marketing-email': '/marketing/email',
  'sites-dominios': '/sites/dominios',
  'sites-hospedagem': '/sites/hospedagem',
  'sites-criar-site': '/sites/criar',
  'sites-editar-site': '/sites/editar',
  'sites-apps': '/sites/apps',
  'sites-protecao': '/sites/protecao',
  'anuncios-war-room': '/anuncios',
  'anuncios-meta-ads': '/anuncios/meta',
  'anuncios-google-ads': '/anuncios/google',
  'anuncios-tiktok-ads': '/anuncios/tiktok',
  'anuncios-rastreamento': '/anuncios/rastreamento',
  'anuncios-regras-ia': '/anuncios/regras',
  'vendas-gestao-de-vendas': '/vendas',
  'vendas-gestao-de-assinaturas': '/vendas/assinaturas',
  'vendas-gestao-produtos-fisicos': '/vendas/fisicos',
  'vendas-pipeline-crm': '/vendas/pipeline',
  crm: '/vendas/pipeline',
  'carteira-saldo': '/carteira/saldo',
  'carteira-extrato': '/carteira/extrato',
  'carteira-saques': '/carteira/saques',
  'carteira-antecipacoes': '/carteira/antecipacoes',
  'parcerias-central-de-colaboradores': '/parcerias/colaboradores',
  'parcerias-afiliados-e-produtores': '/parcerias/afiliados',
  'parcerias-chat': '/parcerias/chat',
  'relatorio-vendas': '/analytics?tab=vendas',
  'relatorio-operacoes': '/analytics?tab=vendas',
  'relatorio-after-pay': '/analytics?tab=afterpay',
  'relatorio-churn-rate': '/analytics?tab=churn',
  'relatorio-abandonos': '/analytics?tab=abandonos',
  'relatorio-desemp.-afiliados': '/analytics?tab=afiliados',
  'relatorio-indicadores': '/analytics?tab=indicadores',
  'relatorio-assinaturas': '/analytics?tab=assinaturas',
  'relatorio-indicadores-produto': '/analytics?tab=ind_prod',
  'relatorio-motivos-recusa': '/analytics?tab=recusa',
  'relatorio-origem-vendas': '/analytics?tab=origem',
  'relatorio-metricas-produtos': '/analytics?tab=metricas',
  'relatorio-estornos': '/analytics?tab=estornos',
  'relatorio-hist.-chargeback': '/analytics?tab=chargeback',
  'ferramentas-impulsione-suas-vendas': '/ferramentas/impulsione',
  'ferramentas-recupere-vendas': '/ferramentas/recupere',
  'ferramentas-fale-com-seus-leads': '/ferramentas/fale',
  'ferramentas-gerencie-seu-negocio': '/ferramentas/gerencie',
  'ferramentas-ver-todas': '/ferramentas/ver-todas',
};

export const MOBILE_VIEW_LABELS: Record<string, string> = {
  home: 'Home',
  produtos: 'Produtos',
  marketing: 'Marketing',
  sites: 'Sites',
  canvas: 'Canvas',
  vendas: 'Vendas',
  carteira: 'Carteira',
  relatorio: 'Relatórios',
  parcerias: 'Parcerias',
  ferramentas: 'Ferramentas',
  anuncios: 'Anúncios',
};

export function resolveRoute(view: string, subView?: string): string {
  if (subView) {
    const slug = subView
      .toLowerCase()
      .normalize('NFD')
      .replace(U0300__U036F_RE, '')
      .replace(S_RE, '-');
    const subKey = `${view}-${slug}`;
    if (SUB_ROUTES[subKey]) {
      return SUB_ROUTES[subKey];
    }
    if (SUB_ROUTES[subView]) {
      return SUB_ROUTES[subView];
    }
  }
  return VIEW_ROUTES[view] || '/';
}

export function resolveActiveView(pathname: string): string {
  if (pathname === KLOEL_CHAT_ROUTE) {
    return '';
  }
  if (pathname === '/dashboard') {
    return 'home';
  }
  if (pathname.startsWith('/products') || pathname.startsWith('/produtos')) {
    return 'produtos';
  }
  if (pathname.startsWith('/sites')) {
    return 'sites';
  }
  if (
    pathname.startsWith('/marketing') ||
    pathname.startsWith('/campaigns') ||
    pathname.startsWith('/flow') ||
    pathname.startsWith('/funnels') ||
    pathname.startsWith('/whatsapp') ||
    pathname.startsWith('/webinarios')
  ) {
    return 'marketing';
  }
  if (pathname.startsWith('/canvas')) {
    return 'canvas';
  }
  if (
    pathname.startsWith('/leads') ||
    pathname.startsWith('/vendas') ||
    pathname.startsWith('/sales')
  ) {
    return 'vendas';
  }
  if (
    pathname.startsWith('/carteira') ||
    pathname.startsWith('/billing') ||
    pathname.startsWith('/payments')
  ) {
    return 'carteira';
  }
  if (
    pathname.startsWith('/analytics') ||
    pathname.startsWith('/metrics') ||
    pathname.startsWith('/relatorio')
  ) {
    return 'relatorio';
  }
  if (pathname.startsWith('/parcerias')) {
    return 'parcerias';
  }
  if (pathname.startsWith('/anuncios')) {
    return 'anuncios';
  }
  if (
    pathname.startsWith('/ferramentas') ||
    pathname.startsWith('/autopilot') ||
    pathname.startsWith('/tools') ||
    pathname.startsWith('/inbox') ||
    pathname.startsWith('/followups') ||
    pathname.startsWith('/video') ||
    pathname.startsWith('/cia') ||
    pathname.startsWith('/scrapers')
  ) {
    return 'ferramentas';
  }
  return '';
}

export function routeMatchesCurrent(
  route: string,
  pathname: string,
  searchParams: ReturnType<typeof useSearchParams>,
): boolean {
  const [routePath, routeQuery] = route.split('?');
  if (routePath !== pathname) {
    return false;
  }
  if (!routeQuery) {
    return true;
  }

  const expectedParams = new URLSearchParams(routeQuery);
  for (const [key, value] of expectedParams.entries()) {
    if (searchParams.get(key) !== value) {
      return false;
    }
  }
  return true;
}

export function resolveActiveSubView(
  pathname: string,
  searchParams: ReturnType<typeof useSearchParams>,
): string | null {
  for (const item of NAV) {
    for (const sub of item.sub) {
      const route = resolveRoute(item.key, sub);
      if (routeMatchesCurrent(route, pathname, searchParams)) {
        return `${item.key}:${sub}`;
      }
    }
  }

  return null;
}
