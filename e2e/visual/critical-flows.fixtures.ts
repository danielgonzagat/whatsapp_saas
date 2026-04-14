import type { Page } from '@playwright/test';
import type { E2EAuthContext } from '../specs/e2e-helpers';

export interface CriticalRoute {
  name: string;
  path: string;
  authenticated: boolean;
  readySelector?: string;
  mask?: string[];
}

const VISUAL_FIXED_TIME_ISO = '2026-01-15T15:30:00.000Z';
const VISUAL_AUTH_USER_EMAIL = 'admin+e2e@example.com';
const VISUAL_AUTH_WORKSPACE_NAME = 'E2E Workspace';

const VISUAL_KYC_PROFILE_FIXTURE = {
  id: 'e2e-user',
  name: 'E2E Admin',
  email: VISUAL_AUTH_USER_EMAIL,
  phone: '11999990000',
  avatarUrl: null,
  birthDate: '1990-01-15T00:00:00.000Z',
  documentType: null,
  documentNumber: null,
  kycStatus: 'approved',
  kycSubmittedAt: '2026-01-10T12:00:00.000Z',
  kycApprovedAt: '2026-01-11T09:30:00.000Z',
  kycRejectedReason: null,
  publicName: 'E2E Admin',
  bio: null,
  website: null,
  instagram: null,
};

const VISUAL_KYC_FISCAL_FIXTURE = {
  workspaceId: 'visual-workspace',
  type: 'PF',
  cpf: '12345678901',
  fullName: 'E2E Admin',
  cnpj: null,
  razaoSocial: null,
  cep: '01001000',
  city: 'Sao Paulo',
  state: 'SP',
  street: 'Praca da Se',
  number: '100',
  district: 'Se',
  complement: null,
};

const VISUAL_KYC_DOCUMENTS_FIXTURE = [
  {
    id: 'doc-front',
    agentId: 'e2e-user',
    workspaceId: 'visual-workspace',
    type: 'DOCUMENT_FRONT',
    status: 'approved',
    fileUrl: 'https://example.com/doc-front.png',
    createdAt: '2026-01-12T10:00:00.000Z',
  },
  {
    id: 'doc-proof-address',
    agentId: 'e2e-user',
    workspaceId: 'visual-workspace',
    type: 'PROOF_OF_ADDRESS',
    status: 'approved',
    fileUrl: 'https://example.com/proof-of-address.pdf',
    createdAt: '2026-01-12T10:05:00.000Z',
  },
];

const VISUAL_KYC_BANK_FIXTURE = {
  id: 'bank-e2e',
  workspaceId: 'visual-workspace',
  bankCode: '001',
  bankName: 'Banco do Brasil',
  agency: '1234',
  account: '12345678',
  accountDigit: '9',
  accountType: 'CHECKING',
  pixType: 'EMAIL',
  pixKey: 'financeiro@example.com',
  isDefault: true,
};

const VISUAL_WALLET_BALANCE_FIXTURE = {
  available: 0,
  pending: 0,
  blocked: 0,
  total: 0,
  anticipatable: 0,
  currency: 'BRL',
  accountType: 'CHECKING',
  updatedAt: VISUAL_FIXED_TIME_ISO,
};

const VISUAL_WALLET_TRANSACTIONS_FIXTURE = {
  transactions: [],
  total: 0,
};

const VISUAL_WALLET_CHART_FIXTURE = {
  chart: [0, 0, 0, 0, 0, 0, 0],
};

const VISUAL_WALLET_MONTHLY_FIXTURE = {
  income: 0,
  expense: 0,
  balance: 0,
  daily: Array.from({ length: 7 }, (_, index) => ({
    day: index + 1,
    income: 0,
    expense: 0,
  })),
};

const VISUAL_WALLET_WITHDRAWALS_FIXTURE = {
  withdrawals: [],
};

const VISUAL_WALLET_ANTICIPATIONS_FIXTURE = {
  anticipations: [],
  totals: {
    totalAnticipated: 0,
    totalFees: 0,
    count: 0,
  },
};

