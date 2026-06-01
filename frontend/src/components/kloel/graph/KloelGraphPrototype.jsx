'use client';
/* eslint-disable */
// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// KLOEL · GRAPH UNIFICADO — canonical prototype, rendered verbatim as the app's
// primary surface. This is the owner-authored source of truth for the KloelGraph
// visual + interaction. Phase 2 wires its internal state to the real Kloel APIs;
// the visual stays byte-identical to this file.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useReducer, useCallback, useMemo, useContext, createContext } from "react";

const THEMES = {
  light: {
    void: "#FAFAF7", paper: "#FFFFFF", raised: "#FCFBF8",
    border: "#E4E2DC", divider: "#EFEDE7", hi: "#C9C6BD",
    silver: "#18181C", text: "#2E2E33", muted: "#6B6B70",
    dim: "#9C9C9F", faint: "#D8D5CE",
    ember: "#E85D30", emberHi: "#D14E26",
    emberSoft: "rgba(232,93,48,0.06)",
    emberBorder: "rgba(232,93,48,0.18)",
    emberGlow: "rgba(232,93,48,0.15)",
    amber: "#B8884C", green: "#2D9D5E",
    blue: "#3F6FB6", purple: "#8B5FB8", rose: "#C95377", red: "#D64545",
    glass: "rgba(255,255,255,0.85)",
  },
  dark: {
    void: "#0A0A0C", paper: "#0D0D10", raised: "#131316",
    border: "#252529", divider: "#1B1B1F", hi: "#5A5A62",
    silver: "#E8E6E1", text: "#C9C7C2", muted: "#9A9AA0",
    dim: "#6A6A72", faint: "#2C2C32",
    ember: "#E85D30", emberHi: "#FF6B3D",
    emberSoft: "rgba(232,93,48,0.08)",
    emberBorder: "rgba(232,93,48,0.22)",
    emberGlow: "rgba(232,93,48,0.18)",
    amber: "#D4A656", green: "#3EBC76",
    blue: "#5B8DCE", purple: "#A77BCF", rose: "#D87093", red: "#E5654E",
    glass: "rgba(13,13,16,0.78)",
  },
};
const FONT = "'Sora', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const ThemeContext = createContext({ C: THEMES.light, mode: "light", toggle: () => {} });
const useTheme = () => useContext(ThemeContext);

