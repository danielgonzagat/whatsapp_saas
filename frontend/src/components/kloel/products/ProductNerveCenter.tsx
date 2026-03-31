"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useProduct, useProductMutations } from "@/hooks/useProducts";
import { useCheckoutPlans, useCheckoutCoupons, useOrderBumps, useCheckoutConfig } from "@/hooks/useCheckoutPlans";
import { apiFetch } from "@/lib/api";

/* ═══════════════════════════════════════════════════
   V — KLOEL Terminator palette (Nerve Center)
   ═══════════════════════════════════════════════════ */
const S = "'Sora',sans-serif";
const M = "'JetBrains Mono',monospace";
const V = { void:"#0A0A0C", s:"#111113", e:"#19191C", b:"#222226", em:"#E85D30", t:"#E0DDD8", t2:"#6E6E73", t3:"#3A3A3F", g:"#25D366", g2:"#10B981", p:"#8B5CF6", bl:"#3B82F6", y:"#F59E0B", r:"#EF4444", pk:"#EC4899" };
const R$ = (n: number) => (n/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

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
        <button onClick={onClose} style={{background:"none",border:"none",color:V.t3,cursor:"pointer",fontSize:18}}>✕</button>
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

// TODO: GET /api/products/:id/affiliates
// Mock affiliates removed — using real data from /affiliate endpoints

// TODO: GET /api/products/:id/coproducers
// Mock coproducers removed

// TODO: GET /api/products/:id/campaigns
// Mock campaigns removed

/* ═══════════════════════════════════════════════════
   PROPS
   ═══════════════════════════════════════════════════ */
interface ProductNerveCenterProps {
  productId: string;
  onBack: () => void;
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
export default function ProductNerveCenter({ productId, onBack }: ProductNerveCenterProps) {
  /* ── data hooks ── */
  const { product: rawProduct, isLoading: prodLoading, mutate: mutateProd } = useProduct(productId);
  const p: any = rawProduct || {};
  const { updateProduct } = useProductMutations();
  const { plans: rawPlans, isLoading: plansLoading, createPlan, deletePlan, updatePlan } = useCheckoutPlans(rawProduct);
  const { coupons: rawCoupons, isLoading: couponsLoading, createCoupon, deleteCoupon } = useCheckoutCoupons();

  /* ── navigation state ── */
  const [tab, setTab] = useState("dados");
  const [selPlan, setSelPlan] = useState<string | null>(null);
  const [planSub, setPlanSub] = useState("loja");
  const [copied, setCopied] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [comSub, setComSub] = useState("config");
  const [ckEdit, setCkEdit] = useState<string | null>(null);
  const [expCk, setExpCk] = useState<number | null>(null);

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
  const [saving, setSaving] = useState(false);
  const [editImageUrl, setEditImageUrl] = useState("");
  const [imgUploading, setImgUploading] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  /* ── URLs state ── */
  const [urls, setUrls] = useState<any[]>([]);
  const [urlsLoading, setUrlsLoading] = useState(false);

  /* ── Reviews state ── */
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

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
      setEditImageUrl(p.imageUrl || "");
    }
  }, [p?.id, p?.name, p?.description, p?.category, p?.tags, p?.originCep, p?.warrantyDays, p?.salesPageUrl, p?.thankyouUrl, p?.thankyouPixUrl, p?.thankyouBoletoUrl, p?.reclameAquiUrl, p?.supportEmail, p?.active, p?.isSample, p?.price]);

  /* ── Fetch URLs on tab ── */
  useEffect(() => {
    if (tab === "urls" && productId) {
      setUrlsLoading(true);
      apiFetch(`/products/${productId}/urls`)
        .then((res: any) => setUrls(Array.isArray(res) ? res : res?.urls || []))
        .catch(() => setUrls([]))
        .finally(() => setUrlsLoading(false));
    }
  }, [tab, productId]);

  /* ── Fetch Reviews on tab ── */
  useEffect(() => {
    if (tab === "avaliacoes" && productId) {
      setReviewsLoading(true);
      apiFetch(`/products/${productId}/reviews`)
        .then((res: any) => setReviews(Array.isArray(res) ? res : res?.reviews || []))
        .catch(() => setReviews([]))
        .finally(() => setReviewsLoading(false));
    }
  }, [tab, productId]);

  /* ── Mapped plans ── */
  const PLANS = (rawPlans || []).map((pl: any) => ({
    id: pl.id,
    name: pl.name || "Sem nome",
    slug: pl.slug || pl.referenceCode || pl.id?.slice(0, 8),
    ref: pl.referenceCode || pl.id?.slice(0, 6)?.toUpperCase() || "---",
    price: pl.priceInCents || 0,
    qty: pl.quantity || 1,
    active: pl.active !== false,
    sales: pl.salesCount || 0,
    inst: pl.maxInstallments || 1,
    vis: pl.visibleToAffiliates !== false,
  }));

  /* ── Mapped coupons ── */
  const COUPONS = (rawCoupons || []).map((c: any) => ({
    id: c.id,
    code: c.code || "",
    type: c.discountType === "FIXED" ? "R$" : "%",
    val: c.discountType === "FIXED" ? (c.discountValue || 0) : (c.discountPercent || c.discountValue || 0),
    used: c.usedCount || 0,
    max: c.maxUses || null,
    on: c.active !== false,
  }));

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

  /* ── Helpers ── */
  const cp = (t: string, id: string) => { navigator.clipboard?.writeText(t); setCopied(id); setTimeout(()=>setCopied(null),2000); };

  const handleImageUpload = async (file: File) => {
    setImgUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "products");
      const data: any = await apiFetch("/kloel/upload", { method: "POST", body: formData });
      if (data?.url) { setEditImageUrl(data.url); }
    } catch (e) { console.error("Image upload failed:", e); }
    finally { setImgUploading(false); }
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await updateProduct(productId, {
        name: editName,
        description: editDesc,
        category: editCategory,
        tags: editTags.split(",").map(t => t.trim()).filter(Boolean),
        originCep: editCep,
        warrantyDays: parseInt(editWarranty) || 7,
        salesPageUrl: editSalesUrl,
        thankyouUrl: editThankUrl,
        thankyouPixUrl: editThankPix,
        thankyouBoletoUrl: editThankBoleto,
        reclameAquiUrl: editReclame,
        supportEmail: editSupportEmail,
        active: editActive,
        isSample: editIsSample,
        imageUrl: editImageUrl || undefined,
      });
      mutateProd();
      setSaved(true);
      setTimeout(()=>setSaved(false),2000);
    } catch(e) {
      console.error("Save error:", e);
    } finally {
      setSaving(false);
    }
  }, [productId, editName, editDesc, editCategory, editTags, editCep, editWarranty, editSalesUrl, editThankUrl, editThankPix, editThankBoleto, editReclame, editSupportEmail, editActive, editIsSample, editImageUrl, updateProduct, mutateProd]);

  const stubSave = () => { setSaved(true); setTimeout(()=>setSaved(false),2000); };

  /* ── Create plan handler ── */
  const handleCreatePlan = async () => {
    if (!newPlanName) return;
    await createPlan({
      name: newPlanName,
      priceInCents: Math.round(parseFloat(newPlanPrice || "0") * 100),
      quantity: parseInt(newPlanQty) || 1,
      maxInstallments: parseInt(newPlanInst) || 12,
    });
    setNewPlanName(""); setNewPlanPrice(""); setNewPlanQty("1"); setNewPlanInst("12");
    setModal(null);
  };

  /* ── Create coupon handler ── */
  const handleCreateCoupon = async () => {
    if (!newCouponCode) return;
    await createCoupon({
      code: newCouponCode.toUpperCase(),
      discountPercent: newCouponType === "%" ? parseFloat(newCouponVal || "0") : 0,
      discountValue: newCouponType === "R$" ? parseFloat(newCouponVal || "0") : 0,
      discountType: newCouponType === "R$" ? "FIXED" : "PERCENT",
      maxUses: newCouponMax ? parseInt(newCouponMax) : undefined,
    });
    setNewCouponCode(""); setNewCouponVal(""); setNewCouponMax("");
    setModal(null);
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
          <div onClick={() => imgInputRef.current?.click()} style={{width:80,height:80,borderRadius:8,background:V.e,border:`2px dashed ${V.b}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,overflow:"hidden"}}>
            {editImageUrl || p.imageUrl ? (
              <img src={editImageUrl || p.imageUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:6}} />
            ) : (
              <><span style={{fontSize:28}}>📦</span><span style={{fontSize:8,color:V.t3,marginTop:2}}>Upload</span></>
            )}
          </div>
          <div style={{flex:1}}>
            <h1 style={{fontSize:18,fontWeight:700,color:V.t,margin:"0 0 4px",fontFamily:S}}>{editName || p.name || "Produto"}</h1>
            <div style={{display:"flex",gap:10,fontSize:12,color:V.t2}}>
              <span>{editCategory || p.category || "Sem categoria"}</span>
              <span style={{fontFamily:M,fontWeight:600,color:V.em}}>{R$(priceInCents)}</span>
              <span style={{color:V.t3}}>·</span>
              <span>Código: <span style={{fontFamily:M,color:V.t}}>{p.slug || p.sku || p.id?.slice(0,12)}</span></span>
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
          <Bt primary onClick={save}>✓ {saved?"Salvo!":saving?"Salvando...":"Salvar"}</Bt>
        </div>
        <div style={{display:"flex",gap:20,marginBottom:20}}>
          <div
            onClick={() => imgInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files?.[0]; if (f) handleImageUpload(f); }}
            style={{width:200,height:160,borderRadius:8,background:V.e,border:`2px dashed ${V.b}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,overflow:"hidden",position:"relative"}}
          >
            {editImageUrl ? (
              <img src={editImageUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:6}} />
            ) : imgUploading ? (
              <><span style={{fontSize:11,color:V.t3}}>Enviando...</span></>
            ) : (
              <><span style={{fontSize:40}}>📷</span><span style={{fontSize:11,color:V.t3,marginTop:6}}>Arraste ou clique para upload</span><span style={{fontSize:9,color:V.t3}}>JPG/PNG/GIF · 500x400 · Max 10MB</span></>
            )}
            <input ref={imgInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{display:"none"}} onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }} />
          </div>
          <div style={{flex:1}}>
            <Fd label="Nome" value={editName} onChange={setEditName} full/>
            <Fd label="Descrição" full>
              <textarea style={{...is,height:80,resize:"vertical"}} value={editDesc} onChange={e=>setEditDesc(e.target.value)}/>
            </Fd>
          </div>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:"0 20px"}}>
          <Fd label="Categoria" value={editCategory} onChange={setEditCategory}/>
          <Fd label="Tags" value={editTags} onChange={setEditTags}/>
          <Fd label="CEP de origem" value={editCep} onChange={setEditCep}/>
          <Fd label="Garantia (dias)" value={editWarranty} onChange={setEditWarranty}/>
          <Fd label="URL página de vendas" value={editSalesUrl} onChange={setEditSalesUrl} full/>
          <Fd label="URL obrigado" value={editThankUrl} onChange={setEditThankUrl} full/>
          <Fd label="URL obrigado Pix" value={editThankPix} onChange={setEditThankPix} full/>
          <Fd label="URL obrigado Boleto" value={editThankBoleto} onChange={setEditThankBoleto} full/>
          <Fd label="URL Reclame Aqui" value={editReclame} onChange={setEditReclame} full/>
          <Fd label="E-mail suporte" value={editSupportEmail} onChange={setEditSupportEmail}/>
          <Fd label="Tipo de frete"><select style={is} defaultValue={p.shippingType || ""}><option>Frete variável ou Grátis</option></select></Fd>
        </div>
        <Tg label="PAC grátis?" checked={p.shippingType === "FREE" || p.shippingValue === 0} onChange={()=>{}}/>
        <Tg label="Aceita SEDEX?" checked={false} onChange={()=>{}}/>
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
                <Bt onClick={()=>setSelPlan(pl.id)} style={{padding:"4px 8px",color:V.bl}}>✏️</Bt>
                <Bt style={{padding:"4px 8px",color:V.p}}>📋</Bt>
                <Bt onClick={()=>setModal("links-"+pl.id)} style={{padding:"4px 8px",color:V.em}}>🔗</Bt>
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
        <div style={{borderLeft:`1px solid ${V.b}`,paddingLeft:14}}><span style={{fontSize:9,color:V.t3}}>CHECKOUT</span><br/><span style={{fontFamily:M,fontSize:11,color:V.em}}>pay.kloel.com/{plan.slug}</span></div>
      </div>
      <TabBar tabs={subs} active={planSub} onSelect={setPlanSub} small/>
      <div style={{...cs,padding:20}}>
        {planSub==="loja"&&<><h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 16px"}}>Config da loja</h3><Tg label="Disponível para venda?" checked={plan.active} onChange={()=>{}}/><Tg label="Ocultar para afiliados?" checked={!plan.vis} onChange={()=>{}}/><Tg label="Exigir endereço?" checked={true} onChange={()=>{}}/><Dv/><Fd label="Nome" value={plan.name} full/><div style={{display:"flex",gap:16}}><Fd label="Valor (R$)" value={(plan.price/100).toFixed(2)}/><Fd label="Qtd itens" value={plan.qty}/></div></>}
        {planSub==="pagamento"&&<><h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 16px"}}>Pagamento</h3><Tg label="Cartão" checked={true} onChange={()=>{}}/><Tg label="Pix" checked={true} onChange={()=>{}}/><Tg label="Boleto" checked={true} onChange={()=>{}}/><Dv/><Fd label="Parcelas máx" value={plan.inst}/><Fd label="Dias boleto" value="7"/></>}
        {planSub==="frete"&&<><h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 16px"}}>Frete</h3><Tg label="PAC grátis?" checked={true} onChange={()=>{}}/><Tg label="SEDEX?" checked={false} onChange={()=>{}}/><div style={{display:"flex",gap:16}}><Fd label="Peso (g)" value="350"/><Fd label="Alt" value="8"/><Fd label="Larg" value="12"/><Fd label="Comp" value="15"/></div></>}
        {planSub==="afiliacao"&&<><h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 16px"}}>Afiliação</h3><Tg label="Aceitar afiliados" checked={true} onChange={()=>{}}/><Fd label="Comissão (%)" value="45"/><Fd label="Cookie (dias)" value="9999"/><div style={{...cs,padding:14,marginTop:12,background:V.e}}><span style={{fontSize:12,fontWeight:600,color:V.t,marginBottom:8,display:"block"}}>⚡ Simulador de ganhos</span><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,textAlign:"center"}}>{[10,50,100].map(n=><div key={n}><span style={{fontSize:9,color:V.t3}}>{n} vendas</span><br/><span style={{fontFamily:M,fontSize:16,fontWeight:700,color:V.g2}}>R$ {((plan.price/100)*.45*n).toLocaleString("pt-BR")}</span></div>)}</div></div></>}
        {planSub==="bump"&&<><div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:0}}>Order Bumps</h3><Bt primary onClick={()=>setModal("newBump")}>+ Adicionar</Bt></div>{realBumps.length > 0 ? realBumps.map((b: any) => (
          <div key={b.id} style={{...cs,padding:14,display:"flex",alignItems:"center",gap:12,background:V.e,position:"relative",overflow:"hidden",marginBottom:8}}>
            <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:V.em}}/>
            <span style={{fontSize:18}}>🎁</span>
            <div style={{flex:1}}><span style={{fontSize:13,fontWeight:600,color:V.t}}>{b.name}</span><br/><span style={{fontSize:11,color:V.t2}}>{b.desc}</span></div>
            <div style={{textAlign:"right"}}>{b.oldPrice > 0 && <><span style={{fontFamily:M,fontSize:10,color:V.t3,textDecoration:"line-through"}}>{R$(b.oldPrice)}</span><br/></>}<span style={{fontFamily:M,fontSize:16,fontWeight:700,color:V.em}}>{R$(b.price)}</span></div>
            <Bg color={b.active?V.g:V.r}>{b.active?"ATIVO":"OFF"}</Bg>
          </div>
        )) : (
          <div style={{...cs,padding:14,display:"flex",alignItems:"center",gap:12,background:V.e,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:V.em}}/>
            <span style={{fontSize:18}}>🎁</span>
            <div style={{flex:1}}><span style={{fontSize:13,color:V.t3}}>Nenhum order bump cadastrado</span></div>
          </div>
        )}</>}
        {planSub==="obrigado"&&<><h3 style={{fontSize:14,fontWeight:600,color:V.t,margin:"0 0 16px"}}>Página de obrigado</h3><Fd label="URL obrigado (cartão)" value={editThankUrl || ""} full/><Fd label="URL obrigado Pix" value={editThankPix || ""} full/><Fd label="URL obrigado Boleto" value={editThankBoleto || ""} full/><Dv/><div style={{display:"flex",gap:10}}><Bt primary>✨ Editor Visual de Checkout</Bt><Bt>👁 Preview</Bt></div></>}
      </div>
      <Bt primary onClick={stubSave} style={{marginTop:16,width:"100%",justifyContent:"center"}}>✓ {saved?"Salvo!":"Salvar"}</Bt>
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
    return { id: pl.id, code: pl.referenceCode || pl.slug || pl.id.slice(0,8), desc: pl.name || "Checkout", mt, vi:0, vt:0, ab:0, ca:0, cv:0 };
  });
  const handleNewCheckout = async () => {
    const res = await createPlan({ name: "Checkout " + ((rawPlans||[]).length + 1), priceInCents: 0, quantity: 1, maxInstallments: 12 });
    if ((res as any)?.id) setCkEdit((res as any).id);
  };
  const handleDeleteCheckout = async (id: string) => { await deletePlan(id); };

  function CheckoutsTab() {
    if(ckEdit) return <CkConfig/>;
    return (<>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h2 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>Checkouts disponíveis</h2><Bt primary onClick={handleNewCheckout}>+ Novo checkout</Bt></div>
      <div style={{...cs,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:".8fr 1.5fr 1fr .7fr .7fr .7fr .7fr .7fr .5fr",padding:"10px 14px",borderBottom:`1px solid ${V.b}`,background:V.e}}>
          {["Código","Descrição","Pagamento","Vis.Ún","Vis.Tot","Aband%","Cancel%","Conv%",""].map(h=><span key={h} style={{fontSize:8,fontWeight:600,color:V.t3,letterSpacing:".06em",textTransform:"uppercase"}}>{h}</span>)}
        </div>
        {CKS.length === 0 ? (
          <div style={{padding:"24px 16px",textAlign:"center"}}><span style={{color:V.t3,fontSize:12}}>Nenhum checkout criado</span></div>
        ) : CKS.map((ck: any,i: number)=>(
          <div key={ck.id} style={{display:"grid",gridTemplateColumns:".8fr 1.5fr 1fr .7fr .7fr .7fr .7fr .7fr .5fr",padding:"10px 14px",borderBottom:i<CKS.length-1?`1px solid ${V.b}`:"none",alignItems:"center"}}>
            <span style={{fontFamily:M,fontSize:10,color:V.t3}}>{ck.code}</span>
            <span style={{fontSize:11,fontWeight:500,color:V.t,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ck.desc}</span>
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{ck.mt.map((m: string)=><Bg key={m} color={m==="BOLETO"?V.pk:m==="PIX"?V.g2:V.bl}>{m}</Bg>)}</div>
            <span style={{fontFamily:M,fontSize:11,color:V.t2,textAlign:"center"}}>{ck.vi.toLocaleString("pt-BR")}</span>
            <span style={{fontFamily:M,fontSize:11,color:V.t2,textAlign:"center"}}>{ck.vt.toLocaleString("pt-BR")}</span>
            <span style={{fontFamily:M,fontSize:11,color:ck.ab>60?V.r:V.y,textAlign:"center"}}>{ck.ab.toFixed(2)}</span>
            <span style={{fontFamily:M,fontSize:11,color:V.t2,textAlign:"center"}}>{ck.ca.toFixed(2)}</span>
            <span style={{fontFamily:M,fontSize:11,fontWeight:600,color:ck.cv>40?V.g2:V.t2,textAlign:"center"}}>{ck.cv.toFixed(2)}</span>
            <div style={{display:"flex",gap:4}}><Bt onClick={()=>setCkEdit(ck.id)} style={{padding:"4px 6px",color:V.bl}}>✏️</Bt><Bt onClick={()=>handleDeleteCheckout(ck.id)} style={{padding:"4px 6px",color:V.r}}>🗑</Bt></div>
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
        <div style={{display:"flex",gap:12,marginTop:20}}><Bt onClick={()=>setCkEdit(null)}>← Voltar</Bt><Bt primary onClick={handleCkSave} style={{marginLeft:"auto"}}>✓ {ckSaved?"Salvo!":ckSaving?"Salvando...":"Salvar"}</Bt></div>
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
        setUrls((prev: any) => [res, ...prev]);
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
              <Bt onClick={()=>handleDeleteUrl(u.id)} style={{padding:"3px 6px",color:V.r}}>🗑</Bt>
            </div>
          ))}
        </div>
      )}
    </>);
  }

  /* ═══════════════════════════════════════════════════
     COMISSIONAMENTO TAB
     ═══════════════════════════════════════════════════ */
  // TODO: Connect to real backend endpoints for commission/affiliate management
  // Affiliate/coproducer data now loaded inside each sub-tab

  function ComissaoTab() {
    const subs=[{k:"config",l:"Configurações"},{k:"afiliados",l:"Afiliados"},{k:"merchan",l:"Merchan"},{k:"termos",l:"Termos"},{k:"coprod",l:"Coprodução"}];
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
        await updateProduct(productId, {
          affiliateEnabled: affEnabled, affiliateVisible: affVisible, affiliateAutoApprove: affAutoApprove,
          affiliateAccessData: affAccessData, affiliateAccessAbandoned: affAccessAbandoned, affiliateFirstInstallment: affFirstInstallment,
          commissionType: comType, commissionCookieDays: parseInt(comCookie) || 180, commissionPercent: parseFloat(comPercent) || 30,
          commissionLastClickPercent: comType === "proportional" ? parseFloat(comLastClick) || 70 : undefined,
          commissionOtherClicksPercent: comType === "proportional" ? parseFloat(comOther) || 30 : undefined,
        });
        mutateProd(); setComSaved(true); setTimeout(() => setComSaved(false), 2000);
      } catch (e) { console.error("Commission save error:", e); }
      finally { setComSaving(false); }
    };
    return (<>
      <TabBar tabs={subs} active={comSub} onSelect={setComSub} small/>
      {comSub==="config"&&<div style={{...cs,padding:24}}>
        <h3 style={{fontSize:16,fontWeight:600,color:V.t,margin:"0 0 12px"}}>Programa de Afiliados</h3>
        <div style={{...cs,padding:12,marginBottom:16,background:`${V.y}08`,border:`1px solid ${V.y}20`}}><span style={{fontSize:11,color:V.y}}>⚠️ Configurações aplicam apenas para novas afiliações.</span></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 24px"}}><Tg label="Participar?" checked={affEnabled} onChange={setAffEnabled} desc="Ativa o programa de afiliados para este produto"/><Tg label="Acesso dados?" checked={affAccessData} onChange={setAffAccessData} desc="Afiliado vê dados completos do cliente"/><Tg label="Visível loja?" checked={affVisible} onChange={setAffVisible} desc="Produto aparece no marketplace para afiliados"/><Tg label="Acesso abandonos?" checked={affAccessAbandoned} onChange={setAffAccessAbandoned} desc="Afiliado vê leads que abandonaram checkout"/><Tg label="Aprovação auto?" checked={affAutoApprove} onChange={setAffAutoApprove} desc="Afiliados são aprovados instantaneamente"/><Tg label="Comissão 1ª parcela?" checked={affFirstInstallment} onChange={setAffFirstInstallment} desc="Para assinaturas: comissão só na primeira parcela"/></div>
        <Dv/>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}><Fd label="Comissionamento"><select style={is} value={comType} onChange={e=>setComType(e.target.value)}><option value="first_click">Primeiro Clique</option><option value="last_click">Último Clique</option><option value="proportional">Divisão Proporcional</option></select></Fd><Fd label="Cookie (dias)" value={comCookie} onChange={setComCookie}/><Fd label="Comissão (%)" value={comPercent} onChange={setComPercent}/></div>
        {comType==="proportional"&&<div style={{display:"flex",gap:16,marginTop:12}}><Fd label="Último Clique (%)" value={comLastClick} onChange={(v: string)=>{setComLastClick(v);setComOther(String(100-( parseFloat(v)||0)))}}/><Fd label="Demais Cliques (%)" value={comOther} onChange={(v: string)=>{setComOther(v);setComLastClick(String(100-(parseFloat(v)||0)))}}/></div>}
        <Bt primary onClick={handleComSave} style={{marginTop:16}}>✓ {comSaved?"Salvo!":comSaving?"Salvando...":"Salvar"}</Bt>
      </div>}
      {comSub==="afiliados"&&<AfiliadosSubTab/>}
      {comSub==="merchan"&&<MerchanSubTab/>}
      {comSub==="termos"&&<TermosSubTab/>}
      {comSub==="coprod"&&<CoprodSubTab/>}
    </>);
  }

  /* ── Afiliados sub-tab ── */
  function AfiliadosSubTab() {
    const [affs, setAffs] = useState<any[]>([]);
    const [affsLoading, setAffsLoading] = useState(true);
    useEffect(() => { apiFetch(`/affiliate/config/${productId}`).then((r: any) => { const reqs = r?.requests || []; setAffs(reqs); }).catch(() => setAffs([])).finally(() => setAffsLoading(false)); }, []);
    const handleExcel = () => {
      const header = "Nome,Email,Status,Desde\n";
      const csv = affs.map((a: any) => `${a.affiliateName||""},${a.affiliateEmail||""},${a.status},${a.createdAt?.slice(0,10)||""}`).join("\n");
      const blob = new Blob([header + csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob); const el = document.createElement("a"); el.href = url; el.download = "afiliados.csv"; el.click();
    };
    const handleAction = async (id: string, status: string) => {
      try { await apiFetch(`/affiliate/request/${id}`, { method: "PATCH", body: { status } }); setAffs((prev: any) => prev.map((a: any) => a.id === id ? { ...a, status } : a)); } catch (e) { console.error(e); }
    };
    return (<div style={{...cs,padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h3 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>Afiliados</h3><div style={{display:"flex",gap:8}}><Bt onClick={handleExcel} style={{background:V.g2,color:"#fff",border:"none"}}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Excel</Bt></div></div>
      {affsLoading ? <div style={{padding:20,textAlign:"center"}}><span style={{color:V.t3,fontSize:12}}>Carregando...</span></div> : affs.length === 0 ? <div style={{padding:20,textAlign:"center"}}><span style={{color:V.t3,fontSize:12}}>Nenhum afiliado</span></div> : (
      <div style={{...cs,overflow:"hidden"}}><div style={{display:"grid",gridTemplateColumns:"2fr .7fr .7fr .7fr .7fr",padding:"10px 14px",background:V.e,borderBottom:`1px solid ${V.b}`}}>{["Nome","Desde","Vendas","Comissão","Status/Ação"].map(h=><span key={h} style={{fontSize:8,fontWeight:600,color:V.t3,letterSpacing:".06em",textTransform:"uppercase"}}>{h}</span>)}</div>
      {affs.map((a: any,i: number)=>(<div key={a.id} style={{display:"grid",gridTemplateColumns:"2fr .7fr .7fr .7fr .7fr",padding:"10px 14px",borderBottom:i<affs.length-1?`1px solid ${V.b}`:"none",alignItems:"center"}}><div><span style={{fontSize:11,fontWeight:600,color:V.t}}>{a.affiliateName||"Sem nome"}</span><br/><span style={{fontSize:9,color:V.t3}}>{a.affiliateEmail||""}</span></div><span style={{fontSize:10,color:V.t2}}>{a.createdAt?.slice(0,10)||""}</span><span style={{fontFamily:M,fontSize:11,color:V.t2}}>0</span><Bg color={V.g2}>{p.commissionPercent||30}%</Bg><div style={{display:"flex",gap:4}}>{a.status==="PENDING"?<><Bt onClick={()=>handleAction(a.id,"APPROVED")} style={{fontSize:9,color:V.g,padding:"2px 6px"}}>Aprovar</Bt><Bt onClick={()=>handleAction(a.id,"REJECTED")} style={{fontSize:9,color:V.r,padding:"2px 6px"}}>Rejeitar</Bt></>:<Bg color={a.status==="APPROVED"?V.g:V.r}>{a.status}</Bg>}</div></div>))}</div>)}
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
      try { await updateProduct(productId, { merchandContent: edRef.current?.innerHTML || merchan }); mutateProd(); setMSaved(true); setTimeout(()=>setMSaved(false),2000); } catch(e){ console.error(e); }
      finally { setMSaving(false); }
    };
    return (<div style={{...cs,padding:24}}><h3 style={{fontSize:16,fontWeight:600,color:V.t,margin:"0 0 8px"}}>Merchan</h3><p style={{fontSize:12,color:V.t2,marginBottom:16}}>Materiais para afiliados.</p><div style={{background:V.e,border:`1px solid ${V.b}`,borderRadius:6,padding:12}}><div style={{display:"flex",gap:4,marginBottom:12}}>{["B","I","U"].map(t=><button key={t} onClick={()=>document.execCommand(t==="B"?"bold":t==="I"?"italic":"underline")} style={{width:28,height:28,background:"transparent",border:`1px solid ${V.b}`,borderRadius:4,color:V.t2,fontSize:12,cursor:"pointer",fontWeight:t==="B"?"bold":"normal",fontStyle:t==="I"?"italic":"normal",textDecoration:t==="U"?"underline":"none"}}>{t}</button>)}<button onClick={()=>{const url=prompt("URL do link:");if(url)document.execCommand("createLink",false,url)}} style={{width:28,height:28,background:"transparent",border:`1px solid ${V.b}`,borderRadius:4,color:V.t2,fontSize:12,cursor:"pointer"}}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></button></div><div ref={edRef} contentEditable dangerouslySetInnerHTML={{__html:merchan}} onInput={e=>setMerchan((e.target as any).innerHTML)} style={{minHeight:140,color:V.t2,fontSize:13,outline:"none",fontFamily:S}} suppressContentEditableWarning/></div><Bt primary onClick={handleSaveMerchan} style={{marginTop:16}}>✓ {mSaved?"Salvo!":mSaving?"Salvando...":"Salvar"}</Bt></div>);
  }

  /* ── Termos sub-tab ── */
  function TermosSubTab() {
    const [terms, setTerms] = useState(p.affiliateTerms || "");
    const [tSaving, setTSaving] = useState(false);
    const [tSaved, setTSaved] = useState(false);
    const edRef = useRef<any>(null);
    const handleSaveTerms = async () => {
      setTSaving(true);
      try { await updateProduct(productId, { affiliateTerms: edRef.current?.innerHTML || terms }); mutateProd(); setTSaved(true); setTimeout(()=>setTSaved(false),2000); } catch(e){ console.error(e); }
      finally { setTSaving(false); }
    };
    return (<div style={{...cs,padding:24}}><h3 style={{fontSize:16,fontWeight:600,color:V.t,margin:"0 0 8px"}}>Termos de uso</h3><div style={{background:V.e,border:`1px solid ${V.b}`,borderRadius:6,padding:12}}><div style={{display:"flex",gap:4,marginBottom:12}}>{["B","I","U"].map(t=><button key={t} onClick={()=>document.execCommand(t==="B"?"bold":t==="I"?"italic":"underline")} style={{width:28,height:28,background:"transparent",border:`1px solid ${V.b}`,borderRadius:4,color:V.t2,fontSize:12,cursor:"pointer",fontWeight:t==="B"?"bold":"normal",fontStyle:t==="I"?"italic":"normal",textDecoration:t==="U"?"underline":"none"}}>{t}</button>)}<button onClick={()=>{const url=prompt("URL do link:");if(url)document.execCommand("createLink",false,url)}} style={{width:28,height:28,background:"transparent",border:`1px solid ${V.b}`,borderRadius:4,color:V.t2,fontSize:12,cursor:"pointer"}}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></button></div><div ref={edRef} contentEditable dangerouslySetInnerHTML={{__html:terms}} onInput={e=>setTerms((e.target as any).innerHTML)} style={{minHeight:140,color:V.t2,fontSize:13,outline:"none",fontFamily:S}} suppressContentEditableWarning/></div><Bt primary onClick={handleSaveTerms} style={{marginTop:16}}>✓ {tSaved?"Salvo!":tSaving?"Salvando...":"Salvar"}</Bt></div>);
  }

  /* ── Coprodução sub-tab ── */
  function CoprodSubTab() {
    return (<div style={{...cs,padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><h3 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>Coprodução</h3></div>
      <div style={{padding:20,textAlign:"center"}}><span style={{color:V.t3,fontSize:12}}>Coprodução estará disponível em breve.</span></div>
    </div>);
  }

  /* ═══════════════════════════════════════════════════
     CUPONS TAB
     ═══════════════════════════════════════════════════ */
  function CuponsTab() {
    return (<>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h2 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>Cupons</h2><Bt primary onClick={()=>setModal("newCoupon")}>+ Criar cupom</Bt></div>
      {couponsLoading ? (
        <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Carregando cupons...</span></div>
      ) : COUPONS.length === 0 ? (
        <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Nenhum cupom cadastrado</span></div>
      ) : COUPONS.map((c: any)=>(<div key={c.id} style={{...cs,padding:16,marginBottom:8,display:"flex",alignItems:"center",gap:14,position:"relative",overflow:"hidden"}}><div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:c.on?V.em:V.t3}}/><span style={{fontSize:16}}>🏷</span><div style={{flex:1}}><span style={{fontFamily:M,fontSize:15,fontWeight:700,color:V.t,letterSpacing:".06em"}}>{c.code}</span><br/><span style={{fontSize:11,color:V.t2}}>{c.type==="%" ? `${c.val}% de desconto` : `R$ ${(c.val/100).toFixed(2)} de desconto`}</span></div><div style={{textAlign:"right"}}><span style={{fontFamily:M,fontSize:14,fontWeight:600,color:V.t}}>{c.used}</span><br/><span style={{fontSize:9,color:V.t3}}>usos{c.max?` / ${c.max}`:""}</span></div><Bg color={c.on?V.g:V.t3}>{c.on?"ATIVO":"OFF"}</Bg></div>))}
    </>);
  }

  /* ═══════════════════════════════════════════════════
     CAMPANHAS TAB
     ═══════════════════════════════════════════════════ */
  function CampanhasTab() {
    return (<>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h2 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>Campanhas</h2></div>
      <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:12}}>Campanhas estará disponível em breve.</span></div>
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
        setReviews((prev: any) => [res, ...prev]); setShowRevForm(false); setNewRevName(""); setNewRevText(""); setNewRevRating(5); setNewRevVer(false);
      } catch (e) { console.error(e); }
    };
    const handleDeleteReview = async (id: string) => {
      try { await apiFetch(`/products/${productId}/reviews/${id}`, { method: "DELETE" }); setReviews((prev: any) => prev.filter((r: any) => r.id !== id)); } catch(e){ console.error(e); }
    };
    if (reviewsLoading) return <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Carregando avaliações...</span></div>;
    return (<>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h2 style={{fontSize:16,fontWeight:600,color:V.t,margin:0}}>Avaliações</h2><Bt primary onClick={()=>setShowRevForm(!showRevForm)}>+ Criar avaliação</Bt></div>
      {showRevForm && <div style={{...cs,padding:16,marginBottom:16}}>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}><Fd label="Nome do autor" value={newRevName} onChange={setNewRevName}/><Fd label="Nota"><div style={{display:"flex",gap:4}}>{[1,2,3,4,5].map(i=><span key={i} onClick={()=>setNewRevRating(i)} style={{cursor:"pointer",fontSize:18,color:i<=newRevRating?V.y:V.t3}}>★</span>)}</div></Fd></div>
        <Fd label="Texto" full><textarea style={{...is,height:60}} value={newRevText} onChange={e=>setNewRevText(e.target.value)} placeholder="Texto da avaliação..."/></Fd>
        <Tg label="Verificado?" checked={newRevVer} onChange={setNewRevVer}/>
        <Bt primary onClick={handleCreateReview} style={{marginTop:8}}>Criar</Bt>
      </div>}
      {REVIEWS.length === 0 ? <div style={{...cs,padding:40,textAlign:"center"}}><span style={{color:V.t3,fontSize:13}}>Nenhuma avaliação ainda</span></div> : <>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20}}>
        <div style={{textAlign:"center"}}><span style={{fontFamily:M,fontSize:48,fontWeight:700,color:V.y}}>{(REVIEWS.reduce((s: number,r: any)=>s+r.rating,0)/REVIEWS.length).toFixed(1)}</span><div style={{display:"flex",gap:2,justifyContent:"center",marginTop:4}}>{[1,2,3,4,5].map(i=><span key={i} style={{color:i<=Math.round(REVIEWS.reduce((s: number,r: any)=>s+r.rating,0)/REVIEWS.length)?V.y:V.t3}}>★</span>)}</div><span style={{fontSize:10,color:V.t3}}>{REVIEWS.length} avaliações</span></div>
        <div style={{flex:1}}>{[5,4,3,2,1].map(n=>{const ct=REVIEWS.filter((r: any)=>r.rating===n).length;return <div key={n} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontFamily:M,fontSize:10,color:V.t2,width:16}}>{n}★</span><div style={{flex:1,height:6,background:V.e,borderRadius:3,overflow:"hidden"}}><div style={{width:`${(ct/REVIEWS.length)*100}%`,height:"100%",background:V.y,borderRadius:3}}/></div><span style={{fontFamily:M,fontSize:10,color:V.t3,width:20}}>{ct}</span></div>})}</div>
      </div>
      {REVIEWS.map((r: any)=>(<div key={r.id} style={{...cs,padding:16,marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><div style={{width:28,height:28,borderRadius:6,background:V.e,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:M,fontSize:10,fontWeight:700,color:V.t2}}>{r.name.split(" ").map((w: string)=>w[0]).join("")}</div><span style={{fontSize:13,fontWeight:600,color:V.t}}>{r.name}</span>{r.ver&&<Bg color={V.g}>VERIFICADO</Bg>}<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>{[1,2,3,4,5].map(i=><span key={i} style={{color:i<=r.rating?V.y:V.t3,fontSize:12}}>★</span>)}<Bt onClick={()=>handleDeleteReview(r.id)} style={{padding:"2px 6px",color:V.r,fontSize:10}}>x</Bt></div></div><p style={{fontSize:12,color:V.t2,margin:0}}>{r.text}</p></div>))}
      </>}
    </>);
  }

  /* ═══════════════════════════════════════════════════
     AFTER PAY TAB
     ═══════════════════════════════════════════════════ */
  function AfterPayTab() {
    const [apDup, setApDup] = useState(p.afterPayDuplicateAddress ?? false);
    const [apCharge, setApCharge] = useState(p.afterPayAffiliateCharge ?? false);
    const [apChargeVal, setApChargeVal] = useState(String(p.afterPayChargeValue ?? 0));
    const [apProvider, setApProvider] = useState(p.afterPayShippingProvider ?? "");
    const [apSaving, setApSaving] = useState(false);
    const [apSaved, setApSaved] = useState(false);
    const handleSaveAP = async () => {
      setApSaving(true);
      try { await updateProduct(productId, { afterPayDuplicateAddress: apDup, afterPayAffiliateCharge: apCharge, afterPayChargeValue: parseFloat(apChargeVal) || 0, afterPayShippingProvider: apProvider }); mutateProd(); setApSaved(true); setTimeout(()=>setApSaved(false),2000); } catch(e){ console.error(e); }
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
          <select style={is} value={apProvider} onChange={e=>setApProvider(e.target.value)}><option value="">Selecione um provedor</option><option value="correios">Correios</option><option value="jadlog">Jadlog</option><option value="outro">Outro</option></select>
        </Fd>
      </div>
      <Bt primary onClick={handleSaveAP} style={{marginTop:16}}>✓ {apSaved?"Salvo!":apSaving?"Salvando...":"Salvar"}</Bt>
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
    useEffect(() => { apiFetch(`/products/${productId}/ai-config`).then((r: any) => setAiCfg(r || {})).catch(() => setAiCfg({})).finally(() => setAiLoading(false)); }, []);
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
      setWhobuys(cp.whobuys || ""); setPains(cp.pains || ""); setPromise(cp.promise || "");
      if (Array.isArray(aiCfg.objections) && aiCfg.objections.length) setObjs(aiCfg.objections);
      setTone(aiCfg.tone || "CONSULTIVE"); setPersist(String(aiCfg.persistenceLevel ?? 3)); setMsgLimit(String(aiCfg.messageLimit ?? 10));
      const fc = aiCfg.followUpConfig || {};
      setFollowUp(fc.schedule || "2h,24h,72h");
      setAutoLink(fc.autoCheckoutLink !== false); setOfferDisc(fc.offerDiscount !== false); setUseUrg(fc.useUrgency !== false);
    }, [aiCfg]);
    const handleSaveAI = async () => {
      setAiSaving(true);
      try {
        await apiFetch(`/products/${productId}/ai-config`, { method: "PUT", body: {
          customerProfile: { whobuys, pains, promise }, objections: objs, tone, persistenceLevel: parseInt(persist)||3, messageLimit: parseInt(msgLimit)||10,
          followUpConfig: { schedule: followUp, autoCheckoutLink: autoLink, offerDiscount: offerDisc, useUrgency: useUrg },
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
          <Fd label="Tom"><select style={is} value={tone} onChange={e=>setTone(e.target.value)}><option value="CONSULTIVE">Consultivo</option><option value="AGGRESSIVE">Agressivo</option><option value="FRIENDLY">Amigável</option><option value="TECHNICAL">Técnico</option><option value="CASUAL">Casual</option></select></Fd>
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
    const lks = [
      { n: "Checkout Padrão", s: plan.slug },
      { n: "CHECKOUT COM CUPOM", s: plan.slug + "?cupom=RESGATE10" },
      { n: "CHECKOUT UPSELL", s: plan.slug + "?upsell=true" },
    ];
    return (
      <Modal title="Checkouts disponíveis" onClose={() => { setModal(null); setExpCk(null); }}>
        {lks.map((ck, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <button
              onClick={() => setExpCk(expCk === i ? null : i)}
              style={{
                width: "100%", display: "flex", justifyContent: "space-between",
                padding: "14px 16px", ...cs, cursor: "pointer",
                border: `1px solid ${expCk === i ? V.em + "40" : V.b}`,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: V.t }}>{ck.n}</span>
              <span style={{ color: V.t3 }}>{expCk === i ? "−" : "+"}</span>
            </button>
            {expCk === i && (
              <div style={{
                padding: "12px 16px", background: V.e,
                borderRadius: "0 0 6px 6px", border: `1px solid ${V.b}`, borderTop: "none",
              }}>
                {[
                  ["URL Padrão", `pay.kloel.com/${ck.s}`],
                  ["URL Ads", `pay.kloel.co/checkout/${plan.ref}`],
                  ["URL curta", `pay.kloel.com/r/${plan.ref}`],
                ].map(([l, u]) => (
                  <div key={l} style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 10, color: V.t3, display: "block", marginBottom: 4 }}>{l}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Bt onClick={() => cp(`https://${u}`, l + i)} style={{ padding: "5px 12px" }}>
                        {copied === l + i ? "✓ Copiado" : "Copiar"}
                      </Bt>
                      <span style={{ fontFamily: M, fontSize: 11, color: V.em, flex: 1 }}>{u}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
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
      {modal==="campLinks"&&<Modal title="Link de Campanha" onClose={()=>setModal(null)}>{[["URL padrão","kloel.com/campanhas/cpa/cam0mlxyg"],["URL para Meta e TikTok","pay.kloel.co/campanhas/cpa/cam0mlxyg"],["URL protetor","pay.kloel.com/r/cam0mlxyg"]].map(([l,u])=><div key={l} style={{marginBottom:12}}><span style={{fontSize:10,color:V.t3,display:"block",marginBottom:4}}>{l}</span><div style={{display:"flex",alignItems:"center",gap:6}}><Bt onClick={()=>cp(u,"camp-"+l)} style={{padding:"5px 12px"}}>{copied==="camp-"+l?"✓ Copiado":"Copiar"}</Bt><span style={{fontFamily:M,fontSize:11,color:V.em,flex:1}}>{u}</span></div></div>)}</Modal>}
      {modal==="newPlan"&&<Modal title="Criar novo plano" onClose={()=>setModal(null)}><div style={{display:"flex",flexWrap:"wrap",gap:"0 16px"}}><Fd label="Nome" value={newPlanName} onChange={setNewPlanName}/><Fd label="Valor (R$)" value={newPlanPrice} onChange={setNewPlanPrice}/><Fd label="Qtd" value={newPlanQty} onChange={setNewPlanQty}/><Fd label="Parcelas" value={newPlanInst} onChange={setNewPlanInst}/></div><Bt primary onClick={handleCreatePlan} style={{marginTop:12}}>✓ Criar</Bt></Modal>}
      {modal==="newBump"&&<Modal title="Novo Order Bump" onClose={()=>setModal(null)}><Fd label="Nome" value={newBumpName} onChange={setNewBumpName} full/><Fd label="Preço" value={newBumpPrice} onChange={setNewBumpPrice}/><Fd label="Checkbox" value="Sim, eu quero!"/><Bt primary onClick={handleCreateBump} style={{marginTop:12}}>✓ Salvar</Bt></Modal>}
      {modal==="newCoupon"&&<Modal title="Criar cupom" onClose={()=>setModal(null)}><Fd label="Código" value={newCouponCode} onChange={setNewCouponCode}/><Fd label="Tipo"><select style={is} value={newCouponType} onChange={e=>setNewCouponType(e.target.value)}><option value="%">Porcentagem (%)</option><option value="R$">Valor fixo (R$)</option></select></Fd><Fd label="Valor" value={newCouponVal} onChange={setNewCouponVal}/><Fd label="Limite usos" value={newCouponMax} onChange={setNewCouponMax}/><Fd label="Data expiração"><input type="date" style={is}/></Fd><Bt primary onClick={handleCreateCoupon} style={{marginTop:12}}>✓ Criar</Bt></Modal>}
      {modal==="newCamp"&&<Modal title="Nova Campanha" onClose={()=>setModal(null)}><Fd label="Nome *" value="" full/><Fd label="URL Destino *" full><select style={is}>{PLANS.map((pl: any)=><option key={pl.id}>{pl.name} — Checkout Padrão</option>)}</select></Fd><Fd label="Pixel" full><select style={is}><option>Nenhum</option><option>PIXEL DAM PURAH — Facebook</option><option>TAG GOOGLE — AW-173134... — Google Ads</option></select></Fd><div style={{display:"flex",gap:12,marginTop:12}}><Bt onClick={()=>setModal(null)}>← Voltar</Bt><Bt primary onClick={()=>setModal(null)} style={{marginLeft:"auto"}}>✓ Salvar</Bt></div></Modal>}
      {modal==="gerente"&&<Modal title="Informações do Gerente" onClose={()=>setModal(null)}><Fd label="Associado *"><select style={is}><option>Selecione</option></select></Fd><Fd label="Comissão com afiliado" value=""/><Fd label="Comissão sem afiliado" value=""/><Tg label="Permite convite?" checked={false} onChange={()=>{}}/><Tg label="Permite alterar comissão?" checked={false} onChange={()=>{}}/><Bt primary onClick={()=>setModal(null)} style={{marginTop:12}}>✓ Salvar</Bt></Modal>}
      {modal==="coprodutor"&&<Modal title="Informações do Coprodutor" onClose={()=>setModal(null)}><Fd label="Associado *"><select style={is}><option>Selecione</option></select></Fd><Fd label="Comissão *" value="0,00%"/><Bt primary onClick={()=>setModal(null)} style={{marginTop:12}}>✓ Salvar</Bt></Modal>}
    </div>
  );
}