const VISUAL_MERCADO_PAGO_STATUS_FIXTURE = {
  connected: false,
  provider: 'mercado_pago',
  checkoutEnabled: false,
  platformManaged: true,
  reason: 'not_connected',
  marketplaceFeePercent: 0,
  seller: null,
  publicKey: null,
  liveMode: false,
  connectedAt: null,
  expiresAt: null,
  integrationId: null,
};

const VISUAL_DASHBOARD_HOME_FIXTURE = {
  generatedAt: VISUAL_FIXED_TIME_ISO,
  range: {
    period: '7d',
    label: 'Últimos 7 dias',
    startDate: '2026-01-09',
    endDate: '2026-01-15',
  },
  hero: {
    totalRevenueInCents: 0,
    previousRevenueInCents: 0,
    revenueDeltaPct: null,
    monthRevenueInCents: 0,
    previousMonthRevenueInCents: 0,
    todayRevenueInCents: 0,
    yesterdayRevenueInCents: 0,
    availableBalanceInCents: 0,
    pendingBalanceInCents: 0,
  },
  metrics: {
    paidOrders: 0,
    totalOrders: 0,
    conversionRatePct: 0,
    averageTicketInCents: 0,
    totalConversations: 0,
    convertedOrders: 0,
    waitingForHuman: 0,
    averageResponseTimeSeconds: 0,
  },
  series: {
    labels: ['09 jan', '10 jan', '11 jan', '12 jan', '13 jan', '14 jan', '15 jan'],
    revenueInCents: [0, 0, 0, 0, 0, 0, 0],
    previousRevenueInCents: [0, 0, 0, 0, 0, 0, 0],
    paidOrders: [0, 0, 0, 0, 0, 0, 0],
    totalOrders: [0, 0, 0, 0, 0, 0, 0],
    conversionRatePct: [0, 0, 0, 0, 0, 0, 0],
    averageTicketInCents: [0, 0, 0, 0, 0, 0, 0],
  },
  products: [],
  recentConversations: [],
  health: {
    operationalScorePct: 0,
    checkoutCompletionRatePct: 0,
    activeCheckpoints: 0,
    totalCheckpoints: 3,
    checkpoints: [
      {
        id: 'catalog',
        label: 'Catálogo publicado',
        description: 'Finalize o catálogo para publicar, sacar e liberar todas as operações.',
        active: false,
      },
      {
        id: 'checkout',
        label: 'Checkout validado',
        description: 'Valide o checkout principal para garantir compra, aprovação e carteira.',
        active: false,
      },
      {
        id: 'whatsapp',
        label: 'Canal conectado',
        description: 'Conecte o WhatsApp para liberar operação comercial assistida.',
        active: false,
      },
    ],
  },
};

const VISUAL_PRODUCT_EDIT_ID = '00000000-0000-0000-0000-000000000000';

const VISUAL_PRODUCT_EDIT_FIXTURE = {
  id: VISUAL_PRODUCT_EDIT_ID,
  name: 'Produto',
  slug: 'produto-e2e-visual',
  description: '',
  category: null,
  tags: [],
  price: 0,
  active: true,
  format: 'DIGITAL',
  warrantyDays: 7,
  salesPageUrl: '',
  thankyouUrl: '',
  thankyouPixUrl: '',
  thankyouBoletoUrl: '',
  reclameAquiUrl: '',
  supportEmail: '',
  imageUrl: null,
};

const VISUAL_CHECKOUT_PRODUCT_ID = 'e2e-checkout-product';

const VISUAL_CHECKOUT_PRODUCTS_FIXTURE = [
  {
    id: VISUAL_CHECKOUT_PRODUCT_ID,
    name: VISUAL_PRODUCT_EDIT_FIXTURE.name,
    slug: VISUAL_PRODUCT_EDIT_FIXTURE.slug,
    description: VISUAL_PRODUCT_EDIT_FIXTURE.description,
    category: VISUAL_PRODUCT_EDIT_FIXTURE.category,
    imageUrl: null,
    images: [],
    price: 0,
    plans: [],
  },
];

const VISUAL_CRM_PIPELINE_FIXTURE = {
  id: 'crm-pipeline-e2e',
  name: 'Pipeline de Vendas',
  stages: [
    {
      id: 'crm-stage-lead',
      name: 'LEAD',
      order: 0,
      color: '#3B82F6',
    },
    {
      id: 'crm-stage-negociacao',
      name: 'EM NEGOCIAÇÃO',
      order: 1,
      color: '#FACC15',
    },
    {
      id: 'crm-stage-fechado',
      name: 'FECHADO',
      order: 2,
      color: '#22C55E',
    },
  ],
};

