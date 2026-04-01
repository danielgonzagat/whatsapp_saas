"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MediaPreviewBox } from "@/components/kloel/MediaPreviewBox";
import { usePersistentImagePreview } from "@/hooks/usePersistentImagePreview";
import { useProduct, useProductMutations, useProducts } from "@/hooks/useProducts";
import { useCheckoutPlans, useOrderBumps, useCheckoutConfig } from "@/hooks/useCheckoutPlans";
import { apiFetch } from "@/lib/api";
import { readFileAsDataUrl, uploadGenericMedia } from "@/lib/media-upload";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DOMPurify = typeof window !== 'undefined' ? require('dompurify') : null;
function sanitizeHtml(html: string): string {
  if (!DOMPurify) return html; // SSR: content comes from DB, not user input
  return (DOMPurify as any).sanitize(html, { ALLOWED_TAGS: ['b','i','u','a','br','p','span'], ALLOWED_ATTR: ['href','target'] });
}

function unwrapApiPayload<T = any>(response: any): T {
  if (response?.error) {
    throw new Error(response.error);
  }

  return (response?.data ?? response) as T;
}

/* ═══════════════════════════════════════════════════
   V — KLOEL Terminator palette (Nerve Center)
   ═══════════════════════════════════════════════════ */
const S = "'Sora',sans-serif";
const M = "'JetBrains Mono',monospace";
const V = { void:"#0A0A0C", s:"#111113", e:"#19191C", b:"#222226", em:"#E85D30", t:"#E0DDD8", t2:"#6E6E73", t3:"#3A3A3F", g:"#25D366", g2:"#10B981", p:"#8B5CF6", bl:"#3B82F6", y:"#F59E0B", r:"#EF4444", pk:"#EC4899" };
const R$ = (n: number) => (n/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const parseCurrencyInput = (value: string) => {
  const normalized = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};
const getPublicOrigin = () => typeof window !== "undefined" ? window.location.origin : "https://kloel.com";
const buildPublicCheckoutUrl = (slug?: string | null) => `${getPublicOrigin()}/${String(slug || "").trim()}`;
const buildPublicCheckoutCodeUrl = (code?: string | null) => `${getPublicOrigin()}/r/${String(code || "").trim()}`;
const SHIPPING_LABELS: Record<string, string> = {
  NONE: "Sem frete",
  FREE: "Frete grátis",
  FIXED: "Frete fixo",
  VARIABLE: "Frete variável",
};

/* ═══════════════════════════════════════════════════
   NP — Neural Pulse Canvas
   ═══════════════════════════════════════════════════ */
function NP({ w=120, h=24, intensity=1 }: { w?: number; h?: number; intensity?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current; if(!c) return;
    const ctx = c.getContext("2d"); if(!ctx) return;
    c.width=w*2; c.height=h*2; ctx.scale(2,2);
    let f = 0; let raf: number;
    const draw = () => {
      ctx.clearRect(0,0,w,h); ctx.beginPath();
      for(let x=0;x<w;x++) ctx.lineTo(x,h/2+Math.sin(x*.12+f*.07)*Math.sin(x*.04+f*.025)*5*intensity);
      ctx.strokeStyle=V.em; ctx.lineWidth=1.5; ctx.globalAlpha=.55; ctx.stroke(); f++; raf=requestAnimationFrame(draw);
    };
    raf=requestAnimationFrame(draw); return()=>cancelAnimationFrame(raf);
  }, [intensity,w,h]);
  return <canvas ref={cv} style={{width:w,height:h,display:"block"}} />;
}

/* ═══════════════════════════════════════════════════
   Shared styles
   ═══════════════════════════════════════════════════ */
const cs: React.CSSProperties = {background:V.s,border:`1px solid ${V.b}`,borderRadius:6};
const is: React.CSSProperties = {width:"100%",padding:"10px 14px",background:V.e,border:`1px solid ${V.b}`,borderRadius:6,color:V.t,fontSize:13,fontFamily:S,outline:"none"};
const ls: React.CSSProperties = {display:"block",fontSize:10,fontWeight:600,color:V.t3,letterSpacing:".08em",textTransform:"uppercase",marginBottom:6,fontFamily:S};

/* ═══════════════════════════════════════════════════
   Mini-components
   ═══════════════════════════════════════════════════ */
function Bg({color,children}: {color: string; children: React.ReactNode}){return <span style={{padding:"3px 10px",background:`${color}15`,border:`1px solid ${color}30`,borderRadius:4,fontSize:9,fontWeight:700,color,fontFamily:M}}>{children}</span>}

