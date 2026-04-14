const VISUAL_FIXED_TIME_ISO = '2026-01-15T15:30:00.000Z';
const VISUAL_AUTH_USER_EMAIL = 'admin+e2e@example.com';
const VISUAL_AUTH_WORKSPACE_NAME = 'E2E Workspace';

export const VISUAL_WORKSPACE_NAME = VISUAL_AUTH_WORKSPACE_NAME;
export const VISUAL_USER_EMAIL = VISUAL_AUTH_USER_EMAIL;

export const VISUAL_KYC_PROFILE_FIXTURE = {
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

export const VISUAL_KYC_FISCAL_FIXTURE = {
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

export const VISUAL_KYC_DOCUMENTS_FIXTURE = [
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

export const VISUAL_KYC_BANK_FIXTURE = {
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

export const VISUAL_WALLET_BALANCE_FIXTURE = {
  available: 0,
  pending: 0,
  blocked: 0,
  total: 0,
  anticipatable: 0,
  currency: 'BRL',
  accountType: 'CHECKING',
  updatedAt: VISUAL_FIXED_TIME_ISO,
};

export const VISUAL_WALLET_TRANSACTIONS_FIXTURE = {
  transactions: [],
  total: 0,
};

export const VISUAL_WALLET_CHART_FIXTURE = {
  chart: [0, 0, 0, 0, 0, 0, 0],
};

export const VISUAL_WALLET_MONTHLY_FIXTURE = {
  income: 0,
  expense: 0,
  balance: 0,
  daily: Array.from({ length: 7 }, (_, index) => ({
    day: index + 1,
    income: 0,
    expense: 0,
  })),
};

export const VISUAL_WALLET_WITHDRAWALS_FIXTURE = {
  withdrawals: [],
};

export const VISUAL_WALLET_ANTICIPATIONS_FIXTURE = {
  anticipations: [],
  totals: {
    totalAnticipated: 0,
    totalFees: 0,
    count: 0,
  },
};

export const VISUAL_MERCADO_PAGO_STATUS_FIXTURE = {
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

export const VISUAL_DASHBOARD_HOME_FIXTURE = {
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

export const VISUAL_PRODUCT_EDIT_ID = '00000000-0000-0000-0000-000000000000';

export const VISUAL_PRODUCT_EDIT_FIXTURE = {
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

export const VISUAL_CHECKOUT_PRODUCT_ID = 'e2e-checkout-product';

export const VISUAL_CHECKOUT_PRODUCTS_FIXTURE = [
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

export const VISUAL_CRM_PIPELINE_FIXTURE = {
  id: 'crm-pipeline-e2e',
  name: 'Pipeline de Vendas',
  stages: [
    { id: 'crm-stage-lead', name: 'LEAD', order: 0, color: '#3B82F6' },
    { id: 'crm-stage-negociacao', name: 'EM NEGOCIAÇÃO', order: 1, color: '#FACC15' },
    { id: 'crm-stage-fechado', name: 'FECHADO', order: 2, color: '#22C55E' },
  ],
};

export const VISUAL_CRM_DEALS_FIXTURE: unknown[] = [];

export const VISUAL_CHECKOUT_PRODUCT_DETAIL_FIXTURE = {
  id: VISUAL_CHECKOUT_PRODUCT_ID,
  name: VISUAL_PRODUCT_EDIT_FIXTURE.name,
  slug: VISUAL_PRODUCT_EDIT_FIXTURE.slug,
  checkoutPlans: [],
  checkoutTemplates: [],
};

export const VISUAL_INBOX_CONVERSATIONS_FIXTURE = [
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

export const VISUAL_INBOX_AGENTS_FIXTURE = [
  {
    id: 'visual-agent-1',
    name: 'Paula Sales',
    email: 'paula@kloel.test',
    role: 'closer',
    isOnline: true,
  },
];

export const VISUAL_INBOX_MESSAGES_FIXTURE = [
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