const VISUAL_CRM_DEALS_FIXTURE: unknown[] = [];

const VISUAL_CHECKOUT_PRODUCT_DETAIL_FIXTURE = {
  id: VISUAL_CHECKOUT_PRODUCT_ID,
  name: VISUAL_PRODUCT_EDIT_FIXTURE.name,
  slug: VISUAL_PRODUCT_EDIT_FIXTURE.slug,
  checkoutPlans: [],
  checkoutTemplates: [],
};

const VISUAL_INBOX_CONVERSATIONS_FIXTURE = [
  {
    id: 'visual-conversation-1',
    contactId: 'visual-contact-1',
    status: 'open',
    channel: 'whatsapp',
    unreadCount: 2,
    lastMessageAt: '2026-01-15T15:28:00.000Z',
    contact: {
      id: 'visual-contact-1',
      name: 'Marina Costa',
      phone: '+55 11 99888-7766',
    },
    assignedAgent: null,
  },
  {
    id: 'visual-conversation-2',
    contactId: 'visual-contact-2',
    status: 'open',
    channel: 'instagram',
    unreadCount: 0,
    lastMessageAt: '2026-01-15T14:42:00.000Z',
    contact: {
      id: 'visual-contact-2',
      name: 'Carlos Lima',
      phone: '+55 21 97777-6655',
    },
    assignedAgent: {
      id: 'visual-agent-1',
      name: 'Paula Sales',
    },
  },
];

const VISUAL_INBOX_AGENTS_FIXTURE = [
  {
    id: 'visual-agent-1',
    name: 'Paula Sales',
    email: 'paula@kloel.test',
    role: 'closer',
    isOnline: true,
  },
];

const VISUAL_INBOX_MESSAGES_FIXTURE = [
  {
    id: 'visual-message-1',
    content: 'Oi, quero entender como funciona o checkout.',
    direction: 'INBOUND',
    createdAt: '2026-01-15T15:24:00.000Z',
  },
  {
    id: 'visual-message-2',
    content: 'Posso te mostrar o fluxo e te passar o link certo agora.',
    direction: 'OUTBOUND',
    createdAt: '2026-01-15T15:25:00.000Z',
  },
  {
    id: 'visual-message-3',
    content: 'Perfeito, manda o link.',
    direction: 'INBOUND',
    createdAt: '2026-01-15T15:28:00.000Z',
  },
];

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

export async function mockVisualAuthApis(page: Page, auth: Pick<E2EAuthContext, 'workspaceId'>) {
  await page.route('**/api/workspace/me', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'e2e-user',
          email: VISUAL_AUTH_USER_EMAIL,
          name: 'E2E Admin',
          workspaceId: auth.workspaceId,
          role: 'OWNER',
        },
        workspaces: [
          {
            id: auth.workspaceId,
            name: VISUAL_AUTH_WORKSPACE_NAME,
          },
        ],
        workspace: {
          id: auth.workspaceId,
          name: VISUAL_AUTH_WORKSPACE_NAME,
        },
      }),
    });
  });

  await page.route('**/api/kyc/profile', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(VISUAL_KYC_PROFILE_FIXTURE),
    });
  });

  await page.route('**/api/kyc/fiscal', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...VISUAL_KYC_FISCAL_FIXTURE,
        workspaceId: auth.workspaceId,
      }),
    });
  });

  await page.route('**/api/kyc/documents', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        VISUAL_KYC_DOCUMENTS_FIXTURE.map((document) => ({
          ...document,
          workspaceId: auth.workspaceId,
        })),
      ),
    });
  });

  await page.route('**/api/kyc/bank', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...VISUAL_KYC_BANK_FIXTURE,
        workspaceId: auth.workspaceId,
      }),
    });
  });

  await page.route('**/api/kyc/status', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kycStatus: 'approved',
      }),
    });
  });

  await page.route('**/api/kyc/completion', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        percentage: 100,
      }),
    });
  });
}