function ThemeProvider({ children }) {
  const [mode, setMode] = useState("light");
  const value = useMemo(() => ({
    C: THEMES[mode], mode,
    toggle: () => setMode(m => m === "light" ? "dark" : "light"),
  }), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

const USER_NAME = "Daniel";
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const CHANNEL_META = {
  whatsapp:  { name: "WhatsApp",  provider: "Meta Business",       step1Verb: "Vincular número",   step1Sub: "Login Meta · OAuth oficial" },
  instagram: { name: "Instagram", provider: "Meta Business",       step1Verb: "Vincular conta",    step1Sub: "Conta Business · Graph API" },
  tiktok:    { name: "TikTok",    provider: "TikTok for Business", step1Verb: "Vincular conta",    step1Sub: "Creator ou Advertiser" },
  facebook:  { name: "Facebook",  provider: "Meta Business",       step1Verb: "Vincular Página",   step1Sub: "Página comercial · Messenger" },
  email:     { name: "Email",     provider: "Domínio próprio",     step1Verb: "Verificar domínio", step1Sub: "DKIM · SPF · DMARC" },
};
const CHANNEL_KEYS = ["whatsapp", "instagram", "tiktok", "facebook", "email"];
const AREA_KEYS = ["criar", "afiliar", "educar"];

const PRODUCT_CATEGORIES = [
  "Dermocosméticos", "Cosméticos", "Suplementos", "Saúde e Bem-estar", "Beleza e Cuidados",
  "Cabelos", "Emagrecimento", "Fitness e Esportes", "Cursos Online", "E-books",
  "Mentorias e Consultorias", "Software e SaaS", "Serviços", "Eventos e Ingressos",
  "Moda e Acessórios", "Casa e Decoração", "Eletrônicos", "Pet", "Alimentos e Bebidas",
  "Infantil", "Espiritualidade", "Finanças e Negócios", "Outros",
].map(c => ({ value: c, label: c }));

const PRODUCT_NERVE_TABS = [
  { suffix: "dados",      type: "p_dados",      label: "Dados gerais" },
  { suffix: "planos",     type: "p_planos",     label: "Planos" },
  { suffix: "urls",       type: "p_urls",       label: "URLs" },
  { suffix: "comissao",   type: "p_comissao",   label: "Comissão / Afiliação" },
  { suffix: "cupons",     type: "p_cupons",     label: "Cupons" },
  { suffix: "campanhas",  type: "p_campanhas",  label: "Campanhas" },
  { suffix: "avaliacoes", type: "p_avaliacoes", label: "Avaliações" },
  { suffix: "afterpay",   type: "p_afterpay",   label: "After Pay" },
  { suffix: "ia",         type: "p_ia",         label: "IA" },
];
const PRODUCT_SUBNODE_TYPES = PRODUCT_NERVE_TABS.map(t => t.type);

const PLAN_DETAIL_SUBTABS = ["Loja", "Pagamento", "Frete", "Afiliação", "Order Bump"];

function defaultCheckoutConfig(over = {}) {
  return {
    theme: "BLANC", accentColor: "#E85D30", accentColor2: "#0A0A0C",
    backgroundColor: "", cardColor: "", textColor: "", mutedTextColor: "",
    fontBody: "Sora", fontDisplay: "Sora",
    brandName: "Kloel", brandLogo: "", headerMessage: "", headerSubMessage: "",
    productImage: "", productDisplayName: "",
    btnStep1Text: "Continuar", btnStep2Text: "Ir para pagamento", btnFinalizeText: "Finalizar compra", btnFinalizeIcon: "lock",
    requireCPF: true, requirePhone: true, phoneLabel: "WhatsApp",
    enableCreditCard: true, enablePix: true, enableBoleto: false, enableCoupon: true,
    showCouponPopup: false, couponPopupDelay: 8, couponPopupTitle: "Espere!", couponPopupDesc: "Ganhe um desconto agora", couponPopupBtnText: "Aplicar", couponPopupDismiss: "Não, obrigado", autoCouponCode: "",
    enableTimer: false, timerType: "COUNTDOWN", timerMinutes: 15, timerMessage: "Oferta acaba em", timerExpiredMessage: "Oferta encerrada", timerPosition: "top",
    showStockCounter: false, stockMessage: "Restam {n} unidades", fakeStockCount: 7,
    shippingMode: "NONE", shippingOriginZip: "", shippingVariableMinInCents: 0, shippingVariableMaxInCents: 0, shippingUseKloelCalculator: false,
    affiliateCustomCommissionEnabled: false, affiliateCustomCommissionType: "PERCENT", affiliateCustomCommissionAmountInCents: 0, affiliateCustomCommissionPercent: 0,
    enableTestimonials: false, testimonials: [],
    enableGuarantee: true, guaranteeTitle: "Garantia incondicional", guaranteeText: "7 dias para testar sem risco", guaranteeDays: 7,
    enableTrustBadges: true, trustBadges: ["Compra segura", "Site protegido"],
    footerText: "© Kloel", showPaymentIcons: true,
    metaTitle: "", metaDescription: "", metaImage: "", favicon: "", customCSS: "",
    enableExitIntent: false, exitIntentTitle: "", exitIntentDescription: "", exitIntentCouponCode: "",
    enableFloatingBar: false, floatingBarMessage: "",
    chatEnabled: false, chatWelcomeMessage: "Oi! Posso ajudar?", chatDelay: 3, chatPosition: "bottom-right", chatColor: "#E85D30", chatOfferDiscount: false, chatDiscountCode: "", chatSupportPhone: "",
    socialProofEnabled: false, socialProofAlerts: [], socialProofCustomNames: "",
    enableSteps: true, coverImage: "", secondaryImage: "", sideImage: "",
    pixels: [],
    ...over,
  };
}

function defaultPlan(over = {}) {
  return {
    id: `pl-${Math.random().toString(36).slice(2, 8)}`, name: "", referenceCode: "",
    priceInCents: 0, compareAtPrice: null, currency: "BRL",
    billingType: "ONE_TIME",
    itemsPerPlan: 1, quantity: 1,
    maxInstallments: 12, maxNoInterest: 1, installmentsFee: false, discountByPayment: false,
    recurringInterval: null,
    trialEnabled: false, trialDays: null, trialPrice: null,
    visibleToAffiliates: true, active: true, salesCount: 0,
    freeShipping: false, shippingPrice: null,
    packagingConfig: null, shippingConfig: null, deliveryFiles: null,
    orderBumps: [], upsells: [], planLinks: [],
    ...over,
  };
}

function defaultProductEditor(seed = {}) {
  return {
    dados: {
      name: seed.name || "",
      category: seed.category || "Dermocosméticos",
      description: seed.description || "",
      status: seed.status || "draft",
      slug: seed.slug || "",
      sku: "",
      format: seed.format || "PHYSICAL",
      price: seed.price || 0,
      currency: "BRL",
      coverUrl: "",
      imageUrl: "",
      featured: false,
      trackStock: false,
      stockQuantity: null,
      salesPageUrl: "",
      thankyouUrl: "",
      thankyouBoletoUrl: "",
      thankyouPixUrl: "",
      reclameAquiUrl: "",
      supportEmail: "",
      warrantyDays: 7,
      shippingType: "NONE",
      shippingValue: null,
      originCep: "",
      merchandContent: "",
      ...seed.dados,
    },
    plans: seed.plans || [],
    checkouts: seed.checkouts || [],
    commission: {
      affiliateEnabled: false,
      affiliateVisible: false,
      affiliateAutoApprove: true,
      affiliateAccessData: true,
      affiliateAccessAbandoned: true,
      affiliateFirstInstallment: false,
      commissionType: "last_click",
      commissionCookieDays: 180,
      commissionPercent: 30,
      commissionLastClickPercent: 70,
      commissionOtherClicksPercent: 30,
      affiliateTerms: "",
      ...seed.commission,
    },
    coproducers: seed.coproducers || [],
    affiliateRequests: seed.affiliateRequests || [],
    coupons: seed.coupons || [],
    campaigns: seed.campaigns || [],
    reviews: seed.reviews || [],
    afterpay: seed.afterpay || [],
    afterPayConfig: {
      duplicateAddress: false,
      affiliateCharge: false,
      chargeValue: null,
      shippingProvider: "",
      ...seed.afterPayConfig,
    },
    urls: seed.urls || [],
    ai: {
      whobuys: "",
      pains: "",
      promise: "",
      objections: [
        { id: "obj-seed-1", label: "É caro", response: "" },
        { id: "obj-seed-2", label: "Não confio", response: "" },
        { id: "obj-seed-3", label: "Funciona?", response: "" },
      ],
      salesArguments: "",
      tone: "CONSULTIVE",
      persistenceLevel: 3,
      messageLimit: 10,
      followUpSchedule: "2h,24h,72h",
      autoCheckoutLink: true,
      offerDiscount: true,
      useUrgency: true,
      technicalInfo: "",
      ...seed.ai,
    },
  };
}

const PRODUCTS = [
  {
    id: "p1", label: "GHK-CU", status: "analysis", tags: ["dermocosmetico", "analise"],
    meta: { category: "Dermocosméticos", price: 197, revenue: 0, sales: 0, subtitle: "em análise · ANVISA" },
    editor: defaultProductEditor({
      name: "GHK-CU", category: "Dermocosméticos", status: "analysis", format: "PHYSICAL", price: 197,
      dados: { name: "GHK-CU", category: "Dermocosméticos", status: "analysis", format: "PHYSICAL", price: 197, slug: "ghk-cu", warrantyDays: 7, shippingType: "VARIABLE", originCep: "37270000", supportEmail: "suporte@kloel.com", salesPageUrl: "https://kloel.com/ghk-cu" },
      plans: [
        defaultPlan({ id: "pl1", name: "GHK-Cu Sérum 30ml", priceInCents: 19700, compareAtPrice: 24700, quantity: 1, maxInstallments: 12, maxNoInterest: 3, referenceCode: "GHKCU-30", visibleToAffiliates: true,
          orderBumps: [{ id: "ob1", title: "Leve também o Tônico", description: "Potencializa o sérum", productName: "Tônico Pré-Sérum", priceInCents: 4700, compareAtPrice: 7900, highlightColor: "#E85D30", checkboxLabel: "Sim, adicionar!", position: "after-payment", isActive: true, sortOrder: 0 }],
          upsells: [{ id: "up1", title: "Oferta única", headline: "Kit 3 meses com 40% OFF", description: "Só agora, nesta tela", productName: "GHK-Cu 90ml", priceInCents: 39700, compareAtPrice: 59100, acceptBtnText: "Sim, quero!", declineBtnText: "Não, obrigado", timerSeconds: 600, chargeType: "ONE_CLICK", isActive: true, sortOrder: 0 }],
        }),
      ],
      checkouts: [
        { id: "ck1", name: "Checkout Principal", slug: "ghk-cu", referenceCode: "GHK-MAIN", salesCount: 0, isActive: true, maxInstallments: 12, quantity: 1, checkoutLinks: [],
          checkoutConfig: defaultCheckoutConfig({ theme: "BLANC", enablePix: true, enableCreditCard: true, enableBoleto: false, enableCoupon: true, enableTimer: true, timerType: "COUNTDOWN", timerMinutes: 15, showStockCounter: true, fakeStockCount: 7, enableGuarantee: true, guaranteeDays: 7,
            pixels: [{ id: "px1", type: "FACEBOOK", pixelId: "1029384756", accessToken: "", trackPageView: true, trackInitiateCheckout: true, trackAddPaymentInfo: true, trackPurchase: true, isActive: true }] }) },
      ],
      coupons: [
        { id: "cp1", code: "PRIMEIRA10", type: "%", val: 10, on: true, used: 0, max: 100, expiresAt: null },
      ],
      coproducers: [
        { id: "co1", role: "COPRODUCER", agentName: "Lab Parceiro", agentEmail: "lab@parceiro.com", percentage: 15 },
      ],
      affiliateRequests: [
        { id: "ar1", affiliateName: "Marina Costa", affiliateEmail: "marina@vendas.co", status: "APPROVED" },
        { id: "ar2", affiliateName: "Pedro Alves", affiliateEmail: "pedro.alves@gmail.com", status: "PENDING" },
      ],
      urls: [
        { id: "u1", description: "Página de vendas", url: "https://kloel.com/ghk-cu", isPrivate: false, active: true, aiLearning: true, aiLearnFreq: "weekly", aiLearnStatus: "learned", chatEnabled: true, salesFromUrl: 0 },
      ],
    }),
  },
  {
    id: "p2", label: "PDRN Coreamy", status: "draft", tags: ["dermocosmetico", "rascunho"],
    meta: { category: "Dermocosméticos", price: 197, revenue: 0, sales: 0, subtitle: "rascunho · aguarda você" },
    editor: defaultProductEditor({ name: "PDRN Coreamy", category: "Dermocosméticos", status: "draft", dados: { name: "PDRN Coreamy", category: "Dermocosméticos", status: "draft", format: "PHYSICAL" } }),
  },
];

function planView(pl) {
  return {
    id: pl.id, name: pl.name || "Sem nome",
    ref: pl.referenceCode || "---",
    price: Number(pl.priceInCents || 0),
    qty: Number(pl.quantity || 1),
    active: pl.isActive !== false,
    sales: Number(pl.salesCount || 0),
    inst: Number(pl.maxInstallments || 1),
    vis: pl.visibleToAffiliates !== false,
    freeShip: pl.freeShipping === true,
    links: Array.isArray(pl.planLinks) ? pl.planLinks : [],
  };
}
function checkoutView(ck) {
  const cfg = ck.checkoutConfig || {};
  const mt = [];
  if (cfg.enablePix !== false) mt.push("PIX");
  if (cfg.enableCreditCard !== false) mt.push("CARTÃO");
  if (cfg.enableBoleto === true) mt.push("BOLETO");
  return {
    id: ck.id, code: ck.referenceCode || ck.slug || String(ck.id).slice(0, 8),
    desc: ck.name || "Checkout", mt,
    sales: Number(ck.salesCount || 0),
    active: ck.isActive !== false,
    installments: Number(ck.maxInstallments || 1),
    quantity: Number(ck.quantity || 1),
    coupon: cfg.enableCoupon !== false,
    urgency: Boolean(cfg.enableTimer || cfg.showStockCounter),
    popup: Boolean(cfg.showCouponPopup),
    theme: cfg.theme || "BLANC",
    links: Array.isArray(ck.checkoutLinks) ? ck.checkoutLinks : [],
  };
}

const brl = (cents) => `R$ ${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")}`;
const pct = (n) => `${Number(n || 0)}%`;

function buildProductSubnodes(p) {
  const nodes = [], edges = [];
  const ed = p.editor || defaultProductEditor();
  const counts = {
    p_planos: ed.plans.length,
    p_checkouts: ed.checkouts.length,
    p_comissao: ed.coproducers.length + (ed.commission.affiliateEnabled ? 1 : 0),
    p_cupons: ed.coupons.length,
    p_campanhas: ed.campaigns.length,
    p_avaliacoes: ed.reviews.length,
    p_afterpay: ed.afterpay.length,
    p_ia: ed.ai.objections.length,
  };
  for (const tab of PRODUCT_NERVE_TABS) {
    const sid = `${p.id}-${tab.suffix}`;
    nodes.push({
      id: sid, type: tab.type, area: "criar", label: tab.label,
      parentId: p.id, tags: [],
      meta: { subtitle: `${tab.label} · ${p.label}`, productId: p.id, productLabel: p.label, count: counts[tab.type] },
    });
    edges.push({ from: p.id, to: sid, directed: true, kind: "attachment" });
  }
  return { nodes, edges, counts };
}

const TAB_SUN = {
  perfil:   "core",
  kloel:    "sun-kloel",
  criar:    "sun-criar",
  afiliar:  "sun-afiliar",
  educar:   "sun-educar",
  conectar: "sun-conectar",
  carteira: "sun-carteira",
};

const AREA_KEYS_ALL = ["criar", "afiliar", "educar"];

const AFFILIATE_BRANCHES = [
  { id: "af-market", key: "marketplace", label: "Marketplace" },
  { id: "af-mine",   key: "minhas",      label: "Minhas afiliações" },
  { id: "af-saved",  key: "salvos",      label: "Salvos" },
  { id: "af-prod",   key: "produtor",    label: "Meus afiliados" },
];

const MY_AFFILIATES_SEED = [
  { id: "af1", name: "Marina Costa", email: "marina@vendas.co", type: "affiliate", status: "active", totalSales: 84, revenue: 41580, commission: 40, temperature: 88, joined: "2026-02-10", products: ["GHK-Cu Sérum"], monthlyPerformance: [12, 18, 9, 22, 14, 9] },
  { id: "af2", name: "Studio Belle", email: "contato@studiobelle.com", type: "producer", status: "active", totalSales: 210, revenue: 188400, commission: 30, temperature: 95, joined: "2025-11-22", products: ["Curso Skincare", "Kit Anti-Idade"], monthlyPerformance: [30, 28, 41, 35, 39, 37] },
  { id: "af3", name: "Pedro Alves", email: "pedro.alves@gmail.com", type: "affiliate", status: "pending", totalSales: 0, revenue: 0, commission: 35, temperature: 0, joined: "2026-05-25", products: [], monthlyPerformance: [0, 0, 0, 0, 0, 0] },
];
const PARTNER_CHATS_SEED = [
  { id: "pc1", name: "Marina Costa", type: "affiliate", unread: 2, lastMessage: "Os criativos novos já estão no ar!", online: true, time: "09:42", messages: [{ id: "m1", text: "Oi! Posso pegar mais materiais do GHK-Cu?", isMe: false, time: "09:30" }, { id: "m2", text: "Claro, acabei de subir 4 criativos novos na aba Arsenal.", isMe: true, time: "09:38" }, { id: "m3", text: "Os criativos novos já estão no ar!", isMe: false, time: "09:42" }] },
  { id: "pc2", name: "Studio Belle", type: "producer", unread: 0, lastMessage: "Fechamos o mês com 210 vendas 🚀", online: false, time: "ontem", messages: [{ id: "m1", text: "Fechamos o mês com 210 vendas 🚀", isMe: false, time: "ontem" }] },
];
const COLLABORATORS_SEED = [
  { id: "co1", name: "Ana Suporte", email: "ana@kloel.com", role: "SUPPORT", status: "active", lastActive: "há 5 min" },
];

const MARKETPLACE_SEED = [
  { id: "mk1", name: "Método Pele de Vidro", producer: "Dra. Helena R.", category: "Dermocosméticos", price: 49700, commission: 50, sales: 1240, rating: 4.8, temperature: 92, cookieDays: 90, totalAffiliates: 340, totalReviews: 210, materials: ["Criativos", "Copy pronta", "VSL"], requestStatus: null, affiliateLink: null, isSaved: false },
  { id: "mk2", name: "Protocolo Colágeno 40+", producer: "Lab Vitalitá", category: "Suplementos", price: 29700, commission: 40, sales: 870, rating: 4.6, temperature: 78, cookieDays: 60, totalAffiliates: 190, totalReviews: 132, materials: ["Criativos", "E-mails"], requestStatus: null, affiliateLink: null, isSaved: false },
  { id: "mk3", name: "Curso Skincare Profissional", producer: "Studio Belle", category: "Cursos", price: 89700, commission: 60, sales: 540, rating: 4.9, temperature: 85, cookieDays: 120, totalAffiliates: 95, totalReviews: 88, materials: ["Criativos", "Copy", "Bônus afiliado"], requestStatus: null, affiliateLink: null, isSaved: false },
  { id: "mk4", name: "Kit Anti-Idade Premium", producer: "NovaDerm", category: "Dermocosméticos", price: 67700, commission: 45, sales: 2100, rating: 4.7, temperature: 95, cookieDays: 90, totalAffiliates: 510, totalReviews: 380, materials: ["Criativos", "Copy", "VSL", "Stories"], requestStatus: null, affiliateLink: null, isSaved: false },
];

const brlFromCents = (cents) => `R$ ${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")}`;
const tempColor = (t, C) => t >= 85 ? C.red : t >= 60 ? C.ember : t >= 30 ? C.amber : C.blue;
const tempLabel = (t) => t >= 85 ? "🔥 quente" : t >= 60 ? "morno" : t >= 30 ? "frio" : "gelado";

function buildAffiliateNodesEdges(affiliate) {
  const nodes = [], edges = [];
  for (const b of AFFILIATE_BRANCHES) {
    nodes.push({ id: b.id, type: "affBranch", area: "afiliar", label: b.label, parentId: "sun-afiliar", tags: [], meta: { subtitle: `afiliação · ${b.label}`, branchKey: b.key } });
    edges.push({ from: "sun-afiliar", to: b.id, directed: true, kind: "attachment" });
  }
  for (const m of affiliate.marketplace) {
    const id = `mk-${m.id}`;
    const approved = m.requestStatus === "APPROVED" || m.affiliateLink;
    nodes.push({ id, type: "affProduct", area: "afiliar", label: m.name, parentId: "af-market", tags: [m.category?.toLowerCase()].filter(Boolean), meta: { subtitle: `${m.commission}% · ${m.producer}`, marketId: m.id, status: m.requestStatus, approved } });
    edges.push({ from: "af-market", to: id, directed: true, kind: "attachment" });
    if (approved) edges.push({ from: "af-mine", to: id, directed: false, kind: "channel-product" });
    if (m.isSaved) edges.push({ from: "af-saved", to: id, directed: false, kind: "channel-product" });
  }
  for (const a of (affiliate.myAffiliates || [])) {
    const id = `aff-${a.id}`;
    nodes.push({ id, type: "affPartner", area: "afiliar", label: a.name, parentId: "af-prod", tags: [a.type], meta: { subtitle: a.status === "pending" ? "solicitação pendente" : `${a.type === "producer" ? "produtor" : "afiliado"} · ${a.totalSales} vendas`, affId: a.id, status: a.status, ptype: a.type } });
    edges.push({ from: "af-prod", to: id, directed: true, kind: "attachment" });
  }
  return { nodes, edges };
}

const MEMBER_AREAS_SEED = [
  {
    id: "ma1", name: "Skincare Profissional", slug: "skincare-pro", description: "Formação completa em cuidados com a pele", type: "course", template: "classic",
    logoUrl: "", coverUrl: "", primaryColor: "#E85D30", customDomain: "",
    certificates: true, quizzes: true, community: false, gamification: false, progressTrack: true, downloads: true, comments: true,
    aiGenerated: false, active: true, avgRating: 4.8,
    modules: [
      { id: "mo1", name: "Fundamentos", description: "Base teórica", position: 0, releaseType: "immediate", active: true, lessons: [
        { id: "le1", name: "Anatomia da pele", type: "video", position: 0, videoUrl: "https://vimeo.com/123", durationMin: 18, aiSummary: "", active: true },
        { id: "le2", name: "Tipos de pele", type: "video", position: 1, videoUrl: "https://vimeo.com/124", durationMin: 22, active: true },
        { id: "le3", name: "Material de apoio", type: "download", position: 2, downloadUrl: "https://files/apostila.pdf", active: true },
      ] },
      { id: "mo2", name: "Ativos & Protocolos", description: "Prática", position: 1, releaseType: "drip", releaseDays: 7, active: true, lessons: [
        { id: "le4", name: "GHK-Cu na prática", type: "video", position: 0, videoUrl: "https://vimeo.com/125", durationMin: 31, active: true },
        { id: "le5", name: "Quiz: ativos", type: "quiz", position: 1, quizData: { questions: 5 }, active: true },
      ] },
    ],
    enrollments: [
      { id: "en1", studentName: "Marina Costa", studentEmail: "marina@ex.com", studentPhone: "64999990000", status: "active", progress: 72, enrolledAt: "2026-03-01" },
      { id: "en2", studentName: "João Pedro", studentEmail: "joao@ex.com", studentPhone: null, status: "active", progress: 35, enrolledAt: "2026-04-12" },
      { id: "en3", studentName: "Ana Lima", studentEmail: "ana@ex.com", studentPhone: null, status: "completed", progress: 100, enrolledAt: "2026-02-08" },
    ],
  },
];
function areaStats(a) {
  const totalModules = a.modules.length;
  const totalLessons = a.modules.reduce((s, m) => s + m.lessons.length, 0);
  const totalStudents = a.enrollments.length;
  const avgCompletion = totalStudents ? Math.round(a.enrollments.reduce((s, e) => s + (e.progress || 0), 0) / totalStudents) : 0;
  return { totalModules, totalLessons, totalStudents, avgCompletion };
}
function buildEducarNodesEdges(educar) {
  const nodes = [], edges = [];
  for (const a of (educar?.areas || [])) {
    const id = `ma-${a.id}`;
    const st = areaStats(a);
    nodes.push({ id, type: "memberArea", area: "educar", label: a.name, parentId: "eu-ensinar", tags: [a.type].filter(Boolean), meta: { subtitle: `${st.totalStudents} alunos · ${st.totalLessons} aulas`, areaId: a.id, active: a.active } });
    edges.push({ from: "eu-ensinar", to: id, directed: true, kind: "attachment" });
  }
  return { nodes, edges };
}

const CONVERSAR_BRANCHES = [
  { id: "cv-crm",       key: "crm",       label: "CRM" },
];
const CRM_MODULES = [
  { id: "cv-inbox",     key: "inbox",     label: "Inbox" },
  { id: "cv-contatos",  key: "contatos",  label: "Contatos" },
  { id: "cv-vendas",    key: "vendas",    label: "Vendas" },
  { id: "cv-anuncios",  key: "anuncios",  label: "Anúncios" },
  { id: "cv-autopilot", key: "autopilot", label: "Autopilot" },
];
const AUTOPILOT_EVENTS_SEED = [
  { id: "ae1", contactName: "Marina Costa", intent: "INTERESSE_PRODUTO", action: "Enviar link checkout", status: "executed", messageSent: "Aqui está seu link com 10% OFF 🎁", latencyMs: 820, time: "09:41" },
  { id: "ae2", contactName: "João Pedro", intent: "OBJECAO_PRECO", action: "Oferecer parcelamento", status: "executed", messageSent: "Dá pra parcelar em 12x sem juros!", latencyMs: 640, time: "ontem" },
  { id: "ae3", contactName: "Lead #4821", intent: "DUVIDA_ENTREGA", action: "Responder prazo", status: "skipped", reason: "Fora do horário comercial", latencyMs: null, time: "ontem" },
  { id: "ae4", contactName: "Carlos M.", intent: "CARRINHO_ABANDONADO", action: "Recuperar carrinho", status: "error", reason: "Número inválido", latencyMs: 1200, time: "2 dias" },
];
const FOLLOWUPS_SEED = [
  { id: "fu1", contactName: "João Pedro", scheduledFor: "amanhã 10:00", reason: "Sem resposta há 24h", message: "Oi João, ainda pensando no kit?", status: "scheduled" },
  { id: "fu2", contactName: "Lead #4821", scheduledFor: "hoje 18:00", reason: "Carrinho abandonado", message: "", status: "scheduled" },
  { id: "fu3", contactName: "Marina Costa", scheduledFor: "27/05 14:00", reason: "Pós-venda (NPS)", message: "Como está sendo sua experiência?", status: "sent" },
];
const AD_PLATFORMS = { meta: "Meta Ads", google: "Google Ads", tiktok: "TikTok Ads" };
const AD_CAMPAIGNS_SEED = [
  { id: "ac1", platform: "meta", campaignName: "GHK-Cu · Conversão", status: "ACTIVE", spend: 1240.50, revenue: 4980.00, roas: 4.01, conversions: 38, impressions: 92400, clicks: 1840, ctr: 1.99, cpc: 0.67 },
  { id: "ac2", platform: "meta", campaignName: "Remarketing · Carrinho", status: "ACTIVE", spend: 380.00, revenue: 2140.00, roas: 5.63, conversions: 18, impressions: 24100, clicks: 720, ctr: 2.99, cpc: 0.53 },
  { id: "ac3", platform: "google", campaignName: "Search · Sérum facial", status: "ACTIVE", spend: 890.00, revenue: 2670.00, roas: 3.00, conversions: 22, impressions: 41200, clicks: 1320, ctr: 3.20, cpc: 0.67 },
  { id: "ac4", platform: "tiktok", campaignName: "VSL · Antes/Depois", status: "PAUSED", spend: 560.00, revenue: 1120.00, roas: 2.00, conversions: 9, impressions: 138000, clicks: 2200, ctr: 1.59, cpc: 0.25 },
];
const AD_RULES_SEED = [
  { id: "rl1", name: "Pausar ROAS baixo", condition: "ROAS < 1.5 por 2 dias", action: "Pausar campanha", alertMethod: "whatsapp", active: true, fireCount: 3 },
  { id: "rl2", name: "Escalar vencedora", condition: "ROAS > 4 e gasto > R$500", action: "Aumentar orçamento 20%", alertMethod: "email", active: true, fireCount: 1 },
  { id: "rl3", name: "Alerta CPC alto", condition: "CPC > R$2", action: "Notificar apenas", alertMethod: "whatsapp", active: false, fireCount: 0 },
];
const ORDERS_SEED = [
  { id: "or1", orderNumber: "#10432", customerName: "Marina Costa", customerEmail: "marina@ex.com", product: "GHK-Cu Sérum", totalInCents: 19700, paymentMethod: "PIX", installments: 1, status: "PAID", kind: "single", utmSource: "instagram", trackingCode: "BR123456789", paidAt: "27/05/2026" },
  { id: "or2", orderNumber: "#10433", customerName: "João Pedro", customerEmail: "joao@ex.com", product: "Kit Anti-Idade", totalInCents: 67700, paymentMethod: "CREDIT_CARD", installments: 12, status: "PENDING", kind: "physical", utmSource: "facebook", trackingCode: null, paidAt: null },
  { id: "or3", orderNumber: "#10434", customerName: "Ana Lima", customerEmail: "ana@ex.com", product: "Curso Skincare (assinatura)", totalInCents: 8970, paymentMethod: "CREDIT_CARD", installments: 1, status: "PAID", kind: "subscription", utmSource: "organic", trackingCode: null, paidAt: "25/05/2026" },
  { id: "or4", orderNumber: "#10435", customerName: "Carlos M.", customerEmail: "carlos@ex.com", product: "PDRN Coreamy", totalInCents: 19700, paymentMethod: "BOLETO", installments: 1, status: "REFUNDED", kind: "single", utmSource: "tiktok", trackingCode: null, paidAt: "20/05/2026" },
];
const ORDER_STATUS = { PAID: ["pago", "green"], PENDING: ["pendente", "amber"], REFUNDED: ["estornado", "red"], CANCELED: ["cancelado", "dim"], CHARGEBACK: ["chargeback", "red"] };
const PAYMENT_LABEL = { PIX: "PIX", CREDIT_CARD: "Cartão", BOLETO: "Boleto" };
const CRM_SEED = {
  pipeline: { id: "pp1", name: "Pipeline de Vendas", isDefault: true },
  stages: [
    { id: "st1", name: "Lead", color: "#6B7280", order: 0 },
    { id: "st2", name: "Qualificado", color: "#3B82F6", order: 1 },
    { id: "st3", name: "Negociação", color: "#E85D30", order: 2 },
    { id: "st4", name: "Fechado", color: "#22C55E", order: 3 },
  ],
  deals: [
    { id: "dl1", title: "GHK-Cu · Marina", value: 197, priority: "HIGH", status: "OPEN", stageId: "st3", contact: { name: "Marina Costa", phone: "5564999990000" } },
    { id: "dl2", title: "Kit Anti-Idade · João", value: 677, priority: "MEDIUM", status: "OPEN", stageId: "st2", contact: { name: "João Pedro", phone: "5564988880000" } },
    { id: "dl3", title: "Curso · Ana", value: 897, priority: "HIGH", status: "WON", stageId: "st4", contact: { name: "Ana Lima", phone: "5564977770000" } },
    { id: "dl4", title: "PDRN · Lead novo", value: 197, priority: "LOW", status: "OPEN", stageId: "st1", contact: { name: "Carlos M.", phone: "5564966660000" } },
  ],
};
const CONTACTS_SEED = [
  { id: "ct1", name: "Marina Costa", phone: "5564999990000", email: "marina@ex.com", optIn: true, tags: ["cliente", "vip"], leadScore: 88, sentiment: "positive", purchaseProbability: "HIGH", nextBestAction: "Enviar oferta upsell", aiSummary: "Compradora recorrente, alto engajamento. Respondeu bem a desconto.", insights: [{ id: "i1", type: "SENTIMENT_CHANGE", description: "Sentimento subiu após entrega", scoreChange: 12 }] },
  { id: "ct2", name: "João Pedro", phone: "5564988880000", email: "joao@ex.com", optIn: true, tags: ["lead"], leadScore: 54, sentiment: "neutral", purchaseProbability: "MEDIUM", nextBestAction: "Aguardar 2 dias", aiSummary: "Demonstrou interesse no kit, mas citou preço.", insights: [{ id: "i2", type: "OBJECTION_RAISED", description: "Objeção de preço detectada", scoreChange: -5 }] },
  { id: "ct3", name: "Ana Lima", phone: "5564977770000", email: "ana@ex.com", optIn: true, tags: ["cliente"], leadScore: 95, sentiment: "positive", purchaseProbability: "HIGH", nextBestAction: "Pedir indicação", aiSummary: "Concluiu o curso, NPS alto.", insights: [] },
];
const CONVERSATIONS_SEED = [
  { id: "cs1", contactName: "Marina Costa", channel: "WHATSAPP", status: "OPEN", priority: "HIGH", unreadCount: 2, lastMessageAt: "09:42", messages: [
    { id: "m1", direction: "INBOUND", type: "TEXT", content: "Oi, o sérum já chegou! Amei 😍", status: "READ", time: "09:30" },
    { id: "m2", direction: "OUTBOUND", type: "TEXT", content: "Que ótimo, Marina! Posso te mostrar o protocolo de 3 meses?", status: "READ", time: "09:35" },
    { id: "m3", direction: "INBOUND", type: "TEXT", content: "Pode sim!", status: "DELIVERED", time: "09:42" },
  ] },
  { id: "cs2", contactName: "João Pedro", channel: "INSTAGRAM", status: "PENDING", priority: "MEDIUM", unreadCount: 0, lastMessageAt: "ontem", messages: [
    { id: "m1", direction: "INBOUND", type: "TEXT", content: "Qual o valor do kit?", status: "READ", time: "ontem" },
    { id: "m2", direction: "OUTBOUND", type: "TEXT", content: "R$ 677 à vista ou 12x. Quer que eu reserve?", status: "READ", time: "ontem" },
  ] },
];

const sentimentColor = (s, C) => ({ positive: C.green, neutral: C.amber, negative: C.red }[s] || C.dim);
const priorityColor = (p, C) => ({ HIGH: C.red, MEDIUM: C.amber, LOW: C.dim }[p] || C.dim);

function buildConversarNodesEdges(conversar) {
  const nodes = [], edges = [];
  if (!conversar) return { nodes, edges };
  for (const b of CONVERSAR_BRANCHES) {
    nodes.push({ id: b.id, type: "convBranch", area: "conectar", label: b.label, parentId: "sun-conectar", tags: [], meta: { subtitle: `conversar · ${b.label}`, branchKey: b.key } });
    edges.push({ from: "sun-conectar", to: b.id, directed: true, kind: "attachment" });
  }
  const mods = conversar.crmModules || {};
  for (const m of CRM_MODULES) {
    if (!mods[m.key]) continue;
    nodes.push({ id: m.id, type: "convBranch", area: "conectar", label: m.label, parentId: "cv-crm", tags: [], meta: { subtitle: `CRM · ${m.label}`, branchKey: m.key } });
    edges.push({ from: "cv-crm", to: m.id, directed: true, kind: "attachment" });
  }
  if (mods.inbox) for (const c of (conversar.conversations || [])) {
    const id = `cv-conv-${c.id}`;
    nodes.push({ id, type: "conversation", area: "conectar", label: c.contactName, parentId: "cv-inbox", tags: [c.channel?.toLowerCase()].filter(Boolean), meta: { subtitle: `${c.channel} · ${c.status}${c.unreadCount ? ` · ${c.unreadCount} novas` : ""}`, convId: c.id } });
    edges.push({ from: "cv-inbox", to: id, directed: true, kind: "attachment" });
  }
  if (mods.contatos) for (const ct of (conversar.contacts || [])) {
    const id = `cv-ct-${ct.id}`;
    nodes.push({ id, type: "contact", area: "conectar", label: ct.name, parentId: "cv-contatos", tags: ct.tags || [], meta: { subtitle: `score ${ct.leadScore} · ${ct.sentiment}`, contactId: ct.id } });
    edges.push({ from: "cv-contatos", to: id, directed: true, kind: "attachment" });
  }
  if (mods.vendas) for (const o of (conversar.orders || [])) {
    const id = `cv-or-${o.id}`;
    nodes.push({ id, type: "order", area: "conectar", label: o.orderNumber, parentId: "cv-vendas", tags: [o.kind].filter(Boolean), meta: { subtitle: `${o.customerName} · ${(ORDER_STATUS[o.status] || ["",""])[0]}`, orderId: o.id, status: o.status } });
    edges.push({ from: "cv-vendas", to: id, directed: true, kind: "attachment" });
  }
  if (mods.anuncios) for (const ad of (conversar.adCampaigns || [])) {
    const id = `cv-ad-${ad.id}`;
    nodes.push({ id, type: "adCampaign", area: "conectar", label: ad.campaignName, parentId: "cv-anuncios", tags: [ad.platform].filter(Boolean), meta: { subtitle: `${AD_PLATFORMS[ad.platform] || ad.platform} · ROAS ${ad.roas}`, adId: ad.id, status: ad.status } });
    edges.push({ from: "cv-anuncios", to: id, directed: true, kind: "attachment" });
  }
  return { nodes, edges };
}

const BASE_SUNS = [
  { id: "core",         type: "core", area: "perfil",   label: "Perfil",    meta: { subtitle: "você · núcleo" } },
  { id: "sun-kloel",    type: "sun",  area: "kloel",    label: "Kloel",     meta: { subtitle: "IA central da sua operação" } },
  { id: "sun-criar",    type: "sun",  area: "criar",    label: "Criar",     meta: { subtitle: "seus produtos" } },
  { id: "sun-afiliar",  type: "sun",  area: "afiliar",  label: "Afiliar",   meta: { subtitle: "produtos afiliados" } },
  { id: "sun-educar",   type: "sun",  area: "educar",   label: "Educar",    meta: { subtitle: "cursos" } },
  { id: "sun-conectar", type: "sun",  area: "conectar", label: "Conversar", meta: { subtitle: "seus canais" } },
  { id: "sun-carteira", type: "sun",  area: "carteira", label: "Consultar",  meta: { subtitle: "saldo · vendas · relatórios" } },
];

const STATIC_BRANCHES = [
  { id: "eu-aprender", type: "branch", area: "educar", label: "Aprender", parentId: "sun-educar", meta: { subtitle: "cursos comprados" } },
  { id: "eu-ensinar",  type: "branch", area: "educar", label: "Ensinar",  parentId: "sun-educar", meta: { subtitle: "área de membros" } },
];

const PROFILE_SECTIONS = [
  { id: "pf-pessoal", key: "pessoal",       label: "Pessoal" },
  { id: "pf-fiscal",  key: "fiscal",        label: "Fiscal" },
  { id: "pf-docs",    key: "documentos",    label: "Docs" },
  { id: "pf-banco",   key: "bancario",      label: "Banco" },
  { id: "pf-publico", key: "perfilPublico", label: "Público" },
  { id: "pf-team",    key: "team",          label: "Equipe" },
  { id: "pf-apps",    key: "apps",          label: "Apps" },
  { id: "pf-seg",     key: "seguranca",     label: "Segurança" },
];

function buildProfileNodesEdges(accountData) {
  const nodes = [], edges = [];
  if (!accountData) return { nodes, edges };
  for (const s of PROFILE_SECTIONS) {
    nodes.push({ id: s.id, type: "profileSection", area: "perfil", label: s.label, parentId: "core", tags: [], meta: { subtitle: `perfil · ${s.label}`, sectionKey: s.key } });
    edges.push({ from: "core", to: s.id, directed: true, kind: "attachment" });
  }
  const addField = (parentId, id, label, sub, extra = {}) => {
    nodes.push({ id, type: "profileField", area: "perfil", label, parentId, tags: [], meta: { subtitle: sub, ...extra } });
    edges.push({ from: parentId, to: id, directed: true, kind: "attachment" });
  };
  const p = accountData.pessoal || {};
  if (p.nome)       addField("pf-pessoal", "pf-nome",    p.nome,       "nome");
  if (p.email)      addField("pf-pessoal", "pf-email",   p.email,      "e-mail");
  if (p.celular)    addField("pf-pessoal", "pf-celular", p.celular,    "celular");
  if (p.nascimento) addField("pf-pessoal", "pf-nasc",    p.nascimento, "nascimento");
  const f = accountData.fiscal || {};
  if (f.cnpj)     addField("pf-fiscal", "pf-cnpj",     f.cnpj,     "CNPJ");
  if (f.razao)    addField("pf-fiscal", "pf-razao",    f.razao,    "razão social");
  if (f.fantasia) addField("pf-fiscal", "pf-fantasia", f.fantasia, "nome fantasia");
  if (f.nomeResp) addField("pf-fiscal", "pf-resp",     f.nomeResp, "responsável");
  if (f.cep || f.rua) {
    const loc = [f.cidade, f.uf].filter(Boolean).join("/") || "Endereço fiscal";
    addField("pf-fiscal", "pf-endereco", loc, "endereço fiscal");
  }
  const docs = accountData.documentos || {};
  for (const [dk, doc] of Object.entries(docs)) {
    const id = `pf-doc-${dk}`;
    nodes.push({ id, type: "doc", area: "perfil", label: doc.name, parentId: "pf-docs", tags: [], meta: { subtitle: `documento · ${doc.status}`, status: doc.status } });
    edges.push({ from: "pf-docs", to: id, directed: true, kind: "attachment" });
  }
  const b = accountData.bancario || {};
  if (b.banco)    addField("pf-banco", "pf-banco-nome", b.banco,    "banco");
  if (b.pixChave) addField("pf-banco", "pf-banco-pix",  b.pixChave, "chave PIX");
  const pp = accountData.perfilPublico || {};
  if (pp.publicName) addField("pf-publico", "pf-pub-name", pp.publicName, "nome público");
  if (pp.instagram)  addField("pf-publico", "pf-pub-ig",   `@${pp.instagram.replace("@", "")}`, "instagram");
  if (pp.website)    addField("pf-publico", "pf-pub-web",  pp.website, "site");
  for (const m of (accountData.team?.members || [])) {
    const id = `pf-tm-${m.id}`;
    nodes.push({ id, type: "teamMember", area: "perfil", label: m.name || m.email, parentId: "pf-team", tags: [], meta: { subtitle: `${m.role} · ${m.status}`, role: m.role, status: m.status } });
    edges.push({ from: "pf-team", to: id, directed: true, kind: "attachment" });
  }
  for (const inv of (accountData.team?.invites || [])) {
    const id = `pf-inv-${inv.id}`;
    nodes.push({ id, type: "teamMember", area: "perfil", label: inv.email, parentId: "pf-team", tags: [], meta: { subtitle: `convite · ${inv.role}`, role: inv.role, status: "pending" } });
    edges.push({ from: "pf-team", to: id, directed: true, kind: "attachment" });
  }
  for (const [ak, app] of Object.entries(accountData.apps || {})) {
    if (!app.connected) continue;
    const id = `pf-app-${ak}`;
    const lbl = { meta: "Meta", google: "Google Ads", tiktok: "TikTok", zapier: "Zapier" }[ak] || ak;
    nodes.push({ id, type: "appNode", area: "perfil", label: lbl, parentId: "pf-apps", tags: [], meta: { subtitle: app.pageName || `${lbl} conectado`, appKey: ak } });
    edges.push({ from: "pf-apps", to: id, directed: true, kind: "attachment" });
  }
  return { nodes, edges };
}

const WALLET_BRANCHES = [
  { id: "wl-saldo",   key: "saldo",        label: "Saldo" },
  { id: "wl-extrato", key: "extrato",      label: "Extrato" },
  { id: "wl-saques",  key: "saques",       label: "Saques" },
  { id: "wl-antec",   key: "antecipacoes", label: "Antecipações" },
  { id: "wl-vendas",  key: "vendas",       label: "Vendas" },
  { id: "wl-assin",   key: "assinaturas",  label: "Assinaturas" },
  { id: "wl-aband",   key: "abandonos",    label: "Abandonos" },
  { id: "wl-estorno", key: "estornos",     label: "Estornos" },
];
const DEFAULT_WALLET = {
  balance: { available: 1284050, pending: 320000, blocked: 0, total: 1604050 },
  withdrawals: [
    { id: "wd1", amount: 500000, status: "completed", date: "20/05/2026", method: "PIX", bank: "Nubank" },
    { id: "wd2", amount: 300000, status: "processing", date: "26/05/2026", method: "TED", bank: "Itaú" },
  ],
  anticipations: [
    { id: "an1", originalAmount: 200000, feePct: 2.99, netAmount: 194020, status: "completed", date: "15/05/2026", installments: 3 },
  ],
  transactions: [
    { id: "tx1", type: "sale", desc: "Venda GHK-Cu", amount: 19700, status: "settled", method: "PIX", date: "27/05/2026", fee: 1574 },
    { id: "tx2", type: "withdrawal", desc: "Saque PIX", amount: -500000, status: "completed", method: "PIX", date: "20/05/2026", fee: 0 },
    { id: "tx3", type: "anticipation", desc: "Antecipação 3×", amount: 194020, status: "completed", method: "Sistema", date: "15/05/2026", fee: 5980 },
  ],
};
function buildWalletNodesEdges(wallet) {
  const nodes = [], edges = [];
  if (!wallet) return { nodes, edges };
  for (const b of WALLET_BRANCHES) {
    nodes.push({ id: b.id, type: "walletBranch", area: "carteira", label: b.label, parentId: "sun-carteira", tags: [], meta: { subtitle: `consultar · ${b.label}`, branchKey: b.key } });
    edges.push({ from: "sun-carteira", to: b.id, directed: true, kind: "attachment" });
  }
  for (const w of wallet.withdrawals) {
    const id = `wl-wd-${w.id}`;
    nodes.push({ id, type: "walletItem", area: "carteira", label: brlFromCents(w.amount), parentId: "wl-saques", tags: [], meta: { subtitle: `${w.method} · ${w.status}`, status: w.status } });
    edges.push({ from: "wl-saques", to: id, directed: true, kind: "attachment" });
  }
  for (const a of wallet.anticipations) {
    const id = `wl-an-${a.id}`;
    nodes.push({ id, type: "walletItem", area: "carteira", label: brlFromCents(a.netAmount), parentId: "wl-antec", tags: [], meta: { subtitle: `${a.installments}× · ${a.status}`, status: a.status } });
    edges.push({ from: "wl-antec", to: id, directed: true, kind: "attachment" });
  }
  return { nodes, edges };
}
