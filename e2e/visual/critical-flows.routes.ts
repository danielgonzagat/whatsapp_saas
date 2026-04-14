export interface CriticalRoute {
  name: string;
  path: string;
  authenticated: boolean;
  readySelector?: string;
  mask?: string[];
}

export const PUBLIC_ROUTES: CriticalRoute[] = [
  { name: 'landing', path: '/', authenticated: false },
  { name: 'login', path: '/login', authenticated: false },
  { name: 'signup', path: '/register', authenticated: false },
];

export const AUTHENTICATED_ROUTES: CriticalRoute[] = [
  {
    name: 'dashboard',
    path: '/dashboard',
    authenticated: true,
    readySelector: '[data-testid="home-dashboard-root"]',
  },
  {
    name: 'products-list',
    path: '/products',
    authenticated: true,
    readySelector: '[data-testid="products-view-root"]',
  },
  {
    name: 'products-new',
    path: '/products/new',
    authenticated: true,
    readySelector: '[data-testid="product-create-root"]',
  },
  {
    name: 'products-edit',
    path: '/products/00000000-0000-0000-0000-000000000000',
    authenticated: true,
    readySelector: '[data-testid="product-nerve-center-root"]',
  },
  { name: 'checkout', path: '/checkout/plan-e2e-fixture', authenticated: true },
  {
    name: 'inbox',
    path: '/inbox',
    authenticated: true,
    readySelector: '[data-testid="inbox-workspace-root"]',
  },
  {
    name: 'crm',
    path: '/vendas/pipeline',
    authenticated: true,
    readySelector: '[data-testid="sales-view-root"]',
  },
  {
    name: 'wallet',
    path: '/carteira/saldo',
    authenticated: true,
    readySelector: '[data-testid="wallet-view-root"]',
  },
  {
    name: 'settings',
    path: '/settings',
    authenticated: true,
    readySelector: '[data-testid="account-settings-root"]',
  },
  {
    name: 'billing',
    path: '/settings?section=billing',
    authenticated: true,
    readySelector: '[data-testid="account-settings-root"]',
  },
  {
    name: 'kyc',
    path: '/settings?section=documentos',
    authenticated: true,
    readySelector: '[data-testid="account-settings-root"]',
  },
];

export const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];