export async function mockVisualRouteApis(page: Page, route: CriticalRoute) {
  if (route.name === 'dashboard') {
    await page.route('**/dashboard/home**', async (requestRoute) => {
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_DASHBOARD_HOME_FIXTURE),
      });
    });

    return;
  }

  if (route.name === 'inbox') {
    await page.route('**/inbox/*/conversations', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_INBOX_CONVERSATIONS_FIXTURE),
      });
    });

    await page.route('**/inbox/*/agents', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_INBOX_AGENTS_FIXTURE),
      });
    });

    await page.route('**/inbox/conversations/*/messages', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_INBOX_MESSAGES_FIXTURE),
      });
    });

    return;
  }

  if (route.name === 'crm') {
    await page.route('**/crm/pipelines**', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      const request = requestRoute.request();
      const pathname = new URL(request.url()).pathname;
      if (request.method() !== 'GET' || !pathname.endsWith('/crm/pipelines')) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pipelines: [VISUAL_CRM_PIPELINE_FIXTURE],
        }),
      });
    });

    await page.route('**/crm/deals**', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      const request = requestRoute.request();
      const pathname = new URL(request.url()).pathname;
      if (request.method() !== 'GET' || !pathname.endsWith('/crm/deals')) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          deals: VISUAL_CRM_DEALS_FIXTURE,
          count: 0,
        }),
      });
    });

    return;
  }

  if (route.name === 'wallet') {
    await page.route('**/kloel/wallet/*/balance', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_WALLET_BALANCE_FIXTURE),
      });
    });

    await page.route('**/kloel/wallet/*/transactions', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_WALLET_TRANSACTIONS_FIXTURE),
      });
    });

    await page.route('**/kloel/wallet/*/chart', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_WALLET_CHART_FIXTURE),
      });
    });

    await page.route('**/kloel/wallet/*/monthly', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_WALLET_MONTHLY_FIXTURE),
      });
    });

    await page.route('**/kloel/wallet/*/withdrawals', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_WALLET_WITHDRAWALS_FIXTURE),
      });
    });

    await page.route('**/kloel/wallet/*/anticipations', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_WALLET_ANTICIPATIONS_FIXTURE),
      });
    });

    await page.route('**/kloel/wallet/*/mercado-pago/status', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_MERCADO_PAGO_STATUS_FIXTURE),
      });
    });

    return;
  }

  if (route.name !== 'products-edit') {
    return;
  }

  await page.route(`**/products/${VISUAL_PRODUCT_EDIT_ID}/urls`, async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest()) {
      await requestRoute.fallback();
      return;
    }

    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route(`**/products/${VISUAL_PRODUCT_EDIT_ID}/coupons`, async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest()) {
      await requestRoute.fallback();
      return;
    }

    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route(`**/products/${VISUAL_PRODUCT_EDIT_ID}`, async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest()) {
      await requestRoute.fallback();
      return;
    }

    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(VISUAL_PRODUCT_EDIT_FIXTURE),
    });
  });

  await page.route('**/products', async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest() || requestRoute.request().method() !== 'GET') {
      await requestRoute.fallback();
      return;
    }

    const pathname = new URL(requestRoute.request().url()).pathname;
    if (!pathname.endsWith('/products')) {
      await requestRoute.fallback();
      return;
    }

    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        products: [VISUAL_PRODUCT_EDIT_FIXTURE],
        count: 1,
      }),
    });
  });

  await page.route('**/checkout/products', async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest()) {
      await requestRoute.fallback();
      return;
    }

    const method = requestRoute.request().method();
    const pathname = new URL(requestRoute.request().url()).pathname;
    if (!pathname.endsWith('/checkout/products')) {
      await requestRoute.fallback();
      return;
    }

    if (method === 'GET') {
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: VISUAL_CHECKOUT_PRODUCTS_FIXTURE,
        }),
      });
      return;
    }

    if (method === 'POST') {
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_CHECKOUT_PRODUCTS_FIXTURE[0]),
      });
      return;
    }

    await requestRoute.fallback();
  });

  await page.route(`**/checkout/products/${VISUAL_CHECKOUT_PRODUCT_ID}`, async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest()) {
      await requestRoute.fallback();
      return;
    }

    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(VISUAL_CHECKOUT_PRODUCT_DETAIL_FIXTURE),
    });
  });
}