function Tg({label,checked,onChange,desc}: {label: string; checked: boolean; onChange?: (v: boolean) => void; desc?: string}){
  return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${V.b}08`}}>
    <div><span style={{fontSize:12,color:V.t2}}>{label}</span>{desc&&<span style={{display:"block",fontSize:10,color:V.t3,marginTop:2}}>{desc}</span>}</div>
    <div onClick={onChange ? ()=>onChange(!checked) : undefined} style={{width:36,height:20,borderRadius:10,background:checked?V.g:V.b,cursor:"pointer",position:"relative"}}><div style={{width:16,height:16,borderRadius:8,background:"#fff",position:"absolute",top:2,left:checked?18:2,transition:"left .2s"}}/></div>
  </div>;
}

function Fd({label,value,full,children,onChange}: {label: string; value?: string | number; full?: boolean; children?: React.ReactNode; onChange?: (v: string) => void}){
  return <div style={{flex:full?"1 1 100%":"1 1 45%",minWidth:0,marginBottom:14}}>
    <span style={ls}>{label}</span>
    {children || <input style={is} value={onChange !== undefined ? (value ?? "") : undefined} defaultValue={onChange === undefined ? value : undefined} onChange={onChange ? (e)=>onChange(e.target.value) : undefined}/>}
  </div>;
}

function Bt({primary,children,onClick,style:sx}: {primary?: boolean; children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties}){
  return <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 16px",background:primary?V.em:"transparent",border:primary?"none":`1px solid ${V.b}`,borderRadius:6,color:primary?V.void:V.t2,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:S,...sx}}>{children}</button>;
}

function Dv(){return <div style={{height:1,background:V.b,margin:"16px 0"}}/>}

function TabBar({tabs,active,onSelect,small}: {tabs: {k:string;l:string}[]; active: string; onSelect: (k:string)=>void; small?: boolean}){
  return <div style={{display:"flex",gap:1,borderBottom:`1px solid ${V.b}`,marginBottom:small?14:20,overflowX:"auto"}}>
    {tabs.map(t=><button key={t.k} onClick={()=>onSelect(t.k)} style={{display:"flex",alignItems:"center",padding:small?"6px 12px":"8px 14px",background:"none",border:"none",borderBottom:active===t.k?`2px solid ${V.em}`:"2px solid transparent",color:active===t.k?V.t:V.t2,fontSize:small?11:12,fontWeight:active===t.k?600:400,cursor:"pointer",fontFamily:S,whiteSpace:"nowrap"}}>{t.l}</button>)}
  </div>;
}

function Modal({title,onClose,children}: {title: string; onClose: ()=>void; children: React.ReactNode}){
  return <div style={{position:"fixed",inset:0,zIndex:100,background:"rgba(0,0,0,.7)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:V.s,border:`1px solid ${V.b}`,borderRadius:10,padding:"24px 28px",maxWidth:560,width:"100%",maxHeight:"85vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
        <h3 style={{fontSize:16,fontWeight:700,color:V.t,margin:0,fontFamily:S}}>{title}</h3>
        <button onClick={onClose} style={{background:"none",border:"none",color:V.t3,cursor:"pointer",fontSize:18}}><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      {children}
    </div>
  </div>;
}

/* ═══════════════════════════════════════════════════
   PLACEHOLDER DATA — empty arrays until backend endpoints
   are connected. Replace with real API calls.
   ═══════════════════════════════════════════════════ */

// Checkout mock removed — using real plan data from useCheckoutPlans

// Affiliates: GET /api/products/:id/affiliates — uses /affiliate endpoints
// Coproducers: managed through /products/:id/commissions with role COPRODUCER
// Campaigns: GET /api/products/:id/campaigns — uses campaigns API

/* ═══════════════════════════════════════════════════
   PROPS
   ═══════════════════════════════════════════════════ */
interface ProductNerveCenterProps {
  productId: string;
  onBack: () => void;
  initialTab?: string;
  initialPlanSub?: string;
  initialComSub?: string;
  initialModal?: string;
  initialFocus?: string;
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
export default function ProductNerveCenter({
  productId,
  onBack,
  initialTab,
  initialPlanSub,
  initialComSub,
  initialModal,
  initialFocus,
}: ProductNerveCenterProps) {
  const router = useRouter();
  /* ── data hooks ── */
  const { product: rawProduct, isLoading: prodLoading, mutate: mutateProd } = useProduct(productId);
  const { products: workspaceProductsRaw } = useProducts();
  const p: any = rawProduct || {};
  const { updateProduct } = useProductMutations();
  const { plans: rawPlans, isLoading: plansLoading, createPlan, deletePlan, updatePlan } = useCheckoutPlans(rawProduct);

  /* ── navigation state ── */
  const [tab, setTab] = useState(initialTab || "dados");
  const [selPlan, setSelPlan] = useState<string | null>(null);
  const [planSub, setPlanSub] = useState(initialPlanSub || "loja");
  const [copied, setCopied] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(initialModal || null);
  const [productSaved, setProductSaved] = useState(false);
  const [comSub, setComSub] = useState(initialComSub || "config");
  const [ckEdit, setCkEdit] = useState<string | null>(null);

  /* ── edit form state (Dados tab) ── */
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editCep, setEditCep] = useState("");
  const [editWarranty, setEditWarranty] = useState("");
  const [editSalesUrl, setEditSalesUrl] = useState("");
  const [editThankUrl, setEditThankUrl] = useState("");
  const [editThankPix, setEditThankPix] = useState("");
  const [editThankBoleto, setEditThankBoleto] = useState("");
  const [editReclame, setEditReclame] = useState("");
  const [editSupportEmail, setEditSupportEmail] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editIsSample, setEditIsSample] = useState(false);
  const [editPrice, setEditPrice] = useState(0);
  const [editSku, setEditSku] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editFormat, setEditFormat] = useState("DIGITAL");
  const [editShippingType, setEditShippingType] = useState("NONE");
  const [editShippingValue, setEditShippingValue] = useState("");
  const [saving, setSaving] = useState(false);
  const imgStorageKey = `kloel_edit_img_${productId}`;
  const [editImageUrl, setEditImageUrl] = useState("");
  const [imageCleared, setImageCleared] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const userChangedImage = useRef(false);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const {
    previewUrl: editPreviewUrl,
    hasLocalPreview,
    clearPreview: clearEditPreview,
    setPreviewUrl: setEditPreviewUrl,
  } = usePersistentImagePreview({ storageKey: imgStorageKey });

  useEffect(() => {
    if (hasLocalPreview) {
      userChangedImage.current = true;
    }
  }, [hasLocalPreview]);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  /* ── URLs state ── */
  const [urls, setUrls] = useState<any[]>([]);
  const [urlsLoading, setUrlsLoading] = useState(false);

  /* ── Reviews state ── */
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [affiliateSummary, setAffiliateSummary] = useState<any | null>(null);
  const [affiliateLoading, setAffiliateLoading] = useState(false);

  /* ── Order bumps for selected plan ── */
  const { bumps, createBump } = useOrderBumps(selPlan);

  /* ── New plan form ── */
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanPrice, setNewPlanPrice] = useState("");
  const [newPlanQty, setNewPlanQty] = useState("1");
  const [newPlanInst, setNewPlanInst] = useState("12");

  /* ── New coupon form ── */
  const [newCouponCode, setNewCouponCode] = useState("");
  const [newCouponType, setNewCouponType] = useState("%");
  const [newCouponVal, setNewCouponVal] = useState("");
  const [newCouponMax, setNewCouponMax] = useState("");
  const [newCouponExpiresAt, setNewCouponExpiresAt] = useState("");

  /* ── New bump form ── */
  const [newBumpName, setNewBumpName] = useState("");
  const [newBumpPrice, setNewBumpPrice] = useState("");

  /* ── Sync form from product data ── */
  useEffect(() => {
    if (p?.name) {
      setEditName(p.name || "");
      setEditDesc(p.description || "");
      setEditCategory(p.category || "");
      setEditTags(Array.isArray(p.tags) ? p.tags.join(", ") : (p.tags || ""));
      setEditCep(p.originCep || "");
      setEditWarranty(String(p.warrantyDays || "7"));
      setEditSalesUrl(p.salesPageUrl || "");
      setEditThankUrl(p.thankyouUrl || "");
      setEditThankPix(p.thankyouPixUrl || "");
      setEditThankBoleto(p.thankyouBoletoUrl || "");
      setEditReclame(p.reclameAquiUrl || "");
      setEditSupportEmail(p.supportEmail || "");
      setEditActive(p.active !== false);
      setEditIsSample(p.isSample === true);
      setEditPrice(p.price || 0);
      setEditSku(p.sku || "");
      setEditSlug(p.slug || "");
      setEditFormat(p.format || "DIGITAL");
      setEditShippingType(p.shippingType || "NONE");
      setEditShippingValue(p.shippingValue ? String(p.shippingValue) : "");
      if (!userChangedImage.current && !hasLocalPreview) {
        const persistedImageUrl = p.imageUrl || "";
        setEditImageUrl((current) => persistedImageUrl || current || "");
        setImageCleared(false);
      }
    }
  }, [p?.id, p?.name, p?.description, p?.category, p?.tags, p?.originCep, p?.warrantyDays, p?.salesPageUrl, p?.thankyouUrl, p?.thankyouPixUrl, p?.thankyouBoletoUrl, p?.reclameAquiUrl, p?.supportEmail, p?.active, p?.isSample, p?.price, p?.imageUrl, p?.sku, p?.slug, p?.format, p?.shippingType, p?.shippingValue, hasLocalPreview]);

  /* ── Fetch URLs on tab ── */
  useEffect(() => {
    if (tab === "urls" && productId) {
      setUrlsLoading(true);
      apiFetch(`/products/${productId}/urls`)
        .then((res: any) => { const d = res?.data ?? res; setUrls(Array.isArray(d) ? d : d?.urls || []); })
        .catch(() => setUrls([]))
        .finally(() => setUrlsLoading(false));
    }
  }, [tab, productId]);

  /* ── Fetch Reviews on tab ── */
  useEffect(() => {
    if (tab === "avaliacoes" && productId) {
      setReviewsLoading(true);
      apiFetch(`/products/${productId}/reviews`)
        .then((res: any) => { const d = unwrapApiPayload<any[]>(res); setReviews(Array.isArray(d) ? d : []); })
        .catch(() => setReviews([]))
        .finally(() => setReviewsLoading(false));
    }
  }, [tab, productId]);

  const loadAffiliateSummary = useCallback(() => {
    if (!productId) return Promise.resolve(null);
    setAffiliateLoading(true);
    return apiFetch(`/products/${productId}/affiliates`)
      .then((res: any) => {
        const data = unwrapApiPayload<any>(res);
        setAffiliateSummary(data || null);
        return data;
      })
      .catch(() => setAffiliateSummary(null))
      .finally(() => setAffiliateLoading(false));
  }, [productId]);

  useEffect(() => {
    if (tab !== "comissao" || productId === "") return;
    void loadAffiliateSummary();
  }, [tab, productId, loadAffiliateSummary]);

  const loadCoupons = useCallback(() => {
    if (!productId) return Promise.resolve([]);
    setCouponsLoading(true);
    return apiFetch(`/products/${productId}/coupons`)
      .then((res: any) => {
        const data = unwrapApiPayload<any[]>(res);
        const nextCoupons = Array.isArray(data) ? data : [];
        setCoupons(nextCoupons);
        return nextCoupons;
      })
      .catch(() => {
        setCoupons([]);
        return [];
      })
      .finally(() => setCouponsLoading(false));
  }, [productId]);

  useEffect(() => {
    if (tab !== "cupons" || !productId) return;
    void loadCoupons();
  }, [tab, productId, loadCoupons]);

  const refreshProduct = useCallback(async () => {
    await mutateProd();
  }, [mutateProd]);

  /* ── Mapped plans ── */
  const PLANS = (rawPlans || []).map((pl: any) => ({
    id: pl.id,
    name: pl.name || "Sem nome",
    slug: pl.slug || pl.referenceCode || pl.id?.slice(0, 8),
    hasRealSlug: !!pl.slug,
    referenceCode: pl.referenceCode || null,
    ref: pl.referenceCode || pl.id?.slice(0, 6)?.toUpperCase() || "---",
    price: pl.priceInCents || 0,
    qty: pl.quantity || 1,
    active: pl.isActive !== false && pl.active !== false,
    sales: pl.salesCount || 0,
    inst: pl.maxInstallments || 1,
    vis: pl.visibleToAffiliates !== false,
    freeShip: pl.freeShipping === true,
  }));

  /* ── Mapped coupons ── */
  const COUPONS = coupons.map((c: any) => ({
    id: c.id,
    code: c.code || "",
    type: c.discountType === "FIXED" ? "R$" : "%",
    val: c.discountValue || 0,
    used: c.usedCount || 0,
    max: c.maxUses || null,
    on: c.active !== false,
    expiresAt: c.expiresAt || null,
  }));

  useEffect(() => {
    const needsPlanContext = initialTab === "planos" && (!!initialPlanSub || initialModal === "newBump");
    if (!needsPlanContext || selPlan || PLANS.length === 0) return;
    setSelPlan(PLANS[0].id);
  }, [initialTab, initialPlanSub, initialModal, selPlan, PLANS]);

  /* ── Mapped reviews ── */
  const REVIEWS = reviews.map((r: any) => ({
    id: r.id,
    rating: r.rating || 5,
    text: r.text || r.comment || "",
    name: r.name || r.authorName || "Anônimo",
    ver: r.verified === true,
  }));

  /* ── Mapped URLs ── */
  const URLS = urls.map((u: any) => ({
    id: u.id,
    desc: u.description || u.label || "",
    url: u.url || "",
    sales: u.salesCount || 0,
  }));

  const recommendedProducts = useMemo(() => {
    const currentTags = new Set(
      String(Array.isArray(p.tags) ? p.tags.join(',') : p.tags || '')
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    );
    const currentCategory = String(p.category || '').toLowerCase();

    return ((workspaceProductsRaw as any[]) || [])
      .filter((candidate) => candidate?.id && candidate.id !== productId)
      .map((candidate) => {
        const candidateTags = String(Array.isArray(candidate.tags) ? candidate.tags.join(',') : candidate.tags || '')
          .split(',')
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean);
        const sharedTags = candidateTags.filter((tag) => currentTags.has(tag)).length;
        const sameCategory = currentCategory && String(candidate.category || '').toLowerCase() === currentCategory ? 2 : 0;
        const higherTicket = Number(candidate.price || 0) >= Number(p.price || 0) ? 1 : 0;
        return {
          ...candidate,
          score: sharedTags * 2 + sameCategory + higherTicket,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [workspaceProductsRaw, productId, p.tags, p.category, p.price]);

  /* ── Helpers ── */
  const cp = (t: string, id: string) => { navigator.clipboard?.writeText(t); setCopied(id); if (copiedTimer.current) clearTimeout(copiedTimer.current); copiedTimer.current = setTimeout(()=>setCopied(null),2000); };

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (initialPlanSub) setPlanSub(initialPlanSub);
  }, [initialPlanSub]);

  useEffect(() => {
    if (initialComSub) setComSub(initialComSub);
  }, [initialComSub]);

  useEffect(() => {
    setModal(initialModal || null);
  }, [initialModal]);

  useEffect(() => {
    if (initialFocus !== "checkout-appearance" || tab !== "checkouts" || ckEdit || !PLANS[0]?.id) return;
    setCkEdit(PLANS[0].id);
  }, [initialFocus, tab, ckEdit, PLANS]);

  const handleImageUpload = async (file: File) => {
    userChangedImage.current = true;
    setImageCleared(false);
    const dataUrl = await readFileAsDataUrl(file);
    setEditPreviewUrl(dataUrl);
    setImgUploading(true);
    try {
      const uploadedUrl = await uploadGenericMedia(file, { folder: "products" });
      if (uploadedUrl) {
        setEditImageUrl(uploadedUrl);
      }
    } catch (e) { console.error("Image upload failed:", e); }
    finally { setImgUploading(false); }
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await updateProduct(productId, {
        name: editName,
        description: editDesc,
        price: editPrice,
        category: editCategory,
        tags: editTags.split(",").map(t => t.trim()).filter(Boolean),
        sku: editSku.trim() || null,
        slug: editSlug.trim() || null,
        format: editFormat,
        originCep: editCep,
        warrantyDays: parseInt(editWarranty) || 7,
        salesPageUrl: editSalesUrl,
        thankyouUrl: editThankUrl,
        thankyouPixUrl: editThankPix,
        thankyouBoletoUrl: editThankBoleto,
        reclameAquiUrl: editReclame,
        supportEmail: editSupportEmail,
        shippingType: editShippingType,
        shippingValue: editShippingType === "FIXED" ? parseCurrencyInput(editShippingValue) : null,
        active: editActive,
        isSample: editIsSample,
        imageUrl: imageCleared ? null : (editImageUrl || undefined),
      });
      await mutateProd();
      clearEditPreview();
      userChangedImage.current = false;
      setImageCleared(false);
      setProductSaved(true);
      setTimeout(()=>setProductSaved(false),2000);
    } catch(e) {
      console.error("Save error:", e);
    } finally {
      setSaving(false);
    }
  }, [productId, editName, editDesc, editPrice, editCategory, editTags, editSku, editSlug, editFormat, editCep, editWarranty, editSalesUrl, editThankUrl, editThankPix, editThankBoleto, editReclame, editSupportEmail, editShippingType, editShippingValue, editActive, editIsSample, editImageUrl, imageCleared, updateProduct, mutateProd, clearEditPreview]);

  // stubSave removed — all save handlers now call real API

  /* ── Create plan handler ── */
  const handleCreatePlan = async () => {
    if (!newPlanName) return;
    const parsedPriceInCents = Math.round(parseCurrencyInput(newPlanPrice) * 100);
    const res: any = await createPlan({
      name: newPlanName,
      priceInCents: parsedPriceInCents > 0 ? parsedPriceInCents : getFallbackPlanPriceInCents(),
      quantity: parseInt(newPlanQty) || 1,
      maxInstallments: parseInt(newPlanInst) || 12,
      brandName: editName || p.name || newPlanName,
    });
    const createdPlanId = res?.id || res?.data?.id || null;
    if (createdPlanId) {
      setSelPlan(createdPlanId);
      setPlanSub("loja");
    }
    setNewPlanName(""); setNewPlanPrice(""); setNewPlanQty("1"); setNewPlanInst("12");
    setModal(null);
  };

  /* ── Create coupon handler ── */
  const handleCreateCoupon = async () => {
    if (!newCouponCode) return;
    await unwrapApiPayload(
      await apiFetch(`/products/${productId}/coupons`, {
        method: "POST",
        body: {
          code: newCouponCode.toUpperCase(),
          discountType: newCouponType === "R$" ? "FIXED" : "PERCENT",
          discountValue: parseFloat(newCouponVal || "0") || 0,
          maxUses: newCouponMax ? parseInt(newCouponMax) : undefined,
          expiresAt: newCouponExpiresAt || undefined,
        },
      }),
    );
    setNewCouponCode("");
    setNewCouponVal("");
    setNewCouponMax("");
    setNewCouponExpiresAt("");
    await loadCoupons();
    setModal(null);
  };

  const handleDeleteCoupon = async (couponId: string) => {
    if (!confirm("Excluir cupom deste produto?")) return;
    await unwrapApiPayload(
      await apiFetch(`/products/${productId}/coupons/${couponId}`, {
        method: "DELETE",
      }),
    );
    await loadCoupons();
  };

  /* ── Create bump handler ── */
  const handleCreateBump = async () => {
    if (!newBumpName) return;
    await createBump({
      name: newBumpName,
      priceInCents: Math.round(parseFloat(newBumpPrice || "0") * 100),
    });
    setNewBumpName(""); setNewBumpPrice("");
    setModal(null);
  };

  /* ── Price display (product price is in reais, not cents) ── */
  const priceInCents = Math.round((p.price || 0) * 100);
  const getFallbackPlanPriceInCents = useCallback(() => {
    const productPrice = Math.round((Number(editPrice) || Number(p.price) || 0) * 100);
    if (productPrice > 0) return productPrice;

    const existingPlanPrice = Number(rawPlans?.[0]?.priceInCents || 0);
    if (existingPlanPrice > 0) return existingPlanPrice;

    return 100;
  }, [editPrice, p.price, rawPlans]);
  const currentImageUrl = editPreviewUrl || editImageUrl || (!imageCleared ? p.imageUrl : "");
  const primaryPlan = PLANS[0] || null;
  const primaryPlanId = primaryPlan?.id || null;
  const primaryCheckoutConfig = (rawPlans || []).find((pl: any) => pl.id === primaryPlanId)?.checkoutConfig || {};

  const openCheckoutEditor = useCallback((focus: string, planId?: string | null) => {
    const targetPlanId = planId || primaryPlanId;
    if (!targetPlanId) return;
    const params = new URLSearchParams();
    params.set("source", "products");
    params.set("productId", productId);
    params.set("focus", focus);
    if (editName || p.name) params.set("productName", editName || p.name);
    router.push(`/checkout/${targetPlanId}?${params.toString()}`);
  }, [router, primaryPlanId, productId, editName, p.name]);

  const TABS = [
    {k:"dados",l:"Dados gerais"},{k:"planos",l:"Planos"},{k:"checkouts",l:"Checkouts"},
    {k:"urls",l:"Urls"},{k:"comissao",l:"Comissionamento / Afiliação"},{k:"cupons",l:"Cupons de Desconto"},
    {k:"campanhas",l:"Campanhas"},{k:"avaliacoes",l:"Avaliações"},{k:"afterpay",l:"After Pay"},{k:"ia",l:"IA"},
  ];

  /* ═══════════════════════════════════════════════════
     LOADING STATE
     ═══════════════════════════════════════════════════ */
  if (prodLoading) {
    return (
      <div style={{background:V.void,minHeight:"100vh",fontFamily:S,color:V.t,padding:28,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{textAlign:"center"}}>
          <div style={{width:40,height:40,border:`3px solid ${V.b}`,borderTopColor:V.em,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 16px"}}/>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <p style={{color:V.t2,fontSize:14}}>Carregando produto...</p>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     HEADER
     ═══════════════════════════════════════════════════ */
  function Header() {
    const totalSales = PLANS.reduce((s: number, pl: any) => s + (pl.sales || 0), 0);
    return (
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <Bt onClick={onBack}>← Produtos</Bt>
          <span style={{fontSize:13,fontWeight:600,color:V.t}}>{editName || p.name || "Produto"}</span>
          <Bg color={editActive?V.g:V.r}>{editActive?"ACTIVE":"INACTIVE"}</Bg>
        </div>
        <div style={{...cs,padding:20,display:"flex",gap:20,alignItems:"center"}}>
          <div onClick={() => imgInputRef.current?.click()} style={{width:80,height:80,borderRadius:8,background:"rgba(255,255,255,0.03)",border:`1px solid ${V.b}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,padding:6}}>
            {currentImageUrl ? (
              <img src={currentImageUrl} alt="" style={{objectFit:"contain",maxWidth:"100%",maxHeight:"100%",borderRadius:4}} />
            ) : (
              <span style={{display:"flex",flexDirection:"column",alignItems:"center"}}><svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={V.t3} strokeWidth={1.5}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg><span style={{fontSize:7,color:V.t3,marginTop:2}}>Foto</span></span>
            )}
          </div>
          <input ref={imgInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{display:"none"}} onChange={e => { const f = e.target.files?.[0]; if (f) void handleImageUpload(f); e.target.value = ""; }} />
          <div style={{flex:1}}>
            <h1 style={{fontSize:18,fontWeight:700,color:V.t,margin:"0 0 4px",fontFamily:S}}>{editName || p.name || "Produto"}</h1>
            <div style={{display:"flex",gap:10,fontSize:12,color:V.t2}}>
              <span>{editCategory || p.category || "Sem categoria"}</span>
              <span style={{fontFamily:M,fontWeight:600,color:V.em}}>{R$(priceInCents)}</span>
              <span style={{color:V.t3}}>·</span>
              <span>Código: <span style={{fontFamily:M,color:V.t}}>{editSlug || editSku || p.slug || p.sku || p.id?.slice(0,12)}</span></span>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <span style={{fontFamily:M,fontSize:28,fontWeight:700,color:V.em}}>{totalSales}</span>
            <span style={{fontSize:10,color:V.t3,marginLeft:4}}>vendas</span>
            <div style={{marginTop:4}}><NP w={90} h={18} intensity={Math.max(0.1, totalSales/100)}/></div>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     DADOS GERAIS TAB
     ═══════════════════════════════════════════════════ */
  function DadosTab() {
    return (
      <div style={{...cs,padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
          <h2 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>Dados do produto</h2>
          <Bt primary onClick={save}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{display:"inline",verticalAlign:"middle",marginRight:4}}><polyline points="20 6 9 17 4 12"/></svg>{productSaved?"Salvo!":saving?"Salvando...":"Salvar"}</Bt>
        </div>
        <div style={{display:"flex",gap:20,marginBottom:20}}>
          <div style={{width:200,flexShrink:0}}>
            <MediaPreviewBox
              inputAriaLabel="Foto do produto"
              previewUrl={editPreviewUrl}
              fallbackUrl={imageCleared ? "" : (editImageUrl || p.imageUrl)}
              uploading={imgUploading}
              emptySubtitle="JPG/PNG/GIF · Max 10MB"
              emptyTitle="Arraste ou clique"
              onSelectFile={(file) => {
                void handleImageUpload(file);
              }}
              onClear={() => {
                userChangedImage.current = true;
                clearEditPreview();
                setEditImageUrl("");
                setImageCleared(true);
              }}
              theme={{
                accentColor: V.em,
                borderColor: V.b,
                frameBackground: "rgba(255,255,255,0.03)",
                labelColor: V.t3,
                mutedColor: V.t3,
                textColor: V.t2,
              }}
              layout={{
                minHeight: 160,
                padding: 12,
                imageMaxWidth: "100%",
                imageMaxHeight: "100%",
                borderRadius: 8,
              }}
            />
          </div>
          <div style={{flex:1}}>
            <Fd label="Nome" value={editName} onChange={setEditName} full/>
            <Fd label="Descrição" full>
              <textarea style={{...is,height:80,resize:"vertical"}} value={editDesc} onChange={e=>setEditDesc(e.target.value)}/>
            </Fd>
          </div>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:"0 20px"}}>
          <Fd label="Preço (R$)" value={editPrice.toFixed(2)} onChange={(value)=>setEditPrice(parseCurrencyInput(value))}/>
          <Fd label="Categoria" value={editCategory} onChange={setEditCategory}/>
          <Fd label="SKU" value={editSku} onChange={setEditSku}/>
          <Fd label="Slug" value={editSlug} onChange={setEditSlug}/>
          <Fd label="Formato">
            <select style={is} value={editFormat} onChange={e=>setEditFormat(e.target.value)}>
              <option value="DIGITAL">Digital</option>
              <option value="PHYSICAL">Físico</option>
              <option value="HYBRID">Híbrido</option>
            </select>
          </Fd>
          <Fd label="Tags" value={editTags} onChange={setEditTags}/>
          <Fd label="CEP de origem" value={editCep} onChange={setEditCep}/>
          <Fd label="Garantia (dias)" value={editWarranty} onChange={setEditWarranty}/>
          <Fd label="URL página de vendas" value={editSalesUrl} onChange={setEditSalesUrl} full/>
          <Fd label="URL obrigado" value={editThankUrl} onChange={setEditThankUrl} full/>
          <Fd label="URL obrigado Pix" value={editThankPix} onChange={setEditThankPix} full/>
          <Fd label="URL obrigado Boleto" value={editThankBoleto} onChange={setEditThankBoleto} full/>
          <Fd label="URL Reclame Aqui" value={editReclame} onChange={setEditReclame} full/>
          <Fd label="E-mail suporte" value={editSupportEmail} onChange={setEditSupportEmail}/>
          <Fd label="Tipo de frete">
            <select style={is} value={editShippingType} onChange={e=>setEditShippingType(e.target.value)}>
              <option value="NONE">Sem frete</option>
              <option value="FREE">Frete grátis</option>
              <option value="FIXED">Frete fixo</option>
              <option value="VARIABLE">Frete variável</option>
            </select>
          </Fd>
          {editShippingType === "FIXED" && <Fd label="Valor do frete (R$)" value={editShippingValue} onChange={setEditShippingValue}/>}
        </div>

        <Tg label="Disponível para venda?" checked={editActive} onChange={setEditActive}/>
        <Tg label="É Amostra?" checked={editIsSample} onChange={setEditIsSample}/>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     PLANOS TAB
     ═══════════════════════════════════════════════════ */
  function PlanosTab() {
    if (selPlan) {
      const plan = PLANS.find((pl: any) => pl.id === selPlan);
      if (plan) return <PlanDetail plan={plan}/>;
    }
    return (<>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
        <h2 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>Planos cadastrados</h2>
        <Bt primary onClick={()=>setModal("newPlan")}>+ Novo plano</Bt>
      </div>
      {plansLoading ? (
        <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Carregando planos...</span></div>
      ) : PLANS.length === 0 ? (
        <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Nenhum plano cadastrado</span></div>
      ) : (
        <div style={{...cs,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 2fr .6fr .8fr .7fr .7fr .7fr 1.2fr",padding:"10px 16px",borderBottom:`1px solid ${V.b}`,background:V.e}}>
            {["Código","Nome","Itens","Valor","Afiliados","Status","Vendas","Ações"].map(h=>
              <span key={h} style={{fontSize:9,fontWeight:600,color:V.t3,letterSpacing:".08em",textTransform:"uppercase"}}>{h}</span>
            )}
          </div>
          {PLANS.map((pl: any, i: number)=>(
            <div key={pl.id} style={{display:"grid",gridTemplateColumns:"1fr 2fr .6fr .8fr .7fr .7fr .7fr 1.2fr",padding:"12px 16px",borderBottom:i<PLANS.length-1?`1px solid ${V.b}`:"none",alignItems:"center"}}>
              <span style={{fontFamily:M,fontSize:11,color:V.t2}}>{pl.ref}</span>
              <span style={{fontSize:12,fontWeight:500,color:V.t,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pl.name}</span>
              <span style={{fontFamily:M,fontSize:12,color:V.t2,textAlign:"center"}}>{pl.qty}</span>
              <span style={{fontFamily:M,fontSize:12,fontWeight:600,color:V.em}}>{R$(pl.price)}</span>
              <Bg color={pl.vis?V.g:V.t3}>{pl.vis?"VISÍVEL":"OCULTO"}</Bg>
              <Bg color={pl.active?V.g:V.r}>{pl.active?"ATIVO":"OFF"}</Bg>
              <span style={{fontFamily:M,fontSize:12,fontWeight:700,color:pl.sales>0?V.em:V.t3,textAlign:"center"}}>{pl.sales}</span>
              <div style={{display:"flex",gap:4}}>
                <Bt onClick={()=>setSelPlan(pl.id)} style={{padding:"4px 8px",color:V.bl}}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></Bt>
                <Bt onClick={()=>cp(pl.id,"plan-"+pl.id)} style={{padding:"4px 8px",color:copied==="plan-"+pl.id?V.g:V.p}}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></Bt>
                <Bt onClick={()=>setModal("links-"+pl.id)} style={{padding:"4px 8px",color:V.em}}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></Bt>
              </div>
            </div>
          ))}
        </div>
      )}
    </>);
  }

  /* ═══════════════════════════════════════════════════
     PLAN DETAIL
     ═══════════════════════════════════════════════════ */
  function PlanDetail({plan}: {plan: any}) {
    const currentPlanRaw = (rawPlans || []).find((candidate: any) => candidate.id === plan.id) || {};
    const [planName, setPlanName] = useState(plan.name);
    const [planPrice, setPlanPrice] = useState((plan.price / 100).toFixed(2));
    const [planQty, setPlanQty] = useState(String(plan.qty));
    const [planInst, setPlanInst] = useState(String(plan.inst));
    const [planFreeShipping, setPlanFreeShipping] = useState(plan.freeShip);
    const [planVisible, setPlanVisible] = useState(plan.vis);
    const [planThankCard, setPlanThankCard] = useState(currentPlanRaw.thankyouUrl || "");
    const [planThankPix, setPlanThankPix] = useState(currentPlanRaw.thankyouPixUrl || "");
    const [planThankBoleto, setPlanThankBoleto] = useState(currentPlanRaw.thankyouBoletoUrl || "");
    const [planSaving, setPlanSaving] = useState(false);
    const [planSaved, setPlanSaved] = useState(false);
    useEffect(() => {
      setPlanName(plan.name);
      setPlanPrice((plan.price / 100).toFixed(2));
      setPlanQty(String(plan.qty));
      setPlanInst(String(plan.inst));
      setPlanFreeShipping(plan.freeShip);
      setPlanVisible(plan.vis);
      setPlanThankCard(currentPlanRaw.thankyouUrl || "");
      setPlanThankPix(currentPlanRaw.thankyouPixUrl || "");
      setPlanThankBoleto(currentPlanRaw.thankyouBoletoUrl || "");
    }, [plan.id, plan.name, plan.price, plan.qty, plan.inst, plan.freeShip, plan.vis, currentPlanRaw.thankyouUrl, currentPlanRaw.thankyouPixUrl, currentPlanRaw.thankyouBoletoUrl]);
    const subs=[{k:"loja",l:"Loja"},{k:"pagamento",l:"Pagamento"},{k:"frete",l:"Frete"},{k:"afiliacao",l:"Afiliação"},{k:"bump",l:"Order Bump"},{k:"obrigado",l:"Pág. Obrigado"}];
    const realBumps = (bumps || []).map((b: any) => ({
      id: b.id,
      name: b.name || "Order Bump",
      desc: b.description || "",
      price: b.priceInCents || 0,
      oldPrice: b.originalPriceInCents || 0,
      active: b.active !== false,
    }));
    return (<>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <Bt onClick={()=>setSelPlan(null)}>← Planos</Bt>
        <span style={{fontSize:13,fontWeight:600,color:V.t}}>{plan.name}</span>
        <Bg color={plan.active?V.g:V.r}>{plan.active?"ATIVO":"OFF"}</Bg>
      </div>
      <div style={{...cs,padding:16,marginBottom:16,display:"flex",alignItems:"center",gap:16}}>
        <div><span style={{fontFamily:M,fontSize:28,fontWeight:700,color:V.em}}>{R$(plan.price)}</span><span style={{display:"block",fontSize:10,color:V.t3}}>{plan.qty} un · Até {plan.inst}x</span></div>
        <NP w={120} h={22} intensity={Math.max(0.1, plan.sales/100)}/>
        <div style={{marginLeft:"auto",textAlign:"right"}}><span style={{fontFamily:M,fontSize:20,fontWeight:700,color:V.t}}>{plan.sales}</span><span style={{display:"block",fontSize:9,color:V.t3}}>VENDAS</span></div>
        <div style={{borderLeft:`1px solid ${V.b}`,paddingLeft:14}}><span style={{fontSize:9,color:V.t3}}>CHECKOUT</span><br/><span style={{fontFamily:M,fontSize:11,color:V.em}}>{buildPublicCheckoutUrl(plan.slug)}</span></div>
      </div>
      <TabBar tabs={subs} active={planSub} onSelect={setPlanSub} small/>
      <div style={{...cs,padding:20}}>
        {planSub==="loja"&&<><h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 16px"}}>Config da loja</h3><Tg label="Disponível para venda?" checked={plan.active} onChange={async(v: boolean)=>{try{await updatePlan(selPlan!,{isActive:v})}catch(e){console.error(e)}}}/><Dv/><Fd label="Nome" value={planName} onChange={setPlanName} full/><div style={{display:"flex",gap:16}}><Fd label="Valor (R$)" value={planPrice} onChange={setPlanPrice}/><Fd label="Qtd itens" value={planQty} onChange={setPlanQty}/></div><div style={{...cs,padding:12,marginTop:8,background:V.e}}><span style={{fontSize:10,color:V.t3,display:"block",marginBottom:6}}>Checkout público gerado pelo Kloel</span><span style={{fontFamily:M,fontSize:11,color:V.em}}>{buildPublicCheckoutUrl(plan.slug)}</span></div></>}
        {planSub==="pagamento"&&<><h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 16px"}}>Pagamento</h3><p style={{fontSize:11,color:V.t3,margin:"0 0 12px"}}>O checkout é criado e operado pelo Kloel. Ajuste parcelas e oferta aqui; meios de pagamento ficam no editor do checkout.</p><Fd label="Parcelas máx" value={planInst} onChange={setPlanInst}/></>}
        {planSub==="frete"&&<><h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 16px"}}>Frete</h3><Tg label="Frete grátis?" checked={planFreeShipping} onChange={setPlanFreeShipping}/><div style={{...cs,padding:12,marginTop:12,background:V.e}}><span style={{fontSize:10,color:V.t3,display:"block",marginBottom:4}}>Política atual</span><span style={{fontSize:12,color:V.t2}}>{planFreeShipping ? "Este plano não adiciona frete ao checkout." : `${SHIPPING_LABELS[editShippingType] || "Frete herdado do produto"}${editShippingType === "FIXED" && editShippingValue ? ` · ${Number(parseCurrencyInput(editShippingValue)).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}` : ""}`}</span></div></>}
        {planSub==="afiliacao"&&<><h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 16px"}}>Afiliação</h3><p style={{fontSize:11,color:V.t3,margin:"0 0 12px"}}>Defina se este plano fica visível para afiliados aprovados e acompanhe a comissão pelo programa do produto.</p><Tg label="Plano visível para afiliados?" checked={planVisible} onChange={setPlanVisible}/><div style={{...cs,padding:14,marginTop:12,background:V.e}}><span style={{fontSize:12,fontWeight:600,color:V.t,marginBottom:8,display:"block"}}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{display:"inline",verticalAlign:"middle",marginRight:4}}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Projeção de comissão</span><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,textAlign:"center"}}>{[10,50,100].map(n=><div key={n}><span style={{fontSize:9,color:V.t3}}>{n} vendas</span><br/><span style={{fontFamily:M,fontSize:16,fontWeight:700,color:V.g2}}>R$ {((parseCurrencyInput(planPrice)||0)*((Number(p.commissionPercent)||30)/100)*n).toLocaleString("pt-BR")}</span></div>)}</div></div></>}
        {planSub==="bump"&&<><div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:0}}>Order Bumps</h3><Bt primary onClick={()=>setModal("newBump")}>+ Adicionar</Bt></div>{realBumps.length > 0 ? realBumps.map((b: any) => (
          <div key={b.id} style={{...cs,padding:14,display:"flex",alignItems:"center",gap:12,background:V.e,position:"relative",overflow:"hidden",marginBottom:8}}>
            <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:V.em}}/>
            <span style={{display:"inline-flex",alignItems:"center",color:V.em}}><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg></span>
            <div style={{flex:1}}><span style={{fontSize:13,fontWeight:600,color:V.t}}>{b.name}</span><br/><span style={{fontSize:11,color:V.t2}}>{b.desc}</span></div>
            <div style={{textAlign:"right"}}>{b.oldPrice > 0 && <><span style={{fontFamily:M,fontSize:10,color:V.t3,textDecoration:"line-through"}}>{R$(b.oldPrice)}</span><br/></>}<span style={{fontFamily:M,fontSize:16,fontWeight:700,color:V.em}}>{R$(b.price)}</span></div>
            <Bg color={b.active?V.g:V.r}>{b.active?"ATIVO":"OFF"}</Bg>
          </div>
        )) : (
          <div style={{...cs,padding:14,display:"flex",alignItems:"center",gap:12,background:V.e,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:V.em}}/>
            <span style={{display:"inline-flex",alignItems:"center",color:V.em}}><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg></span>
            <div style={{flex:1}}><span style={{fontSize:13,color:V.t3}}>Nenhum order bump cadastrado</span></div>
          </div>
        )}</>}
        {planSub==="obrigado"&&<><h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 16px"}}>Página de obrigado</h3><Fd label="URL obrigado (cartão)" value={planThankCard} onChange={setPlanThankCard} full/><Fd label="URL obrigado Pix" value={planThankPix} onChange={setPlanThankPix} full/><Fd label="URL obrigado Boleto" value={planThankBoleto} onChange={setPlanThankBoleto} full/><Dv/><div style={{display:"flex",gap:10}}><Bt primary onClick={()=>openCheckoutEditor("checkout-appearance", plan.id)}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{display:"inline",verticalAlign:"middle",marginRight:4}}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Editor Visual de Checkout</Bt><Bt onClick={()=>window.open(buildPublicCheckoutUrl(plan.slug), "_blank", "noopener,noreferrer")}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{display:"inline",verticalAlign:"middle",marginRight:4}}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Preview</Bt></div></>}
      </div>
      <Bt primary onClick={async ()=>{setPlanSaving(true);try{await updatePlan(selPlan!,{name:planName,priceInCents:Math.round(parseCurrencyInput(planPrice)*100),quantity:parseInt(planQty)||1,maxInstallments:parseInt(planInst)||1,freeShipping:planFreeShipping,visibleToAffiliates:planVisible,thankyouUrl:planThankCard || null,thankyouPixUrl:planThankPix || null,thankyouBoletoUrl:planThankBoleto || null});setPlanSaved(true);setTimeout(()=>setPlanSaved(false),2000)}catch(e){console.error(e)}finally{setPlanSaving(false)}}} style={{marginTop:16,width:"100%",justifyContent:"center"}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{display:"inline",verticalAlign:"middle",marginRight:4}}><polyline points="20 6 9 17 4 12"/></svg>{planSaved?"Salvo!":planSaving?"Salvando...":"Salvar"}</Bt>
    </>);
  }

  /* ═══════════════════════════════════════════════════
     CHECKOUTS TAB
     ═══════════════════════════════════════════════════ */
  const CKS = (rawPlans || []).map((pl: any) => {
    const cfg = pl.checkoutConfig || {};
    const mt: string[] = [];
    if (cfg.enablePix !== false) mt.push("PIX");
    if (cfg.enableCreditCard !== false) mt.push("CARTÃO");
    if (cfg.enableBoleto) mt.push("BOLETO");
    return {
      id: pl.id,
      code: pl.referenceCode || pl.slug || pl.id.slice(0,8),
      slug: pl.slug || null,
      hasRealSlug: !!pl.slug,
      referenceCode: pl.referenceCode || null,
      desc: pl.name || "Checkout",
      mt,
      sales: Number(pl.salesCount || 0),
      active: pl.isActive !== false && pl.active !== false,
      installments: Number(pl.maxInstallments || 1),
      quantity: Number(pl.quantity || 1),
      coupon: cfg.enableCoupon !== false,
      urgency: !!cfg.enableTimer || !!cfg.showStockCounter,
      popup: !!cfg.showCouponPopup,
    };
  });
  const handleNewCheckout = async () => {
    try {
      const checkoutName = "Checkout " + ((rawPlans || []).length + 1);
      const res: any = await createPlan({
        name: checkoutName,
        priceInCents: getFallbackPlanPriceInCents(),
        quantity: 1,
        maxInstallments: 12,
        brandName: editName || p.name || checkoutName,
      });
      const createdPlanId = res?.id || res?.data?.id || null;
      if (!createdPlanId) throw new Error("Nenhum checkout foi criado");
      openCheckoutEditor("checkout-appearance", createdPlanId);
    } catch (error) {
      console.error("Checkout creation error:", error);
      if (typeof window !== "undefined") {
        window.alert("Nao foi possivel criar o checkout agora. Tente novamente.");
      }
    }
  };
  const handleDeleteCheckout = async (id: string) => { await deletePlan(id); };

  function CheckoutsTab() {
    if(ckEdit) return <CkConfig/>;
    return (<>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h2 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>Checkouts disponíveis</h2><Bt primary onClick={handleNewCheckout}>+ Novo checkout</Bt></div>
      <div style={{...cs,padding:16,marginBottom:16,background:initialFocus==="checkout-appearance"?`${V.em}08`:V.s,border:initialFocus==="checkout-appearance"?`1px solid ${V.em}25`:`1px solid ${V.b}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:V.t}}>Checkout como peça central da oferta</div>
            <div style={{fontSize:11,color:V.t3,marginTop:4,lineHeight:1.6}}>
              {primaryPlanId
                ? `O checkout principal deste produto é ${primaryPlan?.name || "o primeiro plano criado"}. Ajuste aparência, cupom, contagem regressiva e prova social sem sair do fluxo comercial.`
                : "Crie o primeiro checkout para configurar aparência, cupom, urgência e rastreamento da oferta."}
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {primaryPlanId && <Bt primary onClick={() => openCheckoutEditor("checkout-appearance", primaryPlanId)}>Abrir editor visual</Bt>}
            {primaryPlanId && <Bt onClick={() => openCheckoutEditor("coupon", primaryPlanId)}>Cupom e popup</Bt>}
            {primaryPlanId && <Bt onClick={() => openCheckoutEditor("urgency", primaryPlanId)}>Urgência</Bt>}
          </div>
        </div>
      </div>
      <div style={{...cs,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:".9fr 1.6fr 1fr .7fr 1fr 1.1fr .7fr 1.1fr",padding:"10px 14px",borderBottom:`1px solid ${V.b}`,background:V.e}}>
          {["Código","Descrição","Pagamento","Vendas","Oferta","Comercial","Status","Ações"].map(h=><span key={h} style={{fontSize:8,fontWeight:600,color:V.t3,letterSpacing:".06em",textTransform:"uppercase"}}>{h}</span>)}
        </div>
        {CKS.length === 0 ? (
          <div style={{padding:"24px 16px",textAlign:"center"}}><span style={{color:V.t3,fontSize:12}}>Nenhum checkout criado</span></div>
        ) : CKS.map((ck: any,i: number)=>(
          <div key={ck.id} style={{display:"grid",gridTemplateColumns:".9fr 1.6fr 1fr .7fr 1fr 1.1fr .7fr 1.1fr",padding:"10px 14px",borderBottom:i<CKS.length-1?`1px solid ${V.b}`:"none",alignItems:"center"}}>
            <span style={{fontFamily:M,fontSize:10,color:V.t3}}>{ck.code}</span>
            <span style={{fontSize:11,fontWeight:500,color:V.t,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ck.desc}</span>
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{ck.mt.map((m: string)=><Bg key={m} color={m==="BOLETO"?V.pk:m==="PIX"?V.g2:V.bl}>{m}</Bg>)}</div>
            <span style={{fontFamily:M,fontSize:11,fontWeight:600,color:ck.sales>0?V.em:V.t2,textAlign:"center"}}>{ck.sales}</span>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              <span style={{fontFamily:M,fontSize:11,color:V.t}}>Até {ck.installments}x</span>
              <span style={{fontSize:10,color:V.t3}}>{ck.quantity} item{ck.quantity === 1 ? "" : "s"}</span>
            </div>
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
              <Bg color={ck.coupon ? V.g2 : V.t3}>{ck.coupon ? "CUPOM" : "SEM CUPOM"}</Bg>
              <Bg color={ck.urgency ? V.y : V.t3}>{ck.urgency ? "URGÊNCIA" : "NORMAL"}</Bg>
              {ck.popup && <Bg color={V.pk}>POPUP</Bg>}
            </div>
            <Bg color={ck.active ? V.g : V.r}>{ck.active ? "ATIVO" : "OFF"}</Bg>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              <Bt onClick={()=>setCkEdit(ck.id)} style={{padding:"4px 6px",color:V.bl}}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></Bt>
              <Bt onClick={()=>openCheckoutEditor(initialFocus==="urgency"?"urgency":"checkout-appearance", ck.id)} style={{padding:"4px 6px",color:V.em}}>↗</Bt>
              {ck.hasRealSlug && <Bt onClick={()=>cp(buildPublicCheckoutUrl(ck.slug), `checkout-url-${ck.id}`)} style={{padding:"4px 6px",color:copied===`checkout-url-${ck.id}`?V.g:V.p}}>{copied===`checkout-url-${ck.id}`?"✓":"⎘"}</Bt>}
              <Bt onClick={()=>handleDeleteCheckout(ck.id)} style={{padding:"4px 6px",color:V.r}}>x</Bt>
            </div>
          </div>
        ))}
      </div>
    </>);
  }

  /* ═══════════════════════════════════════════════════
     CHECKOUT CONFIG
     ═══════════════════════════════════════════════════ */
  function CkConfig() {
    const { config: ckCfg, updateConfig: saveCkCfg, isLoading: ckLoading } = useCheckoutConfig(ckEdit);
    const [ckLocal, setCkLocal] = useState<any>({});
    const [ckSaving, setCkSaving] = useState(false);
    const [ckSaved, setCkSaved] = useState(false);
    const planForCk = (rawPlans||[]).find((pl: any) => pl.id === ckEdit);
    useEffect(() => { if (ckCfg) setCkLocal(ckCfg); }, [ckCfg]);
    const patch = (k: string, v: any) => setCkLocal((p: any) => ({ ...p, [k]: v }));
    const handleCkSave = async () => {
      setCkSaving(true);
      try {
        const { id, planId, plan, createdAt, updatedAt, pixels, ...rest } = ckLocal;
        await saveCkCfg(rest);
        if (planForCk && ckLocal.brandName !== planForCk.name) {
          await updatePlan(ckEdit!, { name: ckLocal.brandName || planForCk.name });
        }
        setCkSaved(true); setTimeout(() => setCkSaved(false), 2000);
      } catch (e) { console.error("Checkout config save error:", e); }
      finally { setCkSaving(false); }
    };
    if (ckLoading) return <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Carregando...</span></div>;
    return (<>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}><Bt onClick={()=>setCkEdit(null)}>← Checkouts</Bt><span style={{fontSize:13,fontWeight:600,color:V.t}}>Configurações — {planForCk?.name || "Checkout"}</span></div>
      <div style={{...cs,padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap",padding:"12px 14px",marginBottom:16,background:V.e,border:`1px solid ${V.b}`,borderRadius:6}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:V.em,fontFamily:M,letterSpacing:".06em"}}>COMERCIAL</div>
            <div style={{fontSize:12,color:V.t2,marginTop:4}}>
              {`Cupom ${ckLocal.enableCoupon!==false?"ativo":"desligado"} · Timer ${ckLocal.enableTimer?"ativo":"desligado"} · Popup ${ckLocal.showCouponPopup?"ativo":"desligado"}`}
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <Bt onClick={() => openCheckoutEditor("checkout-appearance", ckEdit)}>Editor completo</Bt>
            <Bt onClick={() => openCheckoutEditor("coupon", ckEdit)}>Focar cupom</Bt>
            <Bt onClick={() => openCheckoutEditor("urgency", ckEdit)}>Focar urgência</Bt>
          </div>
        </div>
        <Fd label="Nome / Descrição *" value={ckLocal.brandName||""} onChange={(v: string)=>patch("brandName",v)} full/>
        <Dv/>
        <h4 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 12px"}}>Pagamento</h4>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:14}}>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:V.t2,cursor:"pointer"}}><input type="checkbox" checked={ckLocal.enableCreditCard!==false} onChange={e=>patch("enableCreditCard",e.target.checked)} style={{accentColor:V.em,width:16,height:16}}/>Cartão de crédito</label>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:V.t2,cursor:"pointer"}}><input type="checkbox" checked={ckLocal.enablePix!==false} onChange={e=>patch("enablePix",e.target.checked)} style={{accentColor:V.em,width:16,height:16}}/>Pix</label>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:V.t2,cursor:"pointer"}}><input type="checkbox" checked={!!ckLocal.enableBoleto} onChange={e=>patch("enableBoleto",e.target.checked)} style={{accentColor:V.em,width:16,height:16}}/>Boleto</label>
        </div>
        <Dv/>
        <Tg label="Cupom de desconto?" checked={ckLocal.enableCoupon!==false} onChange={(v: boolean)=>patch("enableCoupon",v)}/>
        {ckLocal.enableCoupon!==false && <Fd label="Cupom automático" value={ckLocal.autoCouponCode||""} onChange={(v: string)=>patch("autoCouponCode",v)}/>}
        <Dv/>
        <h4 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 12px"}}>Contador</h4>
        <Tg label="Usar contador?" checked={!!ckLocal.enableTimer} onChange={(v: boolean)=>patch("enableTimer",v)}/>
        {ckLocal.enableTimer && <div style={{display:"flex",gap:16}}><Fd label="Minutos" value={String(ckLocal.timerMinutes||15)} onChange={(v: string)=>patch("timerMinutes",parseInt(v)||15)}/><Fd label="Mensagem" value={ckLocal.timerMessage||""} onChange={(v: string)=>patch("timerMessage",v)}/></div>}
        <Dv/>
        <h4 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 12px"}}>Personalizar</h4>
        <Fd label="Cor principal" value={ckLocal.accentColor||"#E85D30"} onChange={(v: string)=>patch("accentColor",v)}/>
        <Fd label="Cor fundo" value={ckLocal.backgroundColor||""} onChange={(v: string)=>patch("backgroundColor",v)}/>
        <Fd label="Texto do botão" value={ckLocal.btnFinalizeText||"Finalizar compra"} onChange={(v: string)=>patch("btnFinalizeText",v)} full/>
        <Fd label="Layout"><select style={is} value={ckLocal.theme||"BLANC"} onChange={e=>patch("theme",e.target.value)}><option value="NOIR">Noir (Escuro)</option><option value="BLANC">Blanc (Claro)</option></select></Fd>
        <Dv/>
        <h4 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 12px"}}>Social Proof</h4>
        <Tg label="Depoimentos?" checked={ckLocal.enableTestimonials!==false} onChange={(v: boolean)=>patch("enableTestimonials",v)}/>
        <Tg label="Garantia?" checked={ckLocal.enableGuarantee!==false} onChange={(v: boolean)=>patch("enableGuarantee",v)}/>
        <Dv/>
        <Tg label="Popup Exit Intent?" checked={!!ckLocal.showCouponPopup} onChange={(v: boolean)=>patch("showCouponPopup",v)}/>
        <div style={{display:"flex",gap:12,marginTop:20}}><Bt onClick={()=>setCkEdit(null)}>← Voltar</Bt><Bt primary onClick={handleCkSave} style={{marginLeft:"auto"}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{display:"inline",verticalAlign:"middle",marginRight:4}}><polyline points="20 6 9 17 4 12"/></svg>{ckSaved?"Salvo!":ckSaving?"Salvando...":"Salvar"}</Bt></div>
      </div>
    </>);
  }

  /* ═══════════════════════════════════════════════════
     URLS TAB
     ═══════════════════════════════════════════════════ */
  function UrlsTab() {
    const [newUrlDesc, setNewUrlDesc] = useState("");
    const [newUrlVal, setNewUrlVal] = useState("");
    const handleAddUrl = async () => {
      if (!newUrlDesc.trim() || !newUrlVal.trim()) return;
      try {
        const res: any = await apiFetch(`/products/${productId}/urls`, { method: "POST", body: { description: newUrlDesc.trim(), url: newUrlVal.trim() } });
        setUrls((prev: any) => [res?.data ?? res, ...prev]);
        setNewUrlDesc(""); setNewUrlVal("");
      } catch (e) { console.error("Add URL error:", e); }
    };
    const handleDeleteUrl = async (urlId: string) => {
      try {
        await apiFetch(`/products/${productId}/urls/${urlId}`, { method: "DELETE" });
        setUrls((prev: any) => prev.filter((u: any) => u.id !== urlId));
      } catch (e) { console.error("Delete URL error:", e); }
    };
    return (<>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h2 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>URLs do produto</h2></div>
      <div style={{...cs,padding:16,marginBottom:16}}>
        <h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 12px"}}>Adicionar URL</h3>
        <div style={{display:"flex",gap:12}}><div style={{flex:"0 0 25%"}}><span style={ls}>Descrição</span><input style={is} placeholder="Ex: PV" value={newUrlDesc} onChange={e=>setNewUrlDesc(e.target.value)}/></div><div style={{flex:1}}><span style={ls}>URL</span><input style={is} placeholder="https://..." value={newUrlVal} onChange={e=>setNewUrlVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddUrl()}/></div><div style={{display:"flex",alignItems:"flex-end"}}><Bt primary onClick={handleAddUrl}>+ Adicionar</Bt></div></div>
      </div>
      {urlsLoading ? (
        <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Carregando URLs...</span></div>
      ) : (
        <div style={{...cs,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 2.5fr .7fr .5fr",padding:"10px 16px",borderBottom:`1px solid ${V.b}`,background:V.e}}>
            {["Descrição","URL","Vendas",""].map(h=><span key={h} style={{fontSize:9,fontWeight:600,color:V.t3,letterSpacing:".08em",textTransform:"uppercase"}}>{h}</span>)}
          </div>
          {URLS.length === 0 ? (
            <div style={{padding:"20px 16px",textAlign:"center"}}><span style={{color:V.t3,fontSize:12}}>Nenhuma URL cadastrada</span></div>
          ) : URLS.map((u: any,i: number)=>(
            <div key={u.id} style={{display:"grid",gridTemplateColumns:"1fr 2.5fr .7fr .5fr",padding:"12px 16px",borderBottom:i<URLS.length-1?`1px solid ${V.b}`:"none",alignItems:"center"}}>
              <span style={{fontSize:12,color:V.t}}>{u.desc}</span>
              <span style={{fontFamily:M,fontSize:11,color:V.em}}>{u.url}</span>
              <span style={{fontFamily:M,fontSize:11,color:V.t3}}>{u.sales}</span>
              <Bt onClick={()=>handleDeleteUrl(u.id)} style={{padding:"3px 6px",color:V.r}}>x</Bt>
            </div>
          ))}
        </div>
      )}
    </>);
  }

  /* ═══════════════════════════════════════════════════
     COMISSIONAMENTO TAB
     ═══════════════════════════════════════════════════ */
  // Commission/affiliate management: uses /affiliate and /products/:id endpoints
  // Affiliate/coproducer data now loaded inside each sub-tab

  function ComissaoTab() {
    const subs=[{k:"config",l:"Configurações"},{k:"afiliados",l:"Afiliados"},{k:"merchan",l:"Merchan"},{k:"termos",l:"Termos"},{k:"coprod",l:"Coprodução / Gerência"}];
    const [affEnabled, setAffEnabled] = useState(p.affiliateEnabled ?? false);
    const [affVisible, setAffVisible] = useState(p.affiliateVisible ?? false);
    const [affAutoApprove, setAffAutoApprove] = useState(p.affiliateAutoApprove ?? true);
    const [affAccessData, setAffAccessData] = useState(p.affiliateAccessData ?? true);
    const [affAccessAbandoned, setAffAccessAbandoned] = useState(p.affiliateAccessAbandoned ?? true);
    const [affFirstInstallment, setAffFirstInstallment] = useState(p.affiliateFirstInstallment ?? false);
    const [comType, setComType] = useState(p.commissionType ?? "last_click");
    const [comCookie, setComCookie] = useState(String(p.commissionCookieDays ?? 180));
    const [comPercent, setComPercent] = useState(String(p.commissionPercent ?? 30));
    const [comLastClick, setComLastClick] = useState(String(p.commissionLastClickPercent ?? 70));
    const [comOther, setComOther] = useState(String(p.commissionOtherClicksPercent ?? 30));
    const [comSaving, setComSaving] = useState(false);
    const [comSaved, setComSaved] = useState(false);
    const handleComSave = async () => {
      setComSaving(true);
      try {
        const summary = unwrapApiPayload(await apiFetch(`/products/${productId}/affiliates`, {
          method: "PUT",
          body: {
          affiliateEnabled: affEnabled, affiliateVisible: affVisible, affiliateAutoApprove: affAutoApprove,
          affiliateAccessData: affAccessData, affiliateAccessAbandoned: affAccessAbandoned, affiliateFirstInstallment: affFirstInstallment,
          commissionType: comType, commissionCookieDays: parseInt(comCookie) || 180, commissionPercent: parseFloat(comPercent) || 30,
          commissionLastClickPercent: comType === "proportional" ? parseFloat(comLastClick) || 70 : undefined,
          commissionOtherClicksPercent: comType === "proportional" ? parseFloat(comOther) || 30 : undefined,
          },
        }));
        setAffiliateSummary(summary);
        await refreshProduct();
        setComSaved(true); setTimeout(() => setComSaved(false), 2000);
      } catch (e) { console.error("Commission save error:", e); }
      finally { setComSaving(false); }
    };
    return (<>
      <TabBar tabs={subs} active={comSub} onSelect={setComSub} small/>
      {comSub==="config"&&<div style={{...cs,padding:24}}>
        <h3 style={{fontSize:16,fontWeight:600,color:V.t,margin:"0 0 12px"}}>Programa de Afiliados</h3>
        <div style={{...cs,padding:12,marginBottom:16,background:`${V.y}08`,border:`1px solid ${V.y}20`}}><span style={{fontSize:11,color:V.y,display:"inline-flex",alignItems:"center",gap:4}}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Configurações aplicam apenas para novas afiliações.</span></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 24px"}}><Tg label="Participar?" checked={affEnabled} onChange={setAffEnabled} desc="Ativa o programa de afiliados para este produto"/><Tg label="Acesso dados?" checked={affAccessData} onChange={setAffAccessData} desc="Afiliado vê dados completos do cliente"/><Tg label="Visível loja?" checked={affVisible} onChange={setAffVisible} desc="Produto aparece no marketplace para afiliados"/><Tg label="Acesso abandonos?" checked={affAccessAbandoned} onChange={setAffAccessAbandoned} desc="Afiliado vê leads que abandonaram checkout"/><Tg label="Aprovação auto?" checked={affAutoApprove} onChange={setAffAutoApprove} desc="Afiliados são aprovados instantaneamente"/><Tg label="Comissão 1ª parcela?" checked={affFirstInstallment} onChange={setAffFirstInstallment} desc="Para assinaturas: comissão só na primeira parcela"/></div>
        <Dv/>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}><Fd label="Comissionamento"><select style={is} value={comType} onChange={e=>setComType(e.target.value)}><option value="first_click">Primeiro Clique</option><option value="last_click">Último Clique</option><option value="proportional">Divisão Proporcional</option></select></Fd><Fd label="Cookie (dias)" value={comCookie} onChange={setComCookie}/><Fd label="Comissão (%)" value={comPercent} onChange={setComPercent}/></div>
        {comType==="proportional"&&<div style={{display:"flex",gap:16,marginTop:12}}><Fd label="Último Clique (%)" value={comLastClick} onChange={(v: string)=>{setComLastClick(v);setComOther(String(100-( parseFloat(v)||0)))}}/><Fd label="Demais Cliques (%)" value={comOther} onChange={(v: string)=>{setComOther(v);setComLastClick(String(100-(parseFloat(v)||0)))}}/></div>}
        <Bt primary onClick={handleComSave} style={{marginTop:16}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{display:"inline",verticalAlign:"middle",marginRight:4}}><polyline points="20 6 9 17 4 12"/></svg>{comSaved?"Salvo!":comSaving?"Salvando...":"Salvar"}</Bt>
      </div>}
      {comSub==="afiliados"&&<AfiliadosSubTab/>}
      {comSub==="merchan"&&<MerchanSubTab/>}
      {comSub==="termos"&&<TermosSubTab/>}
      {comSub==="coprod"&&<CoprodSubTab/>}
    </>);
  }

  function AfiliadosSubTab() {
    const stats = affiliateSummary?.stats || {};
    const requests = affiliateSummary?.requests || [];
    const links = affiliateSummary?.links || [];
    const affiliateProduct = affiliateSummary?.affiliateProduct;
    const [requestActionId, setRequestActionId] = useState<string | null>(null);
    const [linkActionId, setLinkActionId] = useState<string | null>(null);

    const handleRequestAction = async (requestId: string, action: "approve" | "reject") => {
      setRequestActionId(`${action}-${requestId}`);
      try {
        const summary = unwrapApiPayload(await apiFetch(`/products/${productId}/affiliates/requests/${requestId}/${action}`, {
          method: "POST",
        }));
        setAffiliateSummary(summary);
      } catch (e) {
        console.error(`Affiliate request ${action} error:`, e);
      } finally {
        setRequestActionId(null);
      }
    };

    const handleLinkToggle = async (linkId: string, active: boolean) => {
      setLinkActionId(linkId);
      try {
        const summary = unwrapApiPayload(await apiFetch(`/products/${productId}/affiliates/links/${linkId}`, {
          method: "PUT",
          body: { active },
        }));
        setAffiliateSummary(summary);
      } catch (e) {
        console.error("Affiliate link toggle error:", e);
      } finally {
        setLinkActionId(null);
      }
    };

    return (<div style={{...cs,padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16,alignItems:"center",gap:12,flexWrap:"wrap"}}><h3 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>Afiliados</h3><div style={{fontSize:11,color:V.t3}}>Pedidos, aprovações e links ativos deste produto</div></div>
      {affiliateLoading ? (
        <div style={{padding:32,textAlign:"center",fontSize:12,color:V.t3}}>Carregando afiliados...</div>
      ) : (
        <>
          <div style={{...cs,padding:14,marginBottom:16,background:affiliateProduct?.listed?`${V.g}08`:`${V.y}08`,border:affiliateProduct?.listed?`1px solid ${V.g}20`:`1px solid ${V.y}20`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:affiliateProduct?.listed?V.g:V.y,fontFamily:M,letterSpacing:".06em"}}>{affiliateProduct?.listed ? "PROGRAMA PUBLICADO" : "PROGRAMA FORA DO MARKETPLACE"}</div>
                <div style={{fontSize:11,color:V.t2,marginTop:4}}>
                  {affiliateProduct
                    ? `Aprovação ${affiliateProduct.approvalMode === "AUTO" ? "automática" : "manual"} · comissão ${Number(affiliateProduct.commissionPct || 0).toFixed(1)}% · cookie ${affiliateProduct.cookieDays || 0} dias.`
                    : "Salve as configurações para criar a infraestrutura real de afiliação e começar a receber solicitações."}
                </div>
              </div>
              <Bg color={affiliateProduct?.listed ? V.g : V.y}>{affiliateProduct?.listed ? "ATIVO" : "RASCUNHO"}</Bg>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,marginBottom:16}}>
            {[["Solicitações", stats.requests || 0],["Pendentes", stats.pendingRequests || 0],["Links ativos", stats.activeLinks || 0],["Comissão gerada", `R$ ${Number(stats.commission || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]].map(([label, value])=>(
              <div key={String(label)} style={{...cs,padding:14,background:V.e}}>
                <div style={{fontSize:10,color:V.t3,marginBottom:6,textTransform:"uppercase",letterSpacing:".06em"}}>{label}</div>
                <div style={{fontFamily:M,fontSize:18,fontWeight:700,color:V.t}}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1.1fr .9fr",gap:16}} className="grid2">
            <div style={{...cs,padding:16,background:V.e}}>
              <div style={{fontSize:12,fontWeight:600,color:V.t,marginBottom:10}}>Solicitações recentes</div>
              {requests.length === 0 ? <div style={{fontSize:12,color:V.t3}}>Nenhuma solicitação recebida ainda.</div> : requests.slice(0, 6).map((request: any)=>(
                <div key={request.id} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"10px 0",borderBottom:`1px solid ${V.b}`}}>
                  <div>
                    <div style={{fontSize:12,color:V.t,fontWeight:600}}>{request.affiliateName || request.affiliateEmail || "Afiliado"}</div>
                    <div style={{fontSize:10,color:V.t3}}>{request.affiliateEmail || "Sem email"}{request.createdAt ? ` · ${new Date(request.createdAt).toLocaleDateString("pt-BR")}` : ""}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <Bg color={request.status === "APPROVED" ? V.g : request.status === "REJECTED" ? V.r : V.y}>{request.status || "PENDING"}</Bg>
                    {request.status === "PENDING" && (
                      <>
                        <Bt primary onClick={() => handleRequestAction(request.id, "approve")} style={{padding:"4px 8px"}}>
                          {requestActionId === `approve-${request.id}` ? "Aprovando..." : "Aprovar"}
                        </Bt>
                        <Bt onClick={() => handleRequestAction(request.id, "reject")} style={{padding:"4px 8px",color:V.r}}>
                          {requestActionId === `reject-${request.id}` ? "Recusando..." : "Recusar"}
                        </Bt>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div style={{...cs,padding:16,background:V.e}}>
              <div style={{fontSize:12,fontWeight:600,color:V.t,marginBottom:10}}>Links ativos</div>
              {links.length === 0 ? <div style={{fontSize:12,color:V.t3}}>Nenhum link ativo gerado ainda.</div> : links.slice(0, 6).map((link: any)=>(
                <div key={link.id} style={{padding:"10px 0",borderBottom:`1px solid ${V.b}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                    <div style={{fontSize:12,color:V.t,fontWeight:600}}>{link.affiliateName || link.affiliateEmail || "Afiliado"}</div>
                    <Bg color={link.active ? V.g : V.t3}>{link.active ? "ATIVO" : "OFF"}</Bg>
                  </div>
                  <div style={{fontSize:10,color:V.t3,marginTop:4}}>Cliques {link.clicks || 0} · Vendas {link.sales || 0}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginTop:6}}>
                    <span style={{fontFamily:M,fontSize:10,color:V.em,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{link.code || link.slug || link.id}</span>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                      <Bt onClick={()=>cp(link.url || link.code || "", `aff-${link.id}`)} style={{padding:"4px 8px"}}>{copied===`aff-${link.id}` ? "Copiado" : "Copiar"}</Bt>
                      <Bt onClick={() => handleLinkToggle(link.id, !link.active)} style={{padding:"4px 8px"}}>
                        {linkActionId === link.id ? "Salvando..." : link.active ? "Desativar" : "Ativar"}
                      </Bt>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>);
  }

  /* ── Merchan sub-tab ── */
  function MerchanSubTab() {
    const [merchan, setMerchan] = useState(p.merchandContent || "");
    const [mSaving, setMSaving] = useState(false);
    const [mSaved, setMSaved] = useState(false);
    const edRef = useRef<any>(null);
    const handleSaveMerchan = async () => {
      setMSaving(true);
      try {
        const summary = unwrapApiPayload(await apiFetch(`/products/${productId}/affiliates`, {
          method: "PUT",
          body: { merchandContent: edRef.current?.innerHTML || merchan },
        }));
        setAffiliateSummary(summary);
        await refreshProduct();
        setMSaved(true); setTimeout(()=>setMSaved(false),2000);
      } catch(e){ console.error(e); }
      finally { setMSaving(false); }
    };
    return (<div style={{...cs,padding:24}}><h3 style={{fontSize:16,fontWeight:600,color:V.t,margin:"0 0 8px"}}>Merchan</h3><p style={{fontSize:12,color:V.t2,marginBottom:16}}>Materiais para afiliados.</p><div style={{background:V.e,border:`1px solid ${V.b}`,borderRadius:6,padding:12}}><div style={{display:"flex",gap:4,marginBottom:12}}>{["B","I","U"].map(t=><button key={t} onClick={()=>document.execCommand(t==="B"?"bold":t==="I"?"italic":"underline")} style={{width:28,height:28,background:"transparent",border:`1px solid ${V.b}`,borderRadius:4,color:V.t2,fontSize:12,cursor:"pointer",fontWeight:t==="B"?"bold":"normal",fontStyle:t==="I"?"italic":"normal",textDecoration:t==="U"?"underline":"none"}}>{t}</button>)}<button onClick={()=>{const url=prompt("URL do link:");if(url)document.execCommand("createLink",false,url)}} style={{width:28,height:28,background:"transparent",border:`1px solid ${V.b}`,borderRadius:4,color:V.t2,fontSize:12,cursor:"pointer"}}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></button></div><div ref={edRef} contentEditable dangerouslySetInnerHTML={{__html:sanitizeHtml(merchan)}} onInput={e=>setMerchan((e.target as any).innerHTML)} style={{minHeight:140,color:V.t2,fontSize:13,outline:"none",fontFamily:S}} suppressContentEditableWarning/></div><Bt primary onClick={handleSaveMerchan} style={{marginTop:16}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{display:"inline",verticalAlign:"middle",marginRight:4}}><polyline points="20 6 9 17 4 12"/></svg>{mSaved?"Salvo!":mSaving?"Salvando...":"Salvar"}</Bt></div>);
  }

  /* ── Termos sub-tab ── */
  function TermosSubTab() {
    const [terms, setTerms] = useState(p.affiliateTerms || "");
    const [tSaving, setTSaving] = useState(false);
    const [tSaved, setTSaved] = useState(false);
    const edRef = useRef<any>(null);
    const handleSaveTerms = async () => {
      setTSaving(true);
      try {
        const summary = unwrapApiPayload(await apiFetch(`/products/${productId}/affiliates`, {
          method: "PUT",
          body: { affiliateTerms: edRef.current?.innerHTML || terms },
        }));
        setAffiliateSummary(summary);
        await refreshProduct();
        setTSaved(true); setTimeout(()=>setTSaved(false),2000);
      } catch(e){ console.error(e); }
      finally { setTSaving(false); }
    };
    return (<div style={{...cs,padding:24}}><h3 style={{fontSize:16,fontWeight:600,color:V.t,margin:"0 0 8px"}}>Termos de uso</h3><div style={{background:V.e,border:`1px solid ${V.b}`,borderRadius:6,padding:12}}><div style={{display:"flex",gap:4,marginBottom:12}}>{["B","I","U"].map(t=><button key={t} onClick={()=>document.execCommand(t==="B"?"bold":t==="I"?"italic":"underline")} style={{width:28,height:28,background:"transparent",border:`1px solid ${V.b}`,borderRadius:4,color:V.t2,fontSize:12,cursor:"pointer",fontWeight:t==="B"?"bold":"normal",fontStyle:t==="I"?"italic":"normal",textDecoration:t==="U"?"underline":"none"}}>{t}</button>)}<button onClick={()=>{const url=prompt("URL do link:");if(url)document.execCommand("createLink",false,url)}} style={{width:28,height:28,background:"transparent",border:`1px solid ${V.b}`,borderRadius:4,color:V.t2,fontSize:12,cursor:"pointer"}}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></button></div><div ref={edRef} contentEditable dangerouslySetInnerHTML={{__html:sanitizeHtml(terms)}} onInput={e=>setTerms((e.target as any).innerHTML)} style={{minHeight:140,color:V.t2,fontSize:13,outline:"none",fontFamily:S}} suppressContentEditableWarning/></div><Bt primary onClick={handleSaveTerms} style={{marginTop:16}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{display:"inline",verticalAlign:"middle",marginRight:4}}><polyline points="20 6 9 17 4 12"/></svg>{tSaved?"Salvo!":tSaving?"Salvando...":"Salvar"}</Bt></div>);
  }

  /* ── Coprodução sub-tab (connected to /products/:id/commissions API) ── */
  function CoprodSubTab() {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ role: "COPRODUCER", percentage: "", agentName: "", agentEmail: "" });
    const [creating, setCreating] = useState(false);

    const fetchCommissions = () => {
      apiFetch<any>(`/products/${productId}/commissions`)
        .then(r => {
          const d = unwrapApiPayload<any[]>(r);
          setItems((Array.isArray(d) ? d : []).filter((c: any) => ["COPRODUCER","MANAGER"].includes(c.role)));
        })
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    };
    useEffect(() => { fetchCommissions(); }, [productId]);

    const handleCreate = async () => {
      setCreating(true);
      try {
        await apiFetch(`/products/${productId}/commissions`, {
          method: "POST",
          body: { ...form, percentage: parseFloat(form.percentage) || 0 },
        });
        setShowForm(false);
        setForm({ role: "COPRODUCER", percentage: "", agentName: "", agentEmail: "" });
        fetchCommissions();
      } catch (e) { console.error(e); }
      finally { setCreating(false); }
    };

    const handleDelete = async (id: string) => {
      if (!confirm("Excluir coprodutor?")) return;
      await apiFetch(`/products/${productId}/commissions/${id}`, { method: "DELETE" });
      fetchCommissions();
    };

    const inputSt: React.CSSProperties = { width:"100%", background:V.e, border:`1px solid ${V.b}`, borderRadius:6, padding:"10px 14px", fontSize:13, color:V.t2, outline:"none", fontFamily:S };

    return (<div style={{...cs,padding:24}}>
      {initialFocus === "coproduction" && (
        <div style={{background:`${V.em}08`,border:`1px solid ${V.em}18`,borderRadius:6,padding:14,marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:V.em,fontFamily:M,letterSpacing:".06em"}}>COPRODUÇÃO</div>
            <div style={{fontSize:12,color:V.t2,marginTop:4}}>Cadastre parceiros com divisão automática de receita e acompanhe o impacto em vendas e repasses.</div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <Bt onClick={() => router.push('/parcerias?tab=afiliados')}>Abrir parcerias</Bt>
            <Bt onClick={() => router.push('/vendas?tab=estrategias')}>Ver estratégias</Bt>
          </div>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h3 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>Coprodução e gerência</h3>
        <Bt primary onClick={()=>setShowForm(!showForm)}>+ Adicionar parceiro</Bt>
      </div>
      {showForm && (
        <div style={{background:V.e,border:`1px solid ${V.b}`,borderRadius:6,padding:16,marginBottom:16}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:600,color:V.t3,marginBottom:4,textTransform:"uppercase",letterSpacing:".08em"}}>Papel</label>
              <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})} style={inputSt}>
                <option value="COPRODUCER">Coprodutor</option>
                <option value="MANAGER">Gerente</option>
              </select>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div><label style={{display:"block",fontSize:10,fontWeight:600,color:V.t3,marginBottom:4,textTransform:"uppercase",letterSpacing:".08em"}}>Nome</label><input value={form.agentName} onChange={e=>setForm({...form,agentName:e.target.value})} style={inputSt} placeholder="Nome do coprodutor"/></div>
            <div><label style={{display:"block",fontSize:10,fontWeight:600,color:V.t3,marginBottom:4,textTransform:"uppercase",letterSpacing:".08em"}}>E-mail</label><input value={form.agentEmail} onChange={e=>setForm({...form,agentEmail:e.target.value})} style={inputSt} placeholder="email@exemplo.com"/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div><label style={{display:"block",fontSize:10,fontWeight:600,color:V.t3,marginBottom:4,textTransform:"uppercase",letterSpacing:".08em"}}>Comissão (%)</label><input type="number" step="0.1" value={form.percentage} onChange={e=>setForm({...form,percentage:e.target.value})} style={inputSt} placeholder="10.0"/></div>
            <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
              <Bt primary onClick={handleCreate} style={{flex:1}}>{creating?"Salvando...":"Adicionar"}</Bt>
              <Bt onClick={()=>setShowForm(false)}>Cancelar</Bt>
            </div>
          </div>
        </div>
      )}
      {loading ? (
        <div style={{padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Carregando...</span></div>
      ) : items.length === 0 ? (
        <div style={{padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Nenhum parceiro cadastrado</span></div>
      ) : items.map((c: any)=>(
        <div key={c.id} style={{background:V.e,border:`1px solid ${V.b}`,borderRadius:6,padding:14,marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:6,background:"rgba(232,93,48,0.12)",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={V.em} strokeWidth={2}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <div style={{fontSize:14,fontWeight:600,color:V.t}}>{c.agentName||"Sem nome"}</div>
              <Bg color={c.role === "MANAGER" ? V.bl : V.em}>{c.role === "MANAGER" ? "GERENTE" : "COPRODUTOR"}</Bg>
            </div>
            <div style={{fontSize:11,color:V.t3}}>{c.agentEmail||"—"}</div>
          </div>
          <div style={{textAlign:"right",marginRight:8}}>
            <span style={{fontFamily:M,fontSize:15,fontWeight:700,color:V.em}}>{Number(c.percentage).toFixed(1)}%</span>
            <div style={{fontSize:9,color:V.t3}}>comissão</div>
          </div>
          <button onClick={()=>handleDelete(c.id)} style={{background:"transparent",border:"none",cursor:"pointer",color:V.t3,padding:4}} title="Excluir"><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
        </div>
      ))}
    </div>);
  }

  /* ═══════════════════════════════════════════════════
     CUPONS TAB
     ═══════════════════════════════════════════════════ */
  function CuponsTab() {
    return (<>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h2 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>Cupons</h2><Bt primary onClick={()=>setModal("newCoupon")}>+ Criar cupom</Bt></div>
      <div style={{...cs,padding:16,marginBottom:16,background:initialFocus==="coupon"?`${V.em}08`:V.s,border:initialFocus==="coupon"?`1px solid ${V.em}25`:`1px solid ${V.b}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:V.t}}>Cupom de recuperação</div>
            <div style={{fontSize:11,color:V.t3,marginTop:4,lineHeight:1.6}}>
              {primaryPlanId
                ? `Checkout principal ${primaryCheckoutConfig.enableCoupon!==false?"já aceita":"ainda não aceita"} cupom. ${primaryCheckoutConfig.autoCouponCode ? `Cupom automático atual: ${primaryCheckoutConfig.autoCouponCode}.` : "Você pode aplicar um cupom automático no popup e no exit intent."}`
                : "Crie um checkout para aplicar cupons automáticos e popup de recuperação."}
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {primaryPlanId && <Bt primary onClick={() => openCheckoutEditor("coupon", primaryPlanId)}>Abrir no checkout</Bt>}
            {primaryPlanId && <Bt onClick={() => openCheckoutEditor("order-bump", primaryPlanId)}>Ver bump junto</Bt>}
          </div>
        </div>
      </div>
      {couponsLoading ? (
        <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Carregando cupons...</span></div>
      ) : COUPONS.length === 0 ? (
        <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Nenhum cupom cadastrado</span></div>
      ) : COUPONS.map((c: any)=>(<div key={c.id} style={{...cs,padding:16,marginBottom:8,display:"flex",alignItems:"center",gap:14,position:"relative",overflow:"hidden"}}><div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:c.on?V.em:V.t3}}/><span style={{display:"inline-flex",alignItems:"center",color:V.t2}}><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></span><div style={{flex:1}}><span style={{fontFamily:M,fontSize:15,fontWeight:700,color:V.t,letterSpacing:".06em"}}>{c.code}</span><br/><span style={{fontSize:11,color:V.t2}}>{c.type==="%" ? `${c.val}% de desconto` : `R$ ${Number(c.val || 0).toFixed(2)} de desconto`}</span>{c.expiresAt && <span style={{display:"block",fontSize:10,color:V.t3,marginTop:4}}>Expira em {new Date(c.expiresAt).toLocaleDateString("pt-BR")}</span>}</div><div style={{textAlign:"right"}}><span style={{fontFamily:M,fontSize:14,fontWeight:600,color:V.t}}>{c.used}</span><br/><span style={{fontSize:9,color:V.t3}}>usos{c.max?` / ${c.max}`:""}</span></div><div style={{display:"flex",alignItems:"center",gap:8}}><Bg color={c.on?V.g:V.t3}>{c.on?"ATIVO":"OFF"}</Bg><Bt onClick={() => handleDeleteCoupon(c.id)} style={{padding:"4px 8px",color:V.r}}>Excluir</Bt></div></div>))}
    </>);
  }

  /* ═══════════════════════════════════════════════════
     CAMPANHAS TAB
     ═══════════════════════════════════════════════════ */
  function CampanhasTab() {
    const [camps, setCamps] = useState<any[]>([]);
    const [campsLoading, setCampsLoading] = useState(true);
    const [showCampForm, setShowCampForm] = useState(false);
    const [campName, setCampName] = useState("");
    const [campPixel, setCampPixel] = useState("");
    const [campMessage, setCampMessage] = useState("");
    const [campBusyId, setCampBusyId] = useState<string | null>(null);
    const loadCampaigns = useCallback(() => {
      setCampsLoading(true);
      return apiFetch(`/products/${productId}/campaigns`)
        .then((r: any) => {
          const d = unwrapApiPayload<any[]>(r);
          setCamps(Array.isArray(d) ? d : []);
        })
        .catch(() => setCamps([]))
        .finally(() => setCampsLoading(false));
    }, [productId]);
    useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);
    const handleCreateCamp = async () => {
      if (!campName.trim()) return;
      try {
        const res: any = await apiFetch(`/products/${productId}/campaigns`, {
          method: "POST",
          body: {
            name: campName.trim(),
            pixelId: campPixel.trim() || null,
            messageTemplate: campMessage.trim() || undefined,
          },
        });
        const created = unwrapApiPayload<any>(res);
        setCamps(prev => [created, ...prev]);
        setCampName("");
        setCampPixel("");
        setCampMessage("");
        setShowCampForm(false);
      } catch (e) { console.error(e); }
    };
    const handleLaunchCamp = async (id: string, smartTime = false) => {
      setCampBusyId(`launch-${id}`);
      try {
        await unwrapApiPayload(await apiFetch(`/products/${productId}/campaigns/${id}/launch`, {
          method: "POST",
          body: { smartTime },
        }));
        await loadCampaigns();
      } catch (e) {
        console.error(e);
      } finally {
        setCampBusyId(null);
      }
    };
    const handlePauseCamp = async (id: string) => {
      setCampBusyId(`pause-${id}`);
      try {
        await unwrapApiPayload(await apiFetch(`/products/${productId}/campaigns/${id}/pause`, {
          method: "POST",
        }));
        await loadCampaigns();
      } catch (e) {
        console.error(e);
      } finally {
        setCampBusyId(null);
      }
    };
    const handleDeleteCamp = async (id: string) => {
      try {
        await unwrapApiPayload(await apiFetch(`/products/${productId}/campaigns/${id}`, { method: "DELETE" }));
        setCamps(prev => prev.filter((c: any) => c.id !== id));
      } catch (e) { console.error(e); }
    };
    if (campsLoading) return <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Carregando...</span></div>;
    return (<>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h2 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>Campanhas Registradas</h2><Bt primary onClick={()=>setShowCampForm(!showCampForm)}>+ Nova Campanha</Bt></div>
      <div style={{...cs,padding:16,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:V.t}}>Recomendações do Kloel</div>
            <div style={{fontSize:11,color:V.t3,marginTop:4}}>Use produtos complementares, site e checkout para empilhar receita sem sair deste fluxo.</div>
          </div>
          <Bg color={V.em}>RECOMENDA</Bg>
        </div>
        {recommendedProducts.length > 0 ? (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
            {recommendedProducts.map((candidate: any) => (
              <div key={candidate.id} style={{background:V.e,border:`1px solid ${V.b}`,borderRadius:6,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:8}}>
                  <div style={{fontSize:13,fontWeight:600,color:V.t}}>{candidate.name || 'Produto complementar'}</div>
                  <span style={{fontFamily:M,fontSize:11,color:V.em}}>{R$(Math.round(Number(candidate.price || 0) * 100))}</span>
                </div>
                <div style={{fontSize:11,color:V.t2,lineHeight:1.5,minHeight:34}}>
                  {candidate.category ? `Mesma frente comercial: ${candidate.category}.` : 'Produto pronto para virar oferta complementar no checkout e na página.'}
                </div>
                <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
                  <Bt onClick={() => router.push(`/products/${candidate.id}`)} style={{padding:"6px 12px"}}>Abrir produto</Bt>
                  <Bt onClick={() => router.push(`/sites/criar?source=products&productId=${productId}&productName=${encodeURIComponent(editName || p.name || '')}`)} style={{padding:"6px 12px"}}>Usar no site</Bt>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:V.t2}}>Nenhum produto complementar encontrado ainda. Crie outra oferta para começar a recomendar no checkout e na página.</span>
            <Bt onClick={() => router.push('/products/new')}>Criar nova oferta</Bt>
          </div>
        )}
        <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
          <Bt onClick={() => router.push(`/products/${productId}?tab=planos&planSub=bump&focus=order-bump`)} style={{padding:"6px 12px"}}>Configurar order bump</Bt>
          <Bt onClick={() => router.push(`/sites/criar?source=products&productId=${productId}&productName=${encodeURIComponent(editName || p.name || '')}`)} style={{padding:"6px 12px"}}>Criar página de venda</Bt>
          <Bt onClick={() => router.push(`/marketing/email?source=products&productId=${productId}`)} style={{padding:"6px 12px"}}>Acionar marketing</Bt>
        </div>
      </div>
      {showCampForm && <div style={{...cs,padding:16,marginBottom:16}}><div style={{display:"flex",gap:12,flexWrap:"wrap"}}><Fd label="Nome da campanha" value={campName} onChange={setCampName}/><Fd label="Pixel ID (opcional)" value={campPixel} onChange={setCampPixel}/><Fd label="Mensagem base" full><textarea style={{...is,height:72}} value={campMessage} onChange={e=>setCampMessage(e.target.value)} placeholder="Mensagem inicial que será enviada para a audiência desta campanha."/></Fd></div><div style={{display:"flex",gap:8,marginTop:8}}><Bt primary onClick={handleCreateCamp}>Criar</Bt><Bt onClick={()=>setShowCampForm(false)}>Cancelar</Bt></div></div>}
      {camps.length === 0 ? <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:12}}>Nenhuma campanha criada</span></div> : (
      <div style={{...cs,overflow:"hidden"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1.5fr 1fr 1fr 1.2fr",padding:"10px 14px",borderBottom:`1px solid ${V.b}`,background:V.e}}>{["Cód.","Nome","Status","Envios","Ações"].map(h=><span key={h} style={{fontSize:9,fontWeight:600,color:V.t3,letterSpacing:".08em",textTransform:"uppercase"}}>{h}</span>)}</div>
      {camps.map((c: any,i: number)=>(<div key={c.id} style={{display:"grid",gridTemplateColumns:"1fr 1.5fr 1fr 1fr 1.2fr",padding:"10px 14px",borderBottom:i<camps.length-1?`1px solid ${V.b}`:"none",alignItems:"center",gap:8}}><span style={{fontFamily:M,fontSize:10,color:V.t3}}>{c.code?.slice(0,8)||c.id.slice(0,8)}</span><div><span style={{fontSize:12,color:V.t,display:"block"}}>{c.name}</span>{c.messageTemplate && <span style={{fontSize:10,color:V.t3,display:"block",marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.messageTemplate}</span>}</div><div><Bg color={c.status==="COMPLETED"?V.g:c.status==="RUNNING"||c.status==="SCHEDULED"?V.bl:V.t3}>{c.status||"DRAFT"}</Bg></div><span style={{fontFamily:M,fontSize:11,color:V.t2,textAlign:"center"}}>{c.sentCount||0} / {c.deliveredCount||0}</span><div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>{(c.status==="RUNNING"||c.status==="SCHEDULED") ? <Bt onClick={()=>handlePauseCamp(c.id)} style={{padding:"4px 8px"}}>{campBusyId===`pause-${c.id}`?"Pausando...":"Pausar"}</Bt> : <Bt primary onClick={()=>handleLaunchCamp(c.id,false)} style={{padding:"4px 8px"}}>{campBusyId===`launch-${c.id}`?"Lançando...":"Lançar"}</Bt>}<Bt onClick={()=>handleLaunchCamp(c.id,true)} style={{padding:"4px 8px"}}>{campBusyId===`launch-${c.id}`?"Agendando...":"Smart time"}</Bt><Bt onClick={()=>handleDeleteCamp(c.id)} style={{padding:"4px 8px",color:V.r}}>Excluir</Bt></div></div>))}</div>)}
    </>);
  }

  /* ═══════════════════════════════════════════════════
     AVALIAÇÕES TAB
     ═══════════════════════════════════════════════════ */
  function AvalTab() {
    const [newRevName, setNewRevName] = useState("");
    const [newRevRating, setNewRevRating] = useState(5);
    const [newRevText, setNewRevText] = useState("");
    const [newRevVer, setNewRevVer] = useState(false);
    const [showRevForm, setShowRevForm] = useState(false);
    const handleCreateReview = async () => {
      if (!newRevName.trim()) return;
      try {
        const res: any = await apiFetch(`/products/${productId}/reviews`, { method: "POST", body: { authorName: newRevName.trim(), rating: newRevRating, comment: newRevText.trim(), verified: newRevVer } });
        const created = unwrapApiPayload<any>(res);
        setReviews((prev: any) => [created, ...prev]); setShowRevForm(false); setNewRevName(""); setNewRevText(""); setNewRevRating(5); setNewRevVer(false);
      } catch (e) { console.error(e); }
    };
    const handleDeleteReview = async (id: string) => {
      try { await apiFetch(`/products/${productId}/reviews/${id}`, { method: "DELETE" }); setReviews((prev: any) => prev.filter((r: any) => r.id !== id)); } catch(e){ console.error(e); }
    };
    if (reviewsLoading) return <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Carregando avaliações...</span></div>;
    return (<>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h2 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>Avaliações</h2><Bt primary onClick={()=>setShowRevForm(!showRevForm)}>+ Criar avaliação</Bt></div>
      {showRevForm && <div style={{...cs,padding:16,marginBottom:16}}>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}><Fd label="Nome do autor" value={newRevName} onChange={setNewRevName}/><Fd label="Nota"><div style={{display:"flex",gap:4}}>{[1,2,3,4,5].map(i=><span key={i} onClick={()=>setNewRevRating(i)} style={{cursor:"pointer",fontSize:18,color:i<=newRevRating?V.y:V.t3}}><svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg></span>)}</div></Fd></div>
        <Fd label="Texto" full><textarea style={{...is,height:60}} value={newRevText} onChange={e=>setNewRevText(e.target.value)} placeholder="Texto da avaliação..."/></Fd>
        <Tg label="Verificado?" checked={newRevVer} onChange={setNewRevVer}/>
        <Bt primary onClick={handleCreateReview} style={{marginTop:8}}>Criar</Bt>
      </div>}
      {REVIEWS.length === 0 ? <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Nenhuma avaliação ainda</span></div> : <>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20}}>
        <div style={{textAlign:"center"}}><span style={{fontFamily:M,fontSize:48,fontWeight:700,color:V.y}}>{(REVIEWS.reduce((s: number,r: any)=>s+r.rating,0)/REVIEWS.length).toFixed(1)}</span><div style={{display:"flex",gap:2,justifyContent:"center",marginTop:4}}>{[1,2,3,4,5].map(i=><span key={i} style={{color:i<=Math.round(REVIEWS.reduce((s: number,r: any)=>s+r.rating,0)/REVIEWS.length)?V.y:V.t3}}><svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg></span>)}</div><span style={{fontSize:10,color:V.t3}}>{REVIEWS.length} avaliações</span></div>
        <div style={{flex:1}}>{[5,4,3,2,1].map(n=>{const ct=REVIEWS.filter((r: any)=>r.rating===n).length;return <div key={n} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontFamily:M,fontSize:10,color:V.t2,width:16}}>{n}<svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{display:"inline",verticalAlign:"middle",marginLeft:1}}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg></span><div style={{flex:1,height:6,background:V.e,borderRadius:3,overflow:"hidden"}}><div style={{width:`${(ct/REVIEWS.length)*100}%`,height:"100%",background:V.y,borderRadius:3}}/></div><span style={{fontFamily:M,fontSize:10,color:V.t3,width:20}}>{ct}</span></div>})}</div>
      </div>
      {REVIEWS.map((r: any)=>(<div key={r.id} style={{...cs,padding:16,marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><div style={{width:28,height:28,borderRadius:6,background:V.e,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:M,fontSize:10,fontWeight:700,color:V.t2}}>{r.name.split(" ").map((w: string)=>w[0]).join("")}</div><span style={{fontSize:13,fontWeight:600,color:V.t}}>{r.name}</span>{r.ver&&<Bg color={V.g}>VERIFICADO</Bg>}<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>{[1,2,3,4,5].map(i=><span key={i} style={{color:i<=r.rating?V.y:V.t3,fontSize:12}}><svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg></span>)}<Bt onClick={()=>handleDeleteReview(r.id)} style={{padding:"2px 6px",color:V.r,fontSize:10}}>x</Bt></div></div><p style={{fontSize:12,color:V.t2,margin:0}}>{r.text}</p></div>))}
      </>}
    </>);
  }

  /* ═══════════════════════════════════════════════════
     AFTER PAY TAB
     ═══════════════════════════════════════════════════ */
  function AfterPayTab() {
    const [apDup, setApDup] = useState(p.afterPayDuplicateAddress ?? false);
    const [apCharge, setApCharge] = useState(p.afterPayAffiliateCharge ?? false);
    const [apChargeVal, setApChargeVal] = useState(p.afterPayChargeValue ? String(p.afterPayChargeValue) : "");
    const [apProvider, setApProvider] = useState(p.afterPayShippingProvider ?? "");
    const [apSaving, setApSaving] = useState(false);
    const [apSaved, setApSaved] = useState(false);
    const handleSaveAP = async () => {
      setApSaving(true);
      try { unwrapApiPayload(await updateProduct(productId, { afterPayDuplicateAddress: apDup, afterPayAffiliateCharge: apCharge, afterPayChargeValue: apCharge ? (parseFloat(apChargeVal) || 0) : null, afterPayShippingProvider: apProvider || null })); await refreshProduct(); setApSaved(true); setTimeout(()=>setApSaved(false),2000); } catch(e){ console.error(e); }
      finally { setApSaving(false); }
    };
    return (<div style={{...cs,padding:24}}>
      <h2 style={{fontSize:16,fontWeight:600,color:V.t,margin:"0 0 20px"}}>Configurações After Pay</h2>
      <div style={{...cs,padding:16,marginBottom:16}}>
        <h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 12px"}}>Configurações de Venda</h3>
        <Tg label="Permitir endereço duplicado na venda pós-paga?" checked={apDup} onChange={setApDup}/>
      </div>
      <div style={{...cs,padding:16,marginBottom:16}}>
        <h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 12px"}}>Configurações de Afiliados</h3>
        <Tg label="Cobrança do afiliado por pedido frustrado?" checked={apCharge} onChange={setApCharge}/>
        {apCharge && <Fd label="Valor cobrança (R$)" value={apChargeVal} onChange={setApChargeVal}/>}
      </div>
      <div style={{...cs,padding:16}}>
        <h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 12px"}}>Configurações de Envio</h3>
        <Fd label="Provedor logístico" full>
          <select style={is} value={apProvider} onChange={e=>setApProvider(e.target.value)}><option value="">Selecione um provedor</option><option value="correios">Correios</option><option value="jadlog">Jadlog</option><option value="melhor_envio">Melhor Envio</option><option value="outro">Outro</option></select>
        </Fd>
      </div>
      <Bt primary onClick={handleSaveAP} style={{marginTop:16}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{display:"inline",verticalAlign:"middle",marginRight:4}}><polyline points="20 6 9 17 4 12"/></svg>{apSaved?"Salvo!":apSaving?"Salvando...":"Salvar"}</Bt>
    </div>);
  }

  /* ═══════════════════════════════════════════════════
     IA TAB
     ═══════════════════════════════════════════════════ */
  function IATab() {
    const [aiCfg, setAiCfg] = useState<any>(null);
    const [aiLoading, setAiLoading] = useState(true);
    const [aiSaving, setAiSaving] = useState(false);
    const [aiSaved, setAiSaved] = useState(false);
    useEffect(() => {
      apiFetch(`/products/${productId}/ai-config`)
        .then((r: any) => setAiCfg(unwrapApiPayload<any>(r) || {}))
        .catch(() => setAiCfg({}))
        .finally(() => setAiLoading(false));
    }, [productId]);
    const [whobuys, setWhobuys] = useState("");
    const [pains, setPains] = useState("");
    const [promise, setPromise] = useState("");
    const [objs, setObjs] = useState<{label:string;response:string}[]>([{label:"É caro",response:""},{label:"Não confio",response:""},{label:"Funciona?",response:""}]);
    const [tone, setTone] = useState("CONSULTIVE");
    const [persist, setPersist] = useState("3");
    const [msgLimit, setMsgLimit] = useState("10");
    const [followUp, setFollowUp] = useState("2h,24h,72h");
    const [autoLink, setAutoLink] = useState(true);
    const [offerDisc, setOfferDisc] = useState(true);
    const [useUrg, setUseUrg] = useState(true);
    useEffect(() => {
      if (!aiCfg) return;
      const cp = aiCfg.customerProfile || {};
      setWhobuys(cp.whobuys || cp.idealCustomer || ""); setPains(cp.pains || cp.painPoints || ""); setPromise(cp.promise || cp.promisedResult || "");
      if (Array.isArray(aiCfg.objections) && aiCfg.objections.length) setObjs(aiCfg.objections.map((obj: any) => ({ label: obj.label || obj.q || "", response: obj.response || obj.a || "" })));
      setTone(aiCfg.tone || "CONSULTIVE"); setPersist(String(aiCfg.persistenceLevel ?? 3)); setMsgLimit(String(aiCfg.messageLimit ?? 10));
      const fc = aiCfg.followUpConfig || {};
      const sa = aiCfg.salesArguments || {};
      setFollowUp(fc.schedule || "2h,24h,72h");
      setAutoLink((sa.autoCheckoutLink ?? fc.autoCheckoutLink) !== false); setOfferDisc((sa.offerDiscount ?? fc.offerDiscount) !== false); setUseUrg((sa.useUrgency ?? fc.useUrgency) !== false);
    }, [aiCfg]);
    const handleSaveAI = async () => {
      setAiSaving(true);
      try {
        await apiFetch(`/products/${productId}/ai-config`, { method: "PUT", body: {
          customerProfile: { whobuys, pains, promise }, objections: objs, tone, persistenceLevel: parseInt(persist)||3, messageLimit: parseInt(msgLimit)||10,
          followUpConfig: { schedule: followUp, autoCheckoutLink: autoLink, offerDiscount: offerDisc, useUrgency: useUrg },
          salesArguments: { autoCheckoutLink: autoLink, offerDiscount: offerDisc, useUrgency: useUrg },
        }});
        setAiSaved(true); setTimeout(()=>setAiSaved(false),2000);
      } catch(e){ console.error(e); } finally { setAiSaving(false); }
    };
    if (aiLoading) return <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Carregando config IA...</span></div>;
    return (<>
      <div style={{...cs,padding:14,marginBottom:16,background:`${V.em}08`,border:`1px solid ${V.em}15`}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={V.em} strokeWidth={2}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><span style={{fontSize:13,fontWeight:700,color:V.em}}>Marketing Artificial</span></div>
        <p style={{fontSize:11,color:V.t2,margin:"6px 0 0"}}>Configure como a IA vende este produto via WhatsApp, Instagram, TikTok e Facebook.</p>
      </div>
      <div style={{...cs,padding:16,marginBottom:16,background:initialFocus==="urgency"?`${V.em}08`:V.s,border:initialFocus==="urgency"?`1px solid ${V.em}25`:`1px solid ${V.b}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:V.t}}>Urgência e escassez</div>
            <div style={{fontSize:11,color:V.t3,marginTop:4,lineHeight:1.6}}>
              {`IA ${useUrg?"já usa":"ainda não usa"} gatilhos de urgência. Checkout principal com timer ${primaryCheckoutConfig.enableTimer?"ativo":"desligado"} e contador ${primaryCheckoutConfig.showStockCounter?"ativo":"desligado"}.`}
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {primaryPlanId && <Bt primary onClick={() => openCheckoutEditor("urgency", primaryPlanId)}>Abrir urgência no checkout</Bt>}
            {primaryPlanId && <Bt onClick={() => openCheckoutEditor("checkout-appearance", primaryPlanId)}>Ver aparência</Bt>}
          </div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}} className="grid2">
        <div style={{...cs,padding:20}}>
          <h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 16px"}}>Perfil do cliente ideal</h3>
          <Fd label="Quem compra?" full><textarea style={{...is,height:70}} value={whobuys} onChange={e=>setWhobuys(e.target.value)} placeholder="Mulheres 35-55 anos..."/></Fd>
          <Fd label="Principais dores" full><textarea style={{...is,height:60}} value={pains} onChange={e=>setPains(e.target.value)} placeholder="Dores, problemas..."/></Fd>
          <Fd label="Resultado prometido" full><textarea style={{...is,height:60}} value={promise} onChange={e=>setPromise(e.target.value)} placeholder="Resultado que o cliente terá..."/></Fd>
        </div>
        <div style={{...cs,padding:20}}>
          <h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 16px"}}>Objeções e respostas</h3>
          {objs.map((o,i)=><div key={i} style={{padding:"8px 0",borderBottom:i<objs.length-1?`1px solid ${V.b}`:"none"}}><div style={{display:"flex",gap:8,alignItems:"center"}}><input style={{...is,flex:1,fontSize:11,fontWeight:600}} value={o.label} onChange={e=>{const n=[...objs];n[i]={...n[i],label:e.target.value};setObjs(n)}} placeholder="Objeção"/><Bt onClick={()=>setObjs(objs.filter((_,j)=>j!==i))} style={{padding:"2px 6px",color:V.r,fontSize:10}}>x</Bt></div><textarea style={{...is,height:40,marginTop:4,fontSize:11}} value={o.response} onChange={e=>{const n=[...objs];n[i]={...n[i],response:e.target.value};setObjs(n)}} placeholder="Resposta da IA..."/></div>)}
          <Bt onClick={()=>setObjs([...objs,{label:"",response:""}])} style={{marginTop:10,width:"100%",justifyContent:"center"}}>+ Adicionar objeção</Bt>
        </div>
      </div>
      <div style={{...cs,padding:20,marginTop:16}}>
        <h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 16px"}}>Comportamento</h3>
        <div style={{display:"flex",flexWrap:"wrap",gap:"0 16px"}}>
          <Fd label="Tom"><select style={is} value={tone} onChange={e=>setTone(e.target.value)}><option value="CONSULTIVE">Consultivo</option><option value="AGGRESSIVE">Agressivo</option><option value="FRIENDLY">Amigável</option><option value="TECHNICAL">Técnico</option><option value="CASUAL">Casual</option><option value="DIRECT">Direto</option><option value="EMPATHETIC">Empático</option><option value="EDUCATIVE">Educativo</option><option value="URGENT">Urgente</option><option value="AUTO">Automático</option></select></Fd>
          <Fd label="Persistência (1-5)" value={persist} onChange={setPersist}/>
          <Fd label="Limite mensagens" value={msgLimit} onChange={setMsgLimit}/>
          <Fd label="Follow-up"><select style={is} value={followUp} onChange={e=>setFollowUp(e.target.value)}><option value="2h,24h,72h">2h, 24h, 72h</option><option value="1h,12h,48h">1h, 12h, 48h</option><option value="6h,24h">6h, 24h</option><option value="off">Desativado</option></select></Fd>
        </div>
        <Tg label="Enviar link checkout auto" checked={autoLink} onChange={setAutoLink}/>
        <Tg label="Oferecer desconto se resistência" checked={offerDisc} onChange={setOfferDisc}/>
        <Tg label="Usar urgência/escassez" checked={useUrg} onChange={setUseUrg}/>
      </div>
      <Bt primary onClick={handleSaveAI} style={{marginTop:16,width:"100%",justifyContent:"center"}}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{marginRight:6}}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>{aiSaved?"IA atualizada":"Salvar config da IA"}</Bt>
    </>);
  }

  /* ═══════════════════════════════════════════════════
     LINKS MODAL
     ═══════════════════════════════════════════════════ */
  function LinksModal({ planId }: { planId: string }) {
    const plan = PLANS.find((pl: any) => pl.id === planId);
    if (!plan) return null;
    const links = [
      plan.hasRealSlug ? {
        label: "URL pública",
        url: buildPublicCheckoutUrl(plan.slug),
        description: "Link real que o cliente usa para abrir este checkout.",
      } : null,
      plan.referenceCode ? {
        label: "URL por código",
        url: buildPublicCheckoutCodeUrl(plan.referenceCode),
        description: "Atalho público por código de referência do checkout.",
      } : null,
      {
        label: "Editor interno",
        url: `${getPublicOrigin()}/checkout/${plan.id}`,
        description: "Acesso autenticado ao editor deste checkout dentro do Kloel.",
      },
    ].filter(Boolean) as Array<{ label: string; url: string; description: string }>;
    return (
      <Modal title="Links disponíveis" onClose={() => { setModal(null); }}>
        <div style={{display:"grid",gap:10}}>
          {links.map((link, index) => (
            <div key={link.label} style={{padding:"12px 16px",background:V.e,borderRadius:6,border:`1px solid ${V.b}`}}>
              <span style={{fontSize:10,color:V.t3,display:"block",marginBottom:4}}>{link.label}</span>
              <span style={{fontSize:11,color:V.t2,display:"block",marginBottom:10,lineHeight:1.5}}>{link.description}</span>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <Bt onClick={() => cp(String(link.url), `link-${plan.id}-${index}`)} style={{padding:"5px 12px"}}>
                  {copied===`link-${plan.id}-${index}`?"Copiado":"Copiar"}
                </Bt>
                <span style={{fontFamily:M,fontSize:11,color:V.em,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{link.url}</span>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    );
  }

  /* ═══════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════ */
  return (
    <div style={{background:V.void,minHeight:"100vh",fontFamily:S,color:V.t,padding:28}}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}} ::selection{background:rgba(232,93,48,.3)} ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:#222226;border-radius:2px}`}</style>
      {(initialFocus || initialTab) && (
        <div style={{...cs,padding:"14px 16px",marginBottom:16,background:`${V.em}08`,border:`1px solid ${V.em}15`}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <NP w={36} h={14} intensity={0.7} />
            <span style={{fontSize:12,fontWeight:700,color:V.em,fontFamily:S}}>Acesso rápido</span>
          </div>
          <span style={{fontSize:12,color:V.t2,fontFamily:S}}>
            {initialFocus === "order-bump" && "Você entrou direto na configuração de order bump deste produto."}
            {initialFocus === "coupon" && "Você entrou direto na gestão de cupons deste produto."}
            {initialFocus === "coproduction" && "Você entrou direto na área de coprodução deste produto."}
            {initialFocus === "checkout-appearance" && "Você entrou direto na configuração visual e comercial do checkout deste produto."}
            {initialFocus === "urgency" && "Você entrou direto na configuração de urgência e escassez da IA deste produto."}
            {initialFocus === "recommendations" && "Você entrou direto na área de recomendações comerciais deste produto."}
            {!initialFocus && "Você entrou diretamente em uma área operacional específica deste produto."}
          </span>
        </div>
      )}
      <Header/>
      <TabBar tabs={TABS} active={tab} onSelect={t=>{setTab(t);setSelPlan(null);setCkEdit(null);}}/>
      <div style={{animation:"fadeIn .3s ease"}} key={`${tab}-${selPlan}-${ckEdit}-${comSub}`}>
        {tab==="dados"&&<DadosTab/>}
        {tab==="planos"&&<PlanosTab/>}
        {tab==="checkouts"&&<CheckoutsTab/>}
        {tab==="urls"&&<UrlsTab/>}
        {tab==="comissao"&&<ComissaoTab/>}
        {tab==="cupons"&&<CuponsTab/>}
        {tab==="campanhas"&&<CampanhasTab/>}
        {tab==="avaliacoes"&&<AvalTab/>}
        {tab==="afterpay"&&<AfterPayTab/>}
        {tab==="ia"&&<IATab/>}
      </div>
      {/* MODALS */}
      {modal?.startsWith("links-") && <LinksModal planId={modal.replace("links-","")} />}
      {/* campLinks modal removed — was orphaned (never opened), hardcoded URLs */}
      {modal==="newPlan"&&<Modal title="Criar novo plano" onClose={()=>setModal(null)}><div style={{display:"flex",flexWrap:"wrap",gap:"0 16px"}}><Fd label="Nome" value={newPlanName} onChange={setNewPlanName}/><Fd label="Valor (R$)" value={newPlanPrice} onChange={setNewPlanPrice}/><Fd label="Qtd" value={newPlanQty} onChange={setNewPlanQty}/><Fd label="Parcelas" value={newPlanInst} onChange={setNewPlanInst}/></div><Bt primary onClick={handleCreatePlan} style={{marginTop:12}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{display:"inline",verticalAlign:"middle",marginRight:4}}><polyline points="20 6 9 17 4 12"/></svg>Criar</Bt></Modal>}
      {modal==="newBump"&&<Modal title="Novo Order Bump" onClose={()=>setModal(null)}><Fd label="Nome" value={newBumpName} onChange={setNewBumpName} full/><Fd label="Preço" value={newBumpPrice} onChange={setNewBumpPrice}/><Fd label="Checkbox" value="Sim, eu quero!"/><Bt primary onClick={handleCreateBump} style={{marginTop:12}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{display:"inline",verticalAlign:"middle",marginRight:4}}><polyline points="20 6 9 17 4 12"/></svg>Salvar</Bt></Modal>}
      {modal==="newCoupon"&&<Modal title="Criar cupom" onClose={()=>setModal(null)}>
        <Fd label="Código" value={newCouponCode} onChange={setNewCouponCode}/>
        <Fd label="Tipo"><select style={is} value={newCouponType} onChange={e=>setNewCouponType(e.target.value)}><option value="%">Porcentagem (%)</option><option value="R$">Valor fixo (R$)</option></select></Fd>
        <Fd label={newCouponType==="%" ? "Valor (%)" : "Valor (R$)"} value={newCouponVal} onChange={setNewCouponVal}/>
        <Fd label="Limite usos" value={newCouponMax} onChange={setNewCouponMax}/>
        <Fd label="Expira em" full><input type="date" style={is} value={newCouponExpiresAt} onChange={e=>setNewCouponExpiresAt(e.target.value)}/></Fd>
        <Bt primary onClick={handleCreateCoupon} style={{marginTop:12}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{display:"inline",verticalAlign:"middle",marginRight:4}}><polyline points="20 6 9 17 4 12"/></svg>Criar</Bt>
      </Modal>}
      {/* Dead modals removed — campaign creation handled by CampanhasTab inline form, coproduction by CoprodSubTab CRUD */}
    </div>
  );
}
