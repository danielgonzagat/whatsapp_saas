// @ts-nocheck
/* eslint-disable */
'use client';
// ─────────────────────────────────────────────────────────────────────────────
// KLOEL · GRAPH UNIFICADO — owner-authored prototype, reproduced VERBATIM as the
// application's primary surface (source of truth for the KloelGraph visual +
// interaction model). Only these header lines were prepended: the Next.js "use
// client" directive and lint/type suppression for this owner-authored single-file
// React prototype. Phase 2 wires its internal seeds to the real Kloel APIs while
// keeping the rendered result 100% identical to this file. Do NOT alter visuals.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useReducer, useCallback, useMemo, useContext, createContext } from "react";
import { sendAuthenticatedKloelMessage } from "@/lib/kloel-conversations";
import { useProducts } from "@/hooks/useProducts";
import { useWalletBalance, useWalletWithdrawals, useWalletAnticipations } from "@/hooks/useWallet";
import { useMemberAreas } from "@/hooks/useMemberAreas";
import { useAffiliates } from "@/hooks/usePartnerships";
import { useContacts, useDeals, usePipelines } from "@/hooks/useCRM";
import { useProfile, useFiscalData, useKycDocuments, useBankAccount } from "@/hooks/useKyc";

/* ═══════════════════════════════════════════════════════════════════════════
   KLOEL · GRAPH UNIFICADO  ·  CRIAR reinventado (ProductNerveCenter → Graph)
   
   Um cérebro. Tudo é nó. Cada produto criado abre as 10 abas reais do
   ProductNerveCenter como SUB-NÓS NAVEGÁVEIS, e cada sub-nó abre um painel
   rico com a lógica REAL extraída do frontend legado:
   
     dados · planos · checkouts · urls · comissão/afiliação · cupons ·
     campanhas · avaliações · afterpay · IA
   
   Toda a lógica (split de comissão, config de checkout, objeções da IA,
   campanhas com pixel, cupons %/R$, avaliações 1-5★, coprodução/gerência)
   vive em estado React e funciona DENTRO do graph — não são shells.
   
   Identidade canonicalizada (Terminator/Velvet):
     · paper warm / void black, ember #E85D30
     · Sora 300/500, JetBrains Mono uppercase
     · max 6px border-radius, pílula flutuante
   ═══════════════════════════════════════════════════════════════════════════ */

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

/* Categorias de produto cadastráveis (lista completa selecionável) */
const PRODUCT_CATEGORIES = [
  "Dermocosméticos", "Cosméticos", "Suplementos", "Saúde e Bem-estar", "Beleza e Cuidados",
  "Cabelos", "Emagrecimento", "Fitness e Esportes", "Cursos Online", "E-books",
  "Mentorias e Consultorias", "Software e SaaS", "Serviços", "Eventos e Ingressos",
  "Moda e Acessórios", "Casa e Decoração", "Eletrônicos", "Pet", "Alimentos e Bebidas",
  "Infantil", "Espiritualidade", "Finanças e Negócios", "Outros",
].map(c => ({ value: c, label: c }));

/* ════════════════════════════════════════════════════════════════════════
   CRIAR · DOMÍNIO REAL · extraído de ProductNerveCenter (frontend legado)
   ────────────────────────────────────────────────────────────────────────
   As 10 abas reais do editor de produto viram sub-nós. Cada produto carrega
   um objeto `editor` com o estado real de cada aba (mesmas chaves do backend).
   ════════════════════════════════════════════════════════════════════════ */

/* As 10 abas reais (product-nerve-tabs.const.ts), mapeadas a tipos de sub-nó */
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

/* Sub-tabs do detalhe de plano — Checkout vive aqui dentro (Order Bump → dentro do Checkout) */
const PLAN_DETAIL_SUBTABS = ["Loja", "Pagamento", "Frete", "Afiliação", "Order Bump"];

/* Defaults reais do editor (chaves idênticas ao backend/hooks legados) */
/* Factory do CheckoutConfig COMPLETO — espelha RAC_CheckoutConfig (~80 campos):
   tema, cores, fontes, marca, textos, pagamentos, popup cupom, timer, estoque,
   frete, comissão custom, depoimentos, garantia, selos, SEO, exit-intent,
   barra flutuante, chat widget, prova social. */
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
    pixels: [], // CheckoutPixel[]: { id, type, pixelId, accessToken, trackPageView, trackInitiateCheckout, trackAddPaymentInfo, trackPurchase, isActive }
    ...over,
  };
}

function defaultPlan(over = {}) {
  return {
    id: `pl-${Math.random().toString(36).slice(2, 8)}`, name: "", referenceCode: "",
    priceInCents: 0, compareAtPrice: null, currency: "BRL",
    billingType: "ONE_TIME",            // ONE_TIME | RECURRING | FREE
    itemsPerPlan: 1, quantity: 1,
    maxInstallments: 12, maxNoInterest: 1, installmentsFee: false, discountByPayment: false,
    recurringInterval: null,            // WEEKLY | BIWEEKLY | MONTHLY | QUARTERLY | SEMIANNUAL | ANNUAL
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
    // ── dados gerais (model Product completo) ──
    dados: {
      name: seed.name || "",
      category: seed.category || "Dermocosméticos",
      description: seed.description || "",
      status: seed.status || "draft",        // draft | analysis | active | paused
      slug: seed.slug || "",
      sku: "",
      format: seed.format || "PHYSICAL",     // PHYSICAL | DIGITAL | HYBRID
      price: seed.price || 0,
      currency: "BRL",
      coverUrl: "",
      imageUrl: "",
      featured: false,
      // estoque
      trackStock: false,
      stockQuantity: null,
      // páginas
      salesPageUrl: "",
      thankyouUrl: "",
      thankyouBoletoUrl: "",
      thankyouPixUrl: "",
      reclameAquiUrl: "",
      supportEmail: "",
      warrantyDays: 7,
      // frete (nível produto)
      shippingType: "NONE",                  // VARIABLE | FIXED | FREE | NONE
      shippingValue: null,
      originCep: "",
      merchandContent: "",
      ...seed.dados,
    },
    // ── planos ──
    plans: seed.plans || [],
    // ── checkouts ──
    checkouts: seed.checkouts || [],
    // ── comissão / afiliação (Product affiliate* + commission*) ──
    commission: {
      affiliateEnabled: false,
      affiliateVisible: false,
      affiliateAutoApprove: true,
      affiliateAccessData: true,
      affiliateAccessAbandoned: true,
      affiliateFirstInstallment: false,
      commissionType: "last_click",          // first_click | last_click | proportional
      commissionCookieDays: 180,             // 1–3650
      commissionPercent: 30,
      commissionLastClickPercent: 70,
      commissionOtherClicksPercent: 30,
      affiliateTerms: "",
      ...seed.commission,
    },
    // ── coprodução / gerência (ProductCommission: role COPRODUCER | MANAGER | AFFILIATE) ──
    coproducers: seed.coproducers || [],
    // ── solicitações de afiliação a ESTE produto (AffiliateRequest) ──
    affiliateRequests: seed.affiliateRequests || [],
    // ── cupons ──
    coupons: seed.coupons || [],
    // ── campanhas (pixelId, salesCount, paidCount) ──
    campaigns: seed.campaigns || [],
    // ── avaliações (1–5★) ──
    reviews: seed.reviews || [],
    // ── after pay (Product afterPay* + Upsell pós-compra) ──
    afterpay: seed.afterpay || [],
    afterPayConfig: {
      duplicateAddress: false,
      affiliateCharge: false,
      chargeValue: null,
      shippingProvider: "",
      ...seed.afterPayConfig,
    },
    // ── URLs (ProductUrl: privacidade + IA learning + chat widget) ──
    urls: seed.urls || [],
    // ── IA (ProductAIConfig) ──
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
      tone: "CONSULTIVE",                    // CONSULTIVE | DIRECT | FRIENDLY | EXPERT
      persistenceLevel: 3,                   // 1–5
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

/* Catálogo inicial — 2 produtos reais com editor completo materializado */
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

/* Helpers de view-model (mapProductEditorPlans / Checkouts) reinventados */
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

/* Formatação BRL a partir de centavos */
const brl = (cents) => `R$ ${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")}`;
const pct = (n) => `${Number(n || 0)}%`;

/* Constrói os sub-nós de um produto a partir das 10 abas + contadores reais */
function buildProductSubnodes(p) {
  const nodes = [], edges = [];
  const ed = p.editor || defaultProductEditor();
  // contadores reais por aba → viram badge no nó
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

/* As massas-sol das interfaces */
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

/* ════════════════════════════════════════════════════════════════════════
   AFILIAR · DOMÍNIO REAL · extraído de produtos/ProdutosAfiliarSeTab + parcerias
   ────────────────────────────────────────────────────────────────────────
   A galáxia "Afiliar" tem 3 ramos fixos + nós dinâmicos:
     · Marketplace   → cada produto disponível para afiliar vira um nó
     · Minhas afiliações → cada link aprovado vira um nó (clicks/sales/revenue)
     · Salvos        → produtos marcados para depois
   Dados idênticos ao backend: MarketplaceItem, AffiliateLink, requestStatus.
   ════════════════════════════════════════════════════════════════════════ */
const AFFILIATE_BRANCHES = [
  { id: "af-market", key: "marketplace", label: "Marketplace" },
  { id: "af-mine",   key: "minhas",      label: "Minhas afiliações" },
  { id: "af-saved",  key: "salvos",      label: "Salvos" },
  { id: "af-prod",   key: "produtor",    label: "Meus afiliados" },
];

/* ── lado PRODUTOR (parcerias/): quem vende os MEUS produtos ──
   Affiliate: type affiliate|producer, status, totalSales, revenue,
   commission %, commissionEarned = revenue*commission/100, temperature,
   joined, products[], monthlyPerformance[]. + colaboradores + chat. */
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

/* Marketplace inicial — produtos de OUTROS produtores, disponíveis p/ afiliar */
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
  // 3 ramos fixos
  for (const b of AFFILIATE_BRANCHES) {
    nodes.push({ id: b.id, type: "affBranch", area: "afiliar", label: b.label, parentId: "sun-afiliar", tags: [], meta: { subtitle: `afiliação · ${b.label}`, branchKey: b.key } });
    edges.push({ from: "sun-afiliar", to: b.id, directed: true, kind: "attachment" });
  }
  // marketplace → nós conectados ao ramo Marketplace
  for (const m of affiliate.marketplace) {
    const id = `mk-${m.id}`;
    const approved = m.requestStatus === "APPROVED" || m.affiliateLink;
    nodes.push({ id, type: "affProduct", area: "afiliar", label: m.name, parentId: "af-market", tags: [m.category?.toLowerCase()].filter(Boolean), meta: { subtitle: `${m.commission}% · ${m.producer}`, marketId: m.id, status: m.requestStatus, approved } });
    edges.push({ from: "af-market", to: id, directed: true, kind: "attachment" });
    // se aprovado, também conecta ao ramo "minhas"
    if (approved) edges.push({ from: "af-mine", to: id, directed: false, kind: "channel-product" });
    // se salvo, conecta ao ramo "salvos"
    if (m.isSaved) edges.push({ from: "af-saved", to: id, directed: false, kind: "channel-product" });
  }
  // lado produtor → cada afiliado/produtor parceiro vira nó sob "Meus afiliados"
  for (const a of (affiliate.myAffiliates || [])) {
    const id = `aff-${a.id}`;
    nodes.push({ id, type: "affPartner", area: "afiliar", label: a.name, parentId: "af-prod", tags: [a.type], meta: { subtitle: a.status === "pending" ? "solicitação pendente" : `${a.type === "producer" ? "produtor" : "afiliado"} · ${a.totalSales} vendas`, affId: a.id, status: a.status, ptype: a.type } });
    edges.push({ from: "af-prod", to: id, directed: true, kind: "attachment" });
  }
  return { nodes, edges };
}

/* ════════════════════════════════════════════════════════════════════════
   EDUCAR · DOMÍNIO REAL · área de membros (MemberArea/Module/Lesson/Enrollment)
   Ramo "Ensinar": cada MemberArea vira um nó com módulos→aulas, alunos,
   certificados e overview. Ramo "Aprender": cursos comprados.
   ════════════════════════════════════════════════════════════════════════ */
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

/* ════════════════════════════════════════════════════════════════════════
   CONVERSAR · DOMÍNIO REAL · CRM (Pipeline/Stage/Deal) + Contact + Conversation
   3 ramos sob a massa "Conversar" (além dos canais): Inbox, CRM, Contatos.
   ════════════════════════════════════════════════════════════════════════ */
const CONVERSAR_BRANCHES = [
  { id: "cv-crm",       key: "crm",       label: "CRM" },
];
// Inbox/Contatos/Vendas/Anúncios/Autopilot são módulos DENTRO do CRM:
// só viram sub-nós depois de ativados/conectados (conversar.crmModules[key]).
const CRM_MODULES = [
  { id: "cv-inbox",     key: "inbox",     label: "Inbox" },
  { id: "cv-contatos",  key: "contatos",  label: "Contatos" },
  { id: "cv-vendas",    key: "vendas",    label: "Vendas" },
  { id: "cv-anuncios",  key: "anuncios",  label: "Anúncios" },
  { id: "cv-autopilot", key: "autopilot", label: "Autopilot" },
];
/* AUTOPILOT (AutopilotEvent/FollowUp): a IA agindo sozinha.
   Eventos: intent → action, status (executed/error/skipped), latência.
   Follow-ups: agendados, motivo, status. */
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
/* WAR ROOM (AdCampaign/AdRule/AdSpend): tráfego pago Meta/Google/TikTok.
   Métricas reais: spend, revenue, ROAS, conversions, impressions, clicks, CTR, CPC.
   Regras de IA: condição → ação, alerta, fireCount. */
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
/* Vendas realizadas (CheckoutOrder/Payment): número, cliente, total, método,
   status, parcelas, UTM, rastreio. Inclui assinaturas e pedidos físicos. */
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
  // módulos do CRM: viram sub-nós do CRM só quando ativados/conectados
  for (const m of CRM_MODULES) {
    if (!mods[m.key]) continue;
    nodes.push({ id: m.id, type: "convBranch", area: "conectar", label: m.label, parentId: "cv-crm", tags: [], meta: { subtitle: `CRM · ${m.label}`, branchKey: m.key } });
    edges.push({ from: "cv-crm", to: m.id, directed: true, kind: "attachment" });
  }
  // conversas → sob Inbox (se ativado)
  if (mods.inbox) for (const c of (conversar.conversations || [])) {
    const id = `cv-conv-${c.id}`;
    nodes.push({ id, type: "conversation", area: "conectar", label: c.contactName, parentId: "cv-inbox", tags: [c.channel?.toLowerCase()].filter(Boolean), meta: { subtitle: `${c.channel} · ${c.status}${c.unreadCount ? ` · ${c.unreadCount} novas` : ""}`, convId: c.id } });
    edges.push({ from: "cv-inbox", to: id, directed: true, kind: "attachment" });
  }
  // contatos → sob Contatos (se ativado)
  if (mods.contatos) for (const ct of (conversar.contacts || [])) {
    const id = `cv-ct-${ct.id}`;
    nodes.push({ id, type: "contact", area: "conectar", label: ct.name, parentId: "cv-contatos", tags: ct.tags || [], meta: { subtitle: `score ${ct.leadScore} · ${ct.sentiment}`, contactId: ct.id } });
    edges.push({ from: "cv-contatos", to: id, directed: true, kind: "attachment" });
  }
  // vendas → sob Vendas (se ativado)
  if (mods.vendas) for (const o of (conversar.orders || [])) {
    const id = `cv-or-${o.id}`;
    nodes.push({ id, type: "order", area: "conectar", label: o.orderNumber, parentId: "cv-vendas", tags: [o.kind].filter(Boolean), meta: { subtitle: `${o.customerName} · ${(ORDER_STATUS[o.status] || ["",""])[0]}`, orderId: o.id, status: o.status } });
    edges.push({ from: "cv-vendas", to: id, directed: true, kind: "attachment" });
  }
  // anúncios → campanhas sob Anúncios (se ativado)
  if (mods.anuncios) for (const ad of (conversar.adCampaigns || [])) {
    const id = `cv-ad-${ad.id}`;
    nodes.push({ id, type: "adCampaign", area: "conectar", label: ad.campaignName, parentId: "cv-anuncios", tags: [ad.platform].filter(Boolean), meta: { subtitle: `${AD_PLATFORMS[ad.platform] || ad.platform} · ROAS ${ad.roas}`, adId: ad.id, status: ad.status } });
    edges.push({ from: "cv-anuncios", to: id, directed: true, kind: "attachment" });
  }
  return { nodes, edges };
}

/* ════════════════════════════════════════════════════════════════════════
   BASE NODES & EDGES (massas fixas)
   ════════════════════════════════════════════════════════════════════════ */
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

/* ════════════════════════════════════════════════════════════════════════
   PERFIL · cluster do usuário (materializa conforme dados preenchidos)
   ════════════════════════════════════════════════════════════════════════ */
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
  // perfil público
  const pp = accountData.perfilPublico || {};
  if (pp.publicName) addField("pf-publico", "pf-pub-name", pp.publicName, "nome público");
  if (pp.instagram)  addField("pf-publico", "pf-pub-ig",   `@${pp.instagram.replace("@", "")}`, "instagram");
  if (pp.website)    addField("pf-publico", "pf-pub-web",  pp.website, "site");
  // equipe → cada membro vira nó
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
  // apps conectados → nó por app conectado
  for (const [ak, app] of Object.entries(accountData.apps || {})) {
    if (!app.connected) continue;
    const id = `pf-app-${ak}`;
    const lbl = { meta: "Meta", google: "Google Ads", tiktok: "TikTok", zapier: "Zapier" }[ak] || ak;
    nodes.push({ id, type: "appNode", area: "perfil", label: lbl, parentId: "pf-apps", tags: [], meta: { subtitle: app.pageName || `${lbl} conectado`, appKey: ak } });
    edges.push({ from: "pf-apps", to: id, directed: true, kind: "attachment" });
  }
  return { nodes, edges };
}

/* ════════════════════════════════════════════════════════════════════════
   CARTEIRA · galáxia financeira própria (carteira.types.ts)
   Saldo (available/pending/blocked/total) · Saques · Antecipações · Extrato
   ════════════════════════════════════════════════════════════════════════ */
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
  balance: { available: 1284050, pending: 320000, blocked: 0, total: 1604050 }, // centavos
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

/* ════════════════════════════════════════════════════════════════════════
   DESEMPENHO · "HOME" do repositório reinventada como constelação viva
   ────────────────────────────────────────────────────────────────────────
   Mesma resposta do backend (DashboardHomeResponse): hero{receita total,
   mês, hoje, saldo, a receber} + metrics{receita, vendas, conversão, ticket}.
   Tudo recalculado por período (Hoje · 30 dias · Personalizado), a partir de
   dados operacionais diários reais — não números fixos. Default: Hoje.
   ════════════════════════════════════════════════════════════════════════ */
const DZ_WEEKDAYS = ["DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];
const DZ_MONTHS = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const dzFullDate = (d) => `${DZ_WEEKDAYS[d.getDay()]}, ${d.getDate()} DE ${DZ_MONTHS[d.getMonth()]} DE ${d.getFullYear()}`;
const dzGreeting = (h) => h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
const dzStartOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const DAY_MS = 86400000;

/* Dados operacionais diários (≈60 dias) — gerados uma vez de forma determinística */
function buildOperationalDays() {
  const days = [];
  const today = dzStartOfDay(new Date());
  let seed = 1337;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 60; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const wd = d.getDay();
    const weekendFactor = (wd === 0 || wd === 6) ? 0.55 : 1;
    const orders = Math.round((3 + rnd() * 7) * weekendFactor);
    const paidOrders = Math.max(0, orders - Math.round(rnd() * 2));
    const avgTicket = 14700 + Math.round(rnd() * 13000);          // centavos
    const revenueInCents = paidOrders * avgTicket;
    const checkoutStarts = orders + Math.round(rnd() * 9);
    const conversations = Math.round(10 + rnd() * 28);
    days.push({ ts: d.getTime(), revenueInCents, orders, paidOrders, checkoutStarts, conversations });
  }
  return days;
}
// Honest-empty: sem dias operacionais fake. computeDesempenho([]) rende zeros reais
// (R$ 0,00 / 0 vendas). Receita real entra via analytics quando o backend subir.
const OPERATIONAL_DAYS = [];

function dzSumRange(days, fromTs, toTs) {
  const sel = days.filter(x => x.ts >= fromTs && x.ts <= toTs);
  const revenueInCents = sel.reduce((s, x) => s + x.revenueInCents, 0);
  const paidOrders = sel.reduce((s, x) => s + x.paidOrders, 0);
  const totalOrders = sel.reduce((s, x) => s + x.orders, 0);
  const checkoutStarts = sel.reduce((s, x) => s + x.checkoutStarts, 0);
  const conversations = sel.reduce((s, x) => s + x.conversations, 0);
  const conversionRatePct = checkoutStarts ? (paidOrders / checkoutStarts) * 100 : 0;
  const averageTicketInCents = paidOrders ? Math.round(revenueInCents / paidOrders) : 0;
  return { revenueInCents, paidOrders, totalOrders, checkoutStarts, conversations, conversionRatePct, averageTicketInCents, series: sel.map(x => x.revenueInCents) };
}

/* Calcula TODO o painel a partir do período ativo + saldo real da carteira */
function computeDesempenho(days, period, customFrom, customTo, wallet) {
  const now = new Date();
  const t0 = dzStartOfDay(now).getTime();
  const tEnd = t0 + DAY_MS - 1;
  const yStart = t0 - DAY_MS, yEnd = t0 - 1;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const prevMonthEnd = monthStart - 1;
  const last30Start = t0 - 29 * DAY_MS;

  const today = dzSumRange(days, t0, tEnd);
  const yesterday = dzSumRange(days, yStart, yEnd);
  const month = dzSumRange(days, monthStart, tEnd);
  const prevMonth = dzSumRange(days, prevMonthStart, prevMonthEnd);

  let from, to, prevFrom, prevTo, label;
  if (period === "today") { from = t0; to = tEnd; prevFrom = yStart; prevTo = yEnd; label = "Hoje"; }
  else if (period === "custom" && customFrom && customTo) {
    from = dzStartOfDay(new Date(customFrom)).getTime();
    to = dzStartOfDay(new Date(customTo)).getTime() + DAY_MS - 1;
    if (to < from) { const t = from; from = to - DAY_MS + 1; to = t + DAY_MS - 1; }
    const len = to - from; prevTo = from - 1; prevFrom = from - len - 1; label = "Personalizado";
  } else { from = last30Start; to = tEnd; const len = to - from; prevTo = from - 1; prevFrom = from - len - 1; label = "Últimos 30 dias"; }

  const active = dzSumRange(days, from, to);
  const prev = dzSumRange(days, prevFrom, prevTo);
  const revenueDeltaPct = prev.revenueInCents ? ((active.revenueInCents - prev.revenueInCents) / prev.revenueInCents) * 100 : null;

  const available = wallet?.balance?.available ?? 0;
  const pending = wallet?.balance?.pending ?? 0;

  const D = { label, period, active, prev, revenueDeltaPct, today, yesterday, month, prevMonth, available, pending, fromTs: from, toTs: to };
  D.cards = dzCards(D);
  return D;
}

/* Fonte única de verdade: os 9 cartões = os 9 nós-métrica */
function dzCards(D) {
  const fmtPct = (n) => n == null ? null : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
  return [
    { key: "total",      group: "hero",   name: "Receita total dos seus produtos", short: "Receita total", value: brlFromCents(D.active.revenueInCents), sub: `Receita aprovada em ${D.label}.`, deltaDir: null, series: D.active.series },
    { key: "month",      group: "hero",   name: "Total deste mês",  short: "Este mês",   value: brlFromCents(D.month.revenueInCents), sub: `Mês anterior · ${brlFromCents(D.prevMonth.revenueInCents)}`, deltaDir: D.month.revenueInCents >= D.prevMonth.revenueInCents ? "up" : "down", series: D.month.series },
    { key: "today",      group: "hero",   name: "Vendas de hoje",   short: "Vendas hoje", value: brlFromCents(D.today.revenueInCents), sub: `Ontem · ${brlFromCents(D.yesterday.revenueInCents)}`, deltaDir: D.today.revenueInCents >= D.yesterday.revenueInCents ? "up" : "down", series: D.today.series },
    { key: "available",  group: "hero",   name: "Saldo disponível", short: "Saldo",      value: brlFromCents(D.available), sub: "Disponível para saque", deltaDir: null },
    { key: "pending",    group: "hero",   name: "A receber",        short: "A receber",  value: brlFromCents(D.pending), sub: "Receitas em processamento", deltaDir: null },
    { key: "revenue",    group: "metric", name: "Receita",          short: "Receita",    value: brlFromCents(D.active.revenueInCents), sub: D.revenueDeltaPct == null ? "Sem comparativo anterior" : `${fmtPct(D.revenueDeltaPct)} vs. período anterior`, deltaDir: D.revenueDeltaPct == null ? null : (D.revenueDeltaPct >= 0 ? "up" : "down"), series: D.active.series },
    { key: "sales",      group: "metric", name: "Vendas",           short: "Vendas",     value: String(D.active.paidOrders), sub: `${D.active.totalOrders} pedidos gerados no período`, deltaDir: null },
    { key: "conversion", group: "metric", name: "Conversão",        short: "Conversão",  value: `${D.active.conversionRatePct.toFixed(1)}%`, sub: "Taxa de checkout concluído", deltaDir: null },
    { key: "ticket",     group: "metric", name: "Ticket médio",     short: "Ticket",     value: brlFromCents(D.active.averageTicketInCents), sub: "Média por pedido aprovado", deltaDir: null },
  ];
}

/* ════════════════════════════════════════════════════════════════════════
   KLOEL · IA central — ações (Novo Chat/Buscar/Imagens/Recentes) + memória
   ════════════════════════════════════════════════════════════════════════ */
const KLOEL_ACTIONS = [
  { id: "kl-new-chat", label: "+ Novo Chat", action: "newChat" },
  { id: "kl-search",   label: "Buscar",      action: "search" },
  { id: "kl-images",   label: "Imagens",     action: "images" },
  { id: "kl-recents",  label: "Recentes",    action: "recents" },
];
function buildKloelNodesEdges(kloel) {
  const nodes = [], edges = [];
  for (const a of KLOEL_ACTIONS) {
    nodes.push({ id: a.id, type: "kloelAction", area: "kloel", label: a.label, parentId: "sun-kloel", tags: [], meta: { subtitle: `Kloel · ${a.label}`, action: a.action } });
    edges.push({ from: "sun-kloel", to: a.id, directed: true, kind: "attachment" });
  }
  for (const c of (kloel.conversations || [])) {
    const id = `klc-${c.id}`;
    nodes.push({ id, type: "kloelConversation", area: "kloel", label: c.title || "Conversa", parentId: "kl-recents", tags: [], meta: { subtitle: `${(c.messages || []).length} mensagens`, conversationId: c.id } });
    edges.push({ from: "kl-recents", to: id, directed: true, kind: "attachment" });
  }
  for (const img of (kloel.images || [])) {
    const id = `kli-${img.id}`;
    nodes.push({ id, type: "kloelImageAsset", area: "kloel", label: img.name || "imagem", parentId: "kl-images", tags: [], meta: { subtitle: img.source || "upload", imageId: img.id, url: img.url } });
    edges.push({ from: "kl-images", to: id, directed: true, kind: "attachment" });
    for (const nid of (img.linkedNodeIds || [])) edges.push({ from: id, to: nid, directed: false, kind: "channel-product" });
  }
  return { nodes, edges };
}

/* ════════════════════════════════════════════════════════════════════════
   BUILD DYNAMIC GRAPH · perfil + PRODUTOS (com sub-nós das 10 abas) + canais
   ════════════════════════════════════════════════════════════════════════ */
function buildGraph(products, channelsState, accountData, affiliate, wallet, educar, conversar, desempenho, kloel) {
  const nodes = [];
  const edges = [];

  // massas fixas
  for (const s of BASE_SUNS) nodes.push({ ...s, tags: [] });
  for (const b of STATIC_BRANCHES) nodes.push({ ...b, tags: [] });
  edges.push({ from: "sun-educar", to: "eu-aprender", directed: true, kind: "attachment" });
  edges.push({ from: "sun-educar", to: "eu-ensinar",  directed: true, kind: "attachment" });

  // canais (nós base)
  for (const k of CHANNEL_KEYS) {
    nodes.push({ id: `ch-${k}`, type: "channel", area: "conectar", label: CHANNEL_META[k].name, parentId: "sun-conectar", tags: [], meta: { provider: CHANNEL_META[k].provider, subtitle: CHANNEL_META[k].provider, channelKey: k } });
    edges.push({ from: "sun-conectar", to: `ch-${k}`, directed: true, kind: "attachment" });
  }

  // ── PRODUTOS · cada um com seus 10 sub-nós reais ──
  for (const p of products) {
    nodes.push({ id: p.id, type: "product", area: "criar", status: p.status, label: p.label, tags: p.tags, parentId: "sun-criar", meta: p.meta, editor: p.editor });
    edges.push({ from: "sun-criar", to: p.id, directed: true, kind: "attachment" });
    const sub = buildProductSubnodes(p);
    nodes.push(...sub.nodes);
    edges.push(...sub.edges);
  }

  // ── AFILIAR · marketplace + minhas afiliações + salvos ──
  if (affiliate) {
    const aff = buildAffiliateNodesEdges(affiliate);
    nodes.push(...aff.nodes);
    edges.push(...aff.edges);
  }

  // ── CARTEIRA · saldo + saques + antecipações + extrato ──
  if (wallet) {
    const wl = buildWalletNodesEdges(wallet);
    nodes.push(...wl.nodes);
    edges.push(...wl.edges);
  }

  // ── EDUCAR · áreas de membros sob "Ensinar" ──
  if (educar) {
    const ed2 = buildEducarNodesEdges(educar);
    nodes.push(...ed2.nodes);
    edges.push(...ed2.edges);
  }

  // ── CONVERSAR · inbox + CRM + contatos sob "Conversar" ──
  if (conversar) {
    const cv = buildConversarNodesEdges(conversar);
    nodes.push(...cv.nodes);
    edges.push(...cv.edges);
  }

  // cluster do perfil
  const prof = buildProfileNodesEdges(accountData);
  nodes.push(...prof.nodes);
  edges.push(...prof.edges);

  // ── DESEMPENHO · HOME viva: cada métrica vira um nó orbitando o núcleo Perfil,
  //    com valor recalculado pelo período ativo (default: hoje) ──
  if (desempenho) {
    nodes.push({ id: "desempenho", type: "desempenho", area: "perfil", label: "Dashboard", parentId: "core", tags: [], meta: { subtitle: `dashboard · ${desempenho.label}` } });
    edges.push({ from: "core", to: "desempenho", directed: true, kind: "attachment" });
    for (const c of desempenho.cards) {
      const id = `dz-${c.key}`;
      nodes.push({ id, type: "metric", area: "perfil", label: c.short, parentId: "desempenho", tags: [], meta: { subtitle: c.value, metricKey: c.key, deltaDir: c.deltaDir, group: c.group } });
      edges.push({ from: "desempenho", to: id, directed: true, kind: "attachment" });
    }
  }

  // ── KLOEL · IA central: ações + conversas + imagens como nós ──
  if (kloel) {
    const kg = buildKloelNodesEdges(kloel);
    nodes.push(...kg.nodes);
    edges.push(...kg.edges);
  }

  // canais conectados → arsenal + voz + edges p/ produtos
  for (const k of CHANNEL_KEYS) {
    const ch = channelsState[k];
    if (!ch?.connected) continue;
    const chNodeId = `ch-${k}`;
    for (const pid of ch.products || []) edges.push({ from: chNodeId, to: pid, directed: false, kind: "channel-product" });
    for (let i = 0; i < (ch.arsenal || 0); i++) {
      const proofId = `${chNodeId}-proof-${i}`;
      nodes.push({ id: proofId, type: "proof", area: "conectar", label: `prova ${i + 1}`, parentId: chNodeId, tags: [], meta: { subtitle: `arsenal de ${CHANNEL_META[k].name}`, channelKey: k } });
      edges.push({ from: chNodeId, to: proofId, directed: false, kind: "attachment" });
    }
    if (ch.voice) {
      const voiceId = `${chNodeId}-voice`;
      const tones = ["Sereno", "Equilibrado", "Caloroso"];
      const edgesK = ["Paciente", "Firme", "Incisivo"];
      nodes.push({ id: voiceId, type: "voice", area: "conectar", label: `voz · ${tones[ch.voice.tone]} · ${edgesK[ch.voice.edge]}`, parentId: chNodeId, tags: [], meta: { subtitle: `calibração · ${CHANNEL_META[k].name}`, voice: ch.voice, channelKey: k } });
      edges.push({ from: chNodeId, to: voiceId, directed: false, kind: "attachment" });
    }
  }
  return { nodes, edges };
}

const NODE_BASE_SIZE = {
  core: 11, sun: 9, branch: 6,
  product: 7.5, channel: 6.5, proof: 3.5, voice: 4,
  profileSection: 6, profileField: 4, doc: 4.5,
  teamMember: 4.5, appNode: 4.5,
  walletBranch: 6, walletItem: 4.5,
  memberArea: 5.5,
  convBranch: 6, conversation: 4.5, contact: 4.5, order: 4.5, adCampaign: 5,
  // desempenho (HOME viva)
  desempenho: 6.8, metric: 4.5,
  // kloel (IA central)
  kloelAction: 5.5, kloelConversation: 4, kloelImageAsset: 4.5,
  // 10 abas de produto
  p_dados: 4.5, p_planos: 5, p_checkouts: 5, p_urls: 4, p_comissao: 4.5,
  p_cupons: 4.5, p_campanhas: 4.5, p_avaliacoes: 4.5, p_afterpay: 4, p_ia: 5,
  // afiliar
  affBranch: 6, affProduct: 5, affPartner: 5,
};

const NODE_LABEL_KIND = {
  core: "perfil", sun: "interface", branch: "seção",
  product: "produto", channel: "canal", proof: "prova", voice: "voz",
  profileSection: "perfil", profileField: "dado", doc: "documento",
  teamMember: "membro", appNode: "integração",
  walletBranch: "carteira", walletItem: "movimentação",
  memberArea: "área de membros",
  convBranch: "conversar", conversation: "conversa", contact: "contato", order: "venda", adCampaign: "campanha",
  desempenho: "desempenho", metric: "métrica",
  kloelAction: "Kloel", kloelConversation: "conversa", kloelImageAsset: "imagem",
  p_dados: "dados gerais", p_planos: "planos", p_checkouts: "checkouts", p_urls: "urls",
  p_comissao: "comissão", p_cupons: "cupons", p_campanhas: "campanhas",
  p_avaliacoes: "avaliações", p_afterpay: "after pay", p_ia: "ia",
  affBranch: "afiliação", affProduct: "produto", affPartner: "parceiro",
};

/* ════════════════════════════════════════════════════════════════════════
   QUERIES, FILTERS, COLOR, LAYOUT, PHYSICS  (preservado do original)
   ════════════════════════════════════════════════════════════════════════ */
function matchQuery(node, query) {
  if (!query || !query.trim()) return false;
  const q = query.trim().toLowerCase();
  if (q.startsWith("type:")) return node.type === q.slice(5);
  if (q.startsWith("tag:")) return (node.tags || []).includes(q.slice(4));
  if (q.startsWith("area:")) return node.area === q.slice(5);
  return (node.label || "").toLowerCase().includes(q);
}

function isPrincipalForTab(node, tab) {
  const sun = TAB_SUN[tab];
  if (!sun) return false;
  return node.parentId === sun;
}

function docColor(status, C) {
  return status === "aprovado" ? C.green : status === "rejeitado" ? C.red : C.amber;
}

function colorForNode(node, groups, C, channels, tab, focusSet) {
  for (const g of groups) {
    if (!g.enabled) continue;
    if (matchQuery(node, g.query)) return g.color;
  }
  if (node.type === "doc") return docColor(node.meta?.status, C);
  if (node.type === "metric" && node.meta?.deltaDir) return node.meta.deltaDir === "up" ? C.green : C.red;
  if (node.type === "desempenho") return C.ember;
  if (node.id === TAB_SUN[tab]) return C.silver;
  if (focusSet) return focusSet.has(node.id) ? C.ember : C.dim;
  if (isPrincipalForTab(node, tab)) return C.ember;
  return C.dim;
}

function applyFilters(nodes, edges, filters) {
  let visible = new Set(nodes.map(n => n.id));
  if (!filters.showTags) nodes.forEach(n => { if (n.type === "tag") visible.delete(n.id); });
  if (!filters.showAttachments) {
    const ATTACH = [...PRODUCT_SUBNODE_TYPES, "proof", "voice", "profileField", "doc"];
    nodes.forEach(n => { if (ATTACH.includes(n.type)) visible.delete(n.id); });
  }
  if (filters.existingOnly) nodes.forEach(n => { if (n.type === "ghost") visible.delete(n.id); });
  if (filters.search?.trim()) {
    const matching = new Set();
    nodes.forEach(n => { if (matchQuery(n, filters.search)) matching.add(n.id); });
    nodes.forEach(n => { if (!matching.has(n.id) && n.id !== "core") visible.delete(n.id); });
  }
  let visibleEdges = edges.filter(e => visible.has(e.from) && visible.has(e.to));
  if (!filters.incomingLinks && !filters.outgoingLinks) visibleEdges = [];
  if (!filters.showOrphans) {
    const connected = new Set();
    visibleEdges.forEach(e => { connected.add(e.from); connected.add(e.to); });
    nodes.forEach(n => { if (!connected.has(n.id) && n.id !== "core") visible.delete(n.id); });
    visibleEdges = visibleEdges.filter(e => visible.has(e.from) && visible.has(e.to));
  }
  return { nodes: nodes.filter(n => visible.has(n.id)), edges: visibleEdges };
}

function computeLayout(nodes) {
  const result = new Map();
  const byId = new Map(nodes.map(n => [n.id, n]));
  const childrenMap = new Map();
  for (const n of nodes) {
    if (n.parentId && byId.has(n.parentId)) {
      if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []);
      childrenMap.get(n.parentId).push(n);
    }
  }
  const roots = nodes.filter(n => !n.parentId || !byId.has(n.parentId));
  const pad = (n) => (NODE_BASE_SIZE[n.type] || 4) + 22;
  const info = new Map();
  function subtreeRadius(n) {
    const kids = childrenMap.get(n.id) || [];
    if (!kids.length) return pad(n);
    const childRs = kids.map(subtreeRadius);
    const maxCr = Math.max(...childRs);
    let orbit = pad(n) + maxCr;
    for (let it = 0; it < 80; it++) {
      let sum = 0;
      for (const cr of childRs) sum += 2 * Math.asin(Math.min(0.999, cr / orbit));
      if (sum <= Math.PI * 2 * 0.86) break;
      orbit *= 1.07;
    }
    info.set(n.id, { orbit, childRs, kids });
    return orbit + maxCr;
  }
  function place(node, x, y, startAngle) {
    result.set(node.id, { x, y });
    const it = info.get(node.id);
    if (!it) return;
    const { orbit, childRs, kids } = it;
    const widths = childRs.map(cr => 2 * Math.asin(Math.min(0.999, cr / orbit)));
    const totalW = widths.reduce((a, b) => a + b, 0);
    const gap = (Math.PI * 2 - totalW) / kids.length;
    let ang = startAngle;
    for (let i = 0; i < kids.length; i++) {
      const center = ang + widths[i] / 2;
      place(kids[i], x + Math.cos(center) * orbit, y + Math.sin(center) * orbit, center + Math.PI);
      ang += widths[i] + gap;
    }
  }
  const rootRs = roots.map(subtreeRadius);
  if (roots.length === 1) place(roots[0], 0, 0, -Math.PI / 2);
  else if (roots.length > 1) {
    const maxR = Math.max(...rootRs);
    let orbit = maxR * 1.3;
    for (let it = 0; it < 80; it++) {
      let sum = 0;
      for (const rr of rootRs) sum += 2 * Math.asin(Math.min(0.999, rr / orbit));
      if (sum <= Math.PI * 2 * 0.82) break;
      orbit *= 1.05;
    }
    const widths = rootRs.map(rr => 2 * Math.asin(Math.min(0.999, rr / orbit)));
    const totalW = widths.reduce((a, b) => a + b, 0);
    const gap = (Math.PI * 2 - totalW) / roots.length;
    let ang = -Math.PI / 2;
    for (let i = 0; i < roots.length; i++) {
      const center = ang + widths[i] / 2;
      place(roots[i], Math.cos(center) * orbit, Math.sin(center) * orbit, center + Math.PI);
      ang += widths[i] + gap;
    }
  }
  return result;
}

const SUN_OF_AREA = { perfil: "core", kloel: "sun-kloel", criar: "sun-criar", afiliar: "sun-afiliar", educar: "sun-educar", conectar: "sun-conectar", carteira: "sun-carteira" };
const GALAXY_RADIUS = { perfil: 240, kloel: 220, criar: 340, afiliar: 260, educar: 200, conectar: 300, carteira: 170 };

function computeGalaxyAnchors(nodes) {
  const ids = new Set(nodes.map(n => n.id));
  const galaxies = Object.entries(SUN_OF_AREA)
    .filter(([area, sunId]) => ids.has(sunId))
    .map(([area, sunId]) => ({ sunId, r: GALAXY_RADIUS[area] || 120 }));
  const result = new Map();
  if (!galaxies.length) return result;
  if (galaxies.length === 1) { result.set(galaxies[0].sunId, { x: 0, y: 0 }); return result; }
  const MARGIN = 70;
  const eff = galaxies.map(g => g.r + MARGIN);
  const maxR = Math.max(...eff);
  let orbit = maxR * 1.15 + 90;
  for (let it = 0; it < 90; it++) {
    let sum = 0;
    for (const r of eff) sum += 2 * Math.asin(Math.min(0.999, r / orbit));
    if (sum <= Math.PI * 2 * 0.92) break;
    orbit *= 1.04;
  }
  const widths = eff.map(r => 2 * Math.asin(Math.min(0.999, r / orbit)));
  const totalW = widths.reduce((a, b) => a + b, 0);
  const gap = (Math.PI * 2 - totalW) / galaxies.length;
  let ang = -Math.PI / 2;
  for (let i = 0; i < galaxies.length; i++) {
    const c = ang + widths[i] / 2;
    result.set(galaxies[i].sunId, { x: Math.cos(c) * orbit, y: Math.sin(c) * orbit });
    ang += widths[i] + gap;
  }
  return result;
}

function nodeRadius(node, degreeMap, nodeSize = 1) {
  const deg = degreeMap.get(node.id) || 1;
  return (NODE_BASE_SIZE[node.type] + Math.sqrt(deg) * 0.8) * nodeSize;
}

function physicsTick(nodes, edges, forces, alpha, degreeMap) {
  const REPULSION = forces.repelForce;
  const LINK_DISTANCE = forces.linkDistance;
  const LINK_FORCE = forces.linkForce;
  const CENTER = forces.centerForce;
  const VELOCITY_DECAY = 0.6;
  const n = nodes.length;
  const idMap = new Map(nodes.map(nd => [nd.id, nd]));
  const deg = (id) => degreeMap.get(id) || 1;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    if (a.fixed || a.dragging) continue;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = nodes[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy; if (d2 < 1) d2 = 1;
      const f = (REPULSION / d2) * alpha;
      a.vx += dx * f; a.vy += dy * f;
    }
  }
  for (const e of edges) {
    const a = idMap.get(e.from), b = idMap.get(e.to);
    if (!a || !b) continue;
    const ca = deg(e.from), cb = deg(e.to);
    const strength = LINK_FORCE * (1 / Math.min(ca, cb));
    const bias = ca / (ca + cb);
    let dx = (b.x + b.vx) - (a.x + a.vx);
    let dy = (b.y + b.vy) - (a.y + a.vy);
    let d = Math.sqrt(dx * dx + dy * dy) || 1;
    const l = (d - LINK_DISTANCE) / d * alpha * strength;
    dx *= l; dy *= l;
    if (!b.fixed && !b.dragging) { b.vx -= dx * bias;       b.vy -= dy * bias; }
    if (!a.fixed && !a.dragging) { a.vx += dx * (1 - bias); a.vy += dy * (1 - bias); }
  }
  if (CENTER) {
    for (const node of nodes) {
      if (node.fixed || node.dragging) continue;
      node.vx += (0 - node.x) * CENTER * alpha;
      node.vy += (0 - node.y) * CENTER * alpha;
    }
  }
  for (const node of nodes) {
    if (node.fixed || node.dragging) continue;
    node.vx *= VELOCITY_DECAY;
    node.vy *= VELOCITY_DECAY;
    node.x += node.vx;
    node.y += node.vy;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      const ra = nodeRadius(a, degreeMap);
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        const rb = nodeRadius(b, degreeMap);
        const minD = ra + rb + 8;
        const dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        if (d < minD) {
          const push = (minD - d) / 2;
          const ux = dx / d, uy = dy / d;
          const aMov = !a.fixed && !a.dragging, bMov = !b.fixed && !b.dragging;
          if (aMov && bMov) {
            a.x -= ux * push; a.y -= uy * push;
            b.x += ux * push; b.y += uy * push;
          } else if (aMov) { a.x -= ux * push * 2; a.y -= uy * push * 2; }
          else if (bMov) { b.x += ux * push * 2; b.y += uy * push * 2; }
        }
      }
    }
  }
}

const defaultSettings = (C) => ({
  filters: { search: "", showTags: true, showAttachments: true, existingOnly: false, showOrphans: true, incomingLinks: true, outgoingLinks: true },
  groups: [],
  display: { arrows: false, textFade: 0.55, nodeSize: 1, linkThickness: 1 },
  forces: { centerForce: 0, repelForce: 300, linkForce: 1.2, linkDistance: 50 },
});

const DEFAULT_CHANNELS = Object.fromEntries(
  CHANNEL_KEYS.map(k => [k, { connected: false, products: [], arsenal: 0, voice: null }])
);

/* ════════════════════════════════════════════════════════════════════════
   ÍCONES
   ════════════════════════════════════════════════════════════════════════ */
const Icon = {
  plus: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  x: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  edit: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>,
  trash: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>,
  cog: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  search: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  chevron: (s=14, dir="down") => {
    const points = dir === "down" ? "6 9 12 15 18 9" : dir === "up" ? "18 15 12 9 6 15" : dir === "right" ? "9 18 15 12 9 6" : "15 18 9 12 15 6";
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points={points}/></svg>;
  },
  sun: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></svg>,
  moon: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  upload: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  arrow: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  back: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  check: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  refresh: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><polyline points="21 3 21 8 16 8"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><polyline points="3 21 3 16 8 16"/></svg>,
  copy: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  tag: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  bolt: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  star: (s=14, fill="none") => <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  card: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
  pix: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 22 12 12 22 2 12z"/></svg>,
  users: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  megaphone: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>,
  link: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  layers: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  user:    (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7" r="3.5"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/></svg>,
  doc:     (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>,
  bank:    (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h18"/><path d="M5 10v9"/><path d="M9 10v9"/><path d="M15 10v9"/><path d="M19 10v9"/><path d="M2.5 19.5h19"/><path d="M4 7l8-4 8 4"/></svg>,
  shield:  (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>,
  alert:   (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.8 1.8 18.3A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.7L13.7 3.8a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>,
  calendar:(s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 10h16"/></svg>,
  clock:   (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  logout:  (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>,
  play:    (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  pause:   (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  box:     (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
};

/* ════════════════════════════════════════════════════════════════════════
   PRIMITIVAS
   ════════════════════════════════════════════════════════════════════════ */
function Tag({ children, color, weight }) {
  const { C } = useTheme();
  return <span style={{ fontFamily: MONO, fontSize: 10, color: color || C.muted, fontWeight: weight || 500, letterSpacing: 2, textTransform: "uppercase" }}>{children}</span>;
}

function CTA({ children, onClick, variant = "ember", small, disabled, fullWidth }) {
  const { C } = useTheme();
  const v = {
    ember:  { bg: C.ember,  color: "#fff",  border: "none", hover: C.emberHi },
    silver: { bg: C.silver, color: C.void,  border: "none", hover: C.silver },
    line:   { bg: "transparent", color: C.silver, border: `1px solid ${C.border}`, hover: C.silver },
    ghost:  { bg: "transparent", color: C.muted, border: "none", hover: "transparent" },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: v.bg, color: v.color, border: v.border, width: fullWidth ? "100%" : "auto",
      height: small ? 32 : 40, padding: small ? "0 14px" : "0 20px", fontSize: small ? 11.5 : 13,
      fontFamily: FONT, fontWeight: 500, borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.35 : 1, outline: "none", transition: "all .15s ease",
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    }}
    onMouseEnter={e => { if (disabled) return; if (variant === "ember") e.currentTarget.style.background = v.hover; if (variant === "line") e.currentTarget.style.borderColor = v.hover; if (variant === "ghost") e.currentTarget.style.color = C.silver; }}
    onMouseLeave={e => { if (disabled) return; if (variant === "ember") e.currentTarget.style.background = v.bg; if (variant === "line") e.currentTarget.style.borderColor = C.border; if (variant === "ghost") e.currentTarget.style.color = v.color; }}>
      {children}
    </button>
  );
}

function Section({ title, defaultOpen = true, children }) {
  const { C } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: `1px solid ${C.divider}` }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", padding: "14px 20px", background: "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: C.silver }}>
        <Tag color={C.silver} weight={600}>{title}</Tag>
        <span style={{ color: C.dim, display: "flex", transition: "transform .15s ease", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>{Icon.chevron(12, "down")}</span>
      </button>
      {open && <div style={{ padding: "0 20px 18px", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>}
    </div>
  );
}

function Toggle({ label, value, onChange, desc }) {
  const { C } = useTheme();
  return (
    <label style={{ display: "flex", alignItems: desc ? "flex-start" : "center", justifyContent: "space-between", cursor: "pointer", padding: "4px 0", gap: 12 }}>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontFamily: FONT, fontSize: 12.5, color: C.text }}>{label}</span>
        {desc && <span style={{ fontFamily: FONT, fontSize: 10.5, color: C.dim, lineHeight: 1.4 }}>{desc}</span>}
      </span>
      <span onClick={() => onChange(!value)} style={{ width: 32, height: 18, borderRadius: 99, position: "relative", background: value ? C.ember : C.faint, transition: "background .15s ease", cursor: "pointer", flexShrink: 0, marginTop: desc ? 2 : 0 }}>
        <span style={{ position: "absolute", top: 2, left: value ? 16 : 2, width: 14, height: 14, borderRadius: 99, background: C.paper, transition: "left .15s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
      </span>
    </label>
  );
}

function Slider({ label, value, min, max, step, onChange, format }) {
  const { C } = useTheme();
  const pctv = ((value - min) / (max - min)) * 100;
  const fmt = format || (v => v.toFixed(step < 1 ? 2 : 0));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontFamily: FONT, fontSize: 12.5, color: C.text }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted, letterSpacing: 0.5 }}>{fmt(value)}</span>
      </div>
      <div style={{ position: "relative", height: 18, display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: C.faint, borderRadius: 99 }} />
        <div style={{ position: "absolute", left: 0, height: 2, background: C.ember, borderRadius: 99, width: `${pctv}%` }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, width: "100%", margin: 0, opacity: 0, cursor: "pointer" }} />
        <div style={{ position: "absolute", left: `calc(${pctv}% - 6px)`, width: 12, height: 12, borderRadius: 99, background: C.ember, border: `2px solid ${C.paper}`, boxShadow: `0 0 0 1px ${C.border}`, pointerEvents: "none" }} />
      </div>
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }) {
  const { C } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: C.paper, border: `1px solid ${focus ? C.silver : C.border}`, borderRadius: 6, transition: "border-color .15s ease" }}>
      <span style={{ color: focus ? C.silver : C.dim, display: "flex" }}>{Icon.search(12)}</span>
      <input value={value} onChange={e => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} placeholder={placeholder} style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: FONT, fontSize: 12, color: C.text, padding: 0 }} />
      {value && <button onClick={() => onChange("")} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, color: C.dim, display: "flex" }}>{Icon.x(11)}</button>}
    </div>
  );
}

function GroupRow({ group, onChange, onDelete }) {
  const { C } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const colors = [C.ember, C.amber, C.green, C.blue, C.purple, C.rose, C.silver, C.muted];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
      <div style={{ position: "relative" }}>
        <button onClick={() => setPickerOpen(!pickerOpen)} style={{ width: 18, height: 18, borderRadius: 99, background: group.color, border: `2px solid ${C.paper}`, boxShadow: `0 0 0 1px ${C.border}`, cursor: "pointer", padding: 0 }} />
        {pickerOpen && (
          <div style={{ position: "absolute", top: 24, left: 0, zIndex: 100, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
            {colors.map(c => <button key={c} onClick={() => { onChange({ ...group, color: c }); setPickerOpen(false); }} style={{ width: 18, height: 18, borderRadius: 99, background: c, border: c === group.color ? `2px solid ${C.silver}` : `2px solid ${C.paper}`, boxShadow: `0 0 0 1px ${C.border}`, cursor: "pointer", padding: 0 }} />)}
          </div>
        )}
      </div>
      <input value={group.query} onChange={e => onChange({ ...group, query: e.target.value })} placeholder="type:product" style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 4, outline: "none", padding: "5px 8px", fontFamily: MONO, fontSize: 10.5, color: C.text, background: C.paper, letterSpacing: 0.3 }} />
      <button onClick={onDelete} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.dim, display: "flex" }} onMouseEnter={e => e.currentTarget.style.color = C.emberHi} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.x(13)}</button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   FORM PRIMITIVES · usadas pelos painéis ricos (compartilhadas)
   ════════════════════════════════════════════════════════════════════════ */
function Field({ label, value, onChange, placeholder, mono, type = "text", suffix, half, disabled, children }) {
  const { C } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ flex: half ? 1 : "none", width: half ? "auto" : "100%", minWidth: 0 }}>
      <label style={{ display: "block", marginBottom: 6, fontFamily: MONO, fontSize: 9.5, color: C.muted, fontWeight: 500, letterSpacing: 1.4, textTransform: "uppercase" }}>{label}</label>
      {children ? children : (
        <div style={{ position: "relative" }}>
          <input value={value ?? ""} type={type} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} disabled={disabled} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
            style={{ width: "100%", height: 36, padding: suffix ? "0 34px 0 11px" : "0 11px", border: `1px solid ${focus ? C.silver : C.border}`, borderRadius: 6, background: disabled ? C.raised : C.paper, color: disabled ? C.muted : C.text, fontFamily: mono ? MONO : FONT, fontSize: mono ? 12 : 12.5, outline: "none", boxSizing: "border-box", transition: "border-color .15s ease" }} />
          {suffix && <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", color: C.dim, display: "flex", pointerEvents: "none" }}>{suffix}</span>}
        </div>
      )}
    </div>
  );
}
function TextArea({ label, value, onChange, placeholder, rows = 3 }) {
  const { C } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ width: "100%" }}>
      <label style={{ display: "block", marginBottom: 6, fontFamily: MONO, fontSize: 9.5, color: C.muted, fontWeight: 500, letterSpacing: 1.4, textTransform: "uppercase" }}>{label}</label>
      <textarea value={value ?? ""} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} rows={rows} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ width: "100%", padding: "9px 11px", border: `1px solid ${focus ? C.silver : C.border}`, borderRadius: 6, background: C.paper, color: C.text, fontFamily: FONT, fontSize: 12.5, outline: "none", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5, transition: "border-color .15s ease" }} />
    </div>
  );
}
function SelectField({ label, value, onChange, options, half }) {
  const { C } = useTheme();
  return (
    <div style={{ flex: half ? 1 : "none", width: half ? "auto" : "100%", minWidth: 0 }}>
      <label style={{ display: "block", marginBottom: 6, fontFamily: MONO, fontSize: 9.5, color: C.muted, fontWeight: 500, letterSpacing: 1.4, textTransform: "uppercase" }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", height: 36, padding: "0 11px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.paper, color: C.text, fontFamily: FONT, fontSize: 12.5, outline: "none", cursor: "pointer", boxSizing: "border-box" }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
function Row({ children }) { return <div style={{ display: "flex", gap: 10, width: "100%" }}>{children}</div>; }
function PanelDivider() { const { C } = useTheme(); return <div style={{ height: 1, background: C.divider, margin: "16px 0" }} />; }
function PanelRow({ label, value, sub, color }) {
  const { C } = useTheme();
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Tag color={C.dim}>{label}</Tag>
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: color || C.silver, fontWeight: 500 }}>{value}</span>
      </div>
      {sub && <div style={{ marginTop: 4 }}><span style={{ fontFamily: FONT, fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{sub}</span></div>}
    </div>
  );
}
function PanelDescription({ children }) { const { C } = useTheme(); return <p style={{ margin: 0, fontFamily: FONT, fontSize: 13, color: C.text, lineHeight: 1.6, fontWeight: 300 }}>{children}</p>; }
function SubTitle({ children, right }) {
  const { C } = useTheme();
  return (
    <div style={{ marginTop: 18, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
      <Tag color={C.silver} weight={600}>{children}</Tag>
      <div style={{ flex: 1, height: 1, background: C.divider }} />
      {right}
    </div>
  );
}
function Pill({ children, color, bg, border }) {
  const { C } = useTheme();
  return <span style={{ padding: "3px 9px", borderRadius: 99, background: bg || C.emberSoft, border: `1px solid ${border || C.emberBorder}`, fontFamily: MONO, fontSize: 10, color: color || C.ember, letterSpacing: 1, whiteSpace: "nowrap" }}>{children}</span>;
}
function EmptyState({ children }) {
  const { C } = useTheme();
  return <div style={{ padding: "28px 20px", textAlign: "center", border: `1px dashed ${C.border}`, borderRadius: 8 }}><span style={{ fontFamily: FONT, fontSize: 12.5, color: C.dim, fontStyle: "italic" }}>{children}</span></div>;
}
function SavedFlash({ saved }) {
  const { C } = useTheme();
  if (!saved) return null;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 10, color: C.green, letterSpacing: 1 }}>{Icon.check(11)} salvo</span>;
}
function Banner({ tone = "info", icon, children }) {
  const { C } = useTheme();
  const tones = {
    info:    { bg: "rgba(63,111,182,0.06)",  border: "rgba(63,111,182,0.18)", color: C.blue },
    warning: { bg: "rgba(184,136,76,0.07)",  border: "rgba(184,136,76,0.20)", color: C.amber },
    success: { bg: "rgba(45,157,94,0.06)",   border: "rgba(45,157,94,0.20)",  color: C.green },
    ember:   { bg: C.emberSoft,              border: C.emberBorder,            color: C.ember },
  }[tone];
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 13px", background: tones.bg, border: `1px solid ${tones.border}`, borderRadius: 6 }}>
      {icon && <span style={{ color: tones.color, display: "flex", marginTop: 1, flexShrink: 0 }}>{icon}</span>}
      <div style={{ flex: 1, fontFamily: FONT, fontSize: 11.5, color: C.text, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   PRODUCT TAB PANELS · lógica REAL do ProductNerveCenter, painel por painel
   Cada painel recebe (ed, patch) onde ed=editor do produto, patch atualiza.
   ════════════════════════════════════════════════════════════════════════ */

/* ── DADOS GERAIS ── */
function TabDados({ ed, patch, product }) {
  const { C } = useTheme();
  const d = ed.dados;
  const set = (k, v) => patch(e => ({ ...e, dados: { ...e.dados, [k]: v } }));
  const isPhysical = d.format !== "DIGITAL";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      <Field label="nome do produto" value={d.name} onChange={v => set("name", v)} placeholder="GHK-Cu Sérum" />
      <Row>
        <SelectField half label="categoria" value={d.category} onChange={v => set("category", v)} options={PRODUCT_CATEGORIES} />
        <SelectField half label="status" value={d.status} onChange={v => set("status", v)} options={[
          { value: "draft", label: "Rascunho" }, { value: "analysis", label: "Em análise" }, { value: "active", label: "Ativo" }, { value: "paused", label: "Pausado" },
        ]} />
      </Row>
      <Row>
        <SelectField half label="formato" value={d.format || "PHYSICAL"} onChange={v => set("format", v)} options={[["PHYSICAL", "Físico"], ["DIGITAL", "Digital"], ["HYBRID", "Híbrido"]].map(([value, label]) => ({ value, label }))} />
        <Field half label="SKU" value={d.sku || ""} onChange={v => set("sku", v)} placeholder="opcional" mono />
      </Row>
      <TextArea label="descrição" value={d.description} onChange={v => set("description", v)} placeholder="Descreva o produto..." rows={4} />
      <Field label="slug (URL)" value={d.slug} onChange={v => set("slug", v)} placeholder="ghk-cu" mono />
      <PhotoUpload label="imagem do produto" value={d.coverUrl || ""} onChange={v => set("coverUrl", v)} />

      <SubTitle>estoque</SubTitle>
      <Toggle label="Controlar estoque" value={d.trackStock === true} onChange={v => set("trackStock", v)} desc="Reduz a cada venda; pausa ao zerar" />
      {d.trackStock && <Field label="quantidade em estoque" value={String(d.stockQuantity ?? "")} onChange={v => set("stockQuantity", parseInt(v) || 0)} mono type="number" />}

      <SubTitle>páginas pós-compra</SubTitle>
      <Field label="página de vendas" value={d.salesPageUrl || ""} onChange={v => set("salesPageUrl", v)} mono placeholder="https://..." />
      <Field label="obrigado (cartão)" value={d.thankyouUrl || ""} onChange={v => set("thankyouUrl", v)} mono placeholder="https://..." />
      <Row>
        <Field half label="obrigado (PIX)" value={d.thankyouPixUrl || ""} onChange={v => set("thankyouPixUrl", v)} mono />
        <Field half label="obrigado (boleto)" value={d.thankyouBoletoUrl || ""} onChange={v => set("thankyouBoletoUrl", v)} mono />
      </Row>
      <Row>
        <Field half label="Reclame Aqui (URL)" value={d.reclameAquiUrl || ""} onChange={v => set("reclameAquiUrl", v)} mono />
        <Field half label="e-mail de suporte" value={d.supportEmail || ""} onChange={v => set("supportEmail", v)} mono />
      </Row>
      <Field label="dias de garantia" value={String(d.warrantyDays ?? 7)} onChange={v => set("warrantyDays", parseInt(v) || 0)} mono type="number" suffix="dias" />

      {isPhysical && <>
        <SubTitle>frete (produto)</SubTitle>
        <SelectField label="tipo de frete" value={d.shippingType || "NONE"} onChange={v => set("shippingType", v)} options={[["NONE", "Sem frete"], ["FREE", "Grátis"], ["FIXED", "Fixo"], ["VARIABLE", "Variável"]].map(([value, label]) => ({ value, label }))} />
        {d.shippingType === "FIXED" && <Field label="valor do frete (R$)" value={String(d.shippingValue ?? "")} onChange={v => set("shippingValue", parseFloat(v) || 0)} mono />}
        {(d.shippingType === "VARIABLE" || d.shippingType === "FIXED") && <Field label="CEP de origem" value={d.originCep || ""} onChange={v => set("originCep", v)} mono />}
      </>}

      <Banner tone="ember" icon={Icon.bolt(13)}>Estes dados alimentam todos os checkouts, a IA de vendas e a página pública do produto.</Banner>
    </div>
  );
}

/* ── PLANOS ── (lista + detalhe com 5 sub-abas; criação/edição reais) */
function TabPlanos({ ed, patch }) {
  const { C } = useTheme();
  const [sel, setSel] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const setPlans = (fn) => patch(e => ({ ...e, plans: fn(e.plans) }));

  const create = () => {
    if (!name.trim()) return;
    const id = `pl-${Date.now()}`;
    setPlans(plans => [...plans, { id, name: name.trim(), priceInCents: Math.round(parseFloat(price.replace(",", ".") || "0") * 100), quantity: 1, maxInstallments: 12, isActive: true, salesCount: 0, visibleToAffiliates: true, freeShipping: false, referenceCode: name.trim().slice(0, 6).toUpperCase(), planLinks: [] }]);
    setName(""); setPrice(""); setCreating(false);
  };
  const dup = (pl) => setPlans(plans => [...plans, { ...pl, id: `pl-${Date.now()}`, name: `${pl.name} (cópia)`, salesCount: 0 }]);
  const del = (id) => { setPlans(plans => plans.filter(p => p.id !== id)); if (sel === id) setSel(null); };

  if (sel) {
    const pl = ed.plans.find(p => p.id === sel);
    if (pl) return <PlanDetail pl={pl} setPlans={setPlans} ed={ed} patch={patch} onBack={() => setSel(null)} />;
  }

  return (
    <div>
      <SubTitle right={<CTA small variant="ember" onClick={() => setCreating(c => !c)}>{Icon.plus(11)} plano</CTA>}>planos cadastrados</SubTitle>
      {creating && (
        <div style={{ padding: 14, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="nome do plano" value={name} onChange={setName} placeholder="Plano único" />
          <Field label="preço (R$)" value={price} onChange={setPrice} placeholder="197,00" mono />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <CTA small variant="ghost" onClick={() => setCreating(false)}>cancelar</CTA>
            <CTA small variant="ember" onClick={create} disabled={!name.trim()}>criar</CTA>
          </div>
        </div>
      )}
      {ed.plans.length === 0 ? <EmptyState>Nenhum plano cadastrado</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ed.plans.map(raw => {
            const pl = planView(raw);
            return (
              <div key={pl.id} onClick={() => setSel(pl.id)} style={{ padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", transition: "border-color .15s ease" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.ember} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontFamily: FONT, fontSize: 13, color: C.silver, fontWeight: 500, flex: 1 }}>{pl.name}</span>
                  <Pill color={pl.active ? C.green : C.dim} bg={C.raised} border={C.divider}>{pl.active ? "ATIVO" : "OFF"}</Pill>
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: C.ember, fontWeight: 600 }}>{brl(pl.price)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.dim }}>{pl.inst}× · {pl.sales} vendas · {pl.ref}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlanDetail({ pl, setPlans, ed, patch, onBack }) {
  const { C } = useTheme();
  const [subtab, setSubtab] = useState("Pagamento");
  const v = planView(pl);
  const update = (k, val) => setPlans(plans => plans.map(p => p.id === pl.id ? { ...p, [k]: val } : p));
  return (
    <div>
      <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 12, marginBottom: 12, padding: 0 }}>{Icon.back(13)} planos</button>
      <h3 style={{ fontFamily: FONT, fontWeight: 400, fontSize: 18, color: C.silver, margin: "0 0 14px" }}>{v.name}</h3>
      <div style={{ display: "flex", gap: 3, padding: 3, background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 7, marginBottom: 16, overflowX: "auto" }} className="hide-scrollbar">
        {PLAN_DETAIL_SUBTABS.map(s => (
          <button key={s} onClick={() => setSubtab(s)} style={{ flex: "1 0 auto", height: 30, padding: "0 12px", border: "none", background: subtab === s ? C.paper : "transparent", color: subtab === s ? C.silver : C.muted, fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", borderRadius: 5, cursor: "pointer", whiteSpace: "nowrap", boxShadow: subtab === s ? `0 0 0 1px ${C.border}` : "none" }}>{s}</button>
        ))}
      </div>
      {subtab === "Loja" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Toggle label="Disponível para venda?" value={pl.isActive !== false} onChange={val => update("isActive", val)} desc="Plano disponível para compra" />
          <Field label="nome exibido na loja" value={pl.name} onChange={val => update("name", val)} />
          <Field label="código de referência" value={pl.referenceCode} onChange={val => update("referenceCode", val)} mono />
          <PhotoUpload label="foto do plano" value={pl.photoUrl || ""} onChange={val => update("photoUrl", val)} />
          <Row>
            <Field half label="valor (R$)" value={(pl.priceInCents / 100).toFixed(2)} onChange={val => update("priceInCents", Math.round(parseFloat(val.replace(",", ".") || "0") * 100))} mono />
            <Field half label="qtd itens" value={String(pl.quantity || 1)} onChange={val => update("quantity", parseInt(val) || 1)} mono type="number" />
          </Row>
          <Banner tone="info" icon={Icon.card(13)}>Checkout público gerado pelo Kloel — vincule um checkout (aba Checkouts) para gerar o link.</Banner>
        </div>
      )}
      {subtab === "Pagamento" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="preço (R$)" value={(pl.priceInCents / 100).toFixed(2)} onChange={val => update("priceInCents", Math.round(parseFloat(val.replace(",", ".") || "0") * 100))} mono />
          <Field label="preço 'de' / riscado (R$)" value={pl.compareAtPrice ? (pl.compareAtPrice / 100).toFixed(2) : ""} onChange={val => update("compareAtPrice", val ? Math.round(parseFloat(val.replace(",", ".")) * 100) : null)} mono placeholder="opcional" />
          <SelectField label="tipo de cobrança" value={pl.billingType || "ONE_TIME"} onChange={val => update("billingType", val)} options={[["ONE_TIME", "Único"], ["RECURRING", "Recorrente"], ["FREE", "Gratuito"]].map(([value, label]) => ({ value, label }))} />
          {pl.billingType === "RECURRING" && <>
            <SelectField label="intervalo de recorrência" value={pl.recurringInterval || "MONTHLY"} onChange={val => update("recurringInterval", val)} options={[["WEEKLY", "Semanal"], ["BIWEEKLY", "Quinzenal"], ["MONTHLY", "Mensal"], ["QUARTERLY", "Trimestral"], ["SEMIANNUAL", "Semestral"], ["ANNUAL", "Anual"]].map(([value, label]) => ({ value, label }))} />
            <Toggle label="Período de teste (trial)" value={pl.trialEnabled === true} onChange={val => update("trialEnabled", val)} />
            {pl.trialEnabled && <Row><Field half label="dias de trial" value={String(pl.trialDays ?? 7)} onChange={val => update("trialDays", parseInt(val) || 0)} mono type="number" /><Field half label="preço do trial (R$)" value={pl.trialPrice ? (pl.trialPrice / 100).toFixed(2) : ""} onChange={val => update("trialPrice", val ? Math.round(parseFloat(val.replace(",", ".")) * 100) : null)} mono /></Row>}
          </>}
          <Row>
            <Field half label="parcelas máx." value={String(pl.maxInstallments || 1)} onChange={val => update("maxInstallments", parseInt(val) || 1)} mono type="number" />
            <Field half label="sem juros até" value={String(pl.maxNoInterest || 1)} onChange={val => update("maxNoInterest", parseInt(val) || 1)} mono type="number" />
          </Row>
          <Row>
            <Field half label="quantidade" value={String(pl.quantity || 1)} onChange={val => update("quantity", parseInt(val) || 1)} mono type="number" />
            <Field half label="itens por plano" value={String(pl.itemsPerPlan || 1)} onChange={val => update("itemsPerPlan", parseInt(val) || 1)} mono type="number" />
          </Row>
          <Toggle label="Repassar juros do parcelamento" value={pl.installmentsFee === true} onChange={val => update("installmentsFee", val)} />
          <Toggle label="Desconto por forma de pagamento" value={pl.discountByPayment === true} onChange={val => update("discountByPayment", val)} desc="Ex: desconto extra no PIX" />
        </div>
      )}
      {subtab === "Frete" && (() => {
        const st = pl.shippingType || (pl.freeShipping ? "FREE" : "FREE");
        const setSt = (v) => { update("shippingType", v); update("freeShipping", v === "FREE"); };
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SelectField label="tipo de frete" value={st} onChange={setSt} options={[["FREE", "Frete grátis"], ["FIXED", "Frete fixo"], ["VARIABLE", "Frete variável"]].map(([value, label]) => ({ value, label }))} />
            {st === "FIXED" && <Field label="valor do frete (R$)" value={pl.shippingPrice != null ? (pl.shippingPrice / 100).toFixed(2) : ""} onChange={val => update("shippingPrice", val ? Math.round(parseFloat(val.replace(",", ".")) * 100) : null)} mono placeholder="0,00" />}
            {st === "VARIABLE" && <Field label="CEP de origem" value={pl.originCep || ""} onChange={val => update("originCep", val)} mono placeholder="00000-000" />}
            <div style={{ padding: "11px 13px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8 }}>
              <Tag color={C.muted} weight={600}>política atual</Tag>
              <div style={{ fontFamily: FONT, fontSize: 12, color: C.text, marginTop: 6 }}>{st === "FREE" ? "Este plano opera com frete grátis." : st === "FIXED" ? `Frete fixo de ${pl.shippingPrice != null ? brl(pl.shippingPrice) : "R$ 0,00"}.` : "Frete variável calculado por CEP de origem e peso."}</div>
            </div>
          </div>
        );
      })()}
      {subtab === "Afiliação" && (() => {
        const basePct = ed?.commission?.commissionPercent || 0;
        const pctEff = pl.customCommission ? (pl.customCommissionPercent ?? basePct) : basePct;
        const proj = (n) => brl(Math.round(pl.priceInCents * (pctEff / 100)) * n);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Toggle label="Plano visível para afiliados?" value={pl.visibleToAffiliates !== false} onChange={val => update("visibleToAffiliates", val)} desc="Plano aparece no marketplace de afiliados" />
            <Toggle label="Comissão personalizada?" value={pl.customCommission === true} onChange={val => update("customCommission", val)} desc="Sobrescreve a comissão padrão do produto" />
            {pl.customCommission && <Field label="comissão deste plano (%)" value={String(pl.customCommissionPercent ?? basePct)} onChange={val => update("customCommissionPercent", Math.max(0, Math.min(100, parseInt(val) || 0)))} mono type="number" />}
            <div style={{ padding: "12px 13px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8 }}>
              <Tag color={C.muted} weight={600}>projeção de comissão · {pctEff}%</Tag>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                {[["10 vendas", 10], ["50 vendas", 50], ["100 vendas", 100]].map(([l, n]) => (
                  <div key={n} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontFamily: MONO, fontSize: 13, color: C.ember, fontWeight: 700 }}>{proj(n)}</div>
                    <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
      {subtab === "Order Bump" && (() => {
        const bumps = pl.orderBumps || [];
        const setBumps = (fn) => update("orderBumps", fn(bumps));
        const addBump = () => setBumps(b => [...b, { id: `ob-${Date.now()}`, title: "Nova oferta", description: "", productName: "", priceInCents: 0, compareAtPrice: null, checkboxLabel: "Sim, adicionar!", position: "after-payment", isActive: true, sortOrder: b.length }]);
        const setBump = (id, k, val) => setBumps(b => b.map(x => x.id === id ? { ...x, [k]: val } : x));
        const delBump = (id) => setBumps(b => b.filter(x => x.id !== id));
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <PanelDescription>Order bumps deste plano — ofertas extras exibidas no checkout. Aumente o ticket médio oferecendo um complemento com um clique.</PanelDescription>
            {bumps.length === 0 ? <EmptyState>Nenhum order bump neste plano ainda.</EmptyState> : bumps.map(b => (
              <div key={b.id} style={{ padding: "12px 13px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <Toggle label={b.isActive !== false ? "Ativo" : "Inativo"} value={b.isActive !== false} onChange={v => setBump(b.id, "isActive", v)} />
                  <button onClick={() => delBump(b.id)} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", display: "flex" }}>{Icon.trash(14)}</button>
                </div>
                <Field label="título da oferta" value={b.title} onChange={v => setBump(b.id, "title", v)} />
                <Field label="produto oferecido" value={b.productName} onChange={v => setBump(b.id, "productName", v)} />
                <Row>
                  <Field half label="preço (R$)" value={(b.priceInCents / 100).toFixed(2)} onChange={v => setBump(b.id, "priceInCents", Math.round(parseFloat(v.replace(",", ".") || "0") * 100))} mono />
                  <Field half label="preço 'de' (R$)" value={b.compareAtPrice ? (b.compareAtPrice / 100).toFixed(2) : ""} onChange={v => setBump(b.id, "compareAtPrice", v ? Math.round(parseFloat(v.replace(",", ".")) * 100) : null)} mono placeholder="opcional" />
                </Row>
                <Field label="texto do checkbox" value={b.checkboxLabel || ""} onChange={v => setBump(b.id, "checkboxLabel", v)} />
              </div>
            ))}
            <CTA small variant="ember" onClick={addBump}>{Icon.plus(12)} order bump</CTA>
          </div>
        );
      })()}
    </div>
  );
}

/* ── CHECKOUTS ── (lista + editor completo: pagamentos, tema, cores, urgência) */
function TabCheckouts({ ed, patch }) {
  const { C } = useTheme();
  const [sel, setSel] = useState(null);
  const setCks = (fn) => patch(e => ({ ...e, checkouts: fn(e.checkouts) }));
  const create = () => {
    const id = `ck-${Date.now()}`;
    setCks(cks => [...cks, { id, name: "Novo checkout", slug: `checkout-${cks.length + 1}`, referenceCode: `CK-${cks.length + 1}`, salesCount: 0, isActive: true, maxInstallments: 12, quantity: 1, checkoutLinks: [], checkoutConfig: defaultCheckoutConfig() }]);
  };
  const dup = (ck) => setCks(cks => [...cks, { ...ck, id: `ck-${Date.now()}`, name: `${ck.name} (cópia)`, salesCount: 0 }]);
  const del = (id) => { setCks(cks => cks.filter(c => c.id !== id)); if (sel === id) setSel(null); };

  if (sel) {
    const ck = ed.checkouts.find(c => c.id === sel);
    if (ck) return <CheckoutEditor ck={ck} setCks={setCks} onBack={() => setSel(null)} onDelete={() => del(ck.id)} plans={ed.plans} />;
  }
  return (
    <div>
      <SubTitle right={<CTA small variant="ember" onClick={create}>{Icon.plus(11)} checkout</CTA>}>checkouts</SubTitle>
      {ed.checkouts.length === 0 ? <EmptyState>Nenhum checkout criado</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ed.checkouts.map(raw => {
            const ck = checkoutView(raw);
            return (
              <div key={ck.id} onClick={() => setSel(ck.id)} style={{ padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", transition: "border-color .15s ease" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.ember} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontFamily: FONT, fontSize: 13, color: C.silver, fontWeight: 500, flex: 1 }}>{ck.desc}</span>
                  <Pill color={ck.theme === "NOIR" ? C.silver : C.amber} bg={C.raised} border={C.divider}>{ck.theme}</Pill>
                  <Pill color={ck.active ? C.green : C.dim} bg={C.raised} border={C.divider}>{ck.active ? "ON" : "OFF"}</Pill>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {ck.mt.map(m => <Pill key={m}>{m}</Pill>)}
                  {ck.urgency && <Pill color={C.amber} bg={C.raised} border={C.divider}>⏱ urgência</Pill>}
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.dim, marginLeft: "auto" }}>{ck.sales} vendas</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PIXEL_TYPES = [["FACEBOOK", "Meta / Facebook"], ["GOOGLE_ADS", "Google Ads"], ["GOOGLE_ANALYTICS", "Google Analytics"], ["TIKTOK", "TikTok"], ["KWAI", "Kwai"], ["TABOOLA", "Taboola"], ["CUSTOM", "Custom"]];
const CK_SECTIONS = [["pagamento", "Pagamento"], ["planos", "Planos"], ["marca", "Marca"], ["conversao", "Conversão"], ["bumps", "Bumps"], ["upsell", "Upsell"], ["pixels", "Pixels"], ["seo", "SEO"]];

function CheckoutEditor({ ck, setCks, onBack, onDelete, plans = [] }) {
  const { C } = useTheme();
  const [saved, setSaved] = useState(false);
  const [sec, setSec] = useState("pagamento");
  const cfg = ck.checkoutConfig || {};
  const setCfg = (k, v) => setCks(cks => cks.map(c => c.id === ck.id ? { ...c, checkoutConfig: { ...c.checkoutConfig, [k]: v } } : c));
  const setName = (v) => setCks(cks => cks.map(c => c.id === ck.id ? { ...c, name: v } : c));
  const mut = (fn) => setCks(cks => cks.map(c => c.id === ck.id ? fn(c) : c));
  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1800); };

  // managers de bump/upsell/pixel
  const bumps = cfg.__bumps || ck.orderBumps || (ck.checkoutConfig?.orderBumps) || [];
  const addBump = () => setCfg("orderBumps", [...(cfg.orderBumps || []), { id: `ob-${Date.now()}`, title: "Novo bump", description: "", productName: "", priceInCents: 0, compareAtPrice: null, highlightColor: "#E85D30", checkboxLabel: "Sim, adicionar!", position: "after-payment", isActive: true, sortOrder: (cfg.orderBumps || []).length }]);
  const setBump = (id, k, v) => setCfg("orderBumps", (cfg.orderBumps || []).map(b => b.id === id ? { ...b, [k]: v } : b));
  const delBump = (id) => setCfg("orderBumps", (cfg.orderBumps || []).filter(b => b.id !== id));
  const addUp = () => setCfg("upsells", [...(cfg.upsells || []), { id: `up-${Date.now()}`, title: "Nova oferta", headline: "", description: "", productName: "", priceInCents: 0, compareAtPrice: null, acceptBtnText: "Sim, quero!", declineBtnText: "Não, obrigado", timerSeconds: 600, chargeType: "ONE_CLICK", isActive: true, sortOrder: (cfg.upsells || []).length }]);
  const setUp = (id, k, v) => setCfg("upsells", (cfg.upsells || []).map(u => u.id === id ? { ...u, [k]: v } : u));
  const delUp = (id) => setCfg("upsells", (cfg.upsells || []).filter(u => u.id !== id));
  const addPixel = () => setCfg("pixels", [...(cfg.pixels || []), { id: `px-${Date.now()}`, type: "FACEBOOK", pixelId: "", accessToken: "", trackPageView: true, trackInitiateCheckout: true, trackAddPaymentInfo: true, trackPurchase: true, isActive: true }]);
  const setPixel = (id, k, v) => setCfg("pixels", (cfg.pixels || []).map(p => p.id === id ? { ...p, [k]: v } : p));
  const delPixel = (id) => setCfg("pixels", (cfg.pixels || []).filter(p => p.id !== id));

  return (
    <div>
      <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 12, marginBottom: 12, padding: 0 }}>{Icon.back(13)} checkouts</button>
      <Field label="nome / descrição" value={ck.name} onChange={setName} />
      {/* sub-abas do checkout */}
      <div className="hide-scrollbar" style={{ display: "flex", gap: 4, margin: "12px 0", overflowX: "auto" }}>
        {CK_SECTIONS.map(([k, l]) => (
          <button key={k} onClick={() => setSec(k)} style={{ flexShrink: 0, padding: "6px 11px", background: sec === k ? C.ember : "transparent", color: sec === k ? "#fff" : C.muted, border: `1px solid ${sec === k ? C.ember : C.border}`, borderRadius: 99, cursor: "pointer", fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>{l}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        {sec === "pagamento" && (
          <>
            <SubTitle>métodos</SubTitle>
            <Toggle label="PIX" value={cfg.enablePix !== false} onChange={v => setCfg("enablePix", v)} />
            <Toggle label="Cartão de crédito" value={cfg.enableCreditCard !== false} onChange={v => setCfg("enableCreditCard", v)} />
            <Toggle label="Boleto" value={cfg.enableBoleto === true} onChange={v => setCfg("enableBoleto", v)} />
            <SubTitle>dados do cliente</SubTitle>
            <Toggle label="Exigir CPF" value={cfg.requireCPF !== false} onChange={v => setCfg("requireCPF", v)} />
            <Toggle label="Exigir telefone" value={cfg.requirePhone !== false} onChange={v => setCfg("requirePhone", v)} />
            <Field label="rótulo do telefone" value={cfg.phoneLabel || "WhatsApp"} onChange={v => setCfg("phoneLabel", v)} />
            <SubTitle>frete no checkout</SubTitle>
            <SelectField label="modo de frete" value={cfg.shippingMode || "NONE"} onChange={v => setCfg("shippingMode", v)} options={[["NONE", "Sem frete"], ["FREE", "Grátis"], ["FIXED", "Fixo"], ["VARIABLE", "Variável (calculadora)"]].map(([value, label]) => ({ value, label }))} />
            {cfg.shippingMode === "VARIABLE" && <Toggle label="Usar calculadora Kloel" value={cfg.shippingUseKloelCalculator === true} onChange={v => setCfg("shippingUseKloelCalculator", v)} />}
          </>
        )}
        {sec === "marca" && (
          <>
            <SelectField label="tema" value={cfg.theme || "BLANC"} onChange={v => setCfg("theme", v)} options={[{ value: "NOIR", label: "Noir (escuro · Velvet)" }, { value: "BLANC", label: "Blanc (claro · Velvet)" }]} />
            <Row>
              <Field half label="cor principal" value={cfg.accentColor || "#E85D30"} onChange={v => setCfg("accentColor", v)} mono />
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}><span style={{ width: 36, height: 36, borderRadius: 6, background: cfg.accentColor || "#E85D30", border: `1px solid ${C.border}` }} /></div>
            </Row>
            <Field label="nome da marca" value={cfg.brandName || ""} onChange={v => setCfg("brandName", v)} />
            <Field label="logo (URL)" value={cfg.brandLogo || ""} onChange={v => setCfg("brandLogo", v)} mono />
            <Field label="mensagem do topo" value={cfg.headerMessage || ""} onChange={v => setCfg("headerMessage", v)} />
            <Field label="submensagem" value={cfg.headerSubMessage || ""} onChange={v => setCfg("headerSubMessage", v)} />
            <SubTitle>textos dos botões</SubTitle>
            <Field label="botão etapa 1" value={cfg.btnStep1Text || ""} onChange={v => setCfg("btnStep1Text", v)} />
            <Field label="botão etapa 2" value={cfg.btnStep2Text || ""} onChange={v => setCfg("btnStep2Text", v)} />
            <Field label="botão finalizar" value={cfg.btnFinalizeText || ""} onChange={v => setCfg("btnFinalizeText", v)} />
            <Toggle label="Checkout em etapas" value={cfg.enableSteps !== false} onChange={v => setCfg("enableSteps", v)} />
            <Field label="texto do rodapé" value={cfg.footerText || ""} onChange={v => setCfg("footerText", v)} />
            <Toggle label="Ícones de pagamento" value={cfg.showPaymentIcons !== false} onChange={v => setCfg("showPaymentIcons", v)} />
          </>
        )}
        {sec === "conversao" && (
          <>
            <SubTitle>timer</SubTitle>
            <Toggle label="Timer de contagem" value={cfg.enableTimer === true} onChange={v => setCfg("enableTimer", v)} />
            {cfg.enableTimer && <>
              <SelectField label="tipo" value={cfg.timerType || "COUNTDOWN"} onChange={v => setCfg("timerType", v)} options={[["COUNTDOWN", "Contagem regressiva"], ["EXPIRATION", "Expiração fixa"], ["STOCK", "Por estoque"]].map(([value, label]) => ({ value, label }))} />
              <Row><Field half label="minutos" value={String(cfg.timerMinutes ?? 15)} onChange={v => setCfg("timerMinutes", parseInt(v) || 0)} mono type="number" /><Field half label="posição" value={cfg.timerPosition || "top"} onChange={v => setCfg("timerPosition", v)} /></Row>
              <Field label="mensagem" value={cfg.timerMessage || ""} onChange={v => setCfg("timerMessage", v)} />
            </>}
            <SubTitle>estoque</SubTitle>
            <Toggle label="Contador de estoque" value={cfg.showStockCounter === true} onChange={v => setCfg("showStockCounter", v)} />
            {cfg.showStockCounter && <Row><Field half label="qtd exibida" value={String(cfg.fakeStockCount ?? 7)} onChange={v => setCfg("fakeStockCount", parseInt(v) || 0)} mono type="number" /><Field half label="mensagem" value={cfg.stockMessage || ""} onChange={v => setCfg("stockMessage", v)} /></Row>}
            <SubTitle>popup de cupom</SubTitle>
            <Toggle label="Popup de cupom" value={cfg.showCouponPopup === true} onChange={v => setCfg("showCouponPopup", v)} />
            {cfg.showCouponPopup && <>
              <Field label="título" value={cfg.couponPopupTitle || ""} onChange={v => setCfg("couponPopupTitle", v)} />
              <Field label="descrição" value={cfg.couponPopupDesc || ""} onChange={v => setCfg("couponPopupDesc", v)} />
              <Row><Field half label="delay (s)" value={String(cfg.couponPopupDelay ?? 8)} onChange={v => setCfg("couponPopupDelay", parseInt(v) || 0)} mono type="number" /><Field half label="cupom auto" value={cfg.autoCouponCode || ""} onChange={v => setCfg("autoCouponCode", v)} mono /></Row>
            </>}
            <SubTitle>exit intent & barra</SubTitle>
            <Toggle label="Exit intent (sair da página)" value={cfg.enableExitIntent === true} onChange={v => setCfg("enableExitIntent", v)} />
            {cfg.enableExitIntent && <><Field label="título exit" value={cfg.exitIntentTitle || ""} onChange={v => setCfg("exitIntentTitle", v)} /><Field label="cupom exit" value={cfg.exitIntentCouponCode || ""} onChange={v => setCfg("exitIntentCouponCode", v)} mono /></>}
            <Toggle label="Barra flutuante" value={cfg.enableFloatingBar === true} onChange={v => setCfg("enableFloatingBar", v)} />
            {cfg.enableFloatingBar && <Field label="mensagem da barra" value={cfg.floatingBarMessage || ""} onChange={v => setCfg("floatingBarMessage", v)} />}
            <SubTitle>garantia & confiança</SubTitle>
            <Toggle label="Selo de garantia" value={cfg.enableGuarantee !== false} onChange={v => setCfg("enableGuarantee", v)} />
            {cfg.enableGuarantee && <Row><Field half label="dias" value={String(cfg.guaranteeDays ?? 7)} onChange={v => setCfg("guaranteeDays", parseInt(v) || 0)} mono type="number" /><Field half label="título" value={cfg.guaranteeTitle || ""} onChange={v => setCfg("guaranteeTitle", v)} /></Row>}
            <Toggle label="Selos de confiança" value={cfg.enableTrustBadges !== false} onChange={v => setCfg("enableTrustBadges", v)} />
            <Toggle label="Depoimentos" value={cfg.enableTestimonials === true} onChange={v => setCfg("enableTestimonials", v)} />
            <SubTitle>prova social</SubTitle>
            <Toggle label="Alertas de venda em tempo real" value={cfg.socialProofEnabled === true} onChange={v => setCfg("socialProofEnabled", v)} desc="Notificações 'Fulano comprou agora'" />
            {/* chat widget no checkout */}
            <SubTitle>chat de vendas (IA)</SubTitle>
            <Toggle label="Chat no checkout" value={cfg.chatEnabled === true} onChange={v => setCfg("chatEnabled", v)} desc="IA conversa com quem está comprando" />
            {cfg.chatEnabled && <>
              <Field label="mensagem de boas-vindas" value={cfg.chatWelcomeMessage || ""} onChange={v => setCfg("chatWelcomeMessage", v)} />
              <Row><Field half label="delay (s)" value={String(cfg.chatDelay ?? 3)} onChange={v => setCfg("chatDelay", parseInt(v) || 0)} mono type="number" /><SelectField half label="posição" value={cfg.chatPosition || "bottom-right"} onChange={v => setCfg("chatPosition", v)} options={[["bottom-right", "↘ direita"], ["bottom-left", "↙ esquerda"]].map(([value, label]) => ({ value, label }))} /></Row>
              <Toggle label="Oferecer desconto no chat" value={cfg.chatOfferDiscount === true} onChange={v => setCfg("chatOfferDiscount", v)} />
              {cfg.chatOfferDiscount && <Field label="cupom do chat" value={cfg.chatDiscountCode || ""} onChange={v => setCfg("chatDiscountCode", v)} mono />}
            </>}
          </>
        )}
        {sec === "planos" && (() => {
          const linked = cfg.linkedPlanIds || [];
          const toggle = (id) => setCfg("linkedPlanIds", linked.includes(id) ? linked.filter(x => x !== id) : [...linked, id]);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SubTitle>planos vinculados</SubTitle>
              {linked.length === 0 && <Banner tone="warning" icon={Icon.link(13)}>Nenhum plano vinculado. Vincule ao menos um plano para liberar URLs públicas de compra.</Banner>}
              {plans.length === 0 ? <EmptyState>Crie um plano primeiro (aba Planos)</EmptyState> : plans.map(raw => {
                const p = planView(raw); const on = linked.includes(p.id);
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", background: C.raised, border: `1px solid ${on ? C.ember : C.divider}`, borderRadius: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver }}>{p.name}</div>
                      <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.dim }}>{brl(p.price)} · {p.qty} item(s)</div>
                    </div>
                    <CTA small variant={on ? "ghost" : "ember"} onClick={() => toggle(p.id)}>{on ? "remover" : "adicionar"}</CTA>
                  </div>
                );
              })}
            </div>
          );
        })()}
        {sec === "bumps" && (
          <>
            <SubTitle right={<CTA small variant="ember" onClick={addBump}>{Icon.plus(11)} bump</CTA>}>order bumps</SubTitle>
            <PanelDescription>Ofertas adicionais exibidas no checkout, antes ou depois do pagamento.</PanelDescription>
            {(cfg.orderBumps || []).length === 0 ? <EmptyState>Nenhum order bump</EmptyState> : (cfg.orderBumps || []).map(b => (
              <div key={b.id} style={{ padding: 14, border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Toggle label="" value={b.isActive} onChange={v => setBump(b.id, "isActive", v)} />
                  <span style={{ flex: 1, fontFamily: MONO, fontSize: 9, color: C.dim, letterSpacing: 1 }}>BUMP</span>
                  <button onClick={() => delBump(b.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, display: "flex", padding: 2 }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(13)}</button>
                </div>
                <Field label="título" value={b.title} onChange={v => setBump(b.id, "title", v)} />
                <Field label="produto" value={b.productName} onChange={v => setBump(b.id, "productName", v)} />
                <Field label="descrição" value={b.description} onChange={v => setBump(b.id, "description", v)} />
                <Row><Field half label="preço (centavos)" value={String(b.priceInCents)} onChange={v => setBump(b.id, "priceInCents", parseInt(v) || 0)} mono type="number" /><Field half label="de (centavos)" value={String(b.compareAtPrice || "")} onChange={v => setBump(b.id, "compareAtPrice", parseInt(v) || null)} mono type="number" /></Row>
                <Field label="texto do checkbox" value={b.checkboxLabel} onChange={v => setBump(b.id, "checkboxLabel", v)} />
                <SelectField label="posição" value={b.position} onChange={v => setBump(b.id, "position", v)} options={[["before-payment", "Antes do pagamento"], ["after-payment", "Depois do pagamento"]].map(([value, label]) => ({ value, label }))} />
              </div>
            ))}
          </>
        )}
        {sec === "upsell" && (
          <>
            <SubTitle right={<CTA small variant="ember" onClick={addUp}>{Icon.plus(11)} upsell</CTA>}>upsells (pós-compra)</SubTitle>
            <PanelDescription>Ofertas one-click exibidas após a compra. ONE_CLICK reaproveita o pagamento; NEW_PAYMENT pede um novo.</PanelDescription>
            {(cfg.upsells || []).length === 0 ? <EmptyState>Nenhum upsell</EmptyState> : (cfg.upsells || []).map(u => (
              <div key={u.id} style={{ padding: 14, border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Toggle label="" value={u.isActive} onChange={v => setUp(u.id, "isActive", v)} />
                  <span style={{ flex: 1, fontFamily: MONO, fontSize: 9, color: C.dim, letterSpacing: 1 }}>UPSELL</span>
                  <button onClick={() => delUp(u.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, display: "flex", padding: 2 }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(13)}</button>
                </div>
                <Field label="headline" value={u.headline} onChange={v => setUp(u.id, "headline", v)} />
                <Field label="produto" value={u.productName} onChange={v => setUp(u.id, "productName", v)} />
                <Row><Field half label="preço (centavos)" value={String(u.priceInCents)} onChange={v => setUp(u.id, "priceInCents", parseInt(v) || 0)} mono type="number" /><Field half label="timer (s)" value={String(u.timerSeconds || "")} onChange={v => setUp(u.id, "timerSeconds", parseInt(v) || null)} mono type="number" /></Row>
                <Row><Field half label="botão aceitar" value={u.acceptBtnText} onChange={v => setUp(u.id, "acceptBtnText", v)} /><Field half label="botão recusar" value={u.declineBtnText} onChange={v => setUp(u.id, "declineBtnText", v)} /></Row>
                <SelectField label="cobrança" value={u.chargeType} onChange={v => setUp(u.id, "chargeType", v)} options={[["ONE_CLICK", "One-click (mesmo cartão)"], ["NEW_PAYMENT", "Novo pagamento"]].map(([value, label]) => ({ value, label }))} />
              </div>
            ))}
          </>
        )}
        {sec === "pixels" && (
          <>
            <SubTitle right={<CTA small variant="ember" onClick={addPixel}>{Icon.plus(11)} pixel</CTA>}>pixels de rastreamento</SubTitle>
            <PanelDescription>Eventos enviados às plataformas de ads: PageView, InitiateCheckout, AddPaymentInfo, Purchase.</PanelDescription>
            {(cfg.pixels || []).length === 0 ? <EmptyState>Nenhum pixel configurado</EmptyState> : (cfg.pixels || []).map(p => (
              <div key={p.id} style={{ padding: 14, border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Toggle label="" value={p.isActive} onChange={v => setPixel(p.id, "isActive", v)} />
                  <span style={{ flex: 1, fontFamily: MONO, fontSize: 9, color: C.dim, letterSpacing: 1 }}>PIXEL</span>
                  <button onClick={() => delPixel(p.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, display: "flex", padding: 2 }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(13)}</button>
                </div>
                <SelectField label="plataforma" value={p.type} onChange={v => setPixel(p.id, "type", v)} options={PIXEL_TYPES.map(([value, label]) => ({ value, label }))} />
                <Field label="ID do pixel" value={p.pixelId} onChange={v => setPixel(p.id, "pixelId", v)} mono />
                {(p.type === "FACEBOOK" || p.type === "TIKTOK") && <Field label="access token (API conversões)" value={p.accessToken} onChange={v => setPixel(p.id, "accessToken", v)} mono />}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[["trackPageView", "PageView"], ["trackInitiateCheckout", "InitiateCheckout"], ["trackAddPaymentInfo", "AddPaymentInfo"], ["trackPurchase", "Purchase"]].map(([k, l]) => (
                    <button key={k} onClick={() => setPixel(p.id, k, !p[k])} style={{ padding: "5px 10px", borderRadius: 99, background: p[k] ? C.emberSoft : "transparent", border: `1px solid ${p[k] ? C.ember : C.border}`, color: p[k] ? C.ember : C.muted, fontFamily: MONO, fontSize: 9.5, cursor: "pointer" }}>{p[k] ? "✓ " : ""}{l}</button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
        {sec === "seo" && (
          <>
            <SubTitle>SEO & meta</SubTitle>
            <Field label="meta título" value={cfg.metaTitle || ""} onChange={v => setCfg("metaTitle", v)} />
            <TextArea label="meta descrição" value={cfg.metaDescription || ""} onChange={v => setCfg("metaDescription", v)} rows={2} />
            <Field label="meta imagem (URL)" value={cfg.metaImage || ""} onChange={v => setCfg("metaImage", v)} mono />
            <Field label="favicon (URL)" value={cfg.favicon || ""} onChange={v => setCfg("favicon", v)} mono />
            <TextArea label="CSS customizado" value={cfg.customCSS || ""} onChange={v => setCfg("customCSS", v)} rows={3} mono />
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
          <CTA variant="ember" onClick={flash}>{Icon.check(13)} salvar</CTA>
          <SavedFlash saved={saved} />
          <button onClick={onDelete} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6, color: C.dim, display: "flex", marginLeft: "auto" }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(14)}</button>
        </div>
      </div>
    </div>
  );
}

/* ── COMISSÃO / AFILIAÇÃO ── (config real + SplitEngine + coprodução/gerência) */
function TabComissao({ ed, patch, product }) {
  const { C } = useTheme();
  const [view, setView] = useState("config"); // config | split | coprod | afiliados
  const cm = ed.commission;
  const set = (k, v) => patch(e => ({ ...e, commission: { ...e.commission, [k]: v } }));
  const setCoprod = (fn) => patch(e => ({ ...e, coproducers: fn(e.coproducers) }));
  const setMerchan = (fn) => patch(e => ({ ...e, commission: { ...e.commission, merchan: fn(e.commission.merchan || []) } }));
  const addMat = () => setMerchan(ms => [...ms, { id: `mat-${Date.now()}`, type: "Criativo", name: "Novo material", url: "" }]);
  const setMat = (id, k, v) => setMerchan(ms => ms.map(m => m.id === id ? { ...m, [k]: v } : m));
  const delMat = (id) => setMerchan(ms => ms.filter(m => m.id !== id));
  const reqs = ed.affiliateRequests || [];
  const setReqs = (fn) => patch(e => ({ ...e, affiliateRequests: fn(e.affiliateRequests || []) }));
  const [saved, setSaved] = useState(false);
  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1800); };

  return (
    <div>
      <div className="hide-scrollbar" style={{ display: "flex", gap: 3, padding: 3, background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 7, marginBottom: 16, overflowX: "auto" }}>
        {[["config", "Configurações"], ["afiliados", "Afiliados"], ["merchan", "Merchan"], ["termos", "Termos"], ["coprod", "Coprodução"]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{ flex: "1 0 auto", height: 30, padding: "0 10px", border: "none", background: view === k ? C.paper : "transparent", color: view === k ? C.silver : C.muted, fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", borderRadius: 5, cursor: "pointer", boxShadow: view === k ? `0 0 0 1px ${C.border}` : "none", whiteSpace: "nowrap" }}>{l}</button>
        ))}
      </div>

      {view === "afiliados" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PanelDescription>Afiliados deste produto. Aprove ou recuse solicitações; aprovados passam a gerar links rastreáveis.</PanelDescription>
          {(() => {
            const pending = reqs.filter(r => r.status === "PENDING");
            const approved = reqs.filter(r => r.status === "APPROVED");
            return (
              <>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["pendentes", pending.length], ["aprovados", approved.length], ["modo", cm.affiliateAutoApprove ? "auto" : "manual"]].map(([l, v]) => (
                    <div key={l} style={{ flex: 1, padding: "10px 8px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, textAlign: "center" }}>
                      <div style={{ fontFamily: MONO, fontSize: l === "modo" ? 13 : 18, fontWeight: 700, color: l === "pendentes" && v > 0 ? C.ember : C.silver }}>{v}</div>
                      <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2 }}>{l}</div>
                    </div>
                  ))}
                </div>
                {reqs.length === 0 ? <EmptyState>Nenhuma solicitação ainda</EmptyState> : reqs.map(r => {
                  const sc = r.status === "APPROVED" ? C.green : r.status === "REJECTED" ? C.red : C.amber;
                  const sl = r.status === "APPROVED" ? "aprovado" : r.status === "REJECTED" ? "recusado" : "pendente";
                  return (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 99, background: C.emberSoft, color: C.ember, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 12, flexShrink: 0 }}>{(r.affiliateName || "?")[0]}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver }}>{r.affiliateName}</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim }}>{r.affiliateEmail}</div>
                      </div>
                      {r.status === "PENDING" ? (
                        <>
                          <button onClick={() => setReqs(rs => rs.map(x => x.id === r.id ? { ...x, status: "REJECTED" } : x))} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", padding: "5px 9px", fontFamily: FONT, fontSize: 11, color: C.muted }}>recusar</button>
                          <CTA small variant="ember" onClick={() => setReqs(rs => rs.map(x => x.id === r.id ? { ...x, status: "APPROVED" } : x))}>aprovar</CTA>
                        </>
                      ) : <Pill color={sc} bg={C.raised} border={C.divider}>{sl}</Pill>}
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      )}

      {view === "config" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          <Banner tone="warning" icon={Icon.alert(13)}>Configurações aplicam apenas para novas afiliações.</Banner>
          <SubTitle>programa de afiliados</SubTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Toggle label="Participar?" value={cm.affiliateEnabled} onChange={v => set("affiliateEnabled", v)} desc="Ativa o programa de afiliados" />
            <Toggle label="Visível na loja?" value={cm.affiliateVisible} onChange={v => set("affiliateVisible", v)} desc="Aparece no marketplace de afiliados" />
            <Toggle label="Aprovação automática?" value={cm.affiliateAutoApprove} onChange={v => set("affiliateAutoApprove", v)} desc="Afiliados aprovados na hora" />
            <Toggle label="Acesso aos dados?" value={cm.affiliateAccessData} onChange={v => set("affiliateAccessData", v)} desc="Afiliado vê dados do cliente" />
            <Toggle label="Acesso a abandonos?" value={cm.affiliateAccessAbandoned} onChange={v => set("affiliateAccessAbandoned", v)} desc="Vê leads que abandonaram" />
            <Toggle label="Comissão na 1ª parcela?" value={cm.affiliateFirstInstallment} onChange={v => set("affiliateFirstInstallment", v)} desc="Assinaturas: só 1ª parcela" />
          </div>
          <SubTitle>comissionamento</SubTitle>
          <SelectField label="tipo de atribuição" value={cm.commissionType} onChange={v => set("commissionType", v)} options={[
            { value: "first_click", label: "Primeiro clique" }, { value: "last_click", label: "Último clique" }, { value: "proportional", label: "Divisão proporcional" },
          ]} />
          <Row>
            <Field half label="cookie (dias)" value={String(cm.commissionCookieDays)} onChange={v => set("commissionCookieDays", Math.max(1, Math.min(3650, parseInt(v) || 180)))} mono type="number" />
            <Field half label="comissão (%)" value={String(cm.commissionPercent)} onChange={v => set("commissionPercent", Math.max(0, Math.min(100, parseInt(v) || 0)))} mono type="number" />
          </Row>
          {cm.commissionType === "proportional" && (
            <Row>
              <Field half label="último clique (%)" value={String(cm.commissionLastClickPercent)} onChange={v => { const n = Math.max(0, Math.min(100, parseInt(v) || 0)); set("commissionLastClickPercent", n); set("commissionOtherClicksPercent", 100 - n); }} mono type="number" />
              <Field half label="demais cliques (%)" value={String(cm.commissionOtherClicksPercent)} onChange={v => { const n = Math.max(0, Math.min(100, parseInt(v) || 0)); set("commissionOtherClicksPercent", n); set("commissionLastClickPercent", 100 - n); }} mono type="number" />
            </Row>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
            <CTA variant="ember" onClick={flash}>{Icon.check(13)} salvar comissões</CTA>
            <SavedFlash saved={saved} />
          </div>
        </div>
      )}

      {view === "merchan" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PanelDescription>Materiais de divulgação que seus afiliados podem baixar e usar: criativos, copies, VSLs, banners e links prontos.</PanelDescription>
          <SubTitle right={<CTA small variant="ember" onClick={addMat}>{Icon.plus(11)} material</CTA>}>materiais de merchandising</SubTitle>
          {(cm.merchan || []).length === 0 ? <EmptyState>Nenhum material ainda</EmptyState> : (cm.merchan || []).map(m => (
            <div key={m.id} style={{ padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Pill color={C.ember} bg={C.raised} border={C.divider}>{m.type}</Pill>
                <span style={{ flex: 1 }} />
                <button onClick={() => delMat(m.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, display: "flex", padding: 2 }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(13)}</button>
              </div>
              <Field label="nome" value={m.name} onChange={v => setMat(m.id, "name", v)} />
              <SelectField label="tipo" value={m.type} onChange={v => setMat(m.id, "type", v)} options={["Criativo", "Copy", "VSL", "Banner", "Stories", "E-mail", "Link"].map(x => ({ value: x, label: x }))} />
              <Field label="url / link do material" value={m.url} onChange={v => setMat(m.id, "url", v)} mono placeholder="https://..." />
            </div>
          ))}
        </div>
      )}

      {view === "termos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PanelDescription>Termos que o afiliado aceita ao se inscrever no seu programa.</PanelDescription>
          <Toggle label="Exigir aceite dos termos" value={cm.affiliateRequireTerms === true} onChange={v => set("affiliateRequireTerms", v)} desc="Afiliado precisa aceitar antes de promover" />
          <TextArea label="termos do afiliado" value={cm.affiliateTerms || ""} onChange={v => set("affiliateTerms", v)} rows={9} placeholder="Regras de divulgação, proibições (ex: não usar a marca em anúncios), política de cookie, regras de comissão, condutas vedadas..." />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <CTA variant="ember" onClick={flash}>{Icon.check(13)} salvar termos</CTA>
            <SavedFlash saved={saved} />
          </div>
        </div>
      )}

      {view === "coprod" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <CoproductionPanel coproducers={ed.coproducers} setCoprod={setCoprod} />
          <div>
            <SubTitle>resultado do split</SubTitle>
            <SplitEngine ed={ed} product={product} />
          </div>
        </div>
      )}
    </div>
  );
}

/* SplitEngine · ordem de prioridade real: Kloel → Fornecedor → Afiliado →
   Coprodutor → Gerente → Vendedor (residual). Calcula sobre o preço do plano. */
function SplitEngine({ ed, product }) {
  const { C } = useTheme();
  const basePrice = ed.plans[0] ? ed.plans[0].priceInCents : (product.meta?.price || 0) * 100;
  const KLOEL_FEE = 0.0799; // 7,99% taxa Kloel (Stripe Connect Direct Charges)
  const affPct = ed.commission.affiliateEnabled ? ed.commission.commissionPercent / 100 : 0;
  const coprodPct = ed.coproducers.filter(c => c.role === "COPRODUCER").reduce((s, c) => s + (parseFloat(c.percentage) || 0), 0) / 100;
  const mgrPct = ed.coproducers.filter(c => c.role === "MANAGER").reduce((s, c) => s + (parseFloat(c.percentage) || 0), 0) / 100;

  const kloel = basePrice * KLOEL_FEE;
  const afterKloel = basePrice - kloel;
  const affiliate = afterKloel * affPct;
  const coprod = afterKloel * coprodPct;
  const manager = afterKloel * mgrPct;
  const supplier = afterKloel - affiliate - coprod - manager; // fornecedor = residual (você)

  const rows = [
    { label: "Kloel", sub: "taxa plataforma 7,99%", value: kloel, color: C.silver },
    { label: "Fornecedor (você)", sub: "residual", value: supplier, color: C.ember },
    { label: "Afiliado", sub: ed.commission.affiliateEnabled ? `${ed.commission.commissionPercent}%` : "inativo", value: affiliate, color: C.blue },
    { label: "Coprodutores", sub: `${(coprodPct * 100).toFixed(0)}%`, value: coprod, color: C.purple },
    { label: "Gerentes", sub: `${(mgrPct * 100).toFixed(0)}%`, value: manager, color: C.amber },
  ];

  return (
    <div>
      <Banner tone="ember" icon={Icon.layers(13)}>Motor de split sobre {brl(basePrice)} (1º plano). Ordem: Kloel → Fornecedor → Afiliado → Coprodutor → Gerente → Vendedor.</Banner>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 2 }}>
        {rows.map(r => {
          const share = basePrice > 0 ? (r.value / basePrice) * 100 : 0;
          return (
            <div key={r.label} style={{ padding: "11px 0", borderBottom: `1px solid ${C.divider}` }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver, fontWeight: 500 }}>{r.label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.dim, letterSpacing: 0.5 }}>{r.sub}</span>
                </span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: r.color, fontWeight: 600 }}>{brl(r.value)}</span>
              </div>
              <div style={{ height: 3, borderRadius: 99, background: C.faint, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.max(0, share)}%`, background: r.color, transition: "width .3s ease" }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 14, padding: "12px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Tag color={C.muted} weight={600}>preço do plano</Tag>
        <span style={{ fontFamily: MONO, fontSize: 15, color: C.silver, fontWeight: 700 }}>{brl(basePrice)}</span>
      </div>
    </div>
  );
}

function CoproductionPanel({ coproducers, setCoprod }) {
  const { C } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ role: "COPRODUCER", percentage: "", agentName: "", agentEmail: "" });
  const add = () => {
    if (!form.agentName.trim()) return;
    setCoprod(cs => [...cs, { id: `co-${Date.now()}`, ...form, percentage: parseFloat(form.percentage) || 0, status: "pending" }]);
    setForm({ role: "COPRODUCER", percentage: "", agentName: "", agentEmail: "" }); setShowForm(false);
  };
  const del = (id) => setCoprod(cs => cs.filter(c => c.id !== id));
  return (
    <div>
      <SubTitle right={<CTA small variant="ember" onClick={() => setShowForm(s => !s)}>{Icon.plus(11)} convidar</CTA>}>coprodutores & gerentes</SubTitle>
      {showForm && (
        <div style={{ padding: 14, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <SelectField label="papel" value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))} options={[{ value: "COPRODUCER", label: "Coprodutor" }, { value: "MANAGER", label: "Gerente" }]} />
          <Field label="nome" value={form.agentName} onChange={v => setForm(f => ({ ...f, agentName: v }))} placeholder="Nome do parceiro" />
          <Field label="e-mail" value={form.agentEmail} onChange={v => setForm(f => ({ ...f, agentEmail: v }))} placeholder="email@parceiro.com" />
          <Field label="percentual (%)" value={form.percentage} onChange={v => setForm(f => ({ ...f, percentage: v }))} mono type="number" />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <CTA small variant="ghost" onClick={() => setShowForm(false)}>cancelar</CTA>
            <CTA small variant="ember" onClick={add} disabled={!form.agentName.trim()}>enviar convite</CTA>
          </div>
        </div>
      )}
      {coproducers.length === 0 ? <EmptyState>Nenhum coprodutor ou gerente</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {coproducers.map(c => (
            <div key={c.id} style={{ padding: "11px 14px", border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: c.role === "MANAGER" ? C.amber : C.purple, display: "flex" }}>{Icon.users(15)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver, fontWeight: 500 }}>{c.agentName}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim }}>{c.role === "MANAGER" ? "gerente" : "coprodutor"} · {c.percentage}%</div>
              </div>
              <Pill color={c.status === "active" ? C.green : C.amber} bg={C.raised} border={C.divider}>{c.status === "active" ? "ATIVO" : "PENDENTE"}</Pill>
              <button onClick={() => del(c.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.dim, display: "flex" }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(13)}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── CUPONS ── (%/R$, validade, limite de uso, ativo/inativo) */
function TabCupons({ ed, patch }) {
  const { C } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", type: "%", val: "", max: "", expiresAt: "" });
  const setCoupons = (fn) => patch(e => ({ ...e, coupons: fn(e.coupons) }));
  const add = () => {
    if (!form.code.trim()) return;
    setCoupons(cs => [...cs, { id: `cp-${Date.now()}`, code: form.code.trim().toUpperCase(), type: form.type, val: parseFloat(form.val.replace(",", ".")) || 0, on: true, used: 0, max: form.max ? parseInt(form.max) : null, expiresAt: form.expiresAt || null }]);
    setForm({ code: "", type: "%", val: "", max: "", expiresAt: "" }); setShowForm(false);
  };
  const toggle = (id) => setCoupons(cs => cs.map(c => c.id === id ? { ...c, on: !c.on } : c));
  const del = (id) => setCoupons(cs => cs.filter(c => c.id !== id));
  return (
    <div>
      <Banner tone="ember" icon={Icon.tag(13)}>Cupons de recuperação podem ser aplicados automaticamente no popup exit intent dos checkouts.</Banner>
      <SubTitle right={<CTA small variant="ember" onClick={() => setShowForm(s => !s)}>{Icon.plus(11)} cupom</CTA>}>cupons</SubTitle>
      {showForm && (
        <div style={{ padding: 14, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="código" value={form.code} onChange={v => setForm(f => ({ ...f, code: v }))} placeholder="PRIMEIRA10" mono />
          <Row>
            <SelectField half label="tipo" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} options={[{ value: "%", label: "Percentual (%)" }, { value: "R$", label: "Fixo (R$)" }]} />
            <Field half label={form.type === "%" ? "desconto (%)" : "desconto (R$)"} value={form.val} onChange={v => setForm(f => ({ ...f, val: v }))} mono />
          </Row>
          <Row>
            <Field half label="limite de uso" value={form.max} onChange={v => setForm(f => ({ ...f, max: v }))} placeholder="∞" mono type="number" />
            <Field half label="validade" value={form.expiresAt} onChange={v => setForm(f => ({ ...f, expiresAt: v }))} type="date" />
          </Row>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <CTA small variant="ghost" onClick={() => setShowForm(false)}>cancelar</CTA>
            <CTA small variant="ember" onClick={add} disabled={!form.code.trim()}>criar cupom</CTA>
          </div>
        </div>
      )}
      {ed.coupons.length === 0 ? <EmptyState>Nenhum cupom cadastrado</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ed.coupons.map(c => (
            <div key={c.id} style={{ padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", alignItems: "center", gap: 12, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: c.on ? C.ember : C.dim }} />
              <span style={{ color: C.muted, display: "flex" }}>{Icon.tag(15)}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.silver, letterSpacing: "0.06em" }}>{c.code}</span>
                <div style={{ fontFamily: FONT, fontSize: 11, color: C.muted, marginTop: 2 }}>{c.type === "%" ? `${c.val}% de desconto` : `${brl(c.val * 100)} de desconto`}{c.expiresAt && ` · expira ${new Date(c.expiresAt).toLocaleDateString("pt-BR")}`}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: C.silver }}>{c.used}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.dim }}>usos{c.max ? ` / ${c.max}` : ""}</div>
              </div>
              <button onClick={() => toggle(c.id)} style={{ cursor: "pointer", background: "transparent", border: "none", padding: 0 }}><Pill color={c.on ? C.green : C.dim} bg={C.raised} border={C.divider}>{c.on ? "ATIVO" : "OFF"}</Pill></button>
              <button onClick={() => del(c.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.dim, display: "flex" }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(13)}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── CAMPANHAS ── (name, pixelId, messageTemplate, launch/pause/delete) */
function TabCampanhas({ ed, patch }) {
  const { C } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", pixelId: "", messageTemplate: "" });
  const setCamps = (fn) => patch(e => ({ ...e, campaigns: fn(e.campaigns) }));
  const add = () => {
    if (!form.name.trim()) return;
    setCamps(cs => [...cs, { id: `cm-${Date.now()}`, name: form.name.trim(), pixelId: form.pixelId.trim() || null, messageTemplate: form.messageTemplate.trim() || null, status: "draft", sent: 0 }]);
    setForm({ name: "", pixelId: "", messageTemplate: "" }); setShowForm(false);
  };
  const launch = (id, smart) => setCamps(cs => cs.map(c => c.id === id ? { ...c, status: smart ? "scheduled" : "active" } : c));
  const pause = (id) => setCamps(cs => cs.map(c => c.id === id ? { ...c, status: "paused" } : c));
  const del = (id) => setCamps(cs => cs.filter(c => c.id !== id));
  const stColor = (s) => s === "active" ? C.green : s === "scheduled" ? C.blue : s === "paused" ? C.amber : C.dim;
  return (
    <div>
      <Banner tone="info" icon={Icon.megaphone(13)}>Campanhas de tráfego e remarketing com pixel. Lance com horário inteligente para máximo alcance.</Banner>
      <SubTitle right={<CTA small variant="ember" onClick={() => setShowForm(s => !s)}>{Icon.plus(11)} campanha</CTA>}>campanhas</SubTitle>
      {showForm && (
        <div style={{ padding: 14, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="nome da campanha" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Black Friday 2026" />
          <Field label="pixel ID (opcional)" value={form.pixelId} onChange={v => setForm(f => ({ ...f, pixelId: v }))} placeholder="123456789" mono />
          <TextArea label="template de mensagem" value={form.messageTemplate} onChange={v => setForm(f => ({ ...f, messageTemplate: v }))} placeholder="Olá {{nome}}, temos uma oferta..." rows={3} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <CTA small variant="ghost" onClick={() => setShowForm(false)}>cancelar</CTA>
            <CTA small variant="ember" onClick={add} disabled={!form.name.trim()}>criar</CTA>
          </div>
        </div>
      )}
      {ed.campaigns.length === 0 ? <EmptyState>Nenhuma campanha criada</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ed.campaigns.map(c => (
            <div key={c.id} style={{ padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontFamily: FONT, fontSize: 13, color: C.silver, fontWeight: 500, flex: 1 }}>{c.name}</span>
                <Pill color={stColor(c.status)} bg={C.raised} border={C.divider}>{c.status.toUpperCase()}</Pill>
              </div>
              {c.pixelId && <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim, marginBottom: 8 }}>pixel · {c.pixelId}</div>}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {(c.status === "draft" || c.status === "paused") ? (
                  <>
                    <CTA small variant="ember" onClick={() => launch(c.id, false)}>{Icon.play(11)} lançar</CTA>
                    <CTA small variant="line" onClick={() => launch(c.id, true)}>⏱ horário smart</CTA>
                  </>
                ) : (
                  <CTA small variant="line" onClick={() => pause(c.id)}>{Icon.pause(11)} pausar</CTA>
                )}
                <button onClick={() => del(c.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.dim, display: "flex", marginLeft: "auto" }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(13)}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── AVALIAÇÕES ── (authorName, rating 1-5★, comment, verified) */
function TabAvaliacoes({ ed, patch }) {
  const { C } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", rating: 5, text: "", verified: false });
  const setReviews = (fn) => patch(e => ({ ...e, reviews: fn(e.reviews) }));
  const add = () => {
    if (!form.name.trim()) return;
    setReviews(rs => [{ id: `rv-${Date.now()}`, authorName: form.name.trim(), rating: form.rating, comment: form.text.trim(), verified: form.verified }, ...rs]);
    setForm({ name: "", rating: 5, text: "", verified: false }); setShowForm(false);
  };
  const del = (id) => setReviews(rs => rs.filter(r => r.id !== id));
  const avg = ed.reviews.length ? (ed.reviews.reduce((s, r) => s + (r.rating || 0), 0) / ed.reviews.length).toFixed(1) : "—";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: C.silver }}>{avg}</span>
        <div style={{ display: "flex", gap: 2, color: C.amber }}>{[1,2,3,4,5].map(s => <span key={s}>{Icon.star(14, s <= Math.round(avg) ? "currentColor" : "none")}</span>)}</div>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.dim, marginLeft: "auto" }}>{ed.reviews.length} avaliações</span>
      </div>
      <SubTitle right={<CTA small variant="ember" onClick={() => setShowForm(s => !s)}>{Icon.plus(11)} avaliação</CTA>}>provas sociais</SubTitle>
      {showForm && (
        <div style={{ padding: 14, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="nome do autor" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Maria S." />
          <div>
            <label style={{ display: "block", marginBottom: 6, fontFamily: MONO, fontSize: 9.5, color: C.muted, fontWeight: 500, letterSpacing: 1.4, textTransform: "uppercase" }}>nota</label>
            <div style={{ display: "flex", gap: 4 }}>
              {[1,2,3,4,5].map(s => <button key={s} onClick={() => setForm(f => ({ ...f, rating: s }))} style={{ cursor: "pointer", background: "none", border: "none", padding: 0, color: s <= form.rating ? C.amber : C.dim, display: "flex" }}>{Icon.star(20, s <= form.rating ? "currentColor" : "none")}</button>)}
            </div>
          </div>
          <TextArea label="comentário" value={form.text} onChange={v => setForm(f => ({ ...f, text: v }))} placeholder="Resultado incrível..." rows={3} />
          <Toggle label="Compra verificada" value={form.verified} onChange={v => setForm(f => ({ ...f, verified: v }))} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <CTA small variant="ghost" onClick={() => setShowForm(false)}>cancelar</CTA>
            <CTA small variant="ember" onClick={add} disabled={!form.name.trim()}>publicar</CTA>
          </div>
        </div>
      )}
      {ed.reviews.length === 0 ? <EmptyState>Nenhuma avaliação ainda</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ed.reviews.map(r => (
            <div key={r.id} style={{ padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver, fontWeight: 500 }}>{r.authorName || r.name}</span>
                {r.verified && <Pill color={C.green} bg={C.raised} border={C.divider}>✓ verificada</Pill>}
                <div style={{ display: "flex", gap: 1, color: C.amber, marginLeft: "auto" }}>{[1,2,3,4,5].map(s => <span key={s}>{Icon.star(11, s <= (r.rating||0) ? "currentColor" : "none")}</span>)}</div>
                <button onClick={() => del(r.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, color: C.dim, display: "flex" }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(12)}</button>
              </div>
              {(r.comment || r.text) && <p style={{ margin: 0, fontFamily: FONT, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{r.comment || r.text}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── AFTER PAY ── (upsell/downsell pós-compra) */
function TabAfterpay({ ed, patch }) {
  const { C } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", kind: "upsell", priceInCents: "" });
  const setAP = (fn) => patch(e => ({ ...e, afterpay: fn(e.afterpay) }));
  const add = () => {
    if (!form.name.trim()) return;
    setAP(a => [...a, { id: `ap-${Date.now()}`, name: form.name.trim(), kind: form.kind, priceInCents: Math.round(parseFloat(form.priceInCents.replace(",", ".") || "0") * 100), accepted: 0, shown: 0 }]);
    setForm({ name: "", kind: "upsell", priceInCents: "" }); setShowForm(false);
  };
  const del = (id) => setAP(a => a.filter(x => x.id !== id));
  return (
    <div>
      <Banner tone="ember" icon={Icon.bolt(13)}>Ofertas exibidas logo após o pagamento. Upsell aumenta o ticket; downsell recupera quem recusou.</Banner>
      <SubTitle right={<CTA small variant="ember" onClick={() => setShowForm(s => !s)}>{Icon.plus(11)} oferta</CTA>}>ofertas pós-compra</SubTitle>
      {showForm && (
        <div style={{ padding: 14, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="nome da oferta" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Kit complementar" />
          <Row>
            <SelectField half label="tipo" value={form.kind} onChange={v => setForm(f => ({ ...f, kind: v }))} options={[{ value: "upsell", label: "Upsell" }, { value: "downsell", label: "Downsell" }]} />
            <Field half label="preço (R$)" value={form.priceInCents} onChange={v => setForm(f => ({ ...f, priceInCents: v }))} mono />
          </Row>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <CTA small variant="ghost" onClick={() => setShowForm(false)}>cancelar</CTA>
            <CTA small variant="ember" onClick={add} disabled={!form.name.trim()}>criar oferta</CTA>
          </div>
        </div>
      )}
      {ed.afterpay.length === 0 ? <EmptyState>Nenhuma oferta pós-compra</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ed.afterpay.map(a => (
            <div key={a.id} style={{ padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <Pill color={a.kind === "upsell" ? C.green : C.amber} bg={C.raised} border={C.divider}>{a.kind === "upsell" ? "UPSELL" : "DOWNSELL"}</Pill>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver, fontWeight: 500 }}>{a.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim }}>{brl(a.priceInCents)}</div>
              </div>
              <button onClick={() => del(a.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.dim, display: "flex" }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(13)}</button>
            </div>
          ))}
        </div>
      )}
      <SubTitle>configuração after pay</SubTitle>
      <Toggle label="Reaproveitar endereço da compra" value={ed.afterPayConfig?.duplicateAddress === true} onChange={v => patch(e => ({ ...e, afterPayConfig: { ...e.afterPayConfig, duplicateAddress: v } }))} desc="Não pede endereço de novo no upsell" />
      <Toggle label="Cobrar afiliado nas ofertas pós-compra" value={ed.afterPayConfig?.affiliateCharge === true} onChange={v => patch(e => ({ ...e, afterPayConfig: { ...e.afterPayConfig, affiliateCharge: v } }))} desc="Afiliado também recebe comissão do upsell" />
      <Field label="provedor de envio (afterpay)" value={ed.afterPayConfig?.shippingProvider || ""} onChange={v => patch(e => ({ ...e, afterPayConfig: { ...e.afterPayConfig, shippingProvider: v } }))} placeholder="opcional" />
    </div>
  );
}
function TabIA({ ed, patch }) {
  const { C } = useTheme();
  const ai = ed.ai;
  const set = (k, v) => patch(e => ({ ...e, ai: { ...e.ai, [k]: v } }));
  const setObjs = (fn) => patch(e => ({ ...e, ai: { ...e.ai, objections: fn(e.ai.objections) } }));
  const [saved, setSaved] = useState(false);
  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1800); };
  const addObj = () => setObjs(o => [...o, { id: `obj-${Date.now()}`, label: "", response: "" }]);
  const updObj = (id, k, v) => setObjs(o => o.map(x => x.id === id ? { ...x, [k]: v } : x));
  const delObj = (id) => setObjs(o => o.filter(x => x.id !== id));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      <Banner tone="ember" icon={Icon.bolt(13)}>Marketing Artificial · configure como a IA vende este produto via WhatsApp, Instagram, TikTok e Facebook.</Banner>
      <SubTitle>perfil do cliente ideal</SubTitle>
      <TextArea label="quem compra?" value={ai.whobuys} onChange={v => set("whobuys", v)} placeholder="Mulheres 35-55 anos..." rows={2} />
      <TextArea label="principais dores" value={ai.pains} onChange={v => set("pains", v)} placeholder="Dores, problemas..." rows={2} />
      <TextArea label="resultado prometido" value={ai.promise} onChange={v => set("promise", v)} placeholder="Resultado que o cliente terá..." rows={2} />
      <TextArea label="argumentos de venda" value={ai.salesArguments || ""} onChange={v => set("salesArguments", v)} placeholder="Provas, diferenciais, autoridade..." rows={2} />
      <TextArea label="ficha técnica / composição" value={ai.technicalInfo || ""} onChange={v => set("technicalInfo", v)} placeholder="Ingredientes, especificações que a IA pode citar..." rows={2} />
      <SubTitle right={<CTA small variant="line" onClick={addObj}>{Icon.plus(11)}</CTA>}>objeções e respostas</SubTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ai.objections.map(o => (
          <div key={o.id} style={{ padding: 12, border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={o.label} onChange={e => updObj(o.id, "label", e.target.value)} placeholder="É caro" style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 5, padding: "6px 9px", fontFamily: FONT, fontSize: 12, color: C.text, background: C.paper, outline: "none" }} />
              <button onClick={() => delObj(o.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.dim, display: "flex" }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.x(12)}</button>
            </div>
            <textarea value={o.response} onChange={e => updObj(o.id, "response", e.target.value)} placeholder="Como a IA responde..." rows={2} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 5, padding: "6px 9px", fontFamily: FONT, fontSize: 12, color: C.text, background: C.paper, outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.4 }} />
          </div>
        ))}
      </div>
      <SubTitle>comportamento</SubTitle>
      <SelectField label="tom de voz" value={ai.tone} onChange={v => set("tone", v)} options={[
        { value: "CONSULTIVE", label: "Consultivo" }, { value: "DIRECT", label: "Direto" }, { value: "FRIENDLY", label: "Amigável" }, { value: "EXPERT", label: "Especialista" },
      ]} />
      <Slider label="nível de persistência" value={ai.persistenceLevel} min={1} max={5} step={1} onChange={v => set("persistenceLevel", v)} format={v => `${v}/5`} />
      <Field label="limite de mensagens por lead" value={String(ai.messageLimit)} onChange={v => set("messageLimit", parseInt(v) || 10)} mono type="number" />
      <Field label="agenda de follow-up" value={ai.followUpSchedule} onChange={v => set("followUpSchedule", v)} placeholder="2h,24h,72h" mono />
      <SubTitle>gatilhos de venda</SubTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Toggle label="Enviar link de checkout automático" value={ai.autoCheckoutLink} onChange={v => set("autoCheckoutLink", v)} />
        <Toggle label="Oferecer desconto na objeção de preço" value={ai.offerDiscount} onChange={v => set("offerDiscount", v)} />
        <Toggle label="Usar gatilhos de urgência" value={ai.useUrgency} onChange={v => set("useUrgency", v)} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
        <CTA variant="ember" onClick={flash}>{Icon.check(13)} salvar IA</CTA>
        <SavedFlash saved={saved} />
      </div>
    </div>
  );
}

/* ── URLs ── (links de checkout por plano, copiáveis) */
function TabUrls({ ed, patch, product }) {
  const { C } = useTheme();
  const [copied, setCopied] = useState(null);
  const [sel, setSel] = useState(null);
  const copy = (txt, id) => { try { navigator.clipboard?.writeText(txt); } catch {} setCopied(id); setTimeout(() => setCopied(null), 1500); };
  const setUrls = (fn) => patch && patch(e => ({ ...e, urls: fn(e.urls || []) }));
  const links = [];
  for (const ck of ed.checkouts) { const v = checkoutView(ck); links.push({ id: ck.id, label: v.desc, url: `kloel.com/c/${ck.code}` }); }
  for (const pl of ed.plans) { const v = planView(pl); links.push({ id: `pl-${pl.id}`, label: v.name, url: `kloel.com/p/${v.ref}` }); }
  const urls = ed.urls || [];
  const addUrl = () => { const id = `u-${Date.now()}`; setUrls(u => [...u, { id, description: "Nova URL", url: "", isPrivate: false, active: true, aiLearning: false, aiLearnFreq: "manual", aiLearnStatus: "pending", chatEnabled: false, salesFromUrl: 0 }]); setSel(id); };
  const setU = (id, k, v) => setUrls(u => u.map(x => x.id === id ? { ...x, [k]: v } : x));
  const delU = (id) => { setUrls(u => u.filter(x => x.id !== id)); if (sel === id) setSel(null); };
  const statusColor = (s) => ({ learned: C.green, learning: C.blue, error: C.red, pending: C.amber }[s] || C.dim);

  if (sel) {
    const u = urls.find(x => x.id === sel);
    if (u) return (
      <div>
        <button onClick={() => setSel(null)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 12, marginBottom: 12, padding: 0 }}>{Icon.back(13)} URLs</button>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          <Field label="descrição" value={u.description} onChange={v => setU(u.id, "description", v)} />
          <Field label="URL" value={u.url} onChange={v => setU(u.id, "url", v)} mono placeholder="https://..." />
          <Toggle label="Privada" value={u.isPrivate} onChange={v => setU(u.id, "isPrivate", v)} desc="Visível só p/ você e afiliados" />
          <SubTitle>aprendizado da IA</SubTitle>
          <Toggle label="IA aprende com esta URL" value={u.aiLearning} onChange={v => setU(u.id, "aiLearning", v)} desc="Kloel lê o conteúdo e usa nas vendas" />
          {u.aiLearning && <>
            <SelectField label="frequência" value={u.aiLearnFreq || "manual"} onChange={v => setU(u.id, "aiLearnFreq", v)} options={[["weekly", "Semanal"], ["biweekly", "Quinzenal"], ["monthly", "Mensal"], ["manual", "Manual"]].map(([value, label]) => ({ value, label }))} />
            <PanelRow label="status" value={u.aiLearnStatus || "pending"} color={statusColor(u.aiLearnStatus)} />
          </>}
          <SubTitle>chat widget</SubTitle>
          <Toggle label="Chat da IA nesta página" value={u.chatEnabled} onChange={v => setU(u.id, "chatEnabled", v)} desc="Widget conversacional flutuante" />
          <button onClick={() => delU(u.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6, color: C.dim, display: "flex", alignSelf: "flex-start" }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(14)} remover</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Banner tone="info" icon={Icon.link(13)}>Links públicos automáticos + URLs próprias que a IA pode aprender e onde o chat pode atuar.</Banner>
      <SubTitle>links automáticos (checkouts & planos)</SubTitle>
      {links.length === 0 ? <EmptyState>Crie um plano ou checkout para gerar links</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {links.map(l => (
            <div key={l.id} style={{ padding: "11px 14px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ fontFamily: FONT, fontSize: 12, color: C.silver, fontWeight: 500, marginBottom: 6 }}>{l.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontFamily: MONO, fontSize: 11, color: C.muted, padding: "6px 9px", background: C.void, border: `1px solid ${C.divider}`, borderRadius: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.url}</span>
                <button onClick={() => copy(l.url, l.id)} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", padding: "6px 8px", color: copied === l.id ? C.green : C.muted, display: "flex" }}>{copied === l.id ? Icon.check(13) : Icon.copy(13)}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <SubTitle right={patch && <CTA small variant="ember" onClick={addUrl}>{Icon.plus(11)} URL</CTA>}>URLs próprias (IA & chat)</SubTitle>
      {urls.length === 0 ? <EmptyState>Nenhuma URL personalizada</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {urls.map(u => (
            <div key={u.id} onClick={() => setSel(u.id)} style={{ padding: "11px 14px", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.borderColor = C.ember} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontFamily: FONT, fontSize: 12.5, color: C.silver }}>{u.description}</span>
                {u.aiLearning && <Pill color={statusColor(u.aiLearnStatus)} bg={C.raised} border={C.divider}>IA {u.aiLearnStatus}</Pill>}
                {u.chatEnabled && <Pill color={C.ember} bg={C.raised} border={C.divider}>chat</Pill>}
                {u.isPrivate && <Pill color={C.dim} bg={C.raised} border={C.divider}>privada</Pill>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   AFILIAR · PAINÉIS RICOS · marketplace, detalhe do produto, minhas afiliações
   Lógica real: solicitar afiliação (PENDING→APPROVED), salvar, copiar link,
   projeção de ganhos, métricas de link (clicks/sales/revenue).
   ════════════════════════════════════════════════════════════════════════ */

/* Painel do SOL "Afiliar" — visão geral de ganhos + ramos */
function AffiliateOverview({ affiliate }) {
  const { C } = useTheme();
  const approved = affiliate.marketplace.filter(m => m.requestStatus === "APPROVED" || m.affiliateLink);
  const saved = affiliate.marketplace.filter(m => m.isSaved);
  const earnings = approved.reduce((s, m) => s + (m.earned || 0), 0);
  return (
    <>
      <div style={{ textAlign: "center", padding: "8px 0 18px" }}>
        <Tag color={C.dim}>ganhos totais como afiliado</Tag>
        <div style={{ fontFamily: MONO, fontSize: 44, fontWeight: 700, color: C.green, letterSpacing: -1, marginTop: 6 }}>{brlFromCents(earnings)}</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: earnings > 0 ? C.green : C.dim, marginTop: 2 }}>{earnings > 0 ? `${approved.length} links ativos` : "sem ganhos ainda"}</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {[["Marketplace", affiliate.marketplace.length, "disponíveis"], ["Aprovadas", approved.length, "links ativos"], ["Salvos", saved.length, "p/ depois"]].map(([l, v, s]) => (
          <div key={l} style={{ flex: 1, padding: "12px 10px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: C.silver }}>{v}</div>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, letterSpacing: 0.5, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      <Banner tone="success" icon={Icon.users(13)}>Cada produto que você se afilia vira um nó. Aprovação acende a conexão com "Minhas afiliações" e libera o link rastreável.</Banner>
    </>
  );
}

/* Painel de um ramo (Marketplace / Minhas / Salvos) */
function AffiliateBranchPanel({ node, affiliate, patchMyAffiliate }) {
  const { C } = useTheme();
  const key = node.meta?.branchKey;
  if (key === "produtor") return <MyAffiliatesPanel affiliate={affiliate} patchMyAffiliate={patchMyAffiliate} />;
  let items = affiliate.marketplace;
  if (key === "minhas") items = items.filter(m => m.requestStatus === "APPROVED" || m.affiliateLink);
  else if (key === "salvos") items = items.filter(m => m.isSaved);
  const desc = { marketplace: "Todos os produtos de outros produtores disponíveis para você afiliar. Clique num nó-produto para ver comissão, materiais e solicitar.", minhas: "Produtos cuja afiliação foi aprovada. Cada um tem um link rastreável com cliques, vendas e receita.", salvos: "Produtos que você marcou para analisar depois." }[key];
  return (
    <>
      <PanelDescription>{desc}</PanelDescription>
      <PanelDivider />
      <Tag color={C.muted} weight={600}>{items.length} {key === "marketplace" ? "produtos" : "itens"}</Tag>
      {items.length === 0 ? <div style={{ marginTop: 10 }}><EmptyState>Nada aqui ainda</EmptyState></div> : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: m.requestStatus === "APPROVED" || m.affiliateLink ? C.green : C.ember }} />
              <span style={{ flex: 1, fontFamily: FONT, fontSize: 12, color: C.text }}>{m.name}</span>
              <Tag color={C.green}>{m.commission}%</Tag>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* Painel do nó-produto do marketplace — detalhe + ações reais */
function AffiliateProductPanel({ node, affiliate, patchAffiliate }) {
  const { C } = useTheme();
  const m = affiliate.marketplace.find(x => x.id === node.meta?.marketId);
  const [copied, setCopied] = useState(false);
  if (!m) return null;
  const cps = (m.price * m.commission) / 100; // comissão por venda (centavos)
  const approved = m.requestStatus === "APPROVED" || m.affiliateLink;
  const pending = m.requestStatus === "PENDING";

  const request = () => patchAffiliate(mid => ({ ...mid, requestStatus: mid.id === m.id ? "PENDING" : mid.requestStatus }), m.id);
  const approve = () => patchAffiliate(mid => ({ ...mid, requestStatus: "APPROVED", affiliateLink: `kloel.com/r/${m.id}-dan`, earned: mid.earned || 0 }), m.id);
  const toggleSave = () => patchAffiliate(mid => ({ ...mid, isSaved: !mid.isSaved }), m.id);
  const copyLink = () => { try { navigator.clipboard?.writeText(m.affiliateLink); } catch {} setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <>
      <div style={{ textAlign: "center", padding: "6px 0 16px" }}>
        <Tag color={C.dim}>comissão</Tag>
        <div style={{ fontFamily: MONO, fontSize: 40, fontWeight: 700, color: C.green, letterSpacing: -1, marginTop: 4 }}>{m.commission}%</div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.silver, marginTop: 2 }}>{brlFromCents(cps)} por venda</div>
      </div>
      <PanelRow label="produtor" value={m.producer} />
      <PanelRow label="preço" value={brlFromCents(m.price)} />
      <PanelRow label="categoria" value={m.category} />
      <PanelRow label="cookie" value={`${m.cookieDays} dias`} />
      <PanelRow label="temperatura" value={tempLabel(m.temperature)} color={tempColor(m.temperature, C)} sub={`${m.totalAffiliates} afiliados · ${m.sales} vendas`} />
      <PanelRow label="avaliação" value={`★ ${m.rating}`} sub={`${m.totalReviews} reviews`} />
      <PanelDivider />
      <Tag color={C.muted}>materiais de divulgação</Tag>
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(m.materials || []).map(mt => <Pill key={mt} color={C.green} bg={C.raised} border={C.divider}>{mt}</Pill>)}
      </div>
      <PanelDivider />
      {/* projeção */}
      <Tag color={C.muted}>projeção de ganhos</Tag>
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        {[["15 vendas", cps * 15], ["50 vendas", cps * 50], ["100 vendas", cps * 100]].map(([l, v]) => (
          <div key={l} style={{ flex: 1, padding: "10px 8px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6, textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: C.green }}>{brlFromCents(v)}</div>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        {approved ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, fontFamily: MONO, fontSize: 11, color: C.muted, padding: "8px 10px", background: C.void, border: `1px solid ${C.divider}`, borderRadius: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.affiliateLink}</span>
              <button onClick={copyLink} style={{ background: copied ? C.green : C.ember, border: "none", borderRadius: 5, cursor: "pointer", padding: "8px 10px", color: "#fff", display: "flex" }}>{copied ? Icon.check(14) : Icon.copy(14)}</button>
            </div>
            <Banner tone="success" icon={Icon.check(13)}>Afiliação aprovada · link rastreável ativo. Use nos seus canais conectados.</Banner>
          </>
        ) : pending ? (
          <>
            <CTA variant="line" fullWidth disabled>solicitação enviada · aguardando</CTA>
            <CTA variant="ember" small fullWidth onClick={approve}>simular aprovação (demo)</CTA>
          </>
        ) : (
          <CTA variant="ember" fullWidth onClick={request}>{Icon.users(13)} solicitar afiliação</CTA>
        )}
        <button onClick={toggleSave} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", padding: "9px", fontFamily: FONT, fontSize: 12, color: m.isSaved ? C.ember : C.muted, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all .15s ease" }}>
          {m.isSaved ? "★ salvo" : "☆ salvar para depois"}
        </button>
      </div>
    </>
  );
}


/* ════════════════════════════════════════════════════════════════════════
   CARTEIRA · PAINÉIS · saldo, saque, antecipação, extrato (lógica real)
   ════════════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════════════
   AFILIAR · LADO PRODUTOR · gerir afiliados dos MEUS produtos (parcerias/)
   Lista + aprovar pendentes + detalhe (performance mensal, links, chat).
   ════════════════════════════════════════════════════════════════════════ */
function Sparkline({ data, color }) {
  const { C } = useTheme();
  const max = Math.max(1, ...data);
  const w = 100, h = 34, n = data.length;
  const pts = data.map((v, i) => [(i / (n - 1)) * w, h - (v / max) * (h - 4) - 2]);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: "block" }}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={1.6} fill={color} />)}
    </svg>
  );
}

function MyAffiliatesPanel({ affiliate, patchMyAffiliate }) {
  const { C } = useTheme();
  const list = affiliate.myAffiliates || [];
  const active = list.filter(a => a.status === "active");
  const pending = list.filter(a => a.status === "pending");
  const totalRev = active.reduce((s, a) => s + (a.revenue || 0), 0);
  const totalComm = active.reduce((s, a) => s + ((a.revenue || 0) * (a.commission || 0)) / 100, 0);
  const approve = (id) => patchMyAffiliate(id, a => ({ ...a, status: "active" }));
  const reject = (id) => patchMyAffiliate(id, a => ({ ...a, status: "rejected" }), true);
  return (
    <>
      <PanelDescription>Quem promove os seus produtos. Aprove solicitações, acompanhe performance e fale com cada parceiro.</PanelDescription>
      <div style={{ display: "flex", gap: 8, margin: "14px 0" }}>
        {[["Afiliados", active.length, ""], ["Receita gerada", "", brl(totalRev)], ["Comissão paga", "", brl(Math.round(totalComm))]].map(([l, v, vv], i) => (
          <div key={i} style={{ flex: 1, padding: "11px 8px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: v !== "" ? 20 : 13, fontWeight: 700, color: i === 0 ? C.silver : i === 1 ? C.green : C.ember }}>{v !== "" ? v : vv}</div>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      {pending.length > 0 && (
        <>
          <SubTitle>solicitações pendentes ({pending.length})</SubTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
            {pending.map(a => (
              <div key={a.id} style={{ padding: "11px 14px", background: "transparent", border: `1px dashed ${C.amber}66`, borderRadius: 6, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 28, height: 28, borderRadius: 99, background: C.emberSoft, color: C.ember, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 12, flexShrink: 0 }}>{a.name[0]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver }}>{a.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim }}>{a.commission}% · quer promover</div>
                </div>
                <button onClick={() => reject(a.id)} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", padding: "6px 10px", fontFamily: FONT, fontSize: 11, color: C.muted }}>recusar</button>
                <CTA small variant="ember" onClick={() => approve(a.id)}>aprovar</CTA>
              </div>
            ))}
          </div>
        </>
      )}
      <SubTitle>parceiros ativos</SubTitle>
      {active.length === 0 ? <EmptyState>Nenhum afiliado ativo ainda</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {active.map(a => {
            const tc = tempColor(a.temperature, C);
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
                <span style={{ width: 32, height: 32, borderRadius: 99, background: a.type === "producer" ? "rgba(139,92,246,0.14)" : C.emberSoft, color: a.type === "producer" ? "#a78bfa" : C.ember, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 13, flexShrink: 0 }}>{a.name[0]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver, fontWeight: 500 }}>{a.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim }}>{a.totalSales} vendas · {brl(a.revenue)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: tc }}>{a.temperature}%</div>
                  <div style={{ width: 44, height: 4, background: C.faint, borderRadius: 99, marginTop: 3, overflow: "hidden" }}><div style={{ width: `${a.temperature}%`, height: "100%", background: tc }} /></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Banner tone="info" icon={Icon.users(13)}>Clique num nó-parceiro no graph para ver performance mensal, links rastreáveis e abrir o chat.</Banner>
    </>
  );
}

/* Painel de um parceiro específico (nó affPartner) */
function AffiliatePartnerPanel({ node, affiliate, patchMyAffiliate }) {
  const { C } = useTheme();
  const a = (affiliate.myAffiliates || []).find(x => x.id === node.meta?.affId);
  const chat = (affiliate.partnerChats || []).find(c => c.name === a?.name);
  const [msg, setMsg] = useState("");
  if (!a) return null;
  const commEarned = ((a.revenue || 0) * (a.commission || 0)) / 100;
  const pending = a.status === "pending";
  const months = ["jan", "fev", "mar", "abr", "mai", "jun"];
  const send = () => {
    if (!msg.trim() || !chat) return;
    patchMyAffiliate(a.id, x => x, false, { chatName: a.name, text: msg.trim() });
    setMsg("");
  };
  return (
    <>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 11px", borderRadius: 99, background: a.type === "producer" ? "rgba(139,92,246,0.12)" : C.emberSoft, border: `1px solid ${a.type === "producer" ? "rgba(139,92,246,0.3)" : C.emberBorder}`, marginBottom: 14 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: a.type === "producer" ? "#a78bfa" : C.ember, letterSpacing: 1.4, fontWeight: 600, textTransform: "uppercase" }}>{a.type === "producer" ? "produtor parceiro" : "afiliado"}{pending ? " · pendente" : ""}</span>
      </div>
      {pending ? (
        <>
          <PanelRow label="comissão solicitada" value={`${a.commission}%`} />
          <PanelRow label="desde" value={new Date(a.joined).toLocaleDateString("pt-BR")} />
          <div style={{ marginTop: 16 }}><CTA variant="ember" fullWidth onClick={() => patchMyAffiliate(a.id, x => ({ ...x, status: "active" }))}>{Icon.check(13)} aprovar afiliação</CTA></div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[["vendas", a.totalSales, C.silver], ["receita", brl(a.revenue), C.green], ["comissão", brl(Math.round(commEarned)), C.ember]].map(([l, v, col]) => (
              <div key={l} style={{ flex: 1, padding: "11px 8px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: col }}>{v}</div>
                <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
          {/* performance mensal */}
          <SubTitle>performance · 6 meses</SubTitle>
          <div style={{ padding: "12px 14px 8px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8 }}>
            <Sparkline data={a.monthlyPerformance} color={C.ember} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>{months.map(m => <span key={m} style={{ fontFamily: MONO, fontSize: 8, color: C.dim }}>{m}</span>)}</div>
          </div>
          <PanelRow label="temperatura" value={`${a.temperature}%`} color={tempColor(a.temperature, C)} />
          {a.products.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Tag color={C.muted}>produtos promovidos</Tag>
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>{a.products.map(p => <Pill key={p} color={C.silver} bg={C.raised} border={C.divider}>{p}</Pill>)}</div>
            </div>
          )}
          {/* chat com o parceiro */}
          {chat && (
            <>
              <SubTitle>{Icon.chat ? "" : ""}chat com {a.name.split(" ")[0]}</SubTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflow: "auto", padding: "4px 0" }}>
                {chat.messages.map(m => (
                  <div key={m.id} style={{ alignSelf: m.isMe ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                    <div style={{ padding: "8px 11px", borderRadius: 10, background: m.isMe ? C.ember : C.raised, color: m.isMe ? "#fff" : C.text, fontFamily: FONT, fontSize: 12, lineHeight: 1.4, border: m.isMe ? "none" : `1px solid ${C.divider}` }}>{m.text}</div>
                    <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2, textAlign: m.isMe ? "right" : "left" }}>{m.time}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); send(); } }} placeholder="mensagem..." style={{ flex: 1, height: 34, padding: "0 11px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.paper, color: C.text, fontFamily: FONT, fontSize: 12, outline: "none" }} />
                <button onClick={send} disabled={!msg.trim()} style={{ background: msg.trim() ? C.ember : C.faint, border: "none", borderRadius: 6, cursor: msg.trim() ? "pointer" : "default", padding: "0 12px", color: "#fff", display: "flex", alignItems: "center" }}>{Icon.arrow(14)}</button>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}


/* ════════════════════════════════════════════════════════════════════════
   EDUCAR · PAINÉIS · área de membros (overview, módulos→aulas, alunos, cert.)
   ════════════════════════════════════════════════════════════════════════ */
const MA_SECTIONS = [["overview", "Visão"], ["conteudo", "Conteúdo"], ["alunos", "Alunos"], ["config", "Config"]];
const LESSON_TYPES = [["video", "Vídeo"], ["text", "Texto"], ["quiz", "Quiz"], ["download", "Download"]];

/* ════════════════════════════════════════════════════════════════════════
   CONVERSAR · PAINÉIS · Inbox, CRM (pipeline/deals), Contatos (lead/sentimento)
   ════════════════════════════════════════════════════════════════════════ */
function ConversarBranchPanel({ node, conversar, patchConversar }) {
  const { C } = useTheme();
  const key = node.meta?.branchKey;
  if (key === "crm") return <CrmPanel conversar={conversar} patchConversar={patchConversar} />;
  if (key === "vendas") return <VendasPanel conversar={conversar} />;
  if (key === "anuncios") return <AnunciosPanel conversar={conversar} patchConversar={patchConversar} />;
  if (key === "autopilot") return <AutopilotPanel conversar={conversar} />;
  if (key === "inbox") {
    const convs = conversar.conversations || [];
    const unread = convs.reduce((s, c) => s + (c.unreadCount || 0), 0);
    return (
      <>
        <PanelDescription>Todas as conversas dos seus canais em um só lugar. Cada conversa é um nó; clique para abrir a thread.</PanelDescription>
        <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
          {[["conversas", convs.length], ["não lidas", unread], ["abertas", convs.filter(c => c.status === "OPEN").length]].map(([l, v]) => (
            <div key={l} style={{ flex: 1, padding: "11px 8px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: l === "não lidas" && v > 0 ? C.ember : C.silver }}>{v}</div>
              <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {convs.map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: c.status === "OPEN" ? C.green : c.status === "PENDING" ? C.amber : C.dim, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver }}>{c.contactName}</div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.dim }}>{c.channel} · {c.lastMessageAt}</div>
              </div>
              {c.unreadCount > 0 && <Pill color={C.ember} bg={C.emberSoft} border={C.emberBorder}>{c.unreadCount}</Pill>}
            </div>
          ))}
        </div>
      </>
    );
  }
  // contatos
  const contacts = conversar.contacts || [];
  return (
    <>
      <PanelDescription>Sua base de contatos enriquecida pela IA: lead score, sentimento, probabilidade de compra e próxima melhor ação.</PanelDescription>
      <SubTitle>contatos ({contacts.length})</SubTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {contacts.map(ct => (
          <div key={ct.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
            <span style={{ width: 30, height: 30, borderRadius: 99, background: C.emberSoft, color: C.ember, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 12, flexShrink: 0 }}>{ct.name[0]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver }}>{ct.name}</div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: sentimentColor(ct.sentiment, C) }}>{ct.sentiment} · score {ct.leadScore}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function CrmPanel({ conversar, patchConversar }) {
  const { C } = useTheme();
  const crm = conversar.crm;
  const totalOpen = crm.deals.filter(d => d.status === "OPEN").reduce((s, d) => s + d.value, 0);
  const won = crm.deals.filter(d => d.status === "WON").reduce((s, d) => s + d.value, 0);
  // move deal to next stage
  const advance = (dealId) => patchConversar(c => {
    const stages = c.crm.stages;
    return { ...c, crm: { ...c.crm, deals: c.crm.deals.map(d => {
      if (d.id !== dealId) return d;
      const idx = stages.findIndex(s => s.id === d.stageId);
      const next = stages[Math.min(stages.length - 1, idx + 1)];
      return { ...d, stageId: next.id, status: next.order === stages.length - 1 ? "WON" : "OPEN" };
    }) } };
  });
  return (
    <>
      <PanelDescription>{crm.pipeline.name} · arraste mentalmente: toque numa negociação para avançá-la de estágio.</PanelDescription>
      <div style={{ margin: "12px 0", padding: "12px 13px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8 }}>
        <Tag color={C.muted} weight={600}>módulos do CRM</Tag>
        <div style={{ fontFamily: FONT, fontSize: 11.5, color: C.dim, margin: "5px 0 10px", lineHeight: 1.45 }}>Ative para conectar. Cada módulo ligado vira um sub-nó do CRM no grafo.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {[["inbox", "Inbox"], ["contatos", "Contatos"], ["vendas", "Vendas"], ["anuncios", "Anúncios"], ["autopilot", "Autopilot"]].map(([k, label]) => (
            <Toggle key={k} label={label} value={(conversar.crmModules || {})[k] === true} onChange={v => patchConversar(c => ({ ...c, crmModules: { ...(c.crmModules || {}), [k]: v } }))} />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        {[["aberto", brl(totalOpen * 100)], ["ganho", brl(won * 100)], ["negócios", crm.deals.length]].map(([l, v]) => (
          <div key={l} style={{ flex: 1, padding: "11px 8px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: l === "negócios" ? 20 : 14, fontWeight: 700, color: l === "ganho" ? C.green : C.silver }}>{v}</div>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      {/* colunas do pipeline */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {crm.stages.map(st => {
          const deals = crm.deals.filter(d => d.stageId === st.id);
          return (
            <div key={st.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: st.color }} />
                <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>{st.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.dim, marginLeft: "auto" }}>{deals.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {deals.length === 0 ? <div style={{ fontFamily: FONT, fontSize: 11, color: C.dim, padding: "4px 0" }}>—</div> : deals.map(d => (
                  <div key={d.id} style={{ padding: "10px 12px", background: C.raised, border: `1px solid ${C.divider}`, borderLeft: `3px solid ${priorityColor(d.priority, C)}`, borderRadius: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: FONT, fontSize: 12, color: C.silver, fontWeight: 500 }}>{d.title}</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim }}>{d.contact?.name} · {brl(d.value * 100)}</div>
                      </div>
                      {d.status === "WON" ? <Pill color={C.green} bg={C.raised} border={C.divider}>ganho</Pill>
                        : <button onClick={() => advance(d.id)} style={{ background: C.emberSoft, border: `1px solid ${C.emberBorder}`, borderRadius: 5, cursor: "pointer", padding: "4px 8px", color: C.ember, fontFamily: MONO, fontSize: 9.5, fontWeight: 600 }}>avançar →</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function VendasPanel({ conversar }) {
  const { C } = useTheme();
  const [filter, setFilter] = useState("all");
  const orders = conversar.orders || [];
  const paid = orders.filter(o => o.status === "PAID");
  const revenue = paid.reduce((s, o) => s + o.totalInCents, 0);
  const filtered = filter === "all" ? orders : orders.filter(o => o.kind === filter);
  const kindLabel = { single: "Avulso", subscription: "Assinatura", physical: "Físico" };
  return (
    <>
      <PanelDescription>Todas as vendas realizadas: avulsas, assinaturas e produtos físicos. Cada pedido é um nó; clique para ver pagamento, cliente e rastreio.</PanelDescription>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        {[["receita paga", brl(revenue)], ["pedidos", orders.length], ["pagos", paid.length]].map(([l, v]) => (
          <div key={l} style={{ flex: 1, padding: "11px 8px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: l === "receita paga" ? 14 : 20, fontWeight: 700, color: l === "receita paga" ? C.green : C.silver }}>{v}</div>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      <div className="hide-scrollbar" style={{ display: "flex", gap: 4, marginBottom: 10, overflowX: "auto" }}>
        {[["all", "Todas"], ["single", "Avulsas"], ["subscription", "Assinaturas"], ["physical", "Físicos"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ flexShrink: 0, padding: "5px 11px", background: filter === k ? C.ember : "transparent", color: filter === k ? "#fff" : C.muted, border: `1px solid ${filter === k ? C.ember : C.border}`, borderRadius: 99, cursor: "pointer", fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" }}>{l}</button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.length === 0 ? <EmptyState>Nenhuma venda</EmptyState> : filtered.map(o => {
          const [sl, sc] = ORDER_STATUS[o.status] || ["", "dim"];
          return (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.dim }}>{o.orderNumber}</span>
                  <span style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver }}>{o.customerName}</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.dim }}>{o.product} · {PAYMENT_LABEL[o.paymentMethod]}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.silver }}>{brl(o.totalInCents)}</div>
                <Pill color={C[sc] || C.dim} bg={C.void} border={C.divider}>{sl}</Pill>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function OrderPanel({ node, conversar, patchConversar }) {
  const { C } = useTheme();
  const o = (conversar.orders || []).find(x => x.id === node.meta?.orderId);
  if (!o) return null;
  const [sl, sc] = ORDER_STATUS[o.status] || ["", "dim"];
  const kindLabel = { single: "Avulso", subscription: "Assinatura", physical: "Físico" };
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: C.silver }}>{o.orderNumber}</span>
        <Pill color={C[sc] || C.dim} bg={C.raised} border={C.divider}>{sl}</Pill>
        <Pill color={C.muted} bg={C.raised} border={C.divider}>{kindLabel[o.kind] || o.kind}</Pill>
      </div>
      <div style={{ textAlign: "center", padding: "6px 0 14px" }}>
        <Tag color={C.dim}>total</Tag>
        <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, color: o.status === "PAID" ? C.green : C.silver, letterSpacing: -1, marginTop: 2 }}>{brl(o.totalInCents)}</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.dim, marginTop: 2 }}>{PAYMENT_LABEL[o.paymentMethod]}{o.installments > 1 ? ` · ${o.installments}×` : ""}</div>
      </div>
      <PanelRow label="cliente" value={o.customerName} />
      <PanelRow label="e-mail" value={o.customerEmail} />
      <PanelRow label="produto" value={o.product} />
      <PanelRow label="origem (UTM)" value={o.utmSource || "—"} />
      {o.paidAt && <PanelRow label="pago em" value={o.paidAt} />}
      <PanelDivider />
      <Field label="código de rastreio" value={o.trackingCode || ""} onChange={v => patchConversar && patchConversar(c => ({ ...c, orders: c.orders.map(x => x.id === o.id ? { ...x, trackingCode: v } : x) }))} mono placeholder="BR123456789" />
      {o.status === "PENDING" && <div style={{ marginTop: 14 }}><Banner tone="warning" icon={Icon.clock(13)}>Pagamento pendente. Acompanhe no gateway.</Banner></div>}
      {o.status === "REFUNDED" && <div style={{ marginTop: 14 }}><Banner tone="warning" icon={Icon.alert(13)}>Pedido estornado ao cliente.</Banner></div>}
    </>
  );
}


/* ── WAR ROOM · tráfego pago (Meta/Google/TikTok) + regras de IA ── */
function AnunciosPanel({ conversar, patchConversar }) {
  const { C } = useTheme();
  const camps = conversar.adCampaigns || [];
  const rules = conversar.adRules || [];
  const spend = camps.reduce((s, c) => s + c.spend, 0);
  const revenue = camps.reduce((s, c) => s + c.revenue, 0);
  const roas = spend > 0 ? (revenue / spend) : 0;
  const conv = camps.reduce((s, c) => s + c.conversions, 0);
  const toggleRule = (id) => patchConversar(c => ({ ...c, adRules: (c.adRules || []).map(r => r.id === id ? { ...r, active: !r.active } : r) }));
  const byPlat = {};
  for (const c of camps) { byPlat[c.platform] = byPlat[c.platform] || { spend: 0, revenue: 0 }; byPlat[c.platform].spend += c.spend; byPlat[c.platform].revenue += c.revenue; }
  return (
    <>
      <PanelDescription>War Room · todo o tráfego pago em um lugar. Métricas reais por campanha e regras de IA que pausam/escalam sozinhas.</PanelDescription>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        {[["gasto", brl(spend * 100)], ["receita", brl(revenue * 100)], ["ROAS", roas.toFixed(2)]].map(([l, v]) => (
          <div key={l} style={{ flex: 1, padding: "11px 6px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: l === "ROAS" ? 19 : 13, fontWeight: 700, color: l === "ROAS" ? (roas >= 2 ? C.green : C.amber) : l === "receita" ? C.green : C.silver }}>{v}</div>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      <SubTitle>por plataforma</SubTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {Object.entries(byPlat).map(([p, d]) => {
          const r = d.spend > 0 ? d.revenue / d.spend : 0;
          return (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
              <span style={{ flex: 1, fontFamily: FONT, fontSize: 12.5, color: C.silver }}>{AD_PLATFORMS[p] || p}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.dim }}>{brl(d.spend * 100)}</span>
              <Pill color={r >= 2 ? C.green : C.amber} bg={C.void} border={C.divider}>ROAS {r.toFixed(1)}</Pill>
            </div>
          );
        })}
      </div>
      <SubTitle>regras de IA</SubTitle>
      <PanelDescription>A IA monitora as campanhas e dispara estas ações automaticamente.</PanelDescription>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rules.map(r => (
          <div key={r.id} style={{ padding: "11px 14px", background: C.raised, border: `1px solid ${r.active ? C.emberBorder : C.divider}`, borderRadius: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span style={{ flex: 1, fontFamily: FONT, fontSize: 12.5, color: C.silver, fontWeight: 500 }}>{r.name}</span>
              {r.fireCount > 0 && <Pill color={C.muted} bg={C.void} border={C.divider}>{r.fireCount}× disparada</Pill>}
              <Toggle label="" value={r.active} onChange={() => toggleRule(r.id)} />
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim, lineHeight: 1.5 }}>
              <span style={{ color: C.amber }}>SE</span> {r.condition} <span style={{ color: C.ember }}>→</span> {r.action}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function AdCampaignPanel({ node, conversar, patchConversar }) {
  const { C } = useTheme();
  const ad = (conversar.adCampaigns || []).find(x => x.id === node.meta?.adId);
  if (!ad) return null;
  const on = ad.status === "ACTIVE";
  const toggle = () => patchConversar(c => ({ ...c, adCampaigns: c.adCampaigns.map(x => x.id === ad.id ? { ...x, status: x.status === "ACTIVE" ? "PAUSED" : "ACTIVE" } : x) }));
  const profit = ad.revenue - ad.spend;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Pill color={C.muted} bg={C.raised} border={C.divider}>{AD_PLATFORMS[ad.platform] || ad.platform}</Pill>
        <Pill color={on ? C.green : C.dim} bg={C.raised} border={C.divider}>{on ? "ativa" : "pausada"}</Pill>
      </div>
      <div style={{ textAlign: "center", padding: "6px 0 14px" }}>
        <Tag color={C.dim}>ROAS</Tag>
        <div style={{ fontFamily: MONO, fontSize: 38, fontWeight: 700, color: ad.roas >= 2 ? C.green : C.amber, letterSpacing: -1, marginTop: 2 }}>{ad.roas.toFixed(2)}</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: profit >= 0 ? C.green : C.red, marginTop: 2 }}>{profit >= 0 ? "+" : ""}{brl(profit * 100)} de lucro</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[["gasto", brl(ad.spend * 100)], ["receita", brl(ad.revenue * 100)], ["conversões", ad.conversions], ["impressões", ad.impressions.toLocaleString("pt-BR")], ["cliques", ad.clicks.toLocaleString("pt-BR")], ["CTR", ad.ctr + "%"], ["CPC", brl(ad.cpc * 100)]].map(([l, v]) => (
          <div key={l} style={{ padding: "9px 10px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginBottom: 2 }}>{l}</div>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: C.silver }}>{v}</div>
          </div>
        ))}
      </div>
      <CTA fullWidth variant={on ? "line" : "ember"} onClick={toggle}>{on ? "pausar campanha" : "ativar campanha"}</CTA>
    </>
  );
}


/* ── AUTOPILOT · a IA agindo sozinha (eventos + follow-ups agendados) ── */
function AutopilotPanel({ conversar }) {
  const { C } = useTheme();
  const events = conversar.autopilotEvents || [];
  const followups = conversar.followups || [];
  const executed = events.filter(e => e.status === "executed").length;
  const errors = events.filter(e => e.status === "error").length;
  const pending = followups.filter(f => f.status === "scheduled").length;
  const statusMap = { executed: ["executada", C.green], skipped: ["pulada", C.amber], error: ["erro", C.red] };
  return (
    <>
      <PanelDescription>Marketing Artificial em ação. A IA detecta intenções, responde e agenda follow-ups sem você mexer um dedo.</PanelDescription>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        {[["ações", events.length], ["executadas", executed], ["agendadas", pending]].map(([l, v]) => (
          <div key={l} style={{ flex: 1, padding: "11px 8px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: l === "executadas" ? C.green : C.silver }}>{v}</div>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      <SubTitle>atividade recente</SubTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {events.map(e => {
          const [sl, sc] = statusMap[e.status] || ["", C.dim];
          return (
            <div key={e.id} style={{ padding: "11px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderLeft: `3px solid ${sc}`, borderRadius: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ flex: 1, fontFamily: FONT, fontSize: 12, color: C.silver, fontWeight: 500 }}>{e.contactName}</span>
                <Pill color={sc} bg={C.void} border={C.divider}>{sl}</Pill>
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.dim }}>{e.time}</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.dim, marginBottom: e.messageSent || e.reason ? 4 : 0 }}>
                <span style={{ color: C.blue }}>{e.intent}</span> <span style={{ color: C.ember }}>→</span> {e.action}{e.latencyMs ? ` · ${e.latencyMs}ms` : ""}
              </div>
              {e.messageSent && <div style={{ fontFamily: FONT, fontSize: 11, color: C.muted, fontStyle: "italic" }}>"{e.messageSent}"</div>}
              {e.reason && !e.messageSent && <div style={{ fontFamily: FONT, fontSize: 10.5, color: e.status === "error" ? C.red : C.dim }}>{e.reason}</div>}
            </div>
          );
        })}
      </div>
      <SubTitle>follow-ups agendados</SubTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {followups.length === 0 ? <EmptyState>Nenhum follow-up</EmptyState> : followups.map(f => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
            <span style={{ color: f.status === "sent" ? C.green : C.amber, display: "flex", flexShrink: 0 }}>{Icon.clock(15)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT, fontSize: 12, color: C.silver }}>{f.contactName}</div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.dim }}>{f.reason}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>{f.scheduledFor}</div>
              <Pill color={f.status === "sent" ? C.green : C.amber} bg={C.void} border={C.divider}>{f.status === "sent" ? "enviado" : "agendado"}</Pill>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}


function ContactPanel({ node, conversar, patchConversar }) {
  const { C } = useTheme();
  const ct = (conversar.contacts || []).find(x => x.id === node.meta?.contactId);
  const [tagInput, setTagInput] = useState("");
  if (!ct) return null;
  const probColor = { HIGH: C.green, MEDIUM: C.amber, LOW: C.dim }[ct.purchaseProbability] || C.dim;
  const upd = (k, v) => patchConversar && patchConversar(c => ({ ...c, contacts: c.contacts.map(x => x.id === ct.id ? { ...x, [k]: v } : x) }));
  const addTag = () => { const t = tagInput.trim(); if (t && !(ct.tags || []).includes(t)) upd("tags", [...(ct.tags || []), t]); setTagInput(""); };
  return (
    <>
      <div style={{ textAlign: "center", padding: "6px 0 14px" }}>
        <div style={{ width: 52, height: 52, borderRadius: 99, background: C.emberSoft, color: C.ember, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 22, margin: "0 auto 8px" }}>{ct.name[0]}</div>
        <Tag color={C.dim}>lead score</Tag>
        <div style={{ fontFamily: MONO, fontSize: 36, fontWeight: 700, color: sentimentColor(ct.sentiment, C), letterSpacing: -1, marginTop: 2 }}>{ct.leadScore}</div>
      </div>
      <PanelRow label="telefone" value={ct.phone} />
      <PanelRow label="e-mail" value={ct.email} />
      <PanelRow label="sentimento" value={ct.sentiment} color={sentimentColor(ct.sentiment, C)} />
      <PanelRow label="prob. de compra" value={ct.purchaseProbability} color={probColor} />
      <div style={{ margin: "10px 0" }}><Toggle label="Opt-in (aceita contato)" value={ct.optIn === true} onChange={v => upd("optIn", v)} /></div>
      <div style={{ marginTop: 8 }}>
        <Tag color={C.muted}>tags</Tag>
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {(ct.tags || []).map(t => <button key={t} onClick={() => upd("tags", ct.tags.filter(x => x !== t))} style={{ padding: "3px 9px", borderRadius: 99, background: C.emberSoft, border: `1px solid ${C.emberBorder}`, color: C.ember, fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>{t} ×</button>)}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="nova tag + Enter" style={{ flex: 1, height: 32, padding: "0 11px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.paper, color: C.text, fontFamily: FONT, fontSize: 12, outline: "none" }} />
          <CTA small variant="line" onClick={addTag}>add</CTA>
        </div>
      </div>
      <PanelDivider />
      <Tag color={C.muted}>próxima melhor ação (IA)</Tag>
      <div style={{ marginTop: 6, padding: "10px 12px", background: C.emberSoft, border: `1px solid ${C.emberBorder}`, borderRadius: 6, fontFamily: FONT, fontSize: 12.5, color: C.ember, fontWeight: 500 }}>{ct.nextBestAction || "—"}</div>
      <div style={{ marginTop: 12 }}><TextArea label="anotações" value={ct.notes || ""} onChange={v => upd("notes", v)} rows={3} placeholder="Notas internas sobre este contato..." /></div>
      {ct.aiSummary && <>
        <div style={{ marginTop: 12 }}><Tag color={C.muted}>resumo da IA</Tag></div>
        <p style={{ margin: "6px 0 0", fontFamily: FONT, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{ct.aiSummary}</p>
      </>}
      {ct.insights?.length > 0 && <>
        <SubTitle>insights</SubTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ct.insights.map(i => (
            <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
              <span style={{ flex: 1, fontFamily: FONT, fontSize: 11.5, color: C.text }}>{i.description}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: i.scoreChange >= 0 ? C.green : C.red }}>{i.scoreChange >= 0 ? "+" : ""}{i.scoreChange}</span>
            </div>
          ))}
        </div>
      </>}
    </>
  );
}

function ConversationPanel({ node, conversar, patchConversar }) {
  const { C } = useTheme();
  const conv = (conversar.conversations || []).find(x => x.id === node.meta?.convId);
  const [msg, setMsg] = useState("");
  if (!conv) return null;
  const send = () => {
    if (!msg.trim()) return;
    patchConversar(c => ({ ...c, conversations: c.conversations.map(x => x.id === conv.id ? { ...x, messages: [...x.messages, { id: `m-${Date.now()}`, direction: "OUTBOUND", type: "TEXT", content: msg.trim(), status: "SENT", time: "agora" }], unreadCount: 0, lastMessageAt: "agora" } : x) }));
    setMsg("");
  };
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Pill color={conv.status === "OPEN" ? C.green : C.amber} bg={C.raised} border={C.divider}>{conv.status}</Pill>
        <Pill color={priorityColor(conv.priority, C)} bg={C.raised} border={C.divider}>{conv.priority}</Pill>
        <Pill color={C.muted} bg={C.raised} border={C.divider}>{conv.channel}</Pill>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflow: "auto", padding: "4px 0" }}>
        {conv.messages.map(m => {
          const me = m.direction === "OUTBOUND";
          return (
            <div key={m.id} style={{ alignSelf: me ? "flex-end" : "flex-start", maxWidth: "82%" }}>
              <div style={{ padding: "8px 11px", borderRadius: 10, background: me ? C.ember : C.raised, color: me ? "#fff" : C.text, fontFamily: FONT, fontSize: 12.5, lineHeight: 1.4, border: me ? "none" : `1px solid ${C.divider}` }}>
                {m.mediaUrl && <div style={{ marginBottom: m.content ? 6 : 0, display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 10, opacity: 0.85 }}>{Icon.box(11)} {m.type === "IMAGE" ? "imagem" : m.type === "AUDIO" ? "áudio" : m.type === "VIDEO" ? "vídeo" : "anexo"}</div>}
                {m.content}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2, textAlign: me ? "right" : "left" }}>{m.time}{me ? ` · ${m.status?.toLowerCase()}` : ""}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); send(); } }} placeholder="responder..." style={{ flex: 1, height: 36, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.paper, color: C.text, fontFamily: FONT, fontSize: 12.5, outline: "none" }} />
        <button onClick={send} disabled={!msg.trim()} style={{ background: msg.trim() ? C.ember : C.faint, border: "none", borderRadius: 6, cursor: msg.trim() ? "pointer" : "default", padding: "0 14px", color: "#fff", display: "flex", alignItems: "center" }}>{Icon.arrow(15)}</button>
      </div>
    </>
  );
}


function MemberAreaPanel({ node, educar, patchArea }) {
  const { C } = useTheme();
  const a = (educar?.areas || []).find(x => x.id === node.meta?.areaId);
  const [sec, setSec] = useState("overview");
  const [openMod, setOpenMod] = useState(null);
  if (!a) return null;
  const st = areaStats(a);

  // mutators
  const addModule = () => patchArea(a.id, ar => ({ ...ar, modules: [...ar.modules, { id: `mo-${Date.now()}`, name: "Novo módulo", description: "", position: ar.modules.length, releaseType: "immediate", active: true, lessons: [] }] }));
  const setModule = (mid, k, v) => patchArea(a.id, ar => ({ ...ar, modules: ar.modules.map(m => m.id === mid ? { ...m, [k]: v } : m) }));
  const delModule = (mid) => patchArea(a.id, ar => ({ ...ar, modules: ar.modules.filter(m => m.id !== mid) }));
  const addLesson = (mid) => patchArea(a.id, ar => ({ ...ar, modules: ar.modules.map(m => m.id === mid ? { ...m, lessons: [...m.lessons, { id: `le-${Date.now()}`, name: "Nova aula", type: "video", position: m.lessons.length, videoUrl: "", active: true }] } : m) }));
  const setLesson = (mid, lid, k, v) => patchArea(a.id, ar => ({ ...ar, modules: ar.modules.map(m => m.id === mid ? { ...m, lessons: m.lessons.map(l => l.id === lid ? { ...l, [k]: v } : l) } : m) }));
  const delLesson = (mid, lid) => patchArea(a.id, ar => ({ ...ar, modules: ar.modules.map(m => m.id === mid ? { ...m, lessons: m.lessons.filter(l => l.id !== lid) } : m) }));
  const setFeat = (k, v) => patchArea(a.id, ar => ({ ...ar, [k]: v }));

  return (
    <>
      <div className="hide-scrollbar" style={{ display: "flex", gap: 4, marginBottom: 14, overflowX: "auto" }}>
        {MA_SECTIONS.map(([k, l]) => (
          <button key={k} onClick={() => setSec(k)} style={{ flexShrink: 0, padding: "6px 12px", background: sec === k ? C.ember : "transparent", color: sec === k ? "#fff" : C.muted, border: `1px solid ${sec === k ? C.ember : C.border}`, borderRadius: 99, cursor: "pointer", fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>{l}</button>
        ))}
      </div>

      {sec === "overview" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[["alunos", st.totalStudents], ["conclusão", `${st.avgCompletion}%`], ["★", a.avgRating]].map(([l, v]) => (
              <div key={l} style={{ flex: 1, padding: "11px 8px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: C.silver }}>{v}</div>
                <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {[["módulos", st.totalModules], ["aulas", st.totalLessons]].map(([l, v]) => (
              <div key={l} style={{ flex: 1, padding: "10px 8px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, color: C.ember }}>{v}</div>
                <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2 }}>{l} publicados</div>
              </div>
            ))}
          </div>
          <Banner tone="success" icon={Icon.box(13)}>{a.certificates ? "Emite certificado ao concluir." : "Certificados desativados."} {a.progressTrack ? "Progresso rastreado por aluno." : ""}</Banner>
        </>
      )}

      {sec === "conteudo" && (
        <>
          <SubTitle right={<CTA small variant="ember" onClick={addModule}>{Icon.plus(11)} módulo</CTA>}>módulos & aulas</SubTitle>
          {a.modules.length === 0 ? <EmptyState>Nenhum módulo ainda</EmptyState> : a.modules.map(m => (
            <div key={m.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 8, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 12px", background: C.raised, cursor: "pointer" }} onClick={() => setOpenMod(openMod === m.id ? null : m.id)}>
                <span style={{ color: C.muted, transform: openMod === m.id ? "rotate(90deg)" : "none", transition: "transform .15s ease", display: "flex" }}>{Icon.chevR ? Icon.chevR(13) : Icon.arrow(13)}</span>
                <span style={{ flex: 1, fontFamily: FONT, fontSize: 12.5, color: C.silver, fontWeight: 500 }}>{m.name}</span>
                <Pill color={C.dim} bg={C.void} border={C.divider}>{m.lessons.length} aulas</Pill>
                {m.releaseType === "drip" && <Pill color={C.amber} bg={C.void} border={C.divider}>drip {m.releaseDays}d</Pill>}
              </div>
              {openMod === m.id && (
                <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <Field label="nome do módulo" value={m.name} onChange={v => setModule(m.id, "name", v)} />
                  <SelectField label="liberação" value={m.releaseType} onChange={v => setModule(m.id, "releaseType", v)} options={[["immediate", "Imediata"], ["drip", "Gotejada (dias)"], ["scheduled", "Data agendada"]].map(([value, label]) => ({ value, label }))} />
                  {m.releaseType === "drip" && <Field label="liberar após (dias)" value={String(m.releaseDays ?? 7)} onChange={v => setModule(m.id, "releaseDays", parseInt(v) || 0)} mono type="number" />}
                  <SubTitle right={<CTA small variant="line" onClick={() => addLesson(m.id)}>{Icon.plus(10)} aula</CTA>}>aulas</SubTitle>
                  {m.lessons.map(l => (
                    <div key={l.id} style={{ border: `1px solid ${C.divider}`, borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <Field value={l.name} onChange={v => setLesson(m.id, l.id, "name", v)} placeholder="nome da aula" />
                        <button onClick={() => delLesson(m.id, l.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, display: "flex", padding: 2 }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(12)}</button>
                      </div>
                      <Row>
                        <SelectField half value={l.type} onChange={v => setLesson(m.id, l.id, "type", v)} options={LESSON_TYPES.map(([value, label]) => ({ value, label }))} />
                        <Field half value={String(l.durationMin ?? "")} onChange={v => setLesson(m.id, l.id, "durationMin", parseInt(v) || 0)} placeholder="min" mono type="number" />
                      </Row>
                      {l.type === "video" && <Field value={l.videoUrl || ""} onChange={v => setLesson(m.id, l.id, "videoUrl", v)} placeholder="URL do vídeo" mono />}
                      {l.type === "video" && <TextArea value={l.transcription || ""} onChange={v => setLesson(m.id, l.id, "transcription", v)} placeholder="transcrição (a IA usa p/ buscar e resumir)" rows={2} />}
                      {l.type === "text" && <TextArea value={l.textContent || ""} onChange={v => setLesson(m.id, l.id, "textContent", v)} placeholder="conteúdo em texto" rows={2} />}
                      {l.type === "download" && <Field value={l.downloadUrl || ""} onChange={v => setLesson(m.id, l.id, "downloadUrl", v)} placeholder="URL do arquivo" mono />}
                    </div>
                  ))}
                  <button onClick={() => delModule(m.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, display: "flex", alignSelf: "flex-start", fontFamily: FONT, fontSize: 11, alignItems: "center", gap: 4 }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(12)} remover módulo</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {sec === "alunos" && (
        <>
          <SubTitle>alunos matriculados ({a.enrollments.length})</SubTitle>
          {a.enrollments.length === 0 ? <EmptyState>Nenhum aluno ainda</EmptyState> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {a.enrollments.map(e => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 99, background: C.emberSoft, color: C.ember, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 12, flexShrink: 0 }}>{e.studentName[0]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver, fontWeight: 500 }}>{e.studentName}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim }}>{e.studentEmail}</div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 70 }}>
                    <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: e.progress >= 100 ? C.green : C.ember }}>{e.progress}%</div>
                    <div style={{ width: 60, height: 4, background: C.faint, borderRadius: 99, marginTop: 3, overflow: "hidden" }}><div style={{ width: `${e.progress}%`, height: "100%", background: e.progress >= 100 ? C.green : C.ember }} /></div>
                  </div>
                  {e.status === "completed" && <Pill color={C.green} bg={C.raised} border={C.divider}>✓</Pill>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {sec === "config" && (
        <>
          <Field label="nome da área" value={a.name} onChange={v => patchArea(a.id, ar => ({ ...ar, name: v }))} />
          <Field label="slug" value={a.slug} onChange={v => patchArea(a.id, ar => ({ ...ar, slug: v }))} mono />
          <TextArea label="descrição" value={a.description || ""} onChange={v => patchArea(a.id, ar => ({ ...ar, description: v }))} rows={2} />
          <SelectField label="template" value={a.template} onChange={v => patchArea(a.id, ar => ({ ...ar, template: v }))} options={[["classic", "Clássico"], ["netflix", "Netflix"], ["minimal", "Minimalista"]].map(([value, label]) => ({ value, label }))} />
          <Field label="domínio customizado" value={a.customDomain || ""} onChange={v => patchArea(a.id, ar => ({ ...ar, customDomain: v }))} mono placeholder="curso.seudominio.com" />
          <SubTitle>recursos</SubTitle>
          <Toggle label="Certificados" value={a.certificates} onChange={v => setFeat("certificates", v)} desc="Emite certificado na conclusão" />
          <Toggle label="Quizzes" value={a.quizzes} onChange={v => setFeat("quizzes", v)} />
          <Toggle label="Comunidade" value={a.community} onChange={v => setFeat("community", v)} />
          <Toggle label="Gamificação" value={a.gamification} onChange={v => setFeat("gamification", v)} />
          <Toggle label="Rastrear progresso" value={a.progressTrack} onChange={v => setFeat("progressTrack", v)} />
          <Toggle label="Downloads" value={a.downloads} onChange={v => setFeat("downloads", v)} />
          <Toggle label="Comentários" value={a.comments} onChange={v => setFeat("comments", v)} />
        </>
      )}
    </>
  );
}


function WalletOverview({ wallet, patchWallet }) {
  const { C } = useTheme();
  const b = wallet.balance;
  return (
    <>
      <div style={{ textAlign: "center", padding: "6px 0 16px" }}>
        <Tag color={C.dim}>saldo disponível</Tag>
        <div style={{ fontFamily: MONO, fontSize: 42, fontWeight: 700, color: C.green, letterSpacing: -1, marginTop: 4 }}>{brlFromCents(b.available)}</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["A liberar", b.pending, C.amber], ["Bloqueado", b.blocked, C.dim], ["Total", b.total, C.silver]].map(([l, v, col]) => (
          <div key={l} style={{ flex: 1, padding: "11px 8px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: col }}>{brlFromCents(v)}</div>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      <Banner tone="success" icon={Icon.bank(13)}>Saldo, Extrato, Saques, Antecipações, Vendas, Assinaturas, Abandonos e Estornos orbitam a massa Consultar. Cada saque, venda e antecipação vira um nó.</Banner>
    </>
  );
}

function WalletBranchPanel({ node, wallet, patchWallet }) {
  const { C } = useTheme();
  const key = node.meta?.branchKey;
  if (key === "saldo") return <WalletOverview wallet={wallet} patchWallet={patchWallet} />;
  if (key === "saques") return <WalletWithdraw wallet={wallet} patchWallet={patchWallet} />;
  if (key === "antecipacoes") return <WalletAnticipate wallet={wallet} patchWallet={patchWallet} />;
  if (key === "extrato") return <WalletExtrato wallet={wallet} />;
  if (key === "vendas") return <WalletVendas />;
  if (key === "assinaturas") return <WalletAssinaturas />;
  if (key === "abandonos") return <WalletAbandonos />;
  if (key === "estornos") return <WalletEstornos />;
  return <PanelDescription>Consultar.</PanelDescription>;
}

/* ── CONSULTAR · Vendas / Assinaturas / Abandonos / Estornos (telas de consulta) ── */
const ABANDONOS_SEED = [
  { id: "ab1", customerName: "Marina Costa", customerEmail: "marina@ex.com", product: "GHK-Cu Sérum", totalInCents: 19700, step: "Pagamento", lastSeen: "há 2h", recovered: false },
  { id: "ab2", customerName: "Lead #4821", customerEmail: "lead4821@ex.com", product: "Kit Anti-Idade", totalInCents: 67700, step: "Dados", lastSeen: "ontem", recovered: false },
  { id: "ab3", customerName: "Bruno Alves", customerEmail: "bruno@ex.com", product: "PDRN Coreamy", totalInCents: 19700, step: "Carrinho", lastSeen: "2 dias", recovered: true },
];

function ConsultaStat({ label, value, color }) {
  const { C } = useTheme();
  return (
    <div style={{ flex: 1, padding: "11px 8px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: color || C.silver }}>{value}</div>
      <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, marginTop: 2, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function OrderRow({ o }) {
  const { C } = useTheme();
  const [lbl, tone] = ORDER_STATUS[o.status] || ["", "dim"];
  const stColor = { green: C.green, amber: C.amber, red: C.red, dim: C.dim }[tone] || C.dim;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.silver }}>{o.orderNumber}</span>
          <span style={{ fontFamily: FONT, fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customerName}</span>
        </div>
        <div style={{ fontFamily: FONT, fontSize: 11, color: C.dim, marginTop: 2 }}>{o.product} · {PAYMENT_LABEL[o.paymentMethod] || o.paymentMethod}{o.installments > 1 ? ` ${o.installments}×` : ""}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.silver }}>{brlFromCents(o.totalInCents)}</div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: stColor }} />
          <span style={{ fontFamily: MONO, fontSize: 9, color: stColor, textTransform: "uppercase", letterSpacing: 0.5 }}>{lbl}</span>
        </span>
      </div>
    </div>
  );
}

function WalletVendas() {
  const { C } = useTheme();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const orders = ORDERS_SEED;
  const paid = orders.filter(o => o.status === "PAID");
  const receita = paid.reduce((s, o) => s + o.totalInCents, 0);
  const pend = orders.filter(o => o.status === "PENDING").length;
  const FILTERS = [["all", "Todos"], ["PAID", "Pagos"], ["PENDING", "Pendentes"], ["REFUNDED", "Estornados"]];
  const q = search.trim().toLowerCase();
  const filtered = orders.filter(o => (filter === "all" || o.status === filter) && (!q || o.customerName.toLowerCase().includes(q) || (o.product || "").toLowerCase().includes(q)));
  return (
    <>
      <PanelDescription>Gestão de vendas e operações. Todo pedido pago, pendente, estornado ou em rota aparece aqui — com cliente, produto, método e status.</PanelDescription>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <ConsultaStat label="receita paga" value={brlFromCents(receita)} color={C.green} />
        <ConsultaStat label="pedidos" value={orders.length} />
        <ConsultaStat label="pendentes" value={pend} color={C.amber} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6, marginBottom: 8 }}>
        <span style={{ color: C.dim, display: "flex" }}>{Icon.search(14)}</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente ou produto..." style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontFamily: FONT, fontSize: 12.5, color: C.text }} />
      </div>
      <div className="hide-scrollbar" style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 10 }}>
        {FILTERS.map(([k, l]) => <button key={k} onClick={() => setFilter(k)} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 99, border: `1px solid ${filter === k ? C.ember : C.border}`, background: filter === k ? C.ember : "transparent", color: filter === k ? "#fff" : C.muted, fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>{l}</button>)}
      </div>
      {filtered.length === 0 ? <EmptyState>Nenhuma venda encontrada.</EmptyState> : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{filtered.map(o => <OrderRow key={o.id} o={o} />)}</div>}
    </>
  );
}

function WalletAssinaturas() {
  const { C } = useTheme();
  const subs = ORDERS_SEED.filter(o => o.kind === "subscription");
  const active = subs.filter(o => o.status === "PAID");
  const cancelled = subs.filter(o => o.status === "CANCELED" || o.status === "REFUNDED");
  const mrr = active.reduce((s, o) => s + o.totalInCents, 0);
  return (
    <>
      <PanelDescription>Assinaturas e recorrência. Receita recorrente (MRR), assinantes ativos, cancelamentos e próxima cobrança de cada assinatura.</PanelDescription>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <ConsultaStat label="MRR" value={brlFromCents(mrr)} color={C.green} />
        <ConsultaStat label="ativas" value={active.length} />
        <ConsultaStat label="canceladas" value={cancelled.length} color={C.dim} />
      </div>
      {subs.length === 0 ? <EmptyState>Nenhuma assinatura ativa ainda.</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {subs.map(o => {
            const isActive = o.status === "PAID";
            return (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: C.silver }}>{o.customerName}</div>
                  <div style={{ fontFamily: FONT, fontSize: 11, color: C.dim, marginTop: 2 }}>{o.product} · próxima cobrança {isActive ? "25/06/2026" : "—"}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.silver }}>{brlFromCents(o.totalInCents)}<span style={{ fontSize: 9, color: C.dim }}>/mês</span></div>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: isActive ? C.green : C.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>{isActive ? "ativa" : "cancelada"}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function WalletEstornos() {
  const { C } = useTheme();
  const refunds = ORDERS_SEED.filter(o => o.status === "REFUNDED" || o.status === "CHARGEBACK");
  const total = refunds.reduce((s, o) => s + o.totalInCents, 0);
  return (
    <>
      <PanelDescription>Estornos e chargebacks. Pedidos devolvidos ao cliente ou contestados na operadora, com valor devolvido, cliente e data.</PanelDescription>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <ConsultaStat label="total estornos" value={refunds.length} color={C.red} />
        <ConsultaStat label="valor devolvido" value={brlFromCents(total)} color={C.red} />
        <ConsultaStat label="chargebacks" value={refunds.filter(o => o.status === "CHARGEBACK").length} color={C.amber} />
      </div>
      {refunds.length === 0 ? <EmptyState>Nenhum estorno no período.</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {refunds.map(o => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: o.status === "CHARGEBACK" ? C.amber : C.red, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: C.silver }}>{o.customerName}</div>
                <div style={{ fontFamily: FONT, fontSize: 10.5, color: C.dim, marginTop: 1 }}>{o.customerEmail} · {o.product}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.red }}>−{brlFromCents(o.totalInCents)}</div>
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.dim }}>{o.paidAt || "—"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12 }}><Banner tone="warning" icon={Icon.alert(13)}>Mantenha a taxa de chargeback abaixo de 1% para evitar bloqueio do adquirente.</Banner></div>
    </>
  );
}

function WalletAbandonos() {
  const { C } = useTheme();
  const recovered = ABANDONOS_SEED.filter(a => a.recovered).length;
  const potencial = ABANDONOS_SEED.filter(a => !a.recovered).reduce((s, a) => s + a.totalInCents, 0);
  return (
    <>
      <PanelDescription>Carrinhos abandonados e recuperação. Checkouts não finalizados — com etapa, último contato e potencial a recuperar.</PanelDescription>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <ConsultaStat label="total abandonos" value={ABANDONOS_SEED.length} color={C.red} />
        <ConsultaStat label="a recuperar" value={brlFromCents(potencial)} color={C.amber} />
        <ConsultaStat label="recuperados" value={recovered} color={C.green} />
      </div>
      {ABANDONOS_SEED.length === 0 ? <EmptyState>Nenhum abandono no período.</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ABANDONOS_SEED.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: C.silver }}>{a.customerName}</div>
                <div style={{ fontFamily: FONT, fontSize: 10.5, color: C.dim, marginTop: 1 }}>{a.customerEmail || "—"} · <span style={{ color: C.ember }}>{a.product}</span></div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.dim, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>parou em {a.step} · {a.lastSeen}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.silver }}>{brlFromCents(a.totalInCents)}</div>
                <span style={{ fontFamily: MONO, fontSize: 9, color: a.recovered ? C.green : C.amber, textTransform: "uppercase", letterSpacing: 0.5 }}>{a.recovered ? "recuperado" : "pendente"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function WalletWithdraw({ wallet, patchWallet }) {
  const { C } = useTheme();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("PIX");
  const stColor = (s) => s === "completed" ? C.green : s === "processing" ? C.blue : s === "failed" ? C.red : C.amber;
  const stLabel = (s) => ({ completed: "concluído", processing: "processando", pending: "pendente", failed: "falhou" }[s] || s);
  const avail = wallet.balance.available;
  const cents = Math.round(parseFloat(String(amount).replace(",", ".") || "0") * 100);
  const submit = () => {
    if (cents <= 0 || cents > avail) return;
    patchWallet(w => ({ ...w, balance: { ...w.balance, available: w.balance.available - cents, total: w.balance.total - cents }, withdrawals: [{ id: `wd-${Date.now()}`, amount: cents, status: "processing", date: new Date().toLocaleDateString("pt-BR"), method, bank: "Conta principal" }, ...w.withdrawals] }));
    setAmount("");
  };
  return (
    <div>
      <Banner tone="info" icon={Icon.bank(13)}>Disponível para saque: <span style={{ fontWeight: 600, color: C.silver }}>{brlFromCents(avail)}</span></Banner>
      <SubTitle>novo saque</SubTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="valor (R$)" value={amount} onChange={setAmount} placeholder="0,00" mono />
        <SelectField label="método" value={method} onChange={setMethod} options={[{ value: "PIX", label: "PIX (instantâneo)" }, { value: "TED", label: "TED (1 dia útil)" }]} />
        {cents > avail && <span style={{ fontFamily: MONO, fontSize: 10, color: C.red }}>valor acima do disponível</span>}
        <CTA variant="ember" fullWidth onClick={submit} disabled={cents <= 0 || cents > avail}>{Icon.arrow(13)} solicitar saque</CTA>
      </div>
      <SubTitle>histórico</SubTitle>
      {wallet.withdrawals.length === 0 ? <EmptyState>Nenhum saque ainda</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {wallet.withdrawals.map(w => (
            <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: C.silver }}>{brlFromCents(w.amount)}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim }}>{w.method} · {w.date}</div>
              </div>
              <Pill color={stColor(w.status)} bg={C.raised} border={C.divider}>{stLabel(w.status)}</Pill>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WalletAnticipate({ wallet, patchWallet }) {
  const { C } = useTheme();
  const [amount, setAmount] = useState("");
  const [installments, setInstallments] = useState("3");
  const FEE_PCT = 2.99;
  const cents = Math.round(parseFloat(String(amount).replace(",", ".") || "0") * 100);
  const fee = Math.round(cents * (FEE_PCT / 100) * (parseInt(installments) || 1) / 3);
  const net = cents - fee;
  const pending = wallet.balance.pending;
  const submit = () => {
    if (cents <= 0 || cents > pending) return;
    patchWallet(w => ({ ...w, balance: { ...w.balance, pending: w.balance.pending - cents, available: w.balance.available + net }, anticipations: [{ id: `an-${Date.now()}`, originalAmount: cents, feePct: FEE_PCT, netAmount: net, status: "completed", date: new Date().toLocaleDateString("pt-BR"), installments: parseInt(installments) || 1 }, ...w.anticipations] }));
    setAmount("");
  };
  return (
    <div>
      <Banner tone="warning" icon={Icon.bolt(13)}>Antecipe recebíveis a liberar (<span style={{ fontWeight: 600, color: C.silver }}>{brlFromCents(pending)}</span>) com taxa de {FEE_PCT}% ao mês.</Banner>
      <SubTitle>antecipar</SubTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="valor a antecipar (R$)" value={amount} onChange={setAmount} placeholder="0,00" mono />
        <SelectField label="parcelas pendentes" value={installments} onChange={setInstallments} options={[["1", "1×"], ["3", "3×"], ["6", "6×"], ["12", "12×"]].map(([value, label]) => ({ value, label }))} />
        {cents > 0 && (
          <div style={{ padding: "12px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><Tag color={C.dim}>bruto</Tag><span style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>{brlFromCents(cents)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><Tag color={C.dim}>taxa ({FEE_PCT}%)</Tag><span style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>− {brlFromCents(fee)}</span></div>
            <div style={{ height: 1, background: C.divider }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}><Tag color={C.muted} weight={600}>líquido</Tag><span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.green }}>{brlFromCents(net)}</span></div>
          </div>
        )}
        <CTA variant="ember" fullWidth onClick={submit} disabled={cents <= 0 || cents > pending}>{Icon.bolt(13)} antecipar agora</CTA>
      </div>
      <SubTitle>antecipações</SubTitle>
      {wallet.anticipations.length === 0 ? <EmptyState>Nenhuma antecipação</EmptyState> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {wallet.anticipations.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: C.green }}>{brlFromCents(a.netAmount)}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim }}>{a.installments}× · taxa {a.feePct}% · {a.date}</div>
              </div>
              <Pill color={C.green} bg={C.raised} border={C.divider}>concluído</Pill>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WalletExtrato({ wallet }) {
  const { C } = useTheme();
  const txIcon = (t) => t === "sale" ? Icon.box : t === "withdrawal" ? Icon.bank : t === "anticipation" ? Icon.bolt : Icon.card;
  return (
    <div>
      <Banner tone="info" icon={Icon.doc(13)}>Todas as movimentações da conta: vendas, saques, antecipações e taxas.</Banner>
      <SubTitle>extrato</SubTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {wallet.transactions.map(tx => {
          const positive = tx.amount >= 0;
          return (
            <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
              <span style={{ color: positive ? C.green : C.muted, display: "flex" }}>{txIcon(tx.type)(16)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver, fontWeight: 500 }}>{tx.desc}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim }}>{tx.method} · {tx.date}{tx.fee ? ` · taxa ${brlFromCents(tx.fee)}` : ""}</div>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: positive ? C.green : C.text }}>{positive ? "+" : ""}{brlFromCents(tx.amount)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* painéis pequenos de nós-folha (carteira / equipe / apps) */
function WalletItemPanel({ node }) {
  const { C } = useTheme();
  return (
    <>
      <PanelRow label="status" value={node.meta?.status || "—"} color={node.meta?.status === "completed" ? C.green : node.meta?.status === "processing" ? C.blue : C.amber} />
      <PanelDivider />
      <PanelDescription>Movimentação financeira da carteira. O detalhe completo fica no extrato e no painel do ramo correspondente.</PanelDescription>
    </>
  );
}
function TeamMemberPanel({ node }) {
  const { C } = useTheme();
  const pending = node.meta?.status === "pending";
  return (
    <>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 11px", borderRadius: 99, background: C.raised, border: `1px solid ${C.divider}`, marginBottom: 14 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: pending ? C.amber : C.green }} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: pending ? C.amber : C.green, letterSpacing: 1.4, fontWeight: 600, textTransform: "uppercase" }}>{pending ? "convite pendente" : "ativo"}</span>
      </div>
      <PanelRow label="papel" value={node.meta?.role || "—"} />
      <PanelDivider />
      <PanelDescription>Membro da sua equipe. Papéis controlam o acesso aos produtos, carteira e configurações. Gerencie em Perfil → Equipe.</PanelDescription>
    </>
  );
}
function AppNodePanel({ node }) {
  const { C } = useTheme();
  return (
    <>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 11px", borderRadius: 99, background: C.emberSoft, border: `1px solid ${C.emberBorder}`, marginBottom: 14 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: C.ember }} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.ember, letterSpacing: 1.4, fontWeight: 600 }}>CONECTADO</span>
      </div>
      <PanelDescription>Integração ativa. Alimenta campanhas, pixel e a IA de vendas. Gerencie em Perfil → Apps.</PanelDescription>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   SETTINGS PANEL  (preservado do original)
   ════════════════════════════════════════════════════════════════════════ */
function SettingsPanel({ settings, setSettings, onClose }) {
  const { C } = useTheme();
  const updateFilters = (key, value) => setSettings(s => ({ ...s, filters: { ...s.filters, [key]: value } }));
  const updateDisplay = (key, value) => setSettings(s => ({ ...s, display: { ...s.display, [key]: value } }));
  const updateForces = (key, value) => setSettings(s => ({ ...s, forces: { ...s.forces, [key]: value } }));
  const addGroup = () => {
    const colors = [C.ember, C.amber, C.green, C.blue, C.purple, C.rose];
    setSettings(s => ({ ...s, groups: [...s.groups, { id: `g${Date.now()}`, query: "", color: colors[s.groups.length % colors.length], enabled: true }] }));
  };
  const updateGroup = (id, next) => setSettings(s => ({ ...s, groups: s.groups.map(g => g.id === id ? next : g) }));
  const deleteGroup = (id) => setSettings(s => ({ ...s, groups: s.groups.filter(g => g.id !== id) }));
  const restoreDefaults = () => setSettings(defaultSettings(C));
  return (
    <div style={{ position: "fixed", top: 72, left: 20, bottom: 20, width: 320, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 16px 50px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", zIndex: 40, animation: "panelSlideLeft .3s cubic-bezier(.2,.7,.2,1) both", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.divider}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Tag color={C.silver} weight={600}>configurações do graph</Tag>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.muted, display: "flex" }}>{Icon.x(16)}</button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <Section title="filtros">
          <SearchInput value={settings.filters.search} onChange={v => updateFilters("search", v)} placeholder="buscar nós..." />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
            <Toggle label="mostrar tags"        value={settings.filters.showTags}        onChange={v => updateFilters("showTags", v)} />
            <Toggle label="mostrar anexos"      value={settings.filters.showAttachments} onChange={v => updateFilters("showAttachments", v)} />
            <Toggle label="apenas existentes"   value={settings.filters.existingOnly}    onChange={v => updateFilters("existingOnly", v)} />
            <Toggle label="mostrar órfãos"      value={settings.filters.showOrphans}     onChange={v => updateFilters("showOrphans", v)} />
            <Toggle label="conexões de entrada" value={settings.filters.incomingLinks}   onChange={v => updateFilters("incomingLinks", v)} />
            <Toggle label="conexões de saída"   value={settings.filters.outgoingLinks}   onChange={v => updateFilters("outgoingLinks", v)} />
          </div>
        </Section>
        <Section title="grupos">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {settings.groups.map(g => <GroupRow key={g.id} group={g} onChange={next => updateGroup(g.id, next)} onDelete={() => deleteGroup(g.id)} />)}
          </div>
          <button onClick={addGroup} style={{ marginTop: 8, padding: "8px 12px", background: "transparent", border: `1px dashed ${C.border}`, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 12, color: C.muted, transition: "all .15s ease" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.ember; e.currentTarget.style.color = C.silver; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}>
            {Icon.plus(12)} novo grupo
          </button>
          <div style={{ marginTop: 6 }}><Tag color={C.dim}>queries: type: · tag: · area: · texto livre</Tag></div>
        </Section>
        <Section title="visual">
          <Toggle label="setas" value={settings.display.arrows} onChange={v => updateDisplay("arrows", v)} />
          <Slider label="text fade threshold" value={settings.display.textFade} min={0} max={1} step={0.05} onChange={v => updateDisplay("textFade", v)} />
          <Slider label="tamanho dos nós"     value={settings.display.nodeSize} min={0.5} max={2.5} step={0.05} onChange={v => updateDisplay("nodeSize", v)} format={v => `${v.toFixed(2)}×`} />
          <Slider label="espessura das linhas" value={settings.display.linkThickness} min={0.5} max={3} step={0.05} onChange={v => updateDisplay("linkThickness", v)} format={v => `${v.toFixed(2)}×`} />
        </Section>
        <Section title="forças">
          <Slider label="força central"        value={settings.forces.centerForce}  min={0} max={0.08} step={0.005} onChange={v => updateForces("centerForce", v)}   format={v => v.toFixed(3)} />
          <Slider label="repulsão"             value={settings.forces.repelForce}   min={50} max={1200} step={25} onChange={v => updateForces("repelForce", v)} format={v => v.toFixed(0)} />
          <Slider label="força das linhas"     value={settings.forces.linkForce}    min={0.1} max={3} step={0.1} onChange={v => updateForces("linkForce", v)} format={v => v.toFixed(1)} />
          <Slider label="distância das linhas" value={settings.forces.linkDistance} min={30} max={160} step={5} onChange={v => updateForces("linkDistance", v)} format={v => `${v.toFixed(0)}px`} />
        </Section>
      </div>
      <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.divider}`, background: C.raised }}>
        <button onClick={restoreDefaults} style={{ width: "100%", padding: "8px 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontFamily: FONT, fontSize: 11.5, color: C.muted, letterSpacing: 0.3, transition: "all .15s ease" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.silver; e.currentTarget.style.color = C.silver; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}>
          restaurar padrões
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   GRAPH CANVAS  (motor preservado do original — física, lente, drag, zoom)
   ════════════════════════════════════════════════════════════════════════ */
function GraphCanvas({ tab, recenterNonce, selectedId, onSelectNode, settings, dynamicGraph, channels }) {
  const { C } = useTheme();
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const nodesRef = useRef([]);
  const targetsRef = useRef(new Map());
  const alphaRef = useRef(1);
  const focusAnimRef = useRef(null);
  // drag-vs-click: a node panel must open only on a genuine click, never after a drag
  const movedRef = useRef(false);
  const downPosRef = useRef({ x: 0, y: 0 });
  const reheat = useCallback((v = 1) => { alphaRef.current = Math.max(alphaRef.current, v); }, []);

  const connectionCount = useMemo(() => {
    const counts = new Map();
    for (const e of dynamicGraph.edges) { counts.set(e.from, (counts.get(e.from) || 0) + 1); counts.set(e.to, (counts.get(e.to) || 0) + 1); }
    return counts;
  }, [dynamicGraph.edges]);

  const [hoveredId, setHoveredId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const [size, setSize] = useState({ w: 1200, h: 700 });
  const sizeRef = useRef(size);
  useEffect(() => { sizeRef.current = size; }, [size]);
  const [, forceRender] = useReducer(x => x + 1, 0);

  const { nodes: visibleNodes, edges: visibleEdges } = useMemo(() => applyFilters(dynamicGraph.nodes, dynamicGraph.edges, settings.filters), [settings.filters, dynamicGraph]);

  useEffect(() => {
    const existingIds = new Set(nodesRef.current.map(n => n.id));
    const newIds = new Set(dynamicGraph.nodes.map(n => n.id));
    nodesRef.current = nodesRef.current.filter(n => newIds.has(n.id));
    const anchors = computeGalaxyAnchors(dynamicGraph.nodes);
    const sunIds = new Set(Object.values(SUN_OF_AREA));
    const sunPosOf = (node) => anchors.get(SUN_OF_AREA[node.area]) || { x: 0, y: 0 };
    let added = false;
    for (const n of dynamicGraph.nodes) {
      if (!sunIds.has(n.id)) continue;
      const a = anchors.get(n.id) || { x: 0, y: 0 };
      const existing = nodesRef.current.find(rn => rn.id === n.id);
      if (existing) { existing.x = a.x; existing.y = a.y; existing.vx = 0; existing.vy = 0; existing.fixed = true; }
      else { nodesRef.current.push({ ...n, x: a.x, y: a.y, vx: 0, vy: 0, fixed: true }); added = true; }
    }
    const galCount = {};
    for (const n of dynamicGraph.nodes) {
      if (sunIds.has(n.id) || existingIds.has(n.id)) continue;
      added = true;
      const g = n.area;
      const i = (galCount[g] = (galCount[g] || 0) + 1);
      let cx, cy;
      const parent = n.parentId ? nodesRef.current.find(rn => rn.id === n.parentId) : null;
      if (parent) { cx = parent.x; cy = parent.y; } else { const sp = sunPosOf(n); cx = sp.x; cy = sp.y; }
      const r = 18 * Math.sqrt(0.5 + i);
      const ang = i * GOLDEN_ANGLE;
      nodesRef.current.push({ ...n, x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, vx: 0, vy: 0 });
    }
    const metaById = new Map(dynamicGraph.nodes.map(n => [n.id, n.meta]));
    for (const rn of nodesRef.current) { const m = metaById.get(rn.id); if (m) rn.meta = m; }
    targetsRef.current = anchors;
    if (added || existingIds.size === 0) alphaRef.current = 1;
    forceRender();
  }, [dynamicGraph.nodes]);

  useEffect(() => {
    let raf;
    const loop = () => {
      const a = alphaRef.current;
      const visIds = new Set(visibleNodes.map(n => n.id));
      const visNodesInRef = nodesRef.current.filter(n => visIds.has(n.id));
      if (a > 0.004) {
        physicsTick(visNodesInRef, visibleEdges, settings.forces, a, connectionCount);
        alphaRef.current = a + (0 - a) * 0.0228;
        forceRender();
      } else if (draggingId) {
        physicsTick(visNodesInRef, visibleEdges, settings.forces, 0.3, connectionCount);
        forceRender();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visibleNodes, visibleEdges, settings.forces, connectionCount, draggingId]);

  useEffect(() => { alphaRef.current = 0.6; }, [settings.forces.centerForce, settings.forces.repelForce, settings.forces.linkForce, settings.forces.linkDistance]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => { const r = entries[0].contentRect; setSize({ w: r.width, h: r.height }); });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const step = e.shiftKey ? 40 : 16;
      if (e.key === "ArrowLeft")  setPan(p => ({ x: p.x + step, y: p.y }));
      if (e.key === "ArrowRight") setPan(p => ({ x: p.x - step, y: p.y }));
      if (e.key === "ArrowUp")    setPan(p => ({ x: p.x, y: p.y + step }));
      if (e.key === "ArrowDown")  setPan(p => ({ x: p.x, y: p.y - step }));
      if (e.key === "+" || e.key === "=") setZoom(z => Math.min(3, z + 0.1));
      if (e.key === "-" || e.key === "_") setZoom(z => Math.max(0.3, z - 0.1));
      if (e.key === "0") { setZoom(1); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── LENTE (GPS) ── ao clicar numa aba, leva o SOL daquela galáxia ao centro
  // EXATO da tela. Os sóis são âncoras fixas e determinísticas, então a mira
  // nunca treme e não depende da física esfriar.
  //
  // CRÍTICO: o pan/zoom da animação é dirigido por REFS com valores concretos
  // (não por updaters de setState, cujo retorno o React não executa de forma
  // síncrona — o que antes fazia a animação parar no 1º frame). A convergência
  // é medida sobre esses valores concretos e, ao final, encaixa-se no alvo
  // exato. Assim funciona SEMPRE, em qualquer aba, a cada clique.
  useEffect(() => {
    let raf = 0, tries = 0, frames = 0;
    const sunId = TAB_SUN[tab];
    const MARGIN = 110, EASE = 0.18;
    const animate = () => {
      const rn = nodesRef.current.find(n => n.id === sunId);
      const sun = rn ? { x: rn.x, y: rn.y } : (targetsRef.current.get(sunId) || null);
      if (!sun) { // sol ainda não semeado → tenta de novo por alguns frames
        if (tries++ < 90) { raf = requestAnimationFrame(animate); focusAnimRef.current = raf; }
        return;
      }
      const { w, h } = sizeRef.current;
      const R = GALAXY_RADIUS[tab] || 200;
      const targetZoom = Math.max(0.4, Math.min(1.6, Math.min(w, h) / (2 * (R + MARGIN))));

      // estado atual vindo dos refs (valores concretos, sempre atualizados)
      const z0 = zoomRef.current;
      const z1 = z0 + (targetZoom - z0) * EASE;
      const tpx = -sun.x * z1, tpy = -sun.y * z1; // centro do sol no zoom deste frame
      const px0 = panRef.current.x, py0 = panRef.current.y;
      const px1 = px0 + (tpx - px0) * EASE;
      const py1 = py0 + (tpy - py0) * EASE;

      const done =
        Math.abs(z1 - targetZoom) < 0.0015 &&
        Math.abs(px1 - tpx) < 0.2 &&
        Math.abs(py1 - tpy) < 0.2;

      if (done || frames++ > 240) {
        // encaixe EXATO no centro (sem resíduo) e encerra
        const fz = targetZoom, fpx = -sun.x * fz, fpy = -sun.y * fz;
        zoomRef.current = fz; panRef.current = { x: fpx, y: fpy };
        setZoom(fz); setPan({ x: fpx, y: fpy });
        return;
      }

      // commit: refs imediatos + estado React para repintar
      zoomRef.current = z1; panRef.current = { x: px1, y: py1 };
      setZoom(z1); setPan({ x: px1, y: py1 });

      raf = requestAnimationFrame(animate);
      focusAnimRef.current = raf;
    };
    cancelAnimationFrame(focusAnimRef.current);
    raf = requestAnimationFrame(animate);
    focusAnimRef.current = raf;
    return () => cancelAnimationFrame(raf);
  }, [tab, recenterNonce, size.w, size.h]);

  const screenToWorld = useCallback((sx, sy) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const ccx = rect.width / 2, ccy = rect.height / 2;
    return { x: (sx - rect.left - ccx - pan.x) / zoom, y: (sy - rect.top - ccy - pan.y) / zoom };
  }, [pan, zoom]);

  const onSvgMouseDown = (e) => { if (e.target.dataset.nodeId) return; cancelAnimationFrame(focusAnimRef.current); setIsPanning(true); panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }; };
  const onNodeMouseDown = (id, e) => { e.stopPropagation(); movedRef.current = false; downPosRef.current = { x: e.clientX, y: e.clientY }; setDraggingId(id); const n = nodesRef.current.find(n => n.id === id); if (n) { n.dragging = true; n.vx = 0; n.vy = 0; } reheat(0.4); };
  const onMouseMove = (e) => {
    if (isPanning) { const dx = e.clientX - panStartRef.current.x; const dy = e.clientY - panStartRef.current.y; setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy }); return; }
    if (draggingId) {
      const mdx = e.clientX - downPosRef.current.x, mdy = e.clientY - downPosRef.current.y;
      if (mdx * mdx + mdy * mdy > 16) movedRef.current = true; // moved > 4px → treat as drag, not click
      const { x, y } = screenToWorld(e.clientX, e.clientY); const n = nodesRef.current.find(n => n.id === draggingId); if (n) { n.x = x; n.y = y; n.vx = 0; n.vy = 0; } reheat(0.4);
    }
  };
  const onMouseUp = () => { setIsPanning(false); if (draggingId) { const n = nodesRef.current.find(n => n.id === draggingId); if (n) n.dragging = false; reheat(0.5); } setDraggingId(null); };
  const onWheel = (e) => { e.preventDefault(); cancelAnimationFrame(focusAnimRef.current); const delta = -e.deltaY * 0.0015; setZoom(z => Math.max(0.3, Math.min(3, z + delta))); };
  const onCanvasClick = (e) => { if (e.target.dataset.nodeId) return; onSelectNode(null); };

  const connectedIds = useMemo(() => {
    const target = hoveredId || selectedId;
    if (!target) return null;
    const set = new Set([target]);
    for (const e of visibleEdges) { if (e.from === target) set.add(e.to); if (e.to === target) set.add(e.from); }
    return set;
  }, [hoveredId, selectedId, visibleEdges]);

  const focusSet = connectedIds;
  const cx = size.w / 2, cy = size.h / 2;
  const labelOpacityFor = (tier) => { const th = settings.display.textFade; const base = [0.34, 0.72, 1.15][tier] - th * 0.35; return Math.max(0, Math.min(1, (zoom - base) * 3)); };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%", background: C.void, overflow: "hidden", cursor: isPanning ? "grabbing" : (draggingId ? "grabbing" : "default") }}>
      <svg ref={svgRef} width={size.w} height={size.h} style={{ display: "block", userSelect: "none", position: "relative", zIndex: 2 }} onMouseDown={onSvgMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel} onClick={onCanvasClick}>
        <defs><marker id="arrow-ember" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill={C.ember} /></marker></defs>
        <g transform={`translate(${cx + pan.x}, ${cy + pan.y}) scale(${zoom})`}>
          {visibleEdges.map((e, i) => {
            const a = nodesRef.current.find(n => n.id === e.from);
            const b = nodesRef.current.find(n => n.id === e.to);
            if (!a || !b) return null;
            const isHighlighted = focusSet && focusSet.has(e.from) && focusSet.has(e.to);
            const isDimmed = focusSet && !isHighlighted;
            let stroke = C.hi, strokeWidth = (0.55 * settings.display.linkThickness) / zoom, opacity = 0.30;
            if (isHighlighted) { stroke = C.ember; strokeWidth = (1.2 * settings.display.linkThickness) / zoom; opacity = 0.9; }
            else if (isDimmed) opacity = 0.04;
            const useArrows = settings.display.arrows && e.directed !== false;
            const aRadius = nodeRadius(a, connectionCount, settings.display.nodeSize);
            const bRadius = nodeRadius(b, connectionCount, settings.display.nodeSize);
            let x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y;
            if (useArrows) { const dx = b.x - a.x, dy = b.y - a.y; const dist = Math.sqrt(dx * dx + dy * dy) || 1; x1 = a.x + (dx / dist) * aRadius; y1 = a.y + (dy / dist) * aRadius; x2 = b.x - (dx / dist) * (bRadius + 6); y2 = b.y - (dy / dist) * (bRadius + 6); }
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} strokeLinecap="round" markerEnd={useArrows && isHighlighted ? "url(#arrow-ember)" : undefined} style={{ transition: "opacity .28s ease, stroke .28s ease, stroke-width .28s ease" }} />;
          })}
          {visibleNodes.map(n => {
            const node = nodesRef.current.find(rn => rn.id === n.id);
            if (!node) return null;
            const isHovered = hoveredId === n.id;
            const isSelected = selectedId === n.id;
            const inFocus = focusSet && focusSet.has(n.id);
            const isDimmed = focusSet && !inFocus;
            const radius = nodeRadius(n, connectionCount, settings.display.nodeSize);
            const fill = colorForNode(n, settings.groups, C, channels, tab, focusSet);
            let opacity = 1; if (isDimmed) opacity = 0.13;
            return (
              <g key={n.id} transform={`translate(${node.x}, ${node.y})`} style={{ cursor: draggingId === n.id ? "grabbing" : "grab", transition: "opacity .28s ease" }} opacity={opacity}>
                <circle cx="0" cy="0" r={radius} fill={fill} stroke={isHovered || isSelected ? C.ember : "none"} strokeWidth={isHovered || isSelected ? 2 / zoom : 0} data-node-id={n.id}
                  onMouseDown={(e) => onNodeMouseDown(n.id, e)} onMouseEnter={() => setHoveredId(n.id)} onMouseLeave={() => setHoveredId(null)} onClick={(e) => { e.stopPropagation(); if (movedRef.current) { movedRef.current = false; return; } onSelectNode(n.id); }} style={{ transition: "fill .28s ease, stroke .15s ease" }} />
              </g>
            );
          })}
          {visibleNodes.map(n => {
            if (!n.label) return null;
            const node = nodesRef.current.find(rn => rn.id === n.id);
            if (!node) return null;
            const isHovered = hoveredId === n.id;
            const isSelected = selectedId === n.id;
            const inFocus = focusSet && focusSet.has(n.id);
            const isDimmed = focusSet && !inFocus;
            const isMass = n.type === "sun" || n.type === "core";
            const isPrincipal = isPrincipalForTab(n, tab);
            const tier = isMass ? 0 : (isPrincipal ? 1 : 2);
            let baseOp = labelOpacityFor(tier);
            if (isHovered || isSelected) baseOp = 1;
            else if (inFocus) baseOp = Math.max(baseOp, 0.9);
            else if (isDimmed) baseOp *= 0.12;
            if (baseOp < 0.02) return null;
            const radius = nodeRadius(n, connectionCount, settings.display.nodeSize);
            const offset = radius + 11 / zoom;
            const fontSize = (isMass ? 12 : isPrincipal ? 11 : 9.5) / zoom;
            const fontWeight = isMass ? 600 : isPrincipal ? 500 : 400;
            const color = (isHovered || isSelected || inFocus) ? C.silver : (tier <= 1 ? C.text : C.muted);
            return (
              <text key={`l-${n.id}`} x={node.x} y={node.y + offset} textAnchor="middle" fontFamily={FONT} fontSize={fontSize} fontWeight={fontWeight} fill={color} opacity={baseOp} style={{ pointerEvents: "none", transition: "opacity .28s ease, fill .15s ease" }}>
                {n.label}
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   CONTROLES FLUTUANTES
   ════════════════════════════════════════════════════════════════════════ */
function RefreshButton({ onRefresh }) {
  const { C } = useTheme();
  const [spinning, setSpinning] = useState(false);
  const [hover, setHover] = useState(false);
  const handle = () => { setSpinning(true); onRefresh(); setTimeout(() => setSpinning(false), 720); };
  return (
    <div style={{ position: "absolute", bottom: 22, right: 22, zIndex: 10 }}>
      <button onClick={handle} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title="reorganizar grafo"
        style={{ width: 44, height: 44, padding: 0, borderRadius: "50%", background: hover ? C.silver : C.glass, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: `1px solid ${hover ? C.silver : C.border}`, color: hover ? C.void : C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: hover ? "0 6px 20px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.12)" : "0 3px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)", transition: "background .2s ease, color .2s ease, border-color .2s ease, box-shadow .2s ease, transform .2s ease", transform: hover ? "translateY(-1px)" : "translateY(0)" }}>
        <span style={{ display: "inline-flex", transition: "transform .72s cubic-bezier(.34,1.4,.5,1)", transform: spinning ? "rotate(-360deg)" : "rotate(0deg)" }}>{Icon.refresh(17)}</span>
      </button>
    </div>
  );
}

function SettingsButton({ open, onClick }) {
  const { C } = useTheme();
  return (
    <button onClick={onClick} style={{ position: "fixed", top: 20, left: 24, zIndex: 45, width: 36, height: 36, padding: 0, background: open ? C.silver : C.glass, color: open ? C.void : C.muted, backdropFilter: "blur(8px)", border: `1px solid ${open ? C.silver : C.border}`, borderRadius: 99, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s ease", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
      onMouseEnter={e => { if (!open) { e.currentTarget.style.color = C.silver; e.currentTarget.style.borderColor = C.silver; } }} onMouseLeave={e => { if (!open) { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; } }} title="configurações">{Icon.cog(15)}</button>
  );
}

function ThemeToggle() {
  const { C, mode, toggle } = useTheme();
  return (
    <button onClick={toggle} style={{ position: "fixed", top: 20, right: 24, zIndex: 45, width: 36, height: 36, padding: 0, background: C.glass, color: C.muted, backdropFilter: "blur(8px)", border: `1px solid ${C.border}`, borderRadius: 99, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s ease", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
      onMouseEnter={e => { e.currentTarget.style.color = C.silver; e.currentTarget.style.borderColor = C.silver; }} onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }} title={mode === "light" ? "tema escuro" : "tema claro"}>
      {mode === "light" ? Icon.moon(15) : Icon.sun(15)}
    </button>
  );
}

function FloatingNav({ active, onChange }) {
  const { C } = useTheme();
  const items = [
    { key: "perfil",   label: "Perfil" }, { key: "kloel",    label: "Kloel" }, { key: "criar",    label: "Criar" }, { key: "afiliar",  label: "Afiliar" },
    { key: "educar",   label: "Educar" }, { key: "conectar", label: "Conversar" }, { key: "carteira", label: "Consultar" },
  ];
  return (
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 50, width: "min(440px, calc(100vw - 120px))", background: C.glass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${C.border}`, borderRadius: 99, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.04)", overflow: "hidden" }}>
      <div className="hide-scrollbar" style={{ display: "flex", gap: 4, alignItems: "center", overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {items.map(it => (
          <button key={it.key} onClick={() => onChange(it.key)} style={{ background: active === it.key ? C.silver : "transparent", color: active === it.key ? C.void : C.muted, border: "none", padding: "8px 16px", borderRadius: 99, fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: 1.2, cursor: "pointer", textTransform: "uppercase", transition: "all .15s ease", whiteSpace: "nowrap", flexShrink: 0 }}>{it.label}</button>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   CHANNEL ONBOARDING WIZARD  (preservado — Conectar→Produtos→Arsenal→Voz)
   ════════════════════════════════════════════════════════════════════════ */
function ChannelOnboardingWizard({ channelKey, channels, setChannels, onClose, products, embedded }) {
  const { C } = useTheme();
  const ch = channels[channelKey];
  const meta = CHANNEL_META[channelKey];
  const [step, setStep] = useState(ch.connected ? 1 : 0);
  const update = (changes) => setChannels(c => ({ ...c, [channelKey]: { ...c[channelKey], ...changes } }));
  const connect = () => { update({ connected: true }); setStep(1); };
  const inner = (
    <>
      <div style={{ padding: "16px 22px 14px", borderBottom: `1px solid ${C.divider}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Tag color={C.muted} weight={600}>{meta.provider}</Tag>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 9.5, color: ch.connected ? C.green : C.dim, textTransform: "uppercase", letterSpacing: 0.5 }}><span style={{ width: 6, height: 6, borderRadius: 99, background: ch.connected ? C.green : C.dim }} />{ch.connected ? "conectado" : "desconectado"}</span>
          </span>
          {!embedded && <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.muted, display: "flex" }}>{Icon.x(16)}</button>}
        </div>
        <h2 style={{ margin: "0 0 14px 0", fontFamily: FONT, fontWeight: 300, fontSize: 26, letterSpacing: -0.7, lineHeight: 1.1, color: C.silver }}>{meta.name}</h2>
        <div style={{ display: "flex", gap: 6 }}>{[["Conectar", 0], ["Produtos", 1], ["Arsenal", 2], ["Configurar", 3]].map(([lbl, i]) => (
          <button key={i} onClick={() => ch.connected || i === 0 ? setStep(i) : null} disabled={!ch.connected && i !== 0} style={{ flex: 1, background: "none", border: "none", padding: 0, cursor: ch.connected || i === 0 ? "pointer" : "default", textAlign: "left" }}>
            <div style={{ height: 2, background: i <= step ? C.ember : C.faint, opacity: i === step ? 1 : i < step ? 0.6 : 1, transition: "all .3s ease" }} />
            {embedded && <span style={{ display: "block", marginTop: 6, fontFamily: MONO, fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", color: i === step ? C.ember : C.dim }}>{lbl}</span>}
          </button>
        ))}</div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "22px 24px 28px" }}>
        {step === 0 && <StepIdentity meta={meta} onConnect={connect} />}
        {step === 1 && <StepProducts ch={ch} update={update} products={products} onNext={() => setStep(2)} onBack={() => setStep(0)} />}
        {step === 2 && <StepArsenal ch={ch} update={update} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <StepVoice ch={ch} update={update} onDone={onClose} onBack={() => setStep(2)} />}
      </div>
    </>
  );
  if (embedded) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ width: "100%", maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>{inner}</div>
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, margin: "auto", width: "80vw", height: "80vh", maxWidth: 1320, maxHeight: 900, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 16px 50px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", zIndex: 40, animation: "panelSlide .3s cubic-bezier(.2,.7,.2,1) both", overflow: "hidden" }}>{inner}</div>
  );
}
function StepIdentity({ meta, onConnect }) {
  const { C } = useTheme();
  return (
    <div>
      <h3 style={{ margin: "0 0 8px 0", fontFamily: FONT, fontSize: 17, fontWeight: 400, color: C.silver, letterSpacing: -0.3 }}>Dê um corpo à inteligência</h3>
      <p style={{ margin: "0 0 22px 0", fontFamily: FONT, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{meta.step1Sub}</p>
      <CTA variant="ember" fullWidth onClick={onConnect}>{meta.step1Verb} {Icon.arrow(13)}</CTA>
      <div style={{ marginTop: 18, padding: "12px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
        <Tag color={C.dim}>o que vai acontecer</Tag>
        <p style={{ margin: "8px 0 0", fontFamily: FONT, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>O nó do canal vai acender em ember. As próximas etapas criam conexões reais com produtos, sub-nós de prova e um sub-nó de voz calibrada.</p>
      </div>
    </div>
  );
}
function StepProducts({ ch, update, products, onNext, onBack }) {
  const { C } = useTheme();
  const picked = ch.products || [];
  const toggle = (id) => { const next = picked.includes(id) ? picked.filter(p => p !== id) : [...picked, id]; update({ products: next }); };
  return (
    <div>
      <h3 style={{ margin: "0 0 8px 0", fontFamily: FONT, fontSize: 17, fontWeight: 400, color: C.silver, letterSpacing: -0.3 }}>O que ela pode oferecer</h3>
      <p style={{ margin: "0 0 18px 0", fontFamily: FONT, fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{picked.length} de {products.length} no catálogo · cada produto vira uma conexão no graph</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
        {products.map(p => {
          const on = picked.includes(p.id);
          return (
            <button key={p.id} onClick={() => toggle(p.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 6, background: on ? C.emberSoft : "transparent", border: `1px solid ${on ? C.ember : C.border}`, color: on ? C.silver : C.text, fontFamily: FONT, fontSize: 12.5, cursor: "pointer", transition: "all .15s ease", textAlign: "left" }}>
              <span style={{ width: 14, height: 14, borderRadius: 99, background: on ? C.ember : "transparent", border: `1.5px solid ${on ? C.ember : C.hi}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>{on && Icon.check(9)}</span>
              <span style={{ flex: 1 }}>{p.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: on ? C.ember : C.dim }}>R$ {p.meta?.price}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <CTA variant="ghost" small onClick={onBack}>{Icon.back(12)} voltar</CTA>
        <CTA variant="ember" small disabled={picked.length === 0} onClick={onNext}>avançar {Icon.arrow(12)}</CTA>
      </div>
    </div>
  );
}
function StepArsenal({ ch, update, onNext, onBack }) {
  const { C } = useTheme();
  const count = ch.arsenal || 0;
  return (
    <div>
      <h3 style={{ margin: "0 0 8px 0", fontFamily: FONT, fontSize: 17, fontWeight: 400, color: C.silver, letterSpacing: -0.3 }}>Munição para convencer</h3>
      <p style={{ margin: "0 0 18px 0", fontFamily: FONT, fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{count === 0 ? "Arraste fotos, vídeos, áudios, depoimentos · cada peça vira um sub-nó conectado ao canal" : `${count} ${count === 1 ? "prova carregada" : "provas carregadas"} · veja no graph`}</p>
      <button onClick={() => update({ arsenal: count + 1 })} style={{ width: "100%", marginBottom: 14, padding: "22px 14px", borderRadius: 6, background: "transparent", border: `1px dashed ${C.border}`, color: C.muted, fontSize: 12.5, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all .15s ease" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.ember; e.currentTarget.style.color = C.text; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}>{Icon.upload(13)} adicionar prova</button>
      {count > 0 && <button onClick={() => update({ arsenal: Math.max(0, count - 1) })} style={{ width: "100%", marginBottom: 14, padding: "8px 14px", background: "transparent", border: "none", color: C.dim, fontSize: 11, fontFamily: FONT, cursor: "pointer", transition: "color .15s ease" }} onMouseEnter={e => e.currentTarget.style.color = C.emberHi} onMouseLeave={e => e.currentTarget.style.color = C.dim}>remover última</button>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
        <CTA variant="ghost" small onClick={onBack}>{Icon.back(12)} voltar</CTA>
        <CTA variant="ember" small onClick={onNext}>{count === 0 ? "pular esta camada" : "avançar"} {Icon.arrow(12)}</CTA>
      </div>
    </div>
  );
}
function StepVoice({ ch, update, onDone, onBack }) {
  const { C } = useTheme();
  const voice = ch.voice || { tone: 1, edge: 1 };
  const TONES = ["Sereno", "Equilibrado", "Caloroso"];
  const EDGES = ["Paciente", "Firme", "Incisivo"];
  const setTone = (i) => update({ voice: { ...voice, tone: i } });
  const setEdge = (i) => update({ voice: { ...voice, edge: i } });
  useEffect(() => { if (!ch.voice) update({ voice: { tone: 1, edge: 1 } }); }, []);
  return (
    <div>
      <h3 style={{ margin: "0 0 8px 0", fontFamily: FONT, fontSize: 17, fontWeight: 400, color: C.silver, letterSpacing: -0.3 }}>Calibre sua voz</h3>
      <p style={{ margin: "0 0 22px 0", fontFamily: FONT, fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{TONES[voice.tone]} · {EDGES[voice.edge]} · um sub-nó "voz" se materializa no graph</p>
      <Dial label="Temperatura" value={voice.tone} onChange={setTone} labels={TONES} />
      <div style={{ height: 20 }} />
      <Dial label="Postura" value={voice.edge} onChange={setEdge} labels={EDGES} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 28 }}>
        <CTA variant="ghost" small onClick={onBack}>{Icon.back(12)} voltar</CTA>
        <CTA variant="ember" small onClick={onDone}>despertar {Icon.arrow(12)}</CTA>
      </div>
    </div>
  );
}
function Dial({ label, value, onChange, labels }) {
  const { C } = useTheme();
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <Tag color={C.dim}>{label}</Tag>
        <span style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver }}>{labels[value]}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {labels.map((_, i) => <button key={i} onClick={() => onChange(i)} style={{ flex: 1, height: 6, padding: 0, background: i === value ? C.ember : C.faint, border: "none", borderRadius: 99, cursor: "pointer", transition: "background .2s ease" }} />)}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   NODE PANEL · roteia para os painéis ricos (inclui as 10 abas de produto)
   ════════════════════════════════════════════════════════════════════════ */
function NodePanel({ node, onClose, onAction, onSelectNode, onNewProduct, onAskKloel, channels, products, patchProductEditor, affiliate, patchAffiliate, patchMyAffiliate, wallet, patchWallet, educar, patchArea, conversar, patchConversar }) {
  const { C } = useTheme();
  if (!node) return null;

  // produto e editor associados (para sub-nós de produto)
  const productId = node.meta?.productId || (node.type === "product" ? node.id : null);
  const product = products.find(p => p.id === productId);
  const ed = product?.editor;
  const patch = (fn) => productId && patchProductEditor(productId, fn);

  const isProductTab = PRODUCT_SUBNODE_TYPES.includes(node.type);
  const isAffiliate = node.type === "affProduct" || node.type === "affBranch";
  const wide = isProductTab || node.type === "product";

  return (
    <div style={{ position: "fixed", inset: 0, margin: "auto", width: "80vw", height: "80vh", maxWidth: 1320, maxHeight: 900, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 16px 50px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", zIndex: 40, animation: "panelSlide .3s cubic-bezier(.2,.7,.2,1) both", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.divider}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Tag color={C.muted} weight={600}>{NODE_LABEL_KIND[node.type] || node.type}{node.meta?.productLabel && isProductTab ? ` · ${node.meta.productLabel}` : ""}</Tag>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.muted, display: "flex" }}>{Icon.x(16)}</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "20px 22px 24px" }}>
        {!isProductTab && (
          <>
            <h2 style={{ margin: "0 0 8px 0", fontFamily: FONT, fontWeight: 300, fontSize: 24, letterSpacing: -0.6, lineHeight: 1.15, color: C.silver }}>{node.label || "Sem nome"}</h2>
            {node.meta?.subtitle && <p style={{ margin: "0 0 22px 0", fontFamily: FONT, fontWeight: 300, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{node.meta.subtitle}</p>}
          </>
        )}

        {/* ─── nós base ─── */}
        {node.type === "core" && <CorePanelBody />}
        {(node.type === "sun" || node.type === "branch") && <MassPanelBody node={node} products={products} affiliate={affiliate} educar={educar} onCreateArea={patchArea ? () => patchArea("__new__") : undefined} onNewProduct={onNewProduct} onOpenNode={onSelectNode} />}
        {node.type === "channel" && <ChannelConnectedPanel node={node} channels={channels} products={products} />}
        {node.type === "proof" && <ProofPanelBody node={node} />}
        {node.type === "voice" && <VoicePanelBody node={node} />}

        {/* ─── produto: overview com atalhos pras 10 abas ─── */}
        {node.type === "product" && ed && <ProductOverview product={product} ed={ed} patch={patch} onAskKloel={onAskKloel} onOpenTab={(suffix) => onSelectNode && onSelectNode(`${product.id}-${suffix}`)} />}

        {/* ─── as 9 abas reais (checkout vive dentro de Planos) ─── */}
        {ed && node.type === "p_dados"      && <TabDados ed={ed} patch={patch} product={product} />}
        {ed && node.type === "p_planos"     && <TabPlanos ed={ed} patch={patch} />}
        {ed && node.type === "p_urls"       && <TabUrls ed={ed} patch={patch} product={product} />}
        {ed && node.type === "p_comissao"   && <TabComissao ed={ed} patch={patch} product={product} />}
        {ed && node.type === "p_cupons"     && <TabCupons ed={ed} patch={patch} />}
        {ed && node.type === "p_campanhas"  && <TabCampanhas ed={ed} patch={patch} />}
        {ed && node.type === "p_avaliacoes" && <TabAvaliacoes ed={ed} patch={patch} />}
        {ed && node.type === "p_afterpay"   && <TabAfterpay ed={ed} patch={patch} />}
        {ed && node.type === "p_ia"         && <TabIA ed={ed} patch={patch} />}

        {/* ─── AFILIAR ─── */}
        {node.type === "affBranch"  && affiliate && <AffiliateBranchPanel node={node} affiliate={affiliate} patchMyAffiliate={patchMyAffiliate} />}
        {node.type === "affProduct" && affiliate && <AffiliateProductPanel node={node} affiliate={affiliate} patchAffiliate={patchAffiliate} />}
        {node.type === "affPartner" && affiliate && <AffiliatePartnerPanel node={node} affiliate={affiliate} patchMyAffiliate={patchMyAffiliate} />}

        {/* ─── EDUCAR ─── */}
        {node.type === "memberArea" && educar && <MemberAreaPanel node={node} educar={educar} patchArea={patchArea} />}

        {/* ─── CONVERSAR ─── */}
        {node.type === "convBranch"   && conversar && <ConversarBranchPanel node={node} conversar={conversar} patchConversar={patchConversar} />}
        {node.type === "conversation" && conversar && <ConversationPanel node={node} conversar={conversar} patchConversar={patchConversar} />}
        {node.type === "contact"      && conversar && <ContactPanel node={node} conversar={conversar} patchConversar={patchConversar} />}
        {node.type === "order"        && conversar && <OrderPanel node={node} conversar={conversar} patchConversar={patchConversar} />}
        {node.type === "adCampaign"   && conversar && <AdCampaignPanel node={node} conversar={conversar} patchConversar={patchConversar} />}

        {/* ─── CARTEIRA ─── */}
        {node.type === "sun" && node.id === "sun-carteira" && wallet && <WalletOverview wallet={wallet} patchWallet={patchWallet} />}
        {node.type === "walletBranch" && wallet && <WalletBranchPanel node={node} wallet={wallet} patchWallet={patchWallet} />}
        {node.type === "walletItem" && <WalletItemPanel node={node} />}

        {/* ─── PERFIL extra (team/app) ─── */}
        {node.type === "teamMember" && <TeamMemberPanel node={node} />}
        {node.type === "appNode" && <AppNodePanel node={node} />}
      </div>
    </div>
  );
}

/* Overview do produto: cabeçalho + grade de atalhos para as 10 abas */
function ProductOverview({ product, ed, patch, onAskKloel, onOpenTab, onBack }) {
  const { C } = useTheme();
  const [tab, setTab] = useState("dados");
  const isActive = product.status === "active";
  const totalSales = ed.plans.reduce((s, p) => s + (p.salesCount || 0), 0);
  const prices = ed.plans.map(p => p.priceInCents || 0).filter(Boolean);
  const priceLabel = prices.length ? (Math.min(...prices) === Math.max(...prices) ? brl(Math.min(...prices)) : `${brl(Math.min(...prices))} – ${brl(Math.max(...prices))}`) : "Sem planos";
  const category = ed.dados?.category || product.meta?.category || "Sem categoria";
  const img = ed.dados?.imageUrl || product.meta?.imageUrl || "";
  const tabs = [
    { k: "dados", l: "Dados gerais" },
    { k: "planos", l: "Planos" },
    { k: "checkouts", l: "Checkouts" },
    { k: "urls", l: "Urls" },
    { k: "comissao", l: "Comissionamento / Afiliação" },
    { k: "cupons", l: "Cupons de Desconto" },
    { k: "campanhas", l: "Campanhas" },
    { k: "avaliacoes", l: "Avaliações" },
    { k: "afterpay", l: "After Pay" },
    { k: "ia", l: "IA" },
  ];
  const body = () => {
    switch (tab) {
      case "dados": return <TabDados ed={ed} patch={patch} product={product} />;
      case "planos": return <TabPlanos ed={ed} patch={patch} />;
      case "checkouts": return <TabCheckouts ed={ed} patch={patch} />;
      case "urls": return <TabUrls ed={ed} patch={patch} product={product} />;
      case "comissao": return <TabComissao ed={ed} patch={patch} product={product} />;
      case "cupons": return <TabCupons ed={ed} patch={patch} />;
      case "campanhas": return <TabCampanhas ed={ed} patch={patch} />;
      case "avaliacoes": return <TabAvaliacoes ed={ed} patch={patch} />;
      case "afterpay": return <TabAfterpay ed={ed} patch={patch} />;
      case "ia": return <TabIA ed={ed} patch={patch} />;
      default: return null;
    }
  };
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {onBack && <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, color: C.muted, fontFamily: FONT, fontSize: 12.5, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.color = C.silver} onMouseLeave={e => e.currentTarget.style.color = C.muted}>{Icon.back(13)} Produtos</button>}
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.silver }}>{product.label}</span>
        <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 6, background: isActive ? "rgba(34,197,94,0.12)" : "rgba(229,72,77,0.12)", border: `1px solid ${isActive ? C.green : C.red}` }}>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: isActive ? C.green : C.red }}>{isActive ? "ACTIVE" : "INACTIVE"}</span>
        </span>
        {onAskKloel && <button onClick={() => onAskKloel({ nodeId: product.id, type: "product", label: product.label })} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 99, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }} onMouseEnter={e => { e.currentTarget.style.borderColor = C.ember; e.currentTarget.style.color = C.ember; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}>{Icon.bolt(11)} Kloel</button>}
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "center", padding: 20, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ width: 80, height: 80, borderRadius: 8, background: C.raised, border: `1px solid ${C.divider}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 6, flexShrink: 0 }}>
          {img ? <img src={img} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 4 }} /> : <span style={{ color: C.dim, display: "flex" }}>{Icon.box(22)}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, color: C.silver, margin: "0 0 4px" }}>{product.label}</h1>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontFamily: FONT, fontSize: 12, color: C.muted }}>
            <span>{category}</span>
            <span style={{ fontFamily: MONO, fontWeight: 600, color: C.ember }}>{priceLabel}</span>
            <span style={{ color: C.dim }}>·</span>
            <span>{ed.plans.length} plano{ed.plans.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: C.ember }}>{totalSales}</span>
          <span style={{ fontFamily: FONT, fontSize: 10, color: C.dim, marginLeft: 4 }}>vendas</span>
          <div style={{ marginTop: 8, marginLeft: "auto", width: 68, height: 2, borderRadius: 16, background: "rgba(232,93,48,0.34)" }} />
        </div>
      </div>
      <div className="hide-scrollbar" style={{ display: "flex", gap: 1, borderBottom: `1px solid ${C.border}`, marginBottom: 20, overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ padding: "8px 14px", background: "none", border: "none", borderBottom: tab === t.k ? `2px solid ${C.ember}` : "2px solid transparent", color: tab === t.k ? C.silver : C.muted, fontFamily: FONT, fontSize: 12, fontWeight: tab === t.k ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap" }}>{t.l}</button>
        ))}
      </div>
      {body()}
    </>
  );
}

/* ── CRIAR · "Meus Produtos" (réplica visual da tela do repo) ── */
function LiveFeed({ color, events }) {
  const { C } = useTheme();
  const list = events && events.length ? events : [{ text: "Aguardando atividade...", time: "agora" }];
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
      <style>{`@keyframes kloelPulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", borderBottom: `1px solid ${C.divider}` }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: color, animation: "kloelPulse 1.6s ease-in-out infinite" }} />
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.dim, letterSpacing: 1, textTransform: "uppercase" }}>ao vivo</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {list.map((e, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", borderBottom: i < list.length - 1 ? `1px solid ${C.divider}` : "none" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: color, flexShrink: 0 }} />
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.text}</span>
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.dim, flexShrink: 0 }}>{e.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CriarProdutosScreen({ products, educar, onOpenNode, onNewProduct }) {
  const { C } = useTheme();
  const [search, setSearch] = useState("");
  const SECTION = { fontFamily: FONT, fontSize: 10, fontWeight: 600, color: C.dim, letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 12 };
  const CARD = { background: C.paper, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginBottom: 16 };
  const revOf = (p) => (p.editor?.plans || []).reduce((a, pl) => a + (pl.salesCount || 0) * (pl.priceInCents || 0), 0);
  const salesOf = (p) => (p.editor?.plans || []).reduce((a, pl) => a + (pl.salesCount || 0), 0);
  const totalRevenue = products.reduce((s, p) => s + revOf(p), 0);
  const totalSales = products.reduce((s, p) => s + salesOf(p), 0);
  const activeProducts = products.filter(p => p.status === "active").length;
  const activePlanCount = products.reduce((s, p) => s + (p.editor?.checkouts || []).filter(c => c.isActive !== false).length, 0);
  const memberAreaCount = (educar?.areas || []).filter(a => a.active !== false).length;
  const affiliateCount = products.reduce((s, p) => s + (p.editor?.affiliateRequests || []).filter(r => r.status === "APPROVED").length, 0);
  const maxRevenue = Math.max(1, ...products.map(revOf));
  const filtered = products.filter(p => p.label.toLowerCase().includes(search.trim().toLowerCase()));
  const tickerItems = products.length ? products.map(p => {
    const plans = p.editor?.plans || [];
    return plans.length ? `${p.label} · ${brl(Math.min(...plans.map(pl => pl.priceInCents || 0)))}` : `${p.label} · sem planos configurados`;
  }) : ["Aguardando vendas..."];
  const productEvents = products.map(p => p.status === "active"
    ? { text: `${p.label} ativo e vendendo`, time: "há 1h" }
    : p.status === "analysis"
      ? { text: `${p.label} em análise regulatória`, time: "há 2h" }
      : { text: `${p.label} salvo como rascunho`, time: "ontem" });
  productEvents.push({ text: "IA atualizou base de conhecimento", time: "há 3h" });

  const statusOf = (p) => p.status === "active" ? [C.ember, "Ativo"] : (p.status === "analysis" || p.status === "pending") ? [C.muted, "Em análise"] : [C.faint, "Rascunho"];
  const priceLabelOf = (p) => {
    const prices = (p.editor?.plans || []).map(pl => pl.priceInCents || 0).filter(v => v > 0);
    if (!prices.length) return "Sem preço";
    const mn = Math.min(...prices), mx = Math.max(...prices);
    return mn === mx ? brlFromCents(mn) : `${brlFromCents(mn)} – ${brlFromCents(mx)}`;
  };
  const planCountLabelOf = (p) => {
    const plans = p.editor?.plans || [];
    const active = plans.filter(pl => pl.isActive !== false).length;
    return active > 0 ? `${active} ${active === 1 ? "plano ativo" : "planos ativos"}` : plans.length > 0 ? `${plans.length} ${plans.length === 1 ? "plano" : "planos"}` : "Sem planos";
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "26px 24px 32px", fontFamily: FONT }}>
      <style>{`@keyframes kloelTicker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        {/* lixo legado removido: toggle "Meus Produtos | Afiliar-se" pressupunha sidebar/telas-fixas. No graph, Criar e Afiliar são galáxias próprias — a navegação é pelo grafo/nav flutuante. */}
        <div style={{ position: "relative", padding: "32px 0", marginBottom: 8 }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 480, height: 180, borderRadius: "16%", pointerEvents: "none", background: "rgba(232,93,48,0.08)" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", textAlign: "center" }}>
            {onNewProduct && (
              <button onClick={onNewProduct} style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", background: C.ember, border: "none", borderRadius: 10, color: "#fff", fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{Icon.plus(16)} Novo produto</button>
            )}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim, letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 8 }}>RECEITA TOTAL DOS SEUS PRODUTOS</div>
              <div style={{ fontFamily: MONO, fontSize: "clamp(44px, 6vw, 80px)", fontWeight: 700, color: C.ember, letterSpacing: "-0.02em", textShadow: "0 0 24px rgba(232,93,48,0.3)", lineHeight: 1 }}>{brlFromCents(totalRevenue)}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 }}>
                <span style={{ width: 34, height: 3, borderRadius: 2, background: C.ember, opacity: 0.55 }} />
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.ember }}>{activeProducts > 0 ? `${activeProducts}/${products.length} ativos` : "Ative seu primeiro produto"}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ overflow: "hidden", borderTop: `1px solid ${C.divider}`, borderBottom: `1px solid ${C.divider}`, padding: "9px 0", marginBottom: 16 }}>
          <div style={{ display: "inline-flex", whiteSpace: "nowrap", animation: "kloelTicker 22s linear infinite", willChange: "transform" }}>
            {[...tickerItems, ...tickerItems].map((t, i) => (
              <span key={i} style={{ fontFamily: MONO, fontSize: 11, color: C.ember, padding: "0 22px", opacity: 0.85 }}>{t}</span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 42, padding: "0 14px", background: C.paper, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 16 }}>
          <span style={{ color: C.dim, display: "flex" }}>{Icon.search(15)}</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto..." style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontFamily: FONT, fontSize: 13, color: C.text }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", display: "flex" }}>{Icon.x(14)}</button>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "40px 20px", background: C.paper, border: `1px dashed ${C.border}`, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontFamily: FONT, fontSize: 14, color: C.silver, marginBottom: 6 }}>Nenhum produto {search ? "encontrado" : "ainda"}</div>
              {onNewProduct && !search && <button onClick={onNewProduct} style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 24px", background: C.ember, border: "none", borderRadius: 6, color: "#fff", fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{Icon.plus(15)} Criar primeiro produto</button>}
            </div>
          ) : filtered.map(p => {
            const [stColor, stLabel] = statusOf(p);
            const rev = revOf(p);
            const img = p.editor?.dados?.imageUrl || p.meta?.imageUrl || "";
            const hasPlanPricing = (p.editor?.plans || []).some(pl => (pl.priceInCents || 0) > 0);
            const priceBg = hasPlanPricing ? C.emberSoft : C.raised;
            const priceBorder = hasPlanPricing ? C.emberBorder : C.border;
            const priceColor = hasPlanPricing ? C.ember : C.muted;
            const category = p.meta?.category || p.editor?.dados?.category || "—";
            return (
              <button key={p.id} onClick={() => onOpenNode(p.id)} style={{ position: "relative", display: "block", width: "100%", padding: "14px 16px", background: C.paper, border: `1px solid ${C.border}`, borderRadius: 12, cursor: "pointer", textAlign: "left", transition: "border-color .15s ease" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.ember} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                <div style={{ display: "grid", gridTemplateColumns: "56px minmax(0,1fr) auto", columnGap: 16, alignItems: "stretch", width: "100%" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "space-between", gap: 10, gridRow: "1 / span 2" }}>
                    <div style={{ width: 56, height: 56, borderRadius: 12, background: C.raised, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", padding: 6, flexShrink: 0 }}>
                      {img ? <div aria-hidden style={{ width: "100%", height: "100%", borderRadius: 8, backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundImage: `url(${img})` }} /> : <span style={{ color: C.ember, display: "flex" }}>{Icon.box(20)}</span>}
                    </div>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.raised, fontFamily: MONO, fontSize: 9.5, color: C.muted }}>{Icon.edit(12)} Editar</span>
                  </div>
                  <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0, flex: 1, fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.silver, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{category}</span>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{planCountLabelOf(p)}</span>
                      </div>
                    </div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: 16, border: `1px solid ${priceBorder}`, background: priceBg, maxWidth: "100%", flexWrap: "wrap", alignSelf: "flex-start" }}>
                      <span style={{ fontFamily: FONT, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>Preço</span>
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: priceColor, wordBreak: "break-word" }}>{priceLabelOf(p)}</span>
                    </div>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
                    <div style={{ textAlign: "right", minWidth: 104 }}>
                      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: C.ember }}>{brlFromCents(rev)}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", marginTop: 2 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "16%", background: stColor }} />
                        <span style={{ fontFamily: MONO, fontSize: 10, color: stColor }}>{stLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {products.length > 0 && (
          <div style={CARD}>
            <div style={SECTION}>Receita por Produto</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {products.map(p => {
                const rev = revOf(p); const pct = (rev / maxRevenue) * 100;
                return (
                  <div key={p.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>{p.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.ember }}>{brlFromCents(rev)}</span>
                    </div>
                    <div style={{ height: 6, background: C.raised, borderRadius: 4 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: C.ember, borderRadius: 4, transition: "width .4s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {products.length > 0 && (
          <div style={CARD}>
            <div style={SECTION}>Saúde operacional</div>
            {[
              { label: "Produtos ativos", count: activeProducts, icon: Icon.box },
              { label: "Checkouts ativos", count: activePlanCount, icon: Icon.card },
              { label: "Áreas vinculadas", count: memberAreaCount, icon: Icon.layers },
              { label: "Afiliados ativos", count: affiliateCount, icon: Icon.bolt },
            ].map(m => {
              const denom = Math.max(activeProducts || 0, activePlanCount || 0, memberAreaCount || 0, affiliateCount || 0, 1);
              const pct = Math.min(((m.count || 0) / denom) * 100, 100);
              return (
                <div key={m.label} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 11, color: C.muted }}>
                      <span style={{ color: C.ember, display: "flex" }}>{m.icon(14)}</span>{m.label}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.ember }}>{m.count || 0}</span>
                  </div>
                  <div style={{ height: 4, background: C.raised, borderRadius: 4 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: C.ember, borderRadius: 4, transition: "width .5s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ color: C.ember, display: "flex" }}>{Icon.bolt(18)}</span>
              <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: C.dim, letterSpacing: "0.25em", textTransform: "uppercase" }}>MOTOR IA</span>
            </div>
            <p style={{ fontFamily: MONO, fontSize: 12, color: C.muted, lineHeight: 1.6, margin: 0 }}>
              {products.length > 0
                ? `${products.length} produtos no motor, ${activePlanCount} checkouts e ${affiliateCount} afiliados — IA operando na jornada de compra.`
                : "Crie produtos para ativar o motor de IA e impulsionar suas vendas."}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Receita", value: brlFromCents(totalRevenue), sub: `${products.length} produtos no catálogo`, icon: Icon.box },
            { label: "Vendas", value: String(totalSales), sub: `${activePlanCount} checkout${activePlanCount === 1 ? "" : "s"} ativo${activePlanCount === 1 ? "" : "s"}`, icon: Icon.card },
            { label: "Ativos", value: String(activeProducts), sub: `${memberAreaCount} áreas de membros`, icon: Icon.bolt },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <span style={{ color: C.ember, display: "flex" }}>{s.icon(18)}</span>
                <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: C.dim, letterSpacing: "0.25em", textTransform: "uppercase" }}>{s.label}</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, color: C.silver }}>{s.value}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.ember, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: C.dim, marginBottom: 10, letterSpacing: "0.25em", textTransform: "uppercase" }}>Feed ao Vivo</div>
          <LiveFeed color={C.ember} events={productEvents} />
        </div>
      </div>
    </div>
  );
}

function CorePanelBody() { return <PanelDescription>Esta é a massa central do seu perfil. Ligados diretamente a ela: Pessoal, Fiscal, Docs e Banco. Cada dado preenchido vira um nó orbitando a seção correspondente.</PanelDescription>; }

function MassPanelBody({ node, products, affiliate, educar, onCreateArea, onNewProduct, onOpenNode }) {
  const { C } = useTheme();
  if (node.id === "sun-criar") {
    return (
      <>
        <PanelDescription>Massa de criação. Todo produto nasce conectado aqui e abre as abas de edição como sub-nós: dados, planos (com checkouts), URLs, comissão, cupons, campanhas, avaliações, after pay e IA.</PanelDescription>
        {onNewProduct && (
          <div style={{ marginTop: 16 }}>
            <CTA variant="ember" fullWidth onClick={onNewProduct}>{Icon.plus(13)} Novo produto</CTA>
          </div>
        )}
        <PanelDivider />
        <Tag color={C.muted} weight={600}>{products.length} produtos</Tag>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {products.map(p => (
            <button key={p.id} onClick={() => onOpenNode && onOpenNode(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6, cursor: onOpenNode ? "pointer" : "default", textAlign: "left", width: "100%", transition: "border-color .15s ease" }}
              onMouseEnter={e => { if (onOpenNode) e.currentTarget.style.borderColor = C.ember; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.divider; }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: C.ember }} />
              <span style={{ flex: 1, fontFamily: FONT, fontSize: 12, color: C.text }}>{p.label}</span>
              <Tag color={C.dim}>R$ {p.meta?.price}</Tag>
              {onOpenNode && <span style={{ color: C.dim, display: "flex" }}>{Icon.chevron(12, "right")}</span>}
            </button>
          ))}
        </div>
      </>
    );
  }
  if (node.id === "sun-afiliar" && affiliate) return <AffiliateOverview affiliate={affiliate} />;
  if (node.id === "sun-carteira") return null; // tratado pela linha dedicada (WalletOverview)
  if (node.id === "eu-ensinar") {
    const areas = educar?.areas || [];
    return (
      <>
        <PanelDescription>Sua área de membros. Cada curso/comunidade é uma área com módulos, aulas, alunos e certificado.</PanelDescription>
        <SubTitle right={onCreateArea && <CTA small variant="ember" onClick={onCreateArea}>{Icon.plus(11)} área</CTA>}>áreas de membros</SubTitle>
        {areas.length === 0 ? <EmptyState>Nenhuma área criada</EmptyState> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {areas.map(a => { const st = areaStats(a); return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: 99, background: a.active ? C.green : C.dim }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FONT, fontSize: 12, color: C.silver }}>{a.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.dim }}>{st.totalStudents} alunos · {st.totalModules} módulos · {st.totalLessons} aulas</div>
                </div>
                {a.certificates && <Pill color={C.green} bg={C.void} border={C.divider}>cert</Pill>}
              </div>
            ); })}
          </div>
        )}
      </>
    );
  }
  const desc = {
    "sun-afiliar":  "Massa de afiliação. Os produtos a que você se afiliar viram nós conectados a esta massa.",
    "sun-educar":   "Massa de educação. Organiza dois ramos: Aprender (cursos comprados) e Ensinar (área de membros).",
    "sun-conectar": "Massa de conversas. WhatsApp, Instagram, Facebook, Email e TikTok orbitam aqui. Conecte um canal para abrir arsenal e voz.",
    "eu-aprender":  "Reúne todos os cursos que você comprou.",
  }[node.id] || "Massa de interface.";
  return <PanelDescription>{desc}</PanelDescription>;
}

function ProofPanelBody({ node }) {
  const ck = node.meta?.channelKey;
  return (
    <>
      <PanelRow label="canal" value={CHANNEL_META[ck]?.name || "—"} />
      <PanelRow label="tipo" value="evidência social" sub="usada pela IA durante objeções" />
      <PanelDivider />
      <PanelDescription>Esta peça é munição. A IA decide quando trazer ela à tona durante uma conversa neste canal.</PanelDescription>
    </>
  );
}
function VoicePanelBody({ node }) {
  const v = node.meta?.voice;
  const TONES = ["Sereno", "Equilibrado", "Caloroso"];
  const EDGES = ["Paciente", "Firme", "Incisivo"];
  return (
    <>
      <PanelRow label="canal" value={CHANNEL_META[node.meta?.channelKey]?.name || "—"} />
      <PanelRow label="temperatura" value={TONES[v?.tone || 1]} />
      <PanelRow label="postura" value={EDGES[v?.edge || 1]} />
      <PanelDivider />
      <PanelDescription>A calibração de voz se aplica a todas as conversas que a IA conduz neste canal.</PanelDescription>
    </>
  );
}
function ChannelConnectedPanel({ node, channels, products }) {
  const { C } = useTheme();
  const ck = node.meta?.channelKey;
  const ch = channels[ck];
  const TONES = ["Sereno", "Equilibrado", "Caloroso"];
  const EDGES = ["Paciente", "Firme", "Incisivo"];
  const linkedProducts = (ch.products || []).map(pid => products.find(p => p.id === pid)).filter(Boolean);
  return (
    <>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "6px 12px", borderRadius: 99, background: C.emberSoft, border: `1px solid ${C.emberBorder}`, marginBottom: 18 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: C.ember }} />
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.ember, letterSpacing: 1.5, fontWeight: 600 }}>CONECTADO</span>
      </div>
      <PanelRow label="provider" value={node.meta?.provider} />
      <PanelRow label="produtos oferecidos" value={linkedProducts.length} />
      <PanelRow label="arsenal" value={ch.arsenal || 0} sub={ch.arsenal === 1 ? "1 prova" : "provas carregadas"} />
      {ch.voice && <PanelRow label="voz" value={`${TONES[ch.voice.tone]} · ${EDGES[ch.voice.edge]}`} />}
      <PanelDivider />
      {linkedProducts.length > 0 && (
        <>
          <Tag color={C.muted}>produtos vinculados</Tag>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {linkedProducts.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: C.void, border: `1px solid ${C.divider}`, borderRadius: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: 99, background: C.ember }} />
                <span style={{ flex: 1, fontFamily: FONT, fontSize: 12, color: C.text }}>{p.label}</span>
                <Tag color={C.dim}>R$ {p.meta?.price}</Tag>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   CORE SETTINGS (PERFIL) · preservado do original — conta/fiscal/docs/banco
   ════════════════════════════════════════════════════════════════════════ */
const DEFAULT_ACCOUNT_DATA = {
  pessoal: { nome: "Daniel Gonzaga", email: "danielgonzagatj@gmail.com", celular: "64993128506", nascimento: "11/04/1999" },
  fiscal: { tipo: "cnpj", cnpj: "47.889.955/0001-05", razao: "BRANDING CAPS LTDA", fantasia: "BRANDING CAPS", ie: "", im: "", cpfResp: "***289971**", nomeResp: "DANIEL GONZAGA PENIN", cep: "37270000", rua: "COMENDADOR FRANCISCO RODRIGUES NEVES", numero: "295", complemento: "LETRA A SALA 02", bairro: "CENTRO", cidade: "CAMPO BELO", uf: "MG" },
  documentos: { identidade: { status: "pendente", enviado: "30/03/2026", name: "Documento de identidade", fileName: "rg-frente.jpg", rejectedReason: null, reviewedAt: null }, contrato: { status: "pendente", enviado: "30/03/2026", name: "Contrato social ou cartão CNPJ", fileName: "contrato-social.pdf", rejectedReason: null, reviewedAt: null } },
  bancario: { tipo: "corrente", banco: "", codigo: "", agencia: "", conta: "", titular: "BRANDING CAPS LTDA", cpfCnpj: "47.889.955/0001-05", pixChave: "", pixTipo: "" },
  // ── perfil público (KycProfile.publicName/bio/website/instagram) ──
  perfilPublico: { publicName: "", bio: "", website: "", instagram: "", avatarUrl: "" },
  // ── equipe (TeamMember + TeamInvite) ──
  team: { members: [{ id: "tm1", name: "Daniel Gonzaga", email: "danielgonzagatj@gmail.com", role: "OWNER", status: "active" }], invites: [] },
  // ── segurança ──
  seguranca: { twoFactor: false, lastLogin: "28/05/2026 09:14", sessions: 1 },
  // ── idiomas ──
  idiomas: { language: "pt-BR" },
  // ── apps / integrações (status por app) ──
  apps: { meta: { connected: false, pageName: null, instagramUsername: null, adAccountId: null }, google: { connected: false }, tiktok: { connected: false }, zapier: { connected: false } },
  // ── referral ──
  referral: { code: "DANIEL-KLOEL", invited: 0, earned: 0 },
};
const ACCOUNT_SECTIONS = [
  { key: "pessoal", label: "Pessoal" }, { key: "fiscal", label: "Fiscal" }, { key: "documentos", label: "Docs" }, { key: "bancario", label: "Banco" },
  { key: "perfilPublico", label: "Público" }, { key: "team", label: "Equipe" }, { key: "apps", label: "Apps" }, { key: "seguranca", label: "Segurança" },
];
function sectionStatus(section, data) {
  if (section === "pessoal") { const p = data.pessoal; return (p.nome && p.email && p.celular && p.nascimento) ? "complete" : "partial"; }
  if (section === "fiscal") { const f = data.fiscal; if (f.tipo === "cnpj" && f.cnpj && f.razao && f.cep) return "complete"; if (f.tipo === "cpf" && f.cpfResp && f.cep) return "complete"; return "partial"; }
  if (section === "documentos") { const all = Object.values(data.documentos); if (all.every(x => x.status === "aprovado")) return "complete"; if (all.some(x => x.status === "rejeitado")) return "error"; return "pending"; }
  if (section === "bancario") { const b = data.bancario; return (b.banco && b.agencia && b.conta) ? "complete" : "incomplete"; }
  if (section === "perfilPublico") { const p = data.perfilPublico; return (p.publicName && p.bio) ? "complete" : "partial"; }
  if (section === "team") { return (data.team.invites.length === 0) ? "complete" : "pending"; }
  if (section === "apps") { const a = data.apps; return Object.values(a).some(x => x.connected) ? "complete" : "incomplete"; }
  if (section === "seguranca") { return data.seguranca.twoFactor ? "complete" : "partial"; }
  return "incomplete";
}
const STATUS_COLOR = (status, C) => ({ complete: C.green, partial: C.amber, pending: C.amber, incomplete: C.ember, error: C.ember }[status] || C.dim);
function StatusDot({ status, size = 5 }) { const { C } = useTheme(); return <span style={{ width: size, height: size, borderRadius: 99, background: STATUS_COLOR(status, C), flexShrink: 0 }} />; }
function CoreAvatar({ avatarUrl, onUpload, initial = "D" }) {
  const { C } = useTheme();
  const inputRef = useRef(null);
  const [hover, setHover] = useState(false);
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onUpload?.(String(reader.result));
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const clickable = Boolean(onUpload);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => clickable && inputRef.current?.click()}
      title={clickable ? "Enviar foto de perfil" : undefined}
      style={{ position: "relative", flexShrink: 0, width: 44, height: 44, cursor: clickable ? "pointer" : "default" }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 99, overflow: "hidden", background: avatarUrl ? `center / cover no-repeat url(${avatarUrl})` : C.silver, color: C.void, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 18, fontWeight: 400, letterSpacing: -0.4 }}>
        {!avatarUrl && initial}
      </div>
      {clickable && hover && (
        <div style={{ position: "absolute", inset: 0, borderRadius: 99, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
          {Icon.upload(15)}
        </div>
      )}
      <span style={{ position: "absolute", bottom: 0, right: 0, width: 11, height: 11, borderRadius: 99, background: C.ember, border: `2px solid ${C.paper}`, pointerEvents: "none" }} />
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}
function Segmented({ options, value, onChange }) {
  const { C } = useTheme();
  return (
    <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 7, background: C.raised, border: `1px solid ${C.divider}` }}>
      {options.map(o => { const active = value === o.value; return <button key={o.value} onClick={() => onChange(o.value)} style={{ flex: 1, height: 32, padding: "0 10px", border: "none", background: active ? C.paper : "transparent", color: active ? C.silver : C.muted, fontFamily: FONT, fontSize: 11.5, fontWeight: active ? 500 : 400, borderRadius: 5, cursor: "pointer", boxShadow: active ? `0 0 0 1px ${C.border}` : "none", transition: "all .15s ease", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</button>; })}
    </div>
  );
}
function StatusBadgePill({ status }) {
  const { C } = useTheme();
  const meta = { pendente: { label: "pendente", color: C.amber, icon: Icon.clock(10) }, aprovado: { label: "aprovado", color: C.green, icon: Icon.check(10) }, rejeitado: { label: "rejeitado", color: C.ember, icon: Icon.alert(10) } }[status] || { label: status, color: C.muted };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 99, background: C.raised, border: `1px solid ${C.divider}`, color: meta.color, fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.2, fontWeight: 600, textTransform: "uppercase" }}>{meta.icon} {meta.label}</span>;
}
function SectionPessoal({ data, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="nome completo" value={data.nome} onChange={v => onChange({ nome: v })} />
      <Field label="e-mail" value={data.email} disabled />
      <Field label="celular" value={data.celular} onChange={v => onChange({ celular: v })} mono />
      <Field label="nascimento" value={data.nascimento} onChange={v => onChange({ nascimento: v })} suffix={Icon.calendar(14)} />
    </div>
  );
}
function SectionFiscal({ data, onChange }) {
  const isPJ = data.tipo === "cnpj";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Segmented value={data.tipo} onChange={v => onChange({ tipo: v })} options={[{ value: "cpf", label: "Pessoa Física" }, { value: "cnpj", label: "Pessoa Jurídica" }]} />
      {isPJ ? (
        <>
          <Row><Field half mono label="CNPJ" value={data.cnpj} onChange={v => onChange({ cnpj: v })} /><Field half label="razão social" value={data.razao} onChange={v => onChange({ razao: v })} /></Row>
          <Row><Field half label="nome fantasia" value={data.fantasia} onChange={v => onChange({ fantasia: v })} /><Field half label="inscrição estadual" value={data.ie} onChange={v => onChange({ ie: v })} placeholder="opcional" /></Row>
          <Field label="inscrição municipal" value={data.im} onChange={v => onChange({ im: v })} placeholder="opcional" />
          <Row><Field half mono label="CPF responsável" value={data.cpfResp} onChange={v => onChange({ cpfResp: v })} /><Field half label="nome responsável" value={data.nomeResp} onChange={v => onChange({ nomeResp: v })} /></Row>
        </>
      ) : (
        <><Field mono label="CPF" value={data.cpfResp} onChange={v => onChange({ cpfResp: v })} /><Field label="nome completo" value={data.nomeResp} onChange={v => onChange({ nomeResp: v })} /></>
      )}
      <SubTitle>endereço fiscal</SubTitle>
      <Row><Field half mono label="CEP" value={data.cep} onChange={v => onChange({ cep: v })} /><Field half label="rua" value={data.rua} onChange={v => onChange({ rua: v })} /></Row>
      <Row><Field half mono label="número" value={data.numero} onChange={v => onChange({ numero: v })} /><Field half label="complemento" value={data.complemento} onChange={v => onChange({ complemento: v })} /></Row>
      <Row><Field half label="bairro" value={data.bairro} onChange={v => onChange({ bairro: v })} /><Field half label="cidade" value={data.cidade} onChange={v => onChange({ cidade: v })} /></Row>
      <Field label="UF" value={data.uf} onChange={v => onChange({ uf: v })} />
    </div>
  );
}
function DocumentRow({ doc, onRemove }) {
  const { C } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", background: C.raised, border: `1px solid ${doc.status === "rejeitado" ? C.red + "55" : C.divider}`, borderRadius: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: C.muted, display: "flex", flexShrink: 0 }}>{Icon.doc(20)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver, fontWeight: 500, marginBottom: 2 }}>{doc.fileName || doc.name}</div>
          <div style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted }}>{doc.reviewedAt ? `revisado em ${doc.reviewedAt}` : `enviado em ${doc.enviado}`}</div>
        </div>
        <StatusBadgePill status={doc.status} />
      </div>
      {doc.status === "rejeitado" && doc.rejectedReason && (
        <div style={{ fontFamily: FONT, fontSize: 11, color: C.red, paddingLeft: 32, lineHeight: 1.4 }}>Motivo: {doc.rejectedReason}</div>
      )}
    </div>
  );
}
function SectionDocumentos({ data, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Banner tone="info" icon={Icon.clock(14)}>A análise dos documentos pode levar até 48 horas úteis. Você será notificado por e-mail.</Banner>
      <DocumentRow doc={data.identidade} />
      <DocumentRow doc={data.contrato} />
    </div>
  );
}
function SectionBancario({ data, onChange }) {
  const { C } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Segmented value={data.tipo} onChange={v => onChange({ tipo: v })} options={[{ value: "corrente", label: "Corrente" }, { value: "poupanca", label: "Poupança" }, { value: "pagamento", label: "Pagamento" }]} />
      <Row><Field half label="banco" value={data.banco} onChange={v => onChange({ banco: v })} placeholder="selecione..." /><Field half mono label="código" value={data.codigo} onChange={v => onChange({ codigo: v })} placeholder="---" /></Row>
      <Row><Field half mono label="agência" value={data.agencia} onChange={v => onChange({ agencia: v })} placeholder="0000" /><Field half mono label="conta" value={data.conta} onChange={v => onChange({ conta: v })} placeholder="00000-0" /></Row>
      <Row><Field half label="titular" value={data.titular} disabled /><Field half mono label="CPF/CNPJ" value={data.cpfCnpj} disabled /></Row>
      <Banner tone="ember" icon={Icon.shield(13)}>Titular preenchido com a razão social e CNPJ dos dados fiscais. A conta deve ser da mesma titularidade.</Banner>
      <SubTitle>PIX (opcional)</SubTitle>
      <Row><Field half label="chave PIX" value={data.pixChave} onChange={v => onChange({ pixChave: v })} placeholder="e-mail, CPF, celular..." /><Field half label="tipo da chave" value={data.pixTipo} onChange={v => onChange({ pixTipo: v })} placeholder="selecione..." /></Row>
      <Banner tone="success" icon={Icon.check(13)}><span style={{ fontWeight: 500, color: C.silver }}>Saque ilimitado</span> · contas CNPJ não possuem limite de saque mensal.</Banner>
    </div>
  );
}

/* ── perfil público (KycProfile) ── */
function SectionPerfilPublico({ data, onChange }) {
  const { C } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Banner tone="info" icon={Icon.user(13)}>Estes dados aparecem na sua página de produtor e nos checkouts.</Banner>
      <Field label="nome público" value={data.publicName} onChange={v => onChange({ publicName: v })} placeholder="Como aparece p/ clientes" />
      <TextArea label="bio" value={data.bio} onChange={v => onChange({ bio: v })} placeholder="Sua história em uma linha..." rows={3} />
      <Row>
        <Field half label="website" value={data.website} onChange={v => onChange({ website: v })} placeholder="https://..." mono />
        <Field half label="instagram" value={data.instagram} onChange={v => onChange({ instagram: v })} placeholder="@usuario" mono />
      </Row>
    </div>
  );
}

/* ── equipe (TeamMember + TeamInvite, roles) ── */
const TEAM_ROLES = [["OWNER", "Dono"], ["ADMIN", "Administrador"], ["MANAGER", "Gerente"], ["ANALYST", "Analista"], ["SUPPORT", "Suporte"]];
function SectionTeam({ data, onChange }) {
  const { C } = useTheme();
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ANALYST");
  const invite = () => {
    if (!email.trim()) return;
    onChange({ invites: [...data.invites, { id: `inv-${Date.now()}`, email: email.trim(), role, status: "pending" }] });
    setEmail(""); setShowInvite(false);
  };
  const revoke = (id) => onChange({ invites: data.invites.filter(i => i.id !== id) });
  const removeMember = (id) => onChange({ members: data.members.filter(m => m.id !== id) });
  const roleLabel = (r) => (TEAM_ROLES.find(([k]) => k === r) || [r, r])[1];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SubTitle right={<CTA small variant="ember" onClick={() => setShowInvite(s => !s)}>{Icon.plus(11)} convidar</CTA>}>membros</SubTitle>
      {showInvite && (
        <div style={{ padding: 14, border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="e-mail" value={email} onChange={setEmail} placeholder="pessoa@empresa.com" mono />
          <SelectField label="papel" value={role} onChange={setRole} options={TEAM_ROLES.filter(([k]) => k !== "OWNER").map(([value, label]) => ({ value, label }))} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <CTA small variant="ghost" onClick={() => setShowInvite(false)}>cancelar</CTA>
            <CTA small variant="ember" onClick={invite} disabled={!email.trim()}>enviar convite</CTA>
          </div>
        </div>
      )}
      {data.members.map(m => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6 }}>
          <span style={{ width: 30, height: 30, borderRadius: 99, background: C.silver, color: C.void, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 13, flexShrink: 0 }}>{(m.name || m.email)[0].toUpperCase()}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver, fontWeight: 500 }}>{m.name || m.email}</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim }}>{roleLabel(m.role)}</div>
          </div>
          {m.role === "OWNER" ? <Pill color={C.amber} bg={C.raised} border={C.divider}>VOCÊ</Pill> : (
            <button onClick={() => removeMember(m.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.dim, display: "flex" }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(13)}</button>
          )}
        </div>
      ))}
      {data.invites.length > 0 && <SubTitle>convites pendentes</SubTitle>}
      {data.invites.map(inv => (
        <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "transparent", border: `1px dashed ${C.border}`, borderRadius: 6 }}>
          <span style={{ color: C.amber, display: "flex" }}>{Icon.clock(15)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT, fontSize: 12, color: C.text }}>{inv.email}</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim }}>{roleLabel(inv.role)} · pendente</div>
          </div>
          <button onClick={() => revoke(inv.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.dim, display: "flex" }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.x(13)}</button>
        </div>
      ))}
    </div>
  );
}

/* ── apps / integrações (Meta connect, Google, TikTok, Zapier) ── */
const APP_META = [
  { key: "meta", label: "Meta Business", desc: "Facebook · Instagram · WhatsApp", icon: "users" },
  { key: "google", label: "Google Ads", desc: "Campanhas e conversões", icon: "megaphone" },
  { key: "tiktok", label: "TikTok for Business", desc: "Ads e pixel", icon: "bolt" },
  { key: "zapier", label: "Zapier", desc: "Automações e webhooks", icon: "link" },
];
function SectionApps({ data, onChange }) {
  const { C } = useTheme();
  const toggle = (key) => {
    const app = data[key] || {};
    if (key === "meta" && !app.connected) onChange({ meta: { connected: true, pageName: "Kloel Oficial", instagramUsername: "kloel.oficial", adAccountId: "act_1029", whatsappPhoneNumberId: "5564993128506", catalogId: "cat_8841", pixelId: "1029384756" } });
    else onChange({ [key]: { ...app, connected: !app.connected } });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Banner tone="ember" icon={Icon.link(13)}>Integrações alimentam campanhas, pixel e a IA de vendas com dados reais.</Banner>
      {APP_META.map(a => {
        const app = data[a.key] || {};
        const on = app.connected;
        return (
          <div key={a.key} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", background: on ? C.emberSoft : C.raised, border: `1px solid ${on ? C.emberBorder : C.divider}`, borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: on ? C.ember : C.muted, display: "flex" }}>{Icon[a.icon](18)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.silver, fontWeight: 500 }}>{a.label}</div>
                <div style={{ fontFamily: FONT, fontSize: 10.5, color: C.dim }}>{on && a.key === "meta" && app.pageName ? `${app.pageName} · @${app.instagramUsername}` : a.desc}</div>
              </div>
              <CTA small variant={on ? "line" : "ember"} onClick={() => toggle(a.key)}>{on ? "desconectar" : "conectar"}</CTA>
            </div>
            {on && a.key === "meta" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 30 }}>
                {app.adAccountId && <Pill color={C.muted} bg={C.raised} border={C.divider}>ads {app.adAccountId}</Pill>}
                {app.whatsappPhoneNumberId && <Pill color={C.green} bg={C.raised} border={C.divider}>WhatsApp ✓</Pill>}
                {app.catalogId && <Pill color={C.muted} bg={C.raised} border={C.divider}>catálogo {app.catalogId}</Pill>}
                {app.pixelId && <Pill color={C.muted} bg={C.raised} border={C.divider}>pixel {app.pixelId}</Pill>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── segurança ── */
function SectionSeguranca({ data, onChange }) {
  const { C } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Toggle label="Autenticação em 2 fatores (2FA)" value={data.twoFactor} onChange={v => onChange({ twoFactor: v })} desc="Camada extra de proteção no login" />
      <PanelDivider />
      <PanelRow label="último login" value={data.lastLogin} />
      <PanelRow label="sessões ativas" value={data.sessions} />
      <Banner tone={data.twoFactor ? "success" : "warning"} icon={data.twoFactor ? Icon.shield(13) : Icon.alert(13)}>{data.twoFactor ? "Sua conta está protegida com 2FA." : "Ative o 2FA para proteger pagamentos e dados fiscais."}</Banner>
    </div>
  );
}

function CoreSettingsPanel({ accountData, setAccountData, onClose, initialSection }) {
  const { C } = useTheme();
  const [section, setSection] = useState(initialSection || "pessoal");
  const update = (key) => (partial) => setAccountData(d => ({ ...d, [key]: { ...d[key], ...partial } }));
  return (
    <div style={{ position: "fixed", inset: 0, margin: "auto", width: "80vw", height: "80vh", maxWidth: 1320, maxHeight: 900, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 16px 50px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", zIndex: 40, animation: "panelSlide .3s cubic-bezier(.2,.7,.2,1) both", overflow: "hidden" }}>
      <div style={{ padding: "18px 22px 16px", borderBottom: `1px solid ${C.divider}`, display: "flex", alignItems: "center", gap: 14 }}>
        <CoreAvatar avatarUrl={accountData.perfilPublico?.avatarUrl} initial={(accountData.pessoal?.nome || "D").trim()[0] || "D"} onUpload={(url) => setAccountData(d => ({ ...d, perfilPublico: { ...d.perfilPublico, avatarUrl: url } }))} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 500, color: C.silver, letterSpacing: -0.2, marginBottom: 2 }}>{accountData.pessoal.nome}</div>
          <div style={{ fontFamily: FONT, fontSize: 11.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{accountData.pessoal.email}</div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.muted, display: "flex" }}>{Icon.x(16)}</button>
      </div>
      <div style={{ padding: "12px 22px", borderBottom: `1px solid ${C.divider}` }}>
        <div className="hide-scrollbar" style={{ display: "flex", gap: 4, overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {ACCOUNT_SECTIONS.map(s => { const active = section === s.key; const status = sectionStatus(s.key, accountData); return <button key={s.key} onClick={() => setSection(s.key)} style={{ flexShrink: 0, padding: "8px 12px", background: active ? C.silver : "transparent", color: active ? C.void : C.muted, border: "none", borderRadius: 6, cursor: "pointer", fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", transition: "all .15s ease" }}><StatusDot status={status} size={5} />{s.label}</button>; })}
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "20px 22px 24px" }}>
        {section === "pessoal" && <SectionPessoal data={accountData.pessoal} onChange={update("pessoal")} />}
        {section === "fiscal" && <SectionFiscal data={accountData.fiscal} onChange={update("fiscal")} />}
        {section === "documentos" && <SectionDocumentos data={accountData.documentos} onChange={update("documentos")} />}
        {section === "bancario" && <SectionBancario data={accountData.bancario} onChange={update("bancario")} />}
        {section === "perfilPublico" && <SectionPerfilPublico data={accountData.perfilPublico} onChange={update("perfilPublico")} />}
        {section === "team" && <SectionTeam data={accountData.team} onChange={update("team")} />}
        {section === "apps" && <SectionApps data={accountData.apps} onChange={update("apps")} />}
        {section === "seguranca" && <SectionSeguranca data={accountData.seguranca} onChange={update("seguranca")} />}
      </div>
      <div style={{ padding: "12px 22px", borderTop: `1px solid ${C.divider}`, background: C.raised, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button style={{ background: "transparent", border: "none", cursor: "pointer", padding: "6px 10px", fontFamily: FONT, fontSize: 11.5, color: C.muted, display: "flex", alignItems: "center", gap: 8, transition: "color .15s ease" }} onMouseEnter={e => e.currentTarget.style.color = C.silver} onMouseLeave={e => e.currentTarget.style.color = C.muted}>{Icon.logout(12)} sair</button>
        <button style={{ background: "transparent", border: "none", cursor: "pointer", padding: "6px 10px", fontFamily: FONT, fontSize: 11.5, color: C.dim, display: "flex", alignItems: "center", gap: 8, transition: "color .15s ease" }} onMouseEnter={e => e.currentTarget.style.color = C.emberHi} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.alert(12)} encerrar conta</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   FAB removido · ações de criação agora vivem dentro dos painéis das massas
   (ex: "+ Novo produto" dentro do painel de Criar)
   ════════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════════
   NEW PRODUCT WIZARD · 5 passos (products/new)
   Detalhes → Vendas → Entrega → Afiliação → Pagamento
   ════════════════════════════════════════════════════════════════════════ */
const WIZARD_STEPS = ["Detalhes", "Vendas", "Entrega", "Afiliação", "Pagamento"];
const GUARANTEE_OPTIONS = [["7", "7 dias"], ["15", "15 dias"], ["30", "30 dias"], ["60", "60 dias"], ["90", "90 dias"]];
const PACKAGE_TYPES = ["Caixa", "Envelope", "Tubo", "Sacola", "Palete", "Outro"];
const DISPATCH_TIMES = [["1", "1 dia útil"], ["2", "2 dias"], ["3", "3 dias"], ["5", "5 dias"], ["7", "7 dias"], ["10", "10 dias"], ["15", "15 dias"]];
const CARRIERS = ["Correios PAC", "SEDEX", "Jadlog", "Loggi", "Total Express", "Azul Cargo", "Latam Cargo", "Sequoia", "Kangu", "Melhor Envio", "Transportadora Local"];

const initialForm = {
  name: "", description: "", category: "Dermocosméticos", tags: [], format: "PHYSICAL", imageUrl: "",
  price: "", paymentType: "ONE_TIME", salesPageUrl: "", guaranteeDays: "30", checkoutType: "standard", facebookPixelId: "", googleTagManagerId: "",
  packageType: "Caixa", width: "", height: "", depth: "", weight: "", shippingResponsible: "producer", dispatchTime: "3", carriers: [],
  affiliatesEnabled: false, affiliateCommissionPercent: "", affiliateApprovalMode: "auto",
  billingType: "one_time", maxInstallments: "12", interestFreeInstallments: "1",
  photoDataUrl: "", deliveryNotApplicable: false,
};

function RadioCards({ value, onChange, options }) {
  const { C } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {options.map(o => {
        const on = value === o.value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 6, background: on ? C.emberSoft : "transparent", border: `1px solid ${on ? C.ember : C.border}`, cursor: "pointer", textAlign: "left", transition: "all .15s ease" }}>
            <span style={{ width: 14, height: 14, borderRadius: 99, border: `1.5px solid ${on ? C.ember : C.hi}`, background: on ? C.ember : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{on && <span style={{ width: 5, height: 5, borderRadius: 99, background: "#fff" }} />}</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontFamily: FONT, fontSize: 12.5, color: on ? C.silver : C.text, fontWeight: 500 }}>{o.label}</span>
              {o.desc && <span style={{ display: "block", fontFamily: FONT, fontSize: 10.5, color: C.dim, marginTop: 1 }}>{o.desc}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
function ChipMulti({ value, onChange, options }) {
  const { C } = useTheme();
  const toggle = (o) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o]);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map(o => {
        const on = value.includes(o);
        return <button key={o} onClick={() => toggle(o)} style={{ padding: "6px 11px", borderRadius: 99, background: on ? C.emberSoft : "transparent", border: `1px solid ${on ? C.ember : C.border}`, color: on ? C.ember : C.muted, fontFamily: MONO, fontSize: 10.5, cursor: "pointer", transition: "all .15s ease" }}>{on ? "✓ " : ""}{o}</button>;
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   DESEMPENHO · painel mission-control + nós-métrica
   ════════════════════════════════════════════════════════════════════════ */
function DzSparkline({ series, color, height = 44 }) {
  const pts = (series && series.length > 1) ? series : [...(series || [0]), ...(series || [0])];
  const W = 300, H = height;
  const max = Math.max(...pts, 1);
  const n = pts.length;
  const stepX = n > 1 ? W / (n - 1) : W;
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${(H - (p / max) * (H - 4) - 2).toFixed(1)}`).join(" ");
  const area = `${path} L ${W.toFixed(1)} ${H} L 0 ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }}>
      <path d={area} fill={color} opacity={0.09} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function DzDateField({ label, value, onChange }) {
  const { C } = useTheme();
  return (
    <label style={{ flex: 1, display: "block" }}>
      <span style={{ display: "block", marginBottom: 6, fontFamily: MONO, fontSize: 9.5, color: C.muted, fontWeight: 500, letterSpacing: 1.4, textTransform: "uppercase" }}>{label}</span>
      <input type="date" value={value || ""} onChange={e => onChange(e.target.value)} style={{ width: "100%", height: 34, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.paper, color: C.text, fontFamily: MONO, fontSize: 11.5, outline: "none", colorScheme: "light dark" }} />
    </label>
  );
}

function DzPeriodSelector({ desempenho, setDesempenho }) {
  const { C } = useTheme();
  const opts = [["today", "Hoje"], ["30d", "30 dias"], ["custom", "Personalizado"]];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, padding: 4, background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8 }}>
        {opts.map(([k, lbl]) => { const on = desempenho.period === k; return (
          <button key={k} onClick={() => setDesempenho(s => ({ ...s, period: k }))} style={{ flex: 1, padding: "8px 6px", borderRadius: 6, border: "none", cursor: "pointer", background: on ? C.silver : "transparent", color: on ? C.void : C.muted, fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", transition: "all .15s ease" }}>{lbl}</button>
        ); })}
      </div>
      {desempenho.period === "custom" && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <DzDateField label="de" value={desempenho.customFrom} onChange={v => setDesempenho(s => ({ ...s, customFrom: v }))} />
          <DzDateField label="até" value={desempenho.customTo} onChange={v => setDesempenho(s => ({ ...s, customTo: v }))} />
        </div>
      )}
    </div>
  );
}

function DzCard({ card, big, onClick }) {
  const { C } = useTheme();
  const arrow = card.deltaDir === "up" ? "▲" : card.deltaDir === "down" ? "▼" : null;
  const arrowColor = card.deltaDir === "up" ? C.green : C.red;
  return (
    <button onClick={onClick} style={{ textAlign: "left", padding: "14px 15px", background: C.paper, border: `1px solid ${C.border}`, borderRadius: 8, cursor: onClick ? "pointer" : "default", display: "flex", flexDirection: "column", gap: 6, transition: "border-color .15s ease" }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.borderColor = C.ember; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}>
      <span style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", lineHeight: 1.3 }}>{card.name}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: FONT, fontSize: big ? 25 : 19, fontWeight: 300, color: C.silver, letterSpacing: -0.5 }}>{card.value}</span>
        {arrow && <span style={{ fontSize: 9.5, color: arrowColor }}>{arrow}</span>}
      </span>
      <span style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted }}>{card.sub}</span>
    </button>
  );
}

function DesempenhoPanel({ desempenho, setDesempenho, data, accountData, onClose, onOpenMetric }) {
  const { C } = useTheme();
  const now = new Date();
  const name = (accountData?.pessoal?.nome || USER_NAME).split(" ")[0];
  const hero = data.cards.filter(c => c.group === "hero");
  const metrics = data.cards.filter(c => c.group === "metric");
  const revenueCard = data.cards.find(c => c.key === "revenue");
  return (
    <div style={{ position: "fixed", inset: 0, margin: "auto", width: "80vw", height: "80vh", maxWidth: 1320, maxHeight: 900, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 16px 50px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", zIndex: 40, animation: "panelSlide .3s cubic-bezier(.2,.7,.2,1) both", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.divider}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.dim, letterSpacing: 1.6, textTransform: "uppercase", marginBottom: 8 }}>{dzFullDate(now)}</div>
            <h2 style={{ margin: 0, fontFamily: FONT, fontWeight: 300, fontSize: 24, color: C.silver, letterSpacing: -0.6 }}>{dzGreeting(now.getHours())}, {name}.</h2>
            <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.muted, marginTop: 4 }}>Operação, receita e conversas em um único plano de controle.</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.muted, display: "flex", flexShrink: 0 }}>{Icon.x(18)}</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "18px 24px 26px" }}>
        <DzPeriodSelector desempenho={desempenho} setDesempenho={setDesempenho} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 2px 18px" }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: C.ember }} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>Período ativo: {data.label}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {hero.map(c => <DzCard key={c.key} card={c} big onClick={() => onOpenMetric(c.key)} />)}
        </div>
        {revenueCard && (
          <div style={{ marginTop: 14, padding: "14px 15px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" }}>Receita no período</span>
              <span style={{ fontFamily: FONT, fontSize: 14, color: C.silver }}>{revenueCard.value}</span>
            </div>
            <DzSparkline series={revenueCard.series} color={C.ember} height={48} />
          </div>
        )}
        <PanelDivider />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {metrics.map(c => <DzCard key={c.key} card={c} onClick={() => onOpenMetric(c.key)} />)}
        </div>
        <Banner tone="ember" icon={Icon.bolt(13)}>Cada métrica também é um nó vivo no graph, ligado ao seu Perfil. Mude o período e a constelação inteira responde.</Banner>
      </div>
    </div>
  );
}

function MetricDetailPanel({ node, data, onClose }) {
  const { C } = useTheme();
  const key = node.meta?.metricKey;
  const card = data.cards.find(c => c.key === key) || { name: node.label, value: node.meta?.subtitle, sub: "", series: [], deltaDir: null };
  const arrow = card.deltaDir === "up" ? "▲" : card.deltaDir === "down" ? "▼" : null;
  const arrowColor = card.deltaDir === "up" ? C.green : C.red;
  const SRC_LABEL = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", organic: "Orgânico", direto: "Direto", google: "Google" };
  const REVENUE_METRICS = ["total", "month", "today", "revenue", "sales", "conversion", "ticket"];
  const paid = ORDERS_SEED.filter(o => o.status === "PAID");
  const bySource = {};
  for (const o of paid) { const s = o.utmSource || "direto"; bySource[s] = (bySource[s] || 0) + o.totalInCents; }
  const sources = Object.entries(bySource).sort((a, b) => b[1] - a[1]);
  const totalSrc = sources.reduce((s, [, v]) => s + v, 0) || 1;
  const maxSrc = Math.max(1, ...sources.map(s => s[1]));
  const byMethod = {};
  for (const o of paid) byMethod[o.paymentMethod] = (byMethod[o.paymentMethod] || 0) + o.totalInCents;
  const methods = Object.entries(byMethod).sort((a, b) => b[1] - a[1]);
  const showBreakdown = REVENUE_METRICS.includes(key);
  return (
    <div style={{ position: "fixed", inset: 0, margin: "auto", width: "80vw", height: "80vh", maxWidth: 1320, maxHeight: 900, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 16px 50px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", zIndex: 40, animation: "panelSlide .3s cubic-bezier(.2,.7,.2,1) both", overflow: "hidden" }}>
      <div style={{ padding: "18px 22px 16px", borderBottom: `1px solid ${C.divider}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.dim, letterSpacing: 1.6, textTransform: "uppercase" }}>relatório · {data.label}</div>
          <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 500, color: C.silver, marginTop: 3 }}>{card.name}</div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.muted, display: "flex", flexShrink: 0 }}>{Icon.x(16)}</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "22px 22px 24px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: FONT, fontSize: 34, fontWeight: 300, color: C.silver, letterSpacing: -1 }}>{card.value}</span>
          {arrow && <span style={{ fontSize: 13, color: arrowColor }}>{arrow}</span>}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted, marginTop: 6 }}>{card.sub}</div>
        {card.series && card.series.length > 0 && (
          <div style={{ marginTop: 18, padding: "14px 15px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>evolução no período</div>
            <DzSparkline series={card.series} color={arrow === "▼" ? C.red : C.ember} height={56} />
          </div>
        )}
        {showBreakdown && sources.length > 0 && (
          <div style={{ marginTop: 14, padding: "14px 15px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 }}>origem das vendas</div>
            {sources.map(([src, v]) => (
              <div key={src} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontFamily: FONT, fontSize: 12, color: C.text }}>{SRC_LABEL[src] || src}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{brlFromCents(v)} · {Math.round(v / totalSrc * 100)}%</span>
                </div>
                <div style={{ height: 6, background: C.raised, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(v / maxSrc * 100)}%`, height: "100%", background: C.ember, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {showBreakdown && methods.length > 0 && (
          <div style={{ marginTop: 14, padding: "14px 15px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.dim, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 }}>meios de pagamento</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {methods.map(([m, v]) => (
                <div key={m} style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT, fontSize: 12, color: C.text }}>
                  <span>{PAYMENT_LABEL[m] || m}</span>
                  <span style={{ fontFamily: MONO, color: C.muted }}>{brlFromCents(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <Banner tone="info" icon={Icon.bolt(13)}>Ajuste o período no nó Dashboard — este valor recalcula automaticamente.</Banner>
      </div>
    </div>
  );
}

function PhotoUpload({ label, value, onChange, hint = "JPG, PNG ou WebP — máx 10MB" }) {
  const { C } = useTheme();
  const inputRef = useRef(null);
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange?.(String(reader.result));
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  return (
    <div style={{ width: "100%" }}>
      {label && <label style={{ display: "block", marginBottom: 6, fontFamily: MONO, fontSize: 9.5, color: C.muted, fontWeight: 500, letterSpacing: 1.4, textTransform: "uppercase" }}>{label}</label>}
      <button type="button" onClick={() => inputRef.current?.click()} style={{ width: "100%", padding: value ? 8 : "22px 14px", borderRadius: 6, background: "transparent", border: `1px dashed ${C.border}`, color: C.muted, fontSize: 12.5, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all .15s ease" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.ember; e.currentTarget.style.color = C.text; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}>
        {value
          ? <img src={value} alt="" style={{ maxHeight: 120, maxWidth: "100%", borderRadius: 4, objectFit: "contain" }} />
          : <span style={{ display: "flex", alignItems: "center", gap: 10 }}>{Icon.upload(14)} Arraste ou clique para enviar</span>}
      </button>
      {value
        ? <button type="button" onClick={() => onChange?.("")} style={{ marginTop: 6, background: "transparent", border: "none", color: C.dim, fontFamily: FONT, fontSize: 11, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>remover imagem</button>
        : <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 9, color: C.dim, textAlign: "center" }}>{hint}</div>}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" onChange={onFile} style={{ display: "none" }} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   KLOEL · overlay central (80%) + telas: Novo Chat · Buscar · Imagens · Recentes
   O grafo permanece vivo no fundo; o overlay flutua e fecha sem navegar.
   ════════════════════════════════════════════════════════════════════════ */
const nowISO = () => new Date().toISOString();
function kloelDayBucket(iso) {
  const sod = (x) => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y.getTime(); };
  const diff = (sod(new Date()) - sod(new Date(iso))) / 86400000;
  return diff <= 0 ? "Hoje" : diff === 1 ? "Ontem" : "Antes";
}
function kloelSystemPrompt({ products, conversar, desempenho, contextRefs }) {
  const L = [];
  L.push("Você é o Kloel, a IA central de operação de uma plataforma de marketing e vendas (Kloel). Responda em português do Brasil, direto, prático e acionável. Use o resumo do estado real da operação abaixo para responder sobre vendas, produtos, checkouts, campanhas, leads e finanças, e para ajudar a criar campanhas, mensagens e configurações.");
  if (desempenho) L.push(`DESEMPENHO (${desempenho.label}): receita ${brlFromCents(desempenho.active.revenueInCents)}, ${desempenho.active.paidOrders} vendas, conversão ${desempenho.active.conversionRatePct.toFixed(1)}%, ticket médio ${brlFromCents(desempenho.active.averageTicketInCents)}. Saldo disponível ${brlFromCents(desempenho.available)}, a receber ${brlFromCents(desempenho.pending)}.`);
  if (products?.length) L.push("PRODUTOS: " + products.map(p => `${p.label} (${p.editor?.dados?.status || "?"}, ${p.editor?.plans?.length || 0} planos, ${p.editor?.checkouts?.length || 0} checkouts)`).join("; ") + ".");
  if (conversar?.contacts?.length) L.push(`CRM: ${conversar.contacts.length} contatos, ${(conversar.conversations || []).length} conversas.`);
  if (conversar?.adCampaigns?.length) L.push("CAMPANHAS: " + conversar.adCampaigns.map(a => `${a.campaignName} ROAS ${a.roas}`).join("; ") + ".");
  if (contextRefs?.length) L.push("CONTEXTO EM FOCO: " + contextRefs.map(r => `${r.type}: ${r.label}`).join("; ") + ".");
  L.push("Se não tiver um dado específico, seja honesto e indique onde encontrá-lo no sistema.");
  return L.join("\n");
}

function KloelMushroom({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <g transform="translate(100 100)">
        <path d="M-60 0Q-65-50-30-70Q0-85 30-70Q65-50 60 0Z" fill="#E85D30" />
        <rect x="-12" y="0" width="24" height="50" rx="3" fill="#E85D30" />
        <line x1="-30" y1="-30" x2="-10" y2="-50" stroke="#FFFFFF" strokeWidth="1.2" />
        <line x1="-10" y1="-50" x2="15" y2="-50" stroke="#FFFFFF" strokeWidth="1.2" />
        <line x1="15" y1="-50" x2="30" y2="-35" stroke="#FFFFFF" strokeWidth="1.2" />
        <line x1="0" y1="-25" x2="0" y2="-60" stroke="#FFFFFF" strokeWidth="1.2" />
        <circle cx="-30" cy="-30" r="2.5" fill="#FFFFFF" />
        <circle cx="-10" cy="-50" r="2.5" fill="#FFFFFF" />
        <circle cx="15" cy="-50" r="2.5" fill="#FFFFFF" />
        <circle cx="30" cy="-35" r="2.5" fill="#FFFFFF" />
        <circle cx="0" cy="-60" r="2.5" fill="#FFFFFF" />
        <line x1="0" y1="5" x2="0" y2="45" stroke="#FFFFFF" strokeWidth="1" opacity="0.6" />
        <circle cx="0" cy="25" r="2" fill="#FFFFFF" opacity="0.8" />
      </g>
    </svg>
  );
}

/* ── AFILIAR · réplica visual canônica (AfiliarSe + Marketplace + Meus afiliados) ── */
function AfiliarScreen({ affiliate, onOpenNode }) {
  const { C } = useTheme();
  const [tab, setTab] = useState("market");
  const [search, setSearch] = useState("");
  const market = affiliate.marketplace || [];
  const mine = market.filter(m => m.requestStatus === "approved");
  const partners = affiliate.myAffiliates || [];
  const earnings = partners.filter(a => a.status === "active").reduce((s, a) => s + Math.round((a.revenue || 0) * (a.commission || 0) / 100), 0);
  const filteredMarket = market.filter(m => m.name.toLowerCase().includes(search.trim().toLowerCase()));
  const pill = (active) => ({ padding: "8px 16px", borderRadius: 99, border: `1px solid ${active ? C.green : C.border}`, background: active ? "rgba(34,197,94,0.10)" : "transparent", color: active ? C.green : C.muted, fontFamily: FONT, fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap" });
  const TABS = [["market", "Marketplace"], ["mine", "Minhas afiliações"], ["partners", "Meus afiliados"]];
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "26px 24px 32px", fontFamily: FONT }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 4, padding: 4, background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 10, marginBottom: 18, width: "fit-content" }}>
          {/* lixo legado removido: cross-nav "Meus Produtos | Afiliar-se" (sidebar legada). Afiliar é galáxia própria no graph. */}
        </div>
        <div style={{ position: "relative", padding: "32px 0", textAlign: "center", marginBottom: 8 }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 460, height: 170, borderRadius: "16%", pointerEvents: "none", background: "rgba(34,197,94,0.07)" }} />
          <div style={{ position: "relative" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim, letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 8 }}>GANHOS COMO AFILIADO</div>
            <div style={{ fontFamily: MONO, fontSize: "clamp(44px, 6vw, 80px)", fontWeight: 700, color: C.green, letterSpacing: "-0.02em", lineHeight: 1, textShadow: "0 0 24px rgba(34,197,94,0.25)" }}>{brlFromCents(earnings)}</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.green, marginTop: 12 }}>{earnings > 0 ? `+${brlFromCents(earnings)} acumulado` : "Sem ganhos ainda"}</div>
          </div>
        </div>
        <div className="hide-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 18 }}>
          {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={pill(tab === k)}>{l}</button>)}
        </div>
        {tab === "market" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, height: 42, padding: "0 14px", background: C.paper, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 16 }}>
              <span style={{ color: C.dim, display: "flex" }}>{Icon.search(15)}</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto para afiliar..." style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontFamily: FONT, fontSize: 13, color: C.text }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))", gap: 12 }}>
              {filteredMarket.map(m => (
                <button key={m.id} onClick={() => onOpenNode(`mk-${m.id}`)} style={{ textAlign: "left", padding: 14, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 10, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, transition: "border-color .15s ease" }} onMouseEnter={e => e.currentTarget.style.borderColor = C.green} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                  <div style={{ height: 96, borderRadius: 8, background: C.raised, border: `1px solid ${C.divider}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.dim }}>{Icon.box(26)}</div>
                  <div>
                    <div style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: C.silver, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                    <div style={{ fontFamily: FONT, fontSize: 11, color: C.muted, marginTop: 2 }}>{m.producer} · {m.category}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.green }}>{m.commission}% comissão</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 11, color: C.muted }}>{Icon.star(11)} {m.rating}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === "mine" && (
          mine.length === 0
            ? <EmptyState>Você ainda não tem afiliações aprovadas. Solicite no Marketplace para gerar um link rastreável.</EmptyState>
            : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{mine.map(m => (
              <button key={m.id} onClick={() => onOpenNode(`mk-${m.id}`)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: C.paper, border: `1px solid ${C.border}`, borderRadius: 10, cursor: "pointer", textAlign: "left" }}>
                <span style={{ flex: 1, fontFamily: FONT, fontSize: 13, color: C.silver }}>{m.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.green }}>{m.commission}%</span>
              </button>
            ))}</div>
        )}
        {tab === "partners" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {partners.map(a => {
              const stColor = a.status === "active" ? C.green : a.status === "pending" ? C.amber : C.dim;
              return (
                <button key={a.id} onClick={() => onOpenNode(`aff-${a.id}`)} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "13px 15px", background: C.paper, border: `1px solid ${C.border}`, borderRadius: 10, cursor: "pointer", textAlign: "left" }} onMouseEnter={e => e.currentTarget.style.borderColor = C.green} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: C.silver }}>{a.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 9, color: stColor, textTransform: "uppercase", letterSpacing: 0.5 }}>{a.status === "active" ? "ativo" : a.status === "pending" ? "pendente" : a.status}</span>
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 11, color: C.dim, marginTop: 2 }}>{a.type === "producer" ? "Produtor parceiro" : "Afiliado"} · {a.totalSales} vendas · {a.commission}%</div>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.green }}>{brlFromCents(a.revenue)}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── CONVERSAR · hub canônico (canais + CRM) ── */
function ConversarScreen({ channels, onOpenNode }) {
  const { C } = useTheme();
  const chKeys = Object.keys(CHANNEL_META);
  const connectedCount = chKeys.filter(k => channels[k]?.connected).length;
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "28px 26px 32px", fontFamily: FONT }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <h2 style={{ margin: "0 0 4px", fontFamily: FONT, fontWeight: 300, fontSize: 24, letterSpacing: -0.6, color: C.silver }}>Conversar</h2>
        <p style={{ margin: "0 0 22px", fontFamily: FONT, fontSize: 12.5, color: C.muted }}>Conecte seus canais e centralize tudo no CRM. {connectedCount}/{chKeys.length} canais conectados.</p>
        <button onClick={() => onOpenNode("cv-crm")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: C.paper, border: `1px solid ${C.border}`, borderRadius: 12, cursor: "pointer", textAlign: "left", marginBottom: 18 }} onMouseEnter={e => e.currentTarget.style.borderColor = C.ember} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: C.emberSoft, color: C.ember, display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.users(20)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: C.silver }}>CRM</div>
            <div style={{ fontFamily: FONT, fontSize: 11.5, color: C.muted, marginTop: 2 }}>Pipeline, contatos, vendas, anúncios e Autopilot — ative os módulos aqui.</div>
          </div>
          <span style={{ color: C.dim, display: "flex" }}>{Icon.chevron(16, "right")}</span>
        </button>
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Canais</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {chKeys.map(k => {
            const meta = CHANNEL_META[k];
            const conn = channels[k]?.connected;
            return (
              <button key={k} onClick={() => onOpenNode(`ch-${k}`)} style={{ textAlign: "left", padding: 16, background: C.paper, border: `1px solid ${conn ? C.green : C.border}`, borderRadius: 12, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }} onMouseEnter={e => e.currentTarget.style.borderColor = conn ? C.green : C.ember} onMouseLeave={e => e.currentTarget.style.borderColor = conn ? C.green : C.border}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: C.silver }}>{meta.name}</span>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: conn ? C.green : C.dim }} />
                </div>
                <div style={{ fontFamily: FONT, fontSize: 11, color: C.muted }}>{meta.provider}</div>
                <span style={{ marginTop: 2, alignSelf: "flex-start", padding: "5px 12px", borderRadius: 8, background: conn ? "rgba(34,197,94,0.10)" : C.ember, border: conn ? `1px solid ${C.green}` : "none", color: conn ? C.green : "#fff", fontFamily: FONT, fontSize: 12, fontWeight: 600 }}>{conn ? "Gerenciar" : meta.step1Verb}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── EDUCAR · réplica visual canônica (Área de membros: Aprender / Ensinar) ── */
function EducarScreen({ educar, onOpenNode, onNewArea }) {
  const { C } = useTheme();
  const [tab, setTab] = useState("ensinar");
  const areas = educar.areas || [];
  const totalStudents = areas.reduce((s, a) => s + areaStats(a).totalStudents, 0);
  const activeAreas = areas.filter(a => a.active).length;
  const withStudents = areas.filter(a => areaStats(a).totalStudents > 0);
  const avgCompletion = withStudents.length ? Math.round(withStudents.reduce((s, a) => s + areaStats(a).avgCompletion, 0) / withStudents.length) : 0;
  const pill = (active) => ({ padding: "8px 16px", borderRadius: 99, border: `1px solid ${active ? C.ember : C.border}`, background: active ? C.emberSoft : "transparent", color: active ? C.ember : C.muted, fontFamily: FONT, fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap" });
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "26px 24px 32px", fontFamily: FONT }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div className="hide-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 18 }}>
          {[["ensinar", "Ensinar"], ["aprender", "Aprender"]].map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={pill(tab === k)}>{l}</button>)}
        </div>
        {tab === "ensinar" && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
              <ConsultaStat label="alunos" value={totalStudents} color={C.ember} />
              <ConsultaStat label="áreas ativas" value={`${activeAreas}/${areas.length}`} />
              <ConsultaStat label="conclusão média" value={`${avgCompletion}%`} color={C.green} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.dim, letterSpacing: 1, textTransform: "uppercase" }}>Áreas de membros</span>
              {onNewArea && <button onClick={onNewArea} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: C.ember, border: "none", borderRadius: 8, color: "#fff", fontFamily: FONT, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{Icon.plus(14)} Nova área</button>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {areas.map(a => {
                const st = areaStats(a);
                return (
                  <button key={a.id} onClick={() => onOpenNode(`ma-${a.id}`)} style={{ textAlign: "left", padding: 0, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 12, cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column", transition: "border-color .15s ease" }} onMouseEnter={e => e.currentTarget.style.borderColor = C.ember} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                    <div style={{ height: 84, background: `linear-gradient(135deg, ${(a.primaryColor || "#E85D30")}22, ${C.raised})`, borderBottom: `1px solid ${C.divider}`, display: "flex", alignItems: "center", justifyContent: "center", color: a.primaryColor || C.ember }}>{Icon.layers(26)}</div>
                    <div style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: C.silver, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                        <span style={{ width: 6, height: 6, borderRadius: 99, background: a.active ? C.green : C.dim, flexShrink: 0 }} />
                      </div>
                      <div style={{ display: "flex", gap: 12, fontFamily: FONT, fontSize: 11, color: C.muted }}>
                        <span>{st.totalStudents} alunos</span>
                        <span>{st.totalLessons} aulas</span>
                        {a.avgRating > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>{Icon.star(10)} {a.avgRating}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {tab === "aprender" && (
          <EmptyState>Você ainda não comprou cursos. Os cursos que você adquirir aparecem aqui para assistir.</EmptyState>
        )}
      </div>
    </div>
  );
}

function KloelOverlay({ title, subtitle, onClose, children, footer, hideHeader }) {
  const { C } = useTheme();
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.12)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "80vw", height: "80vh", maxWidth: 1320, maxHeight: 900, background: C.paper, border: `1px solid ${C.divider}`, borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.16)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "panelSlide .25s cubic-bezier(.2,.7,.2,1) both" }}>
        {hideHeader ? (
          <button onClick={onClose} aria-label="Fechar" style={{ position: "absolute", top: 14, right: 16, zIndex: 2, background: "transparent", border: "none", cursor: "pointer", padding: 6, color: C.muted, display: "flex" }}>{Icon.x(18)}</button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 22px", borderBottom: `1px solid ${C.divider}` }}>
            <KloelMushroom size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 500, color: C.silver }}>{title}</div>
              {subtitle && <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.dim, letterSpacing: 1, textTransform: "uppercase" }}>{subtitle}</div>}
            </div>
            <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6, color: C.muted, display: "flex" }}>{Icon.x(18)}</button>
          </div>
        )}
        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", minHeight: 0 }}>{children}</div>
        {footer}
      </div>
    </div>
  );
}

function KloelChatScreen({ kloel, setKloel, conversationId, context, onClose }) {
  const { C } = useTheme();
  const [localId, setLocalId] = useState(conversationId || null);
  const conv = (kloel.conversations || []).find(c => c.id === localId) || null;
  const messages = conv?.messages || [];
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages.length, loading]);

  const send = async () => {
    const text = input.trim(); if (!text || loading) return;
    let id = localId;
    const prev = messages;
    if (!id) {
      id = `kc-${Date.now()}`;
      const newConv = { id, title: text.slice(0, 42), createdAt: nowISO(), updatedAt: nowISO(), messages: [], contextRefs: context?.contextRefs || [], imageRefs: [] };
      setKloel(k => ({ ...k, conversations: [newConv, ...(k.conversations || [])] }));
      setLocalId(id);
    }
    const userMsg = { id: `m-${Date.now()}`, role: "user", content: text, createdAt: nowISO() };
    setKloel(k => ({ ...k, conversations: k.conversations.map(c => c.id === id ? { ...c, messages: [...c.messages, userMsg], updatedAt: nowISO() } : c) }));
    setInput(""); setLoading(true);
    try {
      // Kloel real engine — DeepSeek v4 pro via backend /kloel/think/sync. No 3rd-party LLM call from the browser.
      void prev;
      const res = await sendAuthenticatedKloelMessage({ message: text, mode: "chat", companyContext: kloelSystemPrompt(context || {}) });
      const reply = String(res?.response ?? res?.reply ?? res?.content ?? res?.message ?? "").trim() || "(sem resposta)";
      const aiMsg = { id: `m-${Date.now() + 1}`, role: "assistant", content: reply, createdAt: nowISO() };
      setKloel(k => ({ ...k, conversations: k.conversations.map(c => c.id === id ? { ...c, messages: [...c.messages, aiMsg], updatedAt: nowISO() } : c) }));
    } catch (e) {
      const errMsg = { id: `m-${Date.now() + 2}`, role: "assistant", content: "Não consegui falar com o modelo neste ambiente agora. Sua conversa foi salva e aparece em Recentes — tente novamente em instantes.", createdAt: nowISO() };
      setKloel(k => ({ ...k, conversations: k.conversations.map(c => c.id === id ? { ...c, messages: [...c.messages, errMsg] } : c) }));
    } finally { setLoading(false); }
  };

  const hasMessages = messages.length > 0;
  const greeting = (() => { const h = new Date().getHours(); if (h >= 5 && h < 12) return "Bom dia"; if (h >= 12 && h < 18) return "Boa tarde"; if (h >= 18) return "Boa noite"; return "Boa madrugada"; })();
  const greetingLine = context?.userName ? `${greeting}, ${context.userName}` : greeting;
  const renderComposer = () => (
    <div style={{ width: "100%", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ background: C.paper, border: `1px solid ${C.divider}`, borderRadius: 16, padding: "14px 14px 12px", boxShadow: "0 16px 50px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)" }}>
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Pergunte alguma coisa" rows={1}
          style={{ width: "100%", minHeight: 24, maxHeight: 160, resize: "none", background: "transparent", border: "none", outline: "none", fontFamily: FONT, fontSize: 14.5, lineHeight: 1.5, color: C.text }} />
        <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
          <button type="button" title="Anexar" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, border: "none", background: "transparent", color: C.muted, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = C.raised} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{Icon.plus(18)}</button>
          <span style={{ flex: 1 }} />
          <button onClick={send} disabled={!input.trim() || loading} aria-label="Enviar" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 10, border: "none", background: input.trim() && !loading ? C.ember : C.faint, color: "#fff", cursor: input.trim() && !loading ? "pointer" : "default" }}>{Icon.arrow(16)}</button>
        </div>
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {hasMessages ? (
        <>
          <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: "24px 26px" }}>
            <div style={{ width: "100%", maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
              {messages.map(m => {
                const me = m.role === "user";
                return (
                  <div key={m.id} style={{ alignSelf: me ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                    <div style={{ padding: me ? "10px 14px" : "2px 0", borderRadius: 16, background: me ? C.raised : "transparent", border: me ? `1px solid ${C.divider}` : "none", color: C.text, fontFamily: FONT, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.content}</div>
                  </div>
                );
              })}
              {loading && <div style={{ alignSelf: "flex-start", fontFamily: FONT, fontSize: 13.5, color: C.muted }}>Kloel está pensando…</div>}
            </div>
          </div>
          <div style={{ padding: "10px 26px 18px" }}>{renderComposer()}</div>
        </>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 26px", gap: 22 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
            <KloelMushroom size={54} />
            <h1 style={{ margin: 0, fontFamily: FONT, fontWeight: 700, fontSize: 38, letterSpacing: "-0.03em", color: C.silver, lineHeight: 1.02 }}>{greetingLine}</h1>
          </div>
          {renderComposer()}
          <div style={{ fontFamily: FONT, fontSize: 11, color: C.dim, textAlign: "center" }}>Kloel é uma IA e pode errar. Confira informações importantes.</div>
        </div>
      )}
    </div>
  );
}

function buildKloelSearchIndex({ products, conversar, affiliate, educar, wallet, kloel }) {
  const idx = [];
  const push = (label, kind, nodeId) => label && idx.push({ label: String(label), kind, nodeId });
  for (const p of (products || [])) {
    push(p.label, "Produto", p.id);
    for (const pl of (p.editor?.plans || [])) push(`${pl.name || "Plano"} · ${p.label}`, "Plano", `${p.id}-planos`);
    for (const ck of (p.editor?.checkouts || [])) push(`${ck.name || "Checkout"} · ${p.label}`, "Checkout", `${p.id}-planos`);
    for (const cp of (p.editor?.coupons || [])) push(`${cp.code} · ${p.label}`, "Cupom", `${p.id}-cupons`);
    for (const u of (p.editor?.urls || [])) push(`${u.description || u.url} · ${p.label}`, "URL", `${p.id}-urls`);
  }
  const mods = conversar?.crmModules || {};
  if (mods.inbox) for (const c of (conversar?.conversations || [])) push(c.contactName, "Conversa", `cv-conv-${c.id}`);
  if (mods.contatos) for (const ct of (conversar?.contacts || [])) push(ct.name, "Contato", `cv-ct-${ct.id}`);
  if (mods.vendas) for (const o of (conversar?.orders || [])) push(`${o.orderNumber} · ${o.customerName}`, "Venda", `cv-or-${o.id}`);
  if (mods.anuncios) for (const ad of (conversar?.adCampaigns || [])) push(ad.campaignName, "Campanha", `cv-ad-${ad.id}`);
  for (const m of (affiliate?.marketplace || [])) push(m.name, "Marketplace", `mk-${m.id}`);
  for (const a of (affiliate?.myAffiliates || [])) push(a.name, "Afiliado", `aff-${a.id}`);
  for (const ar of (educar?.areas || [])) push(ar.name, "Área de membros", `ma-${ar.id}`);
  for (const w of (wallet?.withdrawals || [])) push(`Saque ${brlFromCents(w.amount)}`, "Carteira", `wl-wd-${w.id}`);
  for (const img of (kloel?.images || [])) push(img.name, "Imagem", `kli-${img.id}`);
  for (const c of (kloel?.conversations || [])) push(c.title, "Chat Kloel", `klc-${c.id}`);
  return idx;
}

function KloelSearchScreen({ data, onOpenNode, onClose }) {
  const { C } = useTheme();
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); const onKey = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  const index = useMemo(() => buildKloelSearchIndex(data), [data]);
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const terms = query.split(/\s+/);
    return index.filter(r => terms.every(t => r.label.toLowerCase().includes(t) || r.kind.toLowerCase().includes(t))).slice(0, 80);
  }, [q, index]);
  const groups = useMemo(() => {
    const g = {};
    for (const r of results) (g[r.kind] = g[r.kind] || []).push(r);
    return Object.entries(g).map(([label, items]) => ({ label, items }));
  }, [results]);
  const pill = { minWidth: 26, height: 26, padding: "0 9px", border: `1px solid ${C.border}`, borderRadius: 7, background: C.void, color: C.muted, fontFamily: MONO, fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 56, display: "flex", alignItems: "flex-start", justifyContent: "center", background: "rgba(0,0,0,0.18)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", padding: "72px 16px 24px" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(680px, 100%)", maxHeight: "calc(100vh - 120px)", background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,0.28)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "panelSlide .2s cubic-bezier(.2,.7,.2,1) both" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 18px", borderBottom: `1px solid ${C.divider}` }}>
          <span style={{ color: C.muted, display: "flex" }}>{Icon.search(18)}</span>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar em tudo: produtos, conversas, vendas, campanhas…" spellCheck={false} autoComplete="off"
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontFamily: FONT, fontSize: 14.5, color: C.text, caretColor: C.ember }} />
          {q && <button onClick={() => setQ("")} style={pill} aria-label="Limpar">{Icon.x(12)}</button>}
          <button onClick={onClose} style={pill}>ESC</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "8px 8px 10px" }}>
          {!q.trim() ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "48px 24px", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: C.emberSoft, color: C.ember, display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.search(18)}</div>
              <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 500, color: C.silver }}>Busque em toda a sua operação</div>
              <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.muted, maxWidth: 380, lineHeight: 1.5 }}>Produtos, planos, checkouts, conversas, contatos, vendas, campanhas, afiliados, cupons, URLs, carteira, imagens e chats.</div>
            </div>
          ) : groups.length === 0 ? (
            <div style={{ padding: "40px 24px", textAlign: "center", fontFamily: FONT, fontSize: 13, color: C.muted }}>Nada encontrado para "{q}"</div>
          ) : groups.map(group => (
            <div key={group.label}>
              <div style={{ padding: "10px 10px 6px", fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>{group.label}</div>
              {group.items.map((r, i) => (
                <button key={i} onClick={() => onOpenNode(r.nodeId)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: 12, border: "none", background: "transparent", borderRadius: 10, cursor: "pointer", textAlign: "left" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.raised} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: C.emberSoft, color: C.ember, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{Icon.chevron(14, "right")}</span>
                  <span style={{ flex: 1, fontFamily: FONT, fontSize: 13.5, color: C.silver, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 16px", borderTop: `1px solid ${C.divider}` }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 10, color: C.dim }}><span style={pill}>↑↓</span> navegar</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 10, color: C.dim }}><span style={pill}>↵</span> abrir</span>
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: C.dim }}>{results.length} resultado{results.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}

function KloelImagesScreen({ kloel, setKloel, linkTargets = [], onOpenNode }) {
  const { C } = useTheme();
  const inputRef = useRef(null);
  const images = kloel.images || [];
  const onFiles = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => setKloel(k => ({ ...k, images: [{ id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: file.name, url: String(reader.result), mimeType: file.type, createdAt: nowISO(), source: "upload", linkedNodeIds: [] }, ...(k.images || [])] }));
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };
  const del = (id) => setKloel(k => ({ ...k, images: (k.images || []).filter(im => im.id !== id) }));
  const link = (id, nodeId) => setKloel(k => ({ ...k, images: k.images.map(im => im.id === id ? { ...im, linkedNodeIds: nodeId ? [nodeId] : [] } : im) }));
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "18px 26px", borderBottom: `1px solid ${C.divider}`, display: "flex", alignItems: "center", gap: 12 }}>
        <PanelDescription>Imagens enviadas viram memória visual navegável — cada uma é um nó em Imagens e pode ser vinculada a um produto.</PanelDescription>
        <div style={{ marginLeft: "auto" }}><CTA variant="ember" onClick={() => inputRef.current?.click()}>{Icon.upload(13)} enviar</CTA></div>
        <input ref={inputRef} type="file" accept="image/*" multiple onChange={onFiles} style={{ display: "none" }} />
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "18px 26px" }}>
        {images.length === 0 ? <EmptyState>Nenhuma imagem ainda — clique em enviar.</EmptyState>
          : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
            {images.map(im => (
              <div key={im.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", background: C.raised }}>
                <div style={{ height: 130, background: `center / cover no-repeat url(${im.url})`, cursor: "pointer" }} onClick={() => onOpenNode(`kli-${im.id}`)} />
                <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ flex: 1, fontFamily: MONO, fontSize: 9.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{im.name}</span>
                    <button onClick={() => del(im.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, display: "flex", padding: 2 }} onMouseEnter={e => e.currentTarget.style.color = C.red} onMouseLeave={e => e.currentTarget.style.color = C.dim}>{Icon.trash(12)}</button>
                  </div>
                  <select value={(im.linkedNodeIds || [])[0] || ""} onChange={e => link(im.id, e.target.value)} style={{ width: "100%", height: 28, padding: "0 6px", border: `1px solid ${C.border}`, borderRadius: 5, background: C.paper, color: C.text, fontFamily: MONO, fontSize: 9.5, outline: "none" }}>
                    <option value="">vincular a…</option>
                    {[...new Set(linkTargets.map(t => t.group))].map(g => (
                      <optgroup key={g} label={g}>
                        {linkTargets.filter(t => t.group === g).map((t, i) => <option key={t.id + i} value={t.id}>{t.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>}
      </div>
    </div>
  );
}

function KloelRecentsScreen({ kloel, onOpenChat, onOpenNode }) {
  const { C } = useTheme();
  const items = useMemo(() => {
    const arr = [];
    for (const c of (kloel.conversations || [])) arr.push({ ts: c.updatedAt || c.createdAt, kind: "Chat", label: c.title || "Conversa", onClick: () => onOpenChat(c.id) });
    for (const im of (kloel.images || [])) arr.push({ ts: im.createdAt, kind: "Imagem", label: im.name, onClick: () => onOpenNode(`kli-${im.id}`) });
    return arr.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  }, [kloel]);
  const groups = useMemo(() => { const g = {}; for (const it of items) { const b = kloelDayBucket(it.ts); (g[b] = g[b] || []).push(it); } return g; }, [items]);
  const order = ["Hoje", "Ontem", "Antes"];
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "26px 26px 26px" }}>
      <div style={{ width: "100%", maxWidth: 640, margin: "0 auto" }}>
        <h2 style={{ margin: "0 0 4px", fontFamily: FONT, fontWeight: 300, fontSize: 24, letterSpacing: -0.6, color: C.silver }}>Recentes</h2>
        <p style={{ margin: "0 0 18px", fontFamily: FONT, fontSize: 12.5, color: C.muted }}>Seu histórico vivo com o Kloel — continue de onde parou.</p>
        {items.length === 0 ? <EmptyState>Nada recente ainda. Inicie um chat ou envie uma imagem.</EmptyState>
          : order.filter(b => groups[b]).map(b => (
            <div key={b} style={{ marginBottom: 18 }}>
              <Tag color={C.muted} weight={600}>{b}</Tag>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {groups[b].map((it, i) => (
                  <button key={i} onClick={it.onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", background: "transparent", border: "none", borderRadius: 10, cursor: "pointer", textAlign: "left" }} onMouseEnter={e => e.currentTarget.style.background = C.raised} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, background: C.emberSoft, color: C.ember, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{it.kind === "Imagem" ? Icon.box(14) : Icon.bolt(14)}</span>
                    <span style={{ flex: 1, fontFamily: FONT, fontSize: 13.5, color: C.silver, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8 }}>{it.kind}</span>
                    <span style={{ color: C.dim, display: "flex" }}>{Icon.chevron(13, "right")}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function KloelOverlayRouter({ node, kloel, setKloel, context, searchData, products, linkTargets, onAskContext, onClose, onOpenNode }) {
  const action = node.type === "kloelConversation" ? "newChat" : node.type === "kloelImageAsset" ? "images" : node.meta?.action;
  const convId = node.type === "kloelConversation" ? node.meta?.conversationId : null;
  const openChat = (cid) => onOpenNode(`klc-${cid}`);
  if (action === "newChat") return <KloelOverlay hideHeader onClose={onClose}><KloelChatScreen kloel={kloel} setKloel={setKloel} conversationId={convId} context={context} onClose={onClose} /></KloelOverlay>;
  if (action === "search") return <KloelSearchScreen data={searchData} onOpenNode={onOpenNode} onClose={onClose} />;
  if (action === "images") return <KloelOverlay title="Imagens" subtitle="memória visual" onClose={onClose}><KloelImagesScreen kloel={kloel} setKloel={setKloel} linkTargets={linkTargets} onOpenNode={onOpenNode} /></KloelOverlay>;
  if (action === "recents") return <KloelOverlay hideHeader onClose={onClose}><KloelRecentsScreen kloel={kloel} onOpenChat={openChat} onOpenNode={onOpenNode} /></KloelOverlay>;
  return null;
}

function KloelMassPanel({ kloel, onClose, onSelectNode }) {
  const { C } = useTheme();
  const convs = [...(kloel.conversations || [])].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).slice(0, 4);
  const btn = (id, label, icon) => (
    <button onClick={() => onSelectNode(id)} style={{ flex: "1 0 auto", display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", borderRadius: 8, background: id === "kl-new-chat" ? C.ember : "transparent", color: id === "kl-new-chat" ? "#fff" : C.text, border: id === "kl-new-chat" ? "none" : `1px solid ${C.border}`, cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 500 }}>{icon}{label}</button>
  );
  return (
    <div style={{ position: "fixed", inset: 0, margin: "auto", width: "80vw", height: "80vh", maxWidth: 1320, maxHeight: 900, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 16px 50px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", zIndex: 40, animation: "panelSlide .3s cubic-bezier(.2,.7,.2,1) both", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.divider}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Tag color={C.muted} weight={600}>IA central</Tag>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.muted, display: "flex" }}>{Icon.x(16)}</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "20px 22px 24px" }}>
        <h2 style={{ margin: "0 0 6px", fontFamily: FONT, fontWeight: 300, fontSize: 24, letterSpacing: -0.6, color: C.silver }}>Kloel</h2>
        <p style={{ margin: "0 0 18px", fontFamily: FONT, fontWeight: 300, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>A inteligência operacional da sua conta. Converse, busque em tudo, envie imagens e retome de onde parou — sem sair do grafo.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {btn("kl-new-chat", "Novo Chat", <span style={{ display: "flex" }}>{Icon.plus(13)}</span>)}
          {btn("kl-search", "Buscar", <span style={{ display: "flex" }}>{Icon.search(13)}</span>)}
          {btn("kl-images", "Imagens", <span style={{ display: "flex" }}>{Icon.box(13)}</span>)}
          {btn("kl-recents", "Recentes", <span style={{ display: "flex" }}>{Icon.clock(13)}</span>)}
        </div>
        <PanelDivider />
        <Tag color={C.muted} weight={600}>conversas recentes</Tag>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {convs.length === 0 ? <EmptyState>Nenhuma conversa ainda</EmptyState> : convs.map(c => (
            <button key={c.id} onClick={() => onSelectNode(`klc-${c.id}`)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 6, cursor: "pointer", textAlign: "left", transition: "border-color .15s ease" }} onMouseEnter={e => e.currentTarget.style.borderColor = C.ember} onMouseLeave={e => e.currentTarget.style.borderColor = C.divider}>
              <span style={{ color: C.ember, display: "flex" }}>{Icon.bolt(12)}</span>
              <span style={{ flex: 1, fontFamily: FONT, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.dim }}>{(c.messages || []).length} msgs</span>
            </button>
          ))}
        </div>
        <Banner tone="ember" icon={Icon.bolt(13)}>Em qualquer nó do grafo você pode trazer o assunto para um novo chat como contexto.</Banner>
      </div>
    </div>
  );
}

function NewProductModal({ onClose, onCreate }) {
  const { C } = useTheme();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [tagInput, setTagInput] = useState("");
  const set = (partial) => setForm(f => ({ ...f, ...partial }));
  const isPhysical = form.format !== "DIGITAL";
  const canNext = step !== 0 || form.name.trim().length > 0;

  const next = () => setStep(s => Math.min(WIZARD_STEPS.length - 1, s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));
  const submit = () => onCreate(form);

  const addTag = () => { const t = tagInput.trim(); if (t && !form.tags.includes(t)) { set({ tags: [...form.tags, t] }); } setTagInput(""); };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: "100%", maxHeight: "88vh", background: C.paper, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 24px 60px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* header + stepper */}
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${C.divider}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontFamily: FONT, fontWeight: 300, fontSize: 22, color: C.silver, letterSpacing: -0.5 }}>Novo produto</h2>
            <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: C.muted, display: "flex" }}>{Icon.x(18)}</button>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {WIZARD_STEPS.map((s, i) => (
              <button key={s} type="button" onClick={() => setStep(i)} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, alignItems: "center", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
                <div style={{ width: "100%", height: 2, background: i <= step ? C.ember : C.faint, transition: "all .3s ease" }} />
                <span style={{ fontFamily: MONO, fontSize: 7.5, color: i === step ? C.ember : C.dim, letterSpacing: 0.3, textTransform: "uppercase", whiteSpace: "nowrap" }}>{s}</span>
              </button>
            ))}
          </div>
        </div>

        {/* content */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 13 }}>
          {step === 0 && (
            <>
              <Field label="nome do produto" value={form.name} onChange={v => set({ name: v })} placeholder="Ex: GHK-Cu Sérum" />
              <TextArea label="descrição" value={form.description} onChange={v => set({ description: v })} placeholder="Descreva o produto..." rows={3} />
              <SelectField label="categoria" value={form.category} onChange={v => set({ category: v })} options={PRODUCT_CATEGORIES} />
              <div>
                <label style={{ display: "block", marginBottom: 6, fontFamily: MONO, fontSize: 9.5, color: C.muted, fontWeight: 500, letterSpacing: 1.4, textTransform: "uppercase" }}>formato</label>
                <RadioCards value={form.format} onChange={v => set({ format: v })} options={[
                  { value: "PHYSICAL", label: "Físico", desc: "Produto enviado" }, { value: "DIGITAL", label: "Digital", desc: "Acesso online" }, { value: "HYBRID", label: "Híbrido", desc: "Físico + digital" },
                ]} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, fontFamily: MONO, fontSize: 9.5, color: C.muted, fontWeight: 500, letterSpacing: 1.4, textTransform: "uppercase" }}>tags</label>
                <div style={{ display: "flex", gap: 8, marginBottom: form.tags.length ? 8 : 0 }}>
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="digite e Enter" style={{ flex: 1, height: 34, padding: "0 11px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.paper, color: C.text, fontFamily: FONT, fontSize: 12, outline: "none" }} />
                  <CTA small variant="line" onClick={addTag}>add</CTA>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{form.tags.map(t => <button key={t} onClick={() => set({ tags: form.tags.filter(x => x !== t) })} style={{ padding: "3px 9px", borderRadius: 99, background: C.emberSoft, border: `1px solid ${C.emberBorder}`, color: C.ember, fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>#{t} ×</button>)}</div>
              </div>
              <PhotoUpload label="foto do produto" value={form.photoDataUrl} onChange={(url) => set({ photoDataUrl: url })} />
            </>
          )}
          {step === 1 && (
            <>
              <Field label="preço (R$)" value={form.price} onChange={v => set({ price: v })} placeholder="197,00" mono />
              <div>
                <label style={{ display: "block", marginBottom: 6, fontFamily: MONO, fontSize: 9.5, color: C.muted, fontWeight: 500, letterSpacing: 1.4, textTransform: "uppercase" }}>tipo de pagamento</label>
                <RadioCards value={form.paymentType} onChange={v => set({ paymentType: v })} options={[
                  { value: "ONE_TIME", label: "À vista", desc: "Pagamento único" }, { value: "SUBSCRIPTION", label: "Assinatura", desc: "Cobrança recorrente" }, { value: "INSTALLMENT", label: "Parcelado", desc: "Dividido em parcelas" },
                ]} />
              </div>
              <Field label="página de vendas (URL)" value={form.salesPageUrl} onChange={v => set({ salesPageUrl: v })} placeholder="https://..." mono />
              <SelectField label="garantia" value={form.guaranteeDays} onChange={v => set({ guaranteeDays: v })} options={GUARANTEE_OPTIONS.map(([value, label]) => ({ value, label }))} />
              <div>
                <label style={{ display: "block", marginBottom: 6, fontFamily: MONO, fontSize: 9.5, color: C.muted, fontWeight: 500, letterSpacing: 1.4, textTransform: "uppercase" }}>tipo de checkout</label>
                <RadioCards value={form.checkoutType} onChange={v => set({ checkoutType: v })} options={[
                  { value: "standard", label: "Standard", desc: "Checkout tradicional" }, { value: "conversational", label: "Conversacional", desc: "Via WhatsApp com IA" },
                ]} />
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <Toggle label="Não se aplica" value={form.deliveryNotApplicable} onChange={v => set({ deliveryNotApplicable: v })} desc="Marque para pular embalagem e entrega (produto sem envio físico)" />
              {form.format === "DIGITAL" ? (
                <Banner tone="success" icon={Icon.check(13)}>Produto digital não precisa de embalagem nem frete.</Banner>
              ) : form.deliveryNotApplicable ? (
                <Banner tone="info" icon={Icon.box(13)}>Entrega marcada como não aplicável. Você pode configurar depois em Dados gerais → Frete.</Banner>
              ) : (
                <>
                  <SubTitle>embalagem</SubTitle>
                  <SelectField label="tipo de embalagem" value={form.packageType} onChange={v => set({ packageType: v })} options={PACKAGE_TYPES.map(p => ({ value: p, label: p }))} />
                  <Row>
                    <Field half label="largura (cm)" value={form.width} onChange={v => set({ width: v })} mono type="number" />
                    <Field half label="altura (cm)" value={form.height} onChange={v => set({ height: v })} mono type="number" />
                  </Row>
                  <Row>
                    <Field half label="profund. (cm)" value={form.depth} onChange={v => set({ depth: v })} mono type="number" />
                    <Field half label="peso (kg)" value={form.weight} onChange={v => set({ weight: v })} mono type="number" />
                  </Row>
                  <SubTitle>entrega</SubTitle>
                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontFamily: MONO, fontSize: 9.5, color: C.muted, fontWeight: 500, letterSpacing: 1.4, textTransform: "uppercase" }}>quem realiza o envio?</label>
                    <RadioCards value={form.shippingResponsible} onChange={v => set({ shippingResponsible: v })} options={[
                      { value: "producer", label: "Produtor", desc: "Você mesmo envia" }, { value: "supplier", label: "Fornecedor", desc: "Seu fornecedor envia" }, { value: "fulfillment", label: "Fulfillment", desc: "Centro de distribuição" }, { value: "dropshipping", label: "Dropshipping", desc: "Envio direto ao cliente" },
                    ]} />
                  </div>
                  <SelectField label="prazo de despacho" value={form.dispatchTime} onChange={v => set({ dispatchTime: v })} options={DISPATCH_TIMES.map(([value, label]) => ({ value, label }))} />
                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontFamily: MONO, fontSize: 9.5, color: C.muted, fontWeight: 500, letterSpacing: 1.4, textTransform: "uppercase" }}>transportadoras</label>
                    <ChipMulti value={form.carriers} onChange={v => set({ carriers: v })} options={CARRIERS} />
                  </div>
                </>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <Toggle label="Habilitar programa de afiliados" value={form.affiliatesEnabled} onChange={v => set({ affiliatesEnabled: v })} desc="Outros poderão vender seu produto por comissão" />
              {form.affiliatesEnabled && (
                <>
                  <Field label="comissão de afiliado (%)" value={form.affiliateCommissionPercent} onChange={v => set({ affiliateCommissionPercent: v })} placeholder="30" mono type="number" />
                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontFamily: MONO, fontSize: 9.5, color: C.muted, fontWeight: 500, letterSpacing: 1.4, textTransform: "uppercase" }}>modo de aprovação</label>
                    <RadioCards value={form.affiliateApprovalMode} onChange={v => set({ affiliateApprovalMode: v })} options={[
                      { value: "auto", label: "Automático", desc: "Aprovação instantânea" }, { value: "manual", label: "Manual", desc: "Você aprova cada solicitação" },
                    ]} />
                  </div>
                </>
              )}
            </>
          )}
          {step === 4 && (
            <>
              <div>
                <label style={{ display: "block", marginBottom: 6, fontFamily: MONO, fontSize: 9.5, color: C.muted, fontWeight: 500, letterSpacing: 1.4, textTransform: "uppercase" }}>tipo de cobrança</label>
                <RadioCards value={form.billingType} onChange={v => set({ billingType: v })} options={[
                  { value: "one_time", label: "Único", desc: "Uma cobrança" }, { value: "recurring", label: "Recorrente", desc: "Assinatura mensal" }, { value: "free", label: "Gratuito", desc: "Sem cobrança" },
                ]} />
              </div>
              {form.billingType !== "free" && (
                <Row>
                  <Field half label="parcelas máx." value={form.maxInstallments} onChange={v => set({ maxInstallments: v })} mono type="number" />
                  <Field half label="sem juros até" value={form.interestFreeInstallments} onChange={v => set({ interestFreeInstallments: v })} mono type="number" />
                </Row>
              )}
            </>
          )}
        </div>

        {/* footer nav */}
        <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.divider}`, background: C.raised, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {step > 0 ? <CTA small variant="ghost" onClick={back}>{Icon.back(12)} voltar</CTA> : <CTA small variant="ghost" onClick={onClose}>cancelar</CTA>}
          {step < WIZARD_STEPS.length - 1
            ? <CTA small variant="ember" onClick={next} disabled={!canNext}>avançar {Icon.arrow(12)}</CTA>
            : <CTA small variant="ember" onClick={submit} disabled={!form.name.trim()}>{Icon.plus(12)} criar produto</CTA>}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ROOT INNER · estado de produtos + perfil + canais, tudo no graph
   ════════════════════════════════════════════════════════════════════════ */
// Adapta o produto REAL do backend (GET /products via useProducts) para o shape
// que o grafo do protótipo espera. Honest-empty: sem dado real → zero nós-produto
// (nunca o seed PRODUCTS). Defensivo a campos ausentes do backend.
function adaptRealProduct(p) {
  const id = String((p && (p.id ?? p._id ?? p.slug)) ?? `prod-${Math.random().toString(36).slice(2, 8)}`);
  const name = (p && (p.name ?? p.title)) ? String(p.name ?? p.title) : "Produto";
  const category = (p && p.category) ? String(p.category) : "Outros";
  const status = (p && p.status) ? String(p.status) : "draft";
  const rawPrice = Number((p && (p.price ?? p.priceInCents ?? p.amount)) || 0);
  const price = rawPrice > 1000 ? Math.round(rawPrice / 100) : rawPrice;
  return {
    id,
    label: name,
    status,
    tags: [category.toLowerCase()].filter(Boolean),
    meta: { category, price, revenue: 0, sales: 0, subtitle: status },
    editor: defaultProductEditor({ name, category, status, price }),
  };
}

// Adapters de dados reais → shape esperado pelos builders do grafo (honest-empty:
// campos ausentes viram vazio/zero; nunca seed). Defensivos a undefined do backend.
function adaptRealArea(a) {
  return {
    ...a,
    id: String((a && (a.id ?? a._id ?? a.slug)) ?? `ma-${Math.random().toString(36).slice(2, 8)}`),
    name: (a && (a.name ?? a.title)) ? String(a.name ?? a.title) : "Área de membros",
    type: (a && a.type) ? String(a.type) : "course",
    active: a ? a.active !== false : true,
    avgRating: Number((a && a.avgRating) || 0),
    modules: Array.isArray(a && a.modules) ? a.modules.map(m => ({ ...m, lessons: Array.isArray(m && m.lessons) ? m.lessons : [] })) : [],
    enrollments: Array.isArray(a && a.enrollments) ? a.enrollments : [],
  };
}
function adaptRealAffiliate(a) {
  return {
    id: String((a && (a.id ?? a._id)) ?? `aff-${Math.random().toString(36).slice(2, 8)}`),
    name: (a && (a.name ?? a.agentName ?? a.email)) ? String(a.name ?? a.agentName ?? a.email) : "Parceiro",
    email: (a && a.email) ? String(a.email) : "",
    type: (a && a.type) ? String(a.type) : "affiliate",
    status: (a && a.status) ? String(a.status) : "active",
    totalSales: Number((a && (a.totalSales ?? a.sales)) || 0),
    revenue: Number((a && a.revenue) || 0),
    commission: Number((a && a.commission) || 0),
    temperature: Number((a && a.temperature) || 0),
    joined: (a && (a.joined ?? a.createdAt)) ? String(a.joined ?? a.createdAt) : "",
    products: Array.isArray(a && a.products) ? a.products : [],
    monthlyPerformance: Array.isArray(a && a.monthlyPerformance) ? a.monthlyPerformance : [0, 0, 0, 0, 0, 0],
  };
}
// Mescla o perfil/fiscal/banco/docs REAIS (KycProfile = Record<string,unknown>)
// sobre o accountData honest-empty. Cada campo só sobrescreve se vier preenchido —
// nunca reintroduz PII fake; sem backend, tudo permanece em branco.
function s(v) { return v == null ? "" : String(v); }
function mergeRealAccount(base, profile, fiscal, bank, docs) {
  const p = profile || {};
  const f = fiscal || {};
  const b = bank || {};
  const out = JSON.parse(JSON.stringify(base));
  out.pessoal = { ...out.pessoal, nome: s(p.nome ?? p.name ?? p.fullName) || out.pessoal.nome, email: s(p.email) || out.pessoal.email, celular: s(p.celular ?? p.phone) || out.pessoal.celular, nascimento: s(p.nascimento ?? p.birthDate) || out.pessoal.nascimento };
  out.fiscal = { ...out.fiscal, tipo: s(f.tipo) || out.fiscal.tipo, cnpj: s(f.cnpj) || out.fiscal.cnpj, razao: s(f.razao ?? f.razaoSocial) || out.fiscal.razao, fantasia: s(f.fantasia ?? f.nomeFantasia) || out.fiscal.fantasia, cpfResp: s(f.cpfResp ?? f.cpf) || out.fiscal.cpfResp, nomeResp: s(f.nomeResp ?? f.responsavel) || out.fiscal.nomeResp, cep: s(f.cep) || out.fiscal.cep, rua: s(f.rua ?? f.logradouro) || out.fiscal.rua, numero: s(f.numero) || out.fiscal.numero, complemento: s(f.complemento) || out.fiscal.complemento, bairro: s(f.bairro) || out.fiscal.bairro, cidade: s(f.cidade) || out.fiscal.cidade, uf: s(f.uf ?? f.estado) || out.fiscal.uf };
  out.bancario = { ...out.bancario, banco: s(b.banco ?? b.bankName) || out.bancario.banco, agencia: s(b.agencia ?? b.agency) || out.bancario.agencia, conta: s(b.conta ?? b.account) || out.bancario.conta, titular: s(b.titular ?? b.holder) || out.bancario.titular, pixChave: s(b.pixChave ?? b.pixKey) || out.bancario.pixChave };
  if (Array.isArray(docs)) {
    for (const d of docs) {
      const type = s(d && (d.type ?? d.kind)).toLowerCase();
      const key = type.includes("ident") || type.includes("rg") ? "identidade" : type.includes("contr") || type.includes("cnpj") ? "contrato" : null;
      if (key && out.documentos[key]) out.documentos[key] = { ...out.documentos[key], status: s(d.status) || "pendente", fileName: s(d.fileName ?? d.name) };
    }
  }
  return out;
}
function adaptRealContact(ct) {
  return {
    id: String((ct && (ct.id ?? ct._id ?? ct.phone)) ?? `ct-${Math.random().toString(36).slice(2, 8)}`),
    name: (ct && (ct.name ?? ct.fullName ?? ct.displayName ?? ct.phone)) ? String(ct.name ?? ct.fullName ?? ct.displayName ?? ct.phone) : "Contato",
    phone: (ct && ct.phone) ? String(ct.phone) : "",
    email: (ct && ct.email) ? String(ct.email) : "",
    optIn: ct ? ct.optIn !== false : true,
    tags: Array.isArray(ct && ct.tags) ? ct.tags : [],
    leadScore: Number((ct && (ct.leadScore ?? ct.score)) || 0),
    sentiment: (ct && ct.sentiment) ? String(ct.sentiment) : "neutral",
    purchaseProbability: (ct && ct.purchaseProbability) ? String(ct.purchaseProbability) : "MEDIUM",
    nextBestAction: (ct && ct.nextBestAction) ? String(ct.nextBestAction) : "",
    aiSummary: (ct && ct.aiSummary) ? String(ct.aiSummary) : "",
    insights: Array.isArray(ct && ct.insights) ? ct.insights : [],
  };
}
function adaptRealDeal(d) {
  const contact = (d && d.contact) || {};
  return {
    id: String((d && (d.id ?? d._id)) ?? `dl-${Math.random().toString(36).slice(2, 8)}`),
    title: (d && (d.title ?? d.name)) ? String(d.title ?? d.name) : "Negócio",
    value: Number((d && (d.value ?? d.amount)) || 0),
    priority: (d && d.priority) ? String(d.priority) : "MEDIUM",
    status: (d && d.status) ? String(d.status) : "OPEN",
    stageId: (d && (d.stageId ?? d.stage)) ? String(d.stageId ?? d.stage) : "",
    contact: { name: (contact.name ?? contact.fullName) ? String(contact.name ?? contact.fullName) : "", phone: contact.phone ? String(contact.phone) : "" },
  };
}
function adaptRealPipeline(pipelines) {
  const list = Array.isArray(pipelines) ? pipelines : [];
  const first = list[0] || {};
  const pipeline = { id: String(first.id ?? "pp1"), name: String(first.name ?? "Pipeline de Vendas"), isDefault: first.isDefault !== false };
  const stages = Array.isArray(first.stages) ? first.stages.map((s, i) => ({
    id: String((s && (s.id ?? s._id)) ?? `st-${i}`),
    name: (s && (s.name ?? s.label)) ? String(s.name ?? s.label) : `Etapa ${i + 1}`,
    color: (s && s.color) ? String(s.color) : "#6B7280",
    order: Number((s && s.order) ?? i),
  })) : [];
  return { pipeline, stages };
}
function adaptRealWalletBalance(b) {
  if (!b) return { available: 0, pending: 0, blocked: 0, total: 0 };
  const available = Number(b.available ?? b.availableInCents ?? 0);
  const pending = Number(b.pending ?? b.pendingInCents ?? 0);
  const blocked = Number(b.blocked ?? b.blockedInCents ?? 0);
  return { available, pending, blocked, total: Number(b.total ?? b.totalInCents ?? (available + pending + blocked)) };
}

function KloelInner() {
  const { C, mode } = useTheme();
  const [tab, setTab] = useState("criar");
  const [recenterNonce, setRecenterNonce] = useState(0);
  const pendingSelectRef = useRef(null);
  // GPS: toda vez que uma aba é clicada (mesmo a já ativa) recentraliza o sol
  const navigate = useCallback((k) => { setTab(k); setRecenterNonce(n => n + 1); }, []);
  const [selectedId, setSelectedId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(defaultSettings(C));
  const [channels, setChannels] = useState(DEFAULT_CHANNELS);
  // Perfil honest-empty (sem PII fake: nome/CNPJ/CPF/banco inventados). Mesma
  // estrutura do form, valores em branco; documentos mostram os 2 slots exigidos
  // como "pendente" (estado real de conta nova). Dados reais via hook de conta/KYC.
  const [accountData, setAccountData] = useState({
    pessoal: { nome: "", email: "", celular: "", nascimento: "" },
    fiscal: { tipo: "cnpj", cnpj: "", razao: "", fantasia: "", ie: "", im: "", cpfResp: "", nomeResp: "", cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" },
    documentos: { identidade: { name: "Documento de identidade", status: "pendente", fileName: "", enviado: "", rejectedReason: null, reviewedAt: null }, contrato: { name: "Contrato social ou cartão CNPJ", status: "pendente", fileName: "", enviado: "", rejectedReason: null, reviewedAt: null } },
    bancario: { tipo: "corrente", banco: "", codigo: "", agencia: "", conta: "", titular: "", cpfCnpj: "", pixChave: "", pixTipo: "" },
    perfilPublico: { publicName: "", bio: "", website: "", instagram: "", avatarUrl: "" },
    team: { members: [], invites: [] },
    seguranca: { twoFactor: false, lastLogin: "", sessions: 0 },
    idiomas: { language: "pt-BR" },
    apps: { meta: { connected: false }, google: { connected: false }, tiktok: { connected: false }, zapier: { connected: false } },
    referral: { code: "", invited: 0, earned: 0 },
  });
  // Perfil REAL: mescla profile/fiscal/banco/docs reais (KYC) sobre o honest-empty.
  const { profile: realProfile } = useProfile();
  const { fiscal: realFiscal } = useFiscalData();
  const { documents: realDocs } = useKycDocuments();
  const { bankAccount: realBank } = useBankAccount();
  useEffect(() => {
    setAccountData(base => mergeRealAccount(base, realProfile, realFiscal, realBank, realDocs));
  }, [realProfile, realFiscal, realBank, realDocs]);
  // Produtos REAIS via useProducts (GET /products). Honest-empty: backend ausente/
  // loading/erro → []. Patches locais (optimistic) continuam via setProducts.
  const { products: realProducts } = useProducts();
  const [products, setProducts] = useState([]);
  useEffect(() => {
    setProducts(Array.isArray(realProducts) ? realProducts.map(adaptRealProduct) : []);
  }, [realProducts]);
  // Afiliar REAL via useAffiliates (GET /partnerships/affiliates). myAffiliates =
  // parceiros reais; marketplace/partnerChats/collaborators honest-empty até endpoint.
  const { affiliates: realAffiliates } = useAffiliates();
  const [affiliate, setAffiliate] = useState({ marketplace: [], myAffiliates: [], partnerChats: [], collaborators: [] });
  useEffect(() => {
    setAffiliate(prev => ({ ...prev, myAffiliates: (Array.isArray(realAffiliates) ? realAffiliates : []).map(adaptRealAffiliate) }));
  }, [realAffiliates]);
  // Carteira REAL via useWallet* (GET /kloel/wallet/...). Honest-empty: backend
  // ausente/loading/erro → saldos zerados + listas vazias (nunca DEFAULT_WALLET fake).
  const { balance: realBalance } = useWalletBalance();
  const { withdrawals: realWithdrawals } = useWalletWithdrawals();
  const { anticipations: realAnticipations } = useWalletAnticipations();
  const [wallet, setWallet] = useState({ balance: { available: 0, pending: 0, blocked: 0, total: 0 }, withdrawals: [], anticipations: [], transactions: [] });
  useEffect(() => {
    setWallet({
      balance: adaptRealWalletBalance(realBalance),
      withdrawals: Array.isArray(realWithdrawals) ? realWithdrawals : [],
      anticipations: Array.isArray(realAnticipations) ? realAnticipations : [],
      transactions: [],
    });
  }, [realBalance, realWithdrawals, realAnticipations]);
  // Educar REAL via useMemberAreas (GET /member-areas). Honest-empty: sem dado → [].
  const { areas: realAreas } = useMemberAreas();
  const [educar, setEducar] = useState({ areas: [] });
  useEffect(() => {
    setEducar({ areas: (Array.isArray(realAreas) ? realAreas : []).map(adaptRealArea) });
  }, [realAreas]);
  // Conversar honest-empty (sem CRM/contatos/conversas/pedidos/anúncios fake). crm
  // mantém só o scaffold do pipeline (sem deals). Dados reais via useCRM/conversations/
  // useAnuncios quando o backend estiver disponível.
  // Conversar REAL: contatos via useContacts (/crm/contacts), deals+pipeline via
  // useDeals/usePipelines (/crm/deals,/crm/pipelines). conversations/orders/anúncios/
  // autopilot honest-empty até endpoint real. Sub-nós só aparecem com crmModules ativo.
  const { contacts: realContacts } = useContacts();
  const { deals: realDeals } = useDeals();
  const { pipelines: realPipelines } = usePipelines();
  const [conversar, setConversar] = useState({ crm: { pipeline: { id: "pp1", name: "Pipeline de Vendas", isDefault: true }, stages: [], deals: [] }, contacts: [], conversations: [], orders: [], adCampaigns: [], adRules: [], autopilotEvents: [], followups: [], crmModules: { inbox: false, contatos: false, vendas: false, anuncios: false, autopilot: false } });
  useEffect(() => {
    const { pipeline, stages } = adaptRealPipeline(realPipelines);
    setConversar(prev => ({
      ...prev,
      contacts: (Array.isArray(realContacts) ? realContacts : []).map(adaptRealContact),
      crm: { pipeline, stages, deals: (Array.isArray(realDeals) ? realDeals : []).map(adaptRealDeal) },
    }));
  }, [realContacts, realDeals, realPipelines]);
  const [desempenho, setDesempenho] = useState({ period: "30d", customFrom: "", customTo: "" });
  const [kloel, setKloel] = useState({ conversations: [], images: [] });
  const [kloelCtx, setKloelCtx] = useState(null);
  const patchConversar = useCallback((fn) => setConversar(prev => fn(prev)), []);
  const [newProductOpen, setNewProductOpen] = useState(false);

  // patch do editor de um produto (atualização imutável profunda)
  const patchProductEditor = useCallback((productId, fn) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, editor: fn(p.editor) } : p));
  }, []);

  // patch de um item do marketplace de afiliação (fn aplica a CADA item; recebe o item)
  const patchAffiliate = useCallback((fn, marketId) => {
    setAffiliate(prev => ({ ...prev, marketplace: prev.marketplace.map(m => m.id === marketId ? fn(m) : m) }));
  }, []);

  // patch do lado produtor: atualiza/remove um afiliado e/ou envia mensagem no chat
  const patchMyAffiliate = useCallback((id, fn, remove = false, chatMsg = null) => {
    setAffiliate(prev => {
      let myAffiliates = prev.myAffiliates;
      if (remove) myAffiliates = myAffiliates.filter(a => a.id !== id);
      else if (fn) myAffiliates = myAffiliates.map(a => a.id === id ? fn(a) : a);
      let partnerChats = prev.partnerChats;
      if (chatMsg) {
        partnerChats = partnerChats.map(c => c.name === chatMsg.chatName
          ? { ...c, messages: [...c.messages, { id: `m-${Date.now()}`, text: chatMsg.text, isMe: true, time: "agora" }], lastMessage: chatMsg.text, unread: 0 }
          : c);
      }
      return { ...prev, myAffiliates, partnerChats };
    });
  }, []);

  // patch da carteira (fn recebe o wallet inteiro)
  const patchWallet = useCallback((fn) => setWallet(prev => fn(prev)), []);

  // patch de uma área de membros (ou cria nova com id "__new__")
  const patchArea = useCallback((areaId, fn) => {
    if (areaId === "__new__") {
      const id = `area-${Date.now()}`;
      setEducar(prev => ({ ...prev, areas: [...prev.areas, { id, name: "Nova área de membros", slug: `area-${prev.areas.length + 1}`, description: "", type: "course", template: "classic", logoUrl: "", coverUrl: "", primaryColor: "#E85D30", customDomain: "", certificates: true, quizzes: false, community: false, gamification: false, progressTrack: true, downloads: true, comments: true, aiGenerated: false, active: true, avgRating: 0, modules: [], enrollments: [] }] }));
      setTimeout(() => setSelectedId(`ma-${id}`), 300);
      return;
    }
    setEducar(prev => ({ ...prev, areas: prev.areas.map(a => a.id === areaId ? fn(a) : a) }));
  }, []);

  // cria novo produto a partir do formulário completo (7 passos) materializando o editor
  const createProduct = useCallback((form) => {
    const id = `p-${Date.now()}`;
    const price = parseFloat(String(form.price || "").replace(",", ".")) || 0;
    const slug = form.name.trim().toLowerCase().replace(/\s+/g, "-");
    const isPhysical = form.format !== "DIGITAL";
    const newProduct = {
      id, label: form.name.trim(), status: "draft", tags: [...(form.tags || []), form.category.toLowerCase()].filter(Boolean),
      meta: { category: form.category, price, revenue: 0, sales: 0, subtitle: "rascunho · novo" },
      editor: defaultProductEditor({
        name: form.name.trim(), category: form.category, status: "draft", format: form.format, price,
        dados: {
          name: form.name.trim(), category: form.category, status: "draft", format: form.format, price, slug,
          description: form.description || "",
          salesPageUrl: form.salesPageUrl || "",
          warrantyDays: parseInt(form.guaranteeDays) || 7,
          shippingType: (isPhysical && !form.deliveryNotApplicable) ? (form.shippingResponsible === "dropshipping" ? "VARIABLE" : "FIXED") : "NONE",
          imageUrl: form.photoDataUrl || "", coverUrl: form.photoDataUrl || "",
        },
        plans: price > 0 ? [defaultPlan({ id: `pl-${Date.now()}`, name: `${form.name.trim()} - plano único`, priceInCents: Math.round(price * 100), quantity: 1, maxInstallments: parseInt(form.maxInstallments) || 12, maxNoInterest: parseInt(form.interestFreeInstallments) || 1, billingType: form.billingType === "recurring" ? "RECURRING" : form.billingType === "free" ? "FREE" : "ONE_TIME", visibleToAffiliates: form.affiliatesEnabled, referenceCode: form.name.trim().slice(0, 6).toUpperCase() })] : [],
        commission: form.affiliatesEnabled ? { affiliateEnabled: true, affiliateVisible: true, affiliateAutoApprove: form.affiliateApprovalMode === "auto", commissionType: "last_click", commissionCookieDays: 180, commissionPercent: parseInt(form.affiliateCommissionPercent) || 30, commissionLastClickPercent: 70, commissionOtherClicksPercent: 30 } : undefined,
        checkouts: price > 0 ? [{ id: `ck-${Date.now()}`, name: "Checkout Principal", slug, referenceCode: "CK-MAIN", salesCount: 0, isActive: true, maxInstallments: parseInt(form.maxInstallments) || 12, quantity: 1, checkoutLinks: [],
          checkoutConfig: defaultCheckoutConfig({ theme: form.checkoutType === "conversational" ? "NOIR" : "BLANC", chatEnabled: form.checkoutType === "conversational", guaranteeDays: parseInt(form.guaranteeDays) || 7,
            pixels: (form.facebookPixelId ? [{ id: `px-${Date.now()}`, type: "FACEBOOK", pixelId: form.facebookPixelId, accessToken: "", trackPageView: true, trackInitiateCheckout: true, trackAddPaymentInfo: true, trackPurchase: true, isActive: true }] : []) }) }] : [],
      }),
    };
    setProducts(prev => [...prev, newProduct]);
    setNewProductOpen(false);
    setTab("criar");
    setRecenterNonce(n => n + 1);
    setTimeout(() => setSelectedId(id), 450);
  }, []);

  useEffect(() => {
    setSettings(s => ({ ...s, groups: s.groups.map(g => {
      if (g.query === "type:product") return { ...g, color: C.ember };
      if (g.query === "type:p_ia") return { ...g, color: C.blue };
      return g;
    }) }));
  }, [mode]);

  const desempenhoData = useMemo(() => computeDesempenho(OPERATIONAL_DAYS, desempenho.period, desempenho.customFrom, desempenho.customTo, wallet), [desempenho, wallet]);
  const dynamicGraph = useMemo(() => buildGraph(products, channels, accountData, affiliate, wallet, educar, conversar, desempenhoData, kloel), [products, channels, accountData, affiliate, wallet, educar, conversar, desempenhoData, kloel]);
  const kloelLinkTargets = useMemo(() => {
    const t = [];
    for (const p of products) {
      t.push({ id: p.id, label: p.label, group: "Produtos" });
      for (const ck of (p.editor?.checkouts || [])) t.push({ id: `${p.id}-planos`, label: `${ck.name || "Checkout"} · ${p.label}`, group: "Checkouts" });
    }
    for (const ad of (conversar?.adCampaigns || [])) t.push({ id: `cv-ad-${ad.id}`, label: ad.campaignName, group: "Campanhas" });
    for (const c of (conversar?.conversations || [])) t.push({ id: `cv-conv-${c.id}`, label: c.contactName, group: "Conversas" });
    for (const ar of (educar?.areas || [])) t.push({ id: `ma-${ar.id}`, label: ar.name, group: "Áreas de membros" });
    return t;
  }, [products, conversar, educar]);
  const productsForWizard = useMemo(() => products.map(p => ({ id: p.id, label: p.label, type: "product", meta: p.meta })), [products]);

  useEffect(() => {
    const id = "kloel-graph-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id; link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Sora:wght@200;300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }, []);

  useEffect(() => { if (pendingSelectRef.current) { setSelectedId(pendingSelectRef.current); pendingSelectRef.current = null; } else { setSelectedId(null); } }, [tab]);

  // abrir um nó "no grafo": navega a câmera até a galáxia dele e o seleciona
  const openNodeInGraph = useCallback((nodeId) => {
    const n = dynamicGraph.nodes.find(x => x.id === nodeId);
    const tabKey = n?.area && TAB_SUN[n.area] ? n.area : null;
    if (tabKey && tabKey !== tab) { pendingSelectRef.current = nodeId; navigate(tabKey); }
    else { setSelectedId(nodeId); setRecenterNonce(v => v + 1); }
  }, [dynamicGraph, tab, navigate]);

  const selectedNode = useMemo(() => dynamicGraph.nodes.find(n => n.id === selectedId), [dynamicGraph.nodes, selectedId]);

  const isCorePanel  = ["core", "profileSection", "profileField", "doc", "teamMember", "appNode"].includes(selectedNode?.type);
  const isDesempenho = selectedNode?.type === "desempenho";
  const isMetric     = selectedNode?.type === "metric";
  const isKloelMass  = selectedNode?.id === "sun-kloel";
  const isKloelOverlay = selectedNode && ["kloelAction", "kloelConversation", "kloelImageAsset"].includes(selectedNode.type);
  const isChannel = selectedNode?.type === "channel";
  const isCriarMass = selectedNode?.id === "sun-criar";
  const isProductEditor = selectedNode?.type === "product";
  const isAfiliarMass = selectedNode?.id === "sun-afiliar";
  const isConectarMass = selectedNode?.id === "sun-conectar";
  const isEducarMass = selectedNode?.id === "sun-educar";
  const isMemberArea = selectedNode?.type === "memberArea";

  const coreInitialSection = useMemo(() => {
    if (!selectedNode || !isCorePanel) return "pessoal";
    if (selectedNode.type === "core") return "pessoal";
    if (selectedNode.type === "profileSection") return selectedNode.meta?.sectionKey || "pessoal";
    if (selectedNode.type === "teamMember") return "team";
    if (selectedNode.type === "appNode") return "apps";
    const map = { "pf-pessoal": "pessoal", "pf-fiscal": "fiscal", "pf-docs": "documentos", "pf-banco": "bancario", "pf-publico": "perfilPublico", "pf-team": "team", "pf-apps": "apps", "pf-seg": "seguranca" };
    return map[selectedNode.parentId] || "pessoal";
  }, [selectedNode, isCorePanel]);

  const openNewProduct = useCallback(() => setNewProductOpen(true), []);

  return (
    <div style={{ background: C.void, height: "100vh", width: "100vw", fontFamily: FONT, color: C.text, position: "relative", overflow: "hidden", transition: "background .25s ease" }}>
      <style>{`
        *{box-sizing:border-box}
        body{margin:0;-webkit-font-smoothing:antialiased}
        ::selection{background:rgba(232,93,48,0.18)}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
        .hide-scrollbar::-webkit-scrollbar{display:none}
        input::placeholder,textarea::placeholder{color:${C.dim}}
        @keyframes panelSlide{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
        @keyframes panelSlideLeft{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:translateX(0)}}
      `}</style>

      <FloatingNav active={tab} onChange={navigate} />
      <SettingsButton open={settingsOpen} onClick={() => setSettingsOpen(o => !o)} />
      <ThemeToggle />

      {settingsOpen && <SettingsPanel settings={settings} setSettings={setSettings} onClose={() => setSettingsOpen(false)} />}

      {selectedNode && isCorePanel && (
        <CoreSettingsPanel key={coreInitialSection} accountData={accountData} setAccountData={setAccountData} onClose={() => setSelectedId(null)} initialSection={coreInitialSection} />
      )}

      {selectedNode && isDesempenho && (
        <DesempenhoPanel desempenho={desempenho} setDesempenho={setDesempenho} data={desempenhoData} accountData={accountData} onClose={() => setSelectedId(null)} onOpenMetric={(k) => setSelectedId(`dz-${k}`)} />
      )}

      {selectedNode && isMetric && (
        <MetricDetailPanel node={selectedNode} data={desempenhoData} onClose={() => setSelectedId(null)} />
      )}

      {selectedNode && isKloelMass && (
        <KloelMassPanel kloel={kloel} onClose={() => setSelectedId(null)} onSelectNode={setSelectedId} />
      )}

      {selectedNode && isKloelOverlay && (
        <KloelOverlayRouter node={selectedNode} kloel={kloel} setKloel={setKloel}
          context={{ products, conversar, desempenho: desempenhoData, userName: (accountData?.pessoal?.nome || accountData?.perfilPublico?.displayName || "").trim().split(" ")[0], contextRefs: kloelCtx || selectedNode.meta?.contextRefs }}
          searchData={{ products, conversar, affiliate, educar, wallet, kloel }} products={products}
          linkTargets={kloelLinkTargets}
          onAskContext={(ref) => { setKloelCtx([ref]); setSelectedId("kl-new-chat"); }}
          onClose={() => { setSelectedId(null); setKloelCtx(null); }} onOpenNode={openNodeInGraph} />
      )}

      {selectedNode && isCriarMass && (
        <KloelOverlay hideHeader onClose={() => setSelectedId(null)}>
          <CriarProdutosScreen products={products} educar={educar} onOpenNode={(id) => setSelectedId(id)} onNewProduct={openNewProduct} />
        </KloelOverlay>
      )}

      {selectedNode && isProductEditor && (() => {
        const prod = products.find(p => p.id === selectedNode.id);
        if (!prod || !prod.editor) return null;
        return (
          <KloelOverlay hideHeader onClose={() => setSelectedId(null)}>
            <div style={{ flex: 1, overflow: "auto", padding: "28px 28px 48px" }}>
              <div style={{ maxWidth: 1180, margin: "0 auto" }}>
                <ProductOverview product={prod} ed={prod.editor} patch={(fn) => patchProductEditor(prod.id, fn)} onAskKloel={(ref) => { setKloelCtx([ref]); setSelectedId("kl-new-chat"); }} onBack={() => setSelectedId("sun-criar")} />
              </div>
            </div>
          </KloelOverlay>
        );
      })()}

      {selectedNode && isAfiliarMass && (
        <KloelOverlay hideHeader onClose={() => setSelectedId(null)}>
          <AfiliarScreen affiliate={affiliate} onOpenNode={(id) => setSelectedId(id)} />
        </KloelOverlay>
      )}

      {selectedNode && isConectarMass && (
        <KloelOverlay hideHeader onClose={() => setSelectedId(null)}>
          <ConversarScreen channels={channels} onOpenNode={(id) => setSelectedId(id)} />
        </KloelOverlay>
      )}

      {selectedNode && isEducarMass && (
        <KloelOverlay hideHeader onClose={() => setSelectedId(null)}>
          <EducarScreen educar={educar} onOpenNode={(id) => setSelectedId(id)} onNewArea={patchArea ? () => patchArea("__new__") : undefined} />
        </KloelOverlay>
      )}

      {selectedNode && isMemberArea && (
        <KloelOverlay hideHeader onClose={() => setSelectedId(null)}>
          <div style={{ flex: 1, overflow: "auto", padding: "28px 28px 40px" }}>
            <div style={{ maxWidth: 920, margin: "0 auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
                <button onClick={() => setSelectedId("sun-educar")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: C.raised, border: `1px solid ${C.divider}`, borderRadius: 8, color: C.muted, fontFamily: FONT, fontSize: 12.5, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.color = C.silver} onMouseLeave={e => e.currentTarget.style.color = C.muted}>{Icon.back(13)} Educar</button>
                <span style={{ fontFamily: FONT, fontSize: 16, fontWeight: 600, color: C.silver }}>{selectedNode.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>área de membros</span>
              </div>
              <MemberAreaPanel node={selectedNode} educar={educar} patchArea={patchArea} />
            </div>
          </div>
        </KloelOverlay>
      )}

      {selectedNode && isChannel && (
        <KloelOverlay hideHeader onClose={() => setSelectedId(null)}>
          <ChannelOnboardingWizard embedded channelKey={selectedNode.meta.channelKey} channels={channels} setChannels={setChannels} onClose={() => setSelectedId(null)} products={productsForWizard} />
        </KloelOverlay>
      )}

      {selectedNode && !isCorePanel && !isDesempenho && !isMetric && !isKloelMass && !isKloelOverlay && !isCriarMass && !isProductEditor && !isAfiliarMass && !isConectarMass && !isEducarMass && !isMemberArea && !isChannel && (
        <NodePanel node={selectedNode} onClose={() => setSelectedId(null)} onAction={() => {}} onSelectNode={setSelectedId} onNewProduct={openNewProduct} onAskKloel={(ref) => { setKloelCtx([ref]); setSelectedId("kl-new-chat"); }} channels={channels} products={products} patchProductEditor={patchProductEditor} affiliate={affiliate} patchAffiliate={patchAffiliate} patchMyAffiliate={patchMyAffiliate} wallet={wallet} patchWallet={patchWallet} educar={educar} patchArea={patchArea} conversar={conversar} patchConversar={patchConversar} />
      )}

      {newProductOpen && <NewProductModal onClose={() => setNewProductOpen(false)} onCreate={createProduct} />}

      <div style={{ position: "absolute", inset: 0 }}>
        <GraphCanvas tab={tab} recenterNonce={recenterNonce} selectedId={selectedId} onSelectNode={setSelectedId} settings={settings} dynamicGraph={dynamicGraph} channels={channels} />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   EXPORT · Root com ThemeProvider
   ════════════════════════════════════════════════════════════════════════ */
export default function Kloel() {
  return (
    <ThemeProvider>
      <KloelInner />
    </ThemeProvider>
  );
}
