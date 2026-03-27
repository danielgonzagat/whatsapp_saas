'use client';

import { useState, useRef, useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useProducts, useProductMutations } from '@/hooks/useProducts';
import { PRODUCT_CATEGORIES } from '@/lib/categories';
import { apiFetch, tokenStorage } from '@/lib/api';
import { apiUrl } from '@/lib/http';

/* ═══════════════════════════════════════════════
   KLOEL MONITOR — Products Page
   List View + 7-Step Create Flow (single file)
   ═══════════════════════════════════════════════ */

// ── Fonts ──
const SORA = "var(--font-sora), 'Sora', sans-serif";
const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

// ── Colors ──
const VOID   = '#0A0A0C';
const SURF   = '#111113';
const ELEV   = '#19191C';
const BRD    = '#222226';
const GLOW   = '#333338';
const SILVER = '#E0DDD8';
const MUTED  = '#6E6E73';
const DIM    = '#3A3A3F';
const EMBER  = '#E85D30';
const EMBER_BG = 'rgba(232,93,48,0.06)';

// ── Spinner ──
const Spinner = ({ size = 20 }: { size?: number }) => (
  <div style={{width:size,height:size,border:'2px solid transparent',borderTopColor:EMBER,borderRadius:'50%',animation:'spin 1s linear infinite'}} />
);

// ═══════════════════════════════════════════════
// INLINE SVG ICONS (IC object — no lucide-react)
// ═══════════════════════════════════════════════
const IC = {
  plus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  ),
  search: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  ),
  filter: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
  ),
  package: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
  ),
  dots: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
  ),
  eye: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  ),
  copy: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
  ),
  link: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
  ),
  arrowLeft: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
  ),
  arrowRight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
  ),
  upload: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
  ),
  sparkle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>
  ),
  check: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  ),
  // Product type icons
  curso: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
  ),
  ebook: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
  ),
  comunidade: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  ),
  fisico: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
  ),
  assinatura: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 6l-9.5 9.5-5-5L1 18"/><polyline points="17 6 23 6 23 12"/></svg>
  ),
  servico: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  ),
  revenue: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
  ),
  sales: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  ),
  active: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
  ),
  image: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#222226" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
  ),
};

// ═══════════════════════════════════════════════
// PRODUCT TYPES (for create flow step 1)
// ═══════════════════════════════════════════════
const PRODUCT_TYPES = [
  { id: 'curso',       label: 'Curso Online',   desc: 'Aulas em video, modulos e certificados', icon: IC.curso },
  { id: 'ebook',       label: 'E-book',         desc: 'Livros digitais em PDF ou EPUB',          icon: IC.ebook },
  { id: 'comunidade',  label: 'Comunidade',     desc: 'Grupo exclusivo com conteudo premium',    icon: IC.comunidade },
  { id: 'fisico',      label: 'Produto Fisico', desc: 'Itens que precisam de envio',              icon: IC.fisico },
  { id: 'assinatura',  label: 'Assinatura',     desc: 'Cobranca recorrente mensal ou anual',     icon: IC.assinatura },
  { id: 'servico',     label: 'Servico',        desc: 'Consultoria, mentoria ou freelance',      icon: IC.servico },
];

const STEP_LABELS = ['Tipo', 'Detalhes', 'Precificacao', 'Logistica', 'Afiliacao', 'Pagina IA', 'Revisao'];
const CURRENCIES = ['BRL', 'USD', 'EUR'];
const PERIODS = ['mensal', 'trimestral', 'semestral', 'anual'];
const SHIPPING_TYPES = ['correios', 'transportadora', 'retirada', 'frete_gratis'];

// ═══════════════════════════════════════════════
// SHARED STYLES
// ═══════════════════════════════════════════════
const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: SURF,
  border: `1px solid ${BRD}`,
  borderRadius: 6,
  padding: '10px 14px',
  fontSize: 13,
  fontFamily: SORA,
  color: SILVER,
  outline: 'none',
  transition: 'border-color 150ms ease',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236E6E73' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 32,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 600,
  color: MUTED,
  fontFamily: SORA,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
};

const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  e.target.style.borderColor = GLOW;
};
const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  e.target.style.borderColor = BRD;
};

// ═══════════════════════════════════════════════
// STATUS / FORMAT CONFIG
// ═══════════════════════════════════════════════
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  APPROVED: { label: 'Ativo',     color: EMBER },
  PENDING:  { label: 'Pendente',  color: MUTED },
  DRAFT:    { label: 'Rascunho',  color: DIM },
  REJECTED: { label: 'Reprovado', color: '#E05252' },
  BLOCKED:  { label: 'Bloqueado', color: '#8B2020' },
};

const FORMAT_MAP: Record<string, string> = {
  PHYSICAL: 'Fisico',
  DIGITAL:  'Digital',
  HYBRID:   'Hibrido',
  CURSO:    'Curso',
  EBOOK:    'E-book',
  COMUNIDADE: 'Comunidade',
  ASSINATURA: 'Assinatura',
  SERVICO:  'Servico',
  FISICO:   'Fisico',
};

// ═══════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════
export default function ProductsPage() {
  // ── View toggle ──
  const [view, setView] = useState<'list' | 'create'>('list');

  // ── List state ──
  const { products: rawProducts, total, isLoading, mutate } = useProducts();
  const { mutate: globalMutate } = useSWRConfig();
  const { createProduct, deleteProduct } = useProductMutations();
  const products = (rawProducts || []) as any[];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  // ── Create state ──
  const [step, setStep] = useState(0);
  const [pType, setPType] = useState<string | null>(null);
  const [pName, setPName] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [pCat, setPCat] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [pCurrency, setPCurrency] = useState('BRL');
  const [pBilling, setPBilling] = useState('unico');
  const [pPeriod, setPPeriod] = useState('mensal');
  const [pGuarantee, setPGuarantee] = useState('30');
  const [pWeight, setPWeight] = useState('');
  const [pHeight, setPHeight] = useState('');
  const [pWidth, setPWidth] = useState('');
  const [pLength, setPLength] = useState('');
  const [pShipping, setPShipping] = useState('correios');
  const [pAffiliate, setPAffiliate] = useState(false);
  const [pCommission, setPCommission] = useState('30');
  const [pApproval, setPApproval] = useState('automatica');
  const [aiDone, setAiDone] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiText, setAiText] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [aiDescGenerating, setAiDescGenerating] = useState(false);
  const [pImageUrl, setPImageUrl] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPhysical = pType === 'fisico';

  // Determine actual steps (skip Logistica if not physical)
  const allSteps = ['Tipo', 'Detalhes', 'Precificacao', 'Logistica', 'Afiliacao', 'Pagina IA', 'Revisao'];
  const steps = isPhysical ? allSteps : allSteps.filter(s => s !== 'Logistica');
  const totalSteps = steps.length;

  const resetCreate = () => {
    setStep(0); setPType(null); setPName(''); setPDesc(''); setPCat('');
    setPPrice(''); setPCurrency('BRL'); setPBilling('unico'); setPPeriod('mensal');
    setPGuarantee('30'); setPWeight(''); setPHeight(''); setPWidth(''); setPLength('');
    setPShipping('correios'); setPAffiliate(false); setPCommission('30'); setPApproval('automatica');
    setAiDone(false); setAiGenerating(false); setAiText(''); setPublishing(false);
    setAiDescGenerating(false); setPImageUrl(''); setImageUploading(false); setImageError('');
  };

  // ── Filtered products ──
  const filtered = products.filter((p: any) => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.name?.toLowerCase().includes(q) && !p.description?.toLowerCase().includes(q)) return false;
    }
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  // ── Stats ──
  const activeCount = products.filter((p: any) => p.status === 'APPROVED').length;
  const totalRevenue = products.reduce((sum: number, p: any) => sum + (p.price || 0), 0);

  // ── Delete handler ──
  const handleDelete = async (id: string) => {
    setMenuOpen(null);
    try {
      await deleteProduct(id);
      mutate();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // ── AI Description generation ──
  const generateAIDesc = () => {
    if (!pName) return;
    setAiDescGenerating(true);
    // Simulated AI generation
    setTimeout(() => {
      const aiDescription = `${pName} e a solucao definitiva para quem busca resultados reais. Desenvolvido com base nas melhores praticas do mercado, este produto oferece uma experiencia completa e transformadora. Com conteudo exclusivo e suporte dedicado, voce tera acesso a tudo que precisa para alcancar seus objetivos de forma rapida e eficiente.`;
      setPDesc(aiDescription);
      setAiDescGenerating(false);
    }, 2000);
  };

  // ── AI Page generation ──
  const generateAIPage = async () => {
    setAiGenerating(true);
    setAiText('');
    const fallbackText = `Pagina de vendas gerada com sucesso para "${pName}". A pagina inclui: headline persuasiva, secao de beneficios, depoimentos simulados, FAQ, garantia de ${pGuarantee} dias, e botao de compra por R$ ${pPrice || '0'}. Pronta para publicacao.`;

    try {
      const res = await apiFetch('/kloel/think', {
        method: 'POST',
        body: {
          message: `Gere uma pagina de vendas curta com headline, subheadline e 3 beneficios para o produto: "${pName}" - ${pDesc || 'sem descricao'}. Responda SOMENTE com o conteudo, sem explicacoes.`,
        },
      });
      const content = res.data?.content || res.data?.message;
      if (content) {
        // Animate typing of real AI content
        let i = 0;
        const interval = setInterval(() => {
          if (i < content.length) {
            setAiText(content.slice(0, i + 1));
            i++;
          } else {
            clearInterval(interval);
            setAiGenerating(false);
            setAiDone(true);
          }
        }, 25);
      } else {
        throw new Error('empty_response');
      }
    } catch {
      // Fallback to template text if API fails
      let i = 0;
      const interval = setInterval(() => {
        if (i < fallbackText.length) {
          setAiText(fallbackText.slice(0, i + 1));
          i++;
        } else {
          clearInterval(interval);
          setAiGenerating(false);
          setAiDone(true);
        }
      }, 25);
    }
  };

  // ── Publish handler ──
  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await createProduct({
        name: pName,
        description: pDesc,
        price: parseFloat(pPrice) || 0,
        currency: pCurrency,
        category: pCat,
        format: pType?.toUpperCase() || 'DIGITAL',
        status: 'DRAFT',
        active: true,
        warrantyDays: parseInt(pGuarantee) || 30,
        metadata: {
          billingType: pBilling,
          recurringInterval: pBilling === 'recorrente' ? pPeriod : null,
          dimensions: isPhysical ? { weight: pWeight, height: pHeight, width: pWidth, length: pLength } : null,
          shippingType: isPhysical ? pShipping : null,
          affiliateEnabled: pAffiliate,
          commissionPercent: pAffiliate ? parseInt(pCommission) : null,
          approvalMode: pAffiliate ? pApproval : null,
          aiPageGenerated: aiDone,
        },
      });
      if (res?.error || (res?.statusCode && res.statusCode >= 400)) {
        alert('Erro ao criar produto: ' + (res.error || res.message || 'Tente novamente'));
        return;
      }
      // Force revalidate all product queries
      await mutate();
      await globalMutate(
        (key: unknown) => typeof key === 'string' && key.startsWith('/products'),
        undefined,
        { revalidate: true }
      );
      setView('list');
      resetCreate();
    } catch (err) {
      console.error('Publish failed:', err);
      alert('Erro ao criar produto. Verifique os dados e tente novamente.');
    } finally {
      setPublishing(false);
    }
  };

  // ═══════════════════════════════════════════════
  // RENDER — CREATE FLOW
  // ═══════════════════════════════════════════════
  if (view === 'create') {
    const currentStepName = steps[step];

    const canNext = (() => {
      switch (currentStepName) {
        case 'Tipo': return !!pType;
        case 'Detalhes': return !!pName;
        case 'Precificacao': return !!pPrice;
        case 'Logistica': return !!pWeight;
        case 'Afiliacao': return true;
        case 'Pagina IA': return true;
        case 'Revisao': return true;
        default: return true;
      }
    })();

    const isFinal = step === totalSteps - 1;

    return (
      <div style={{ minHeight: '100vh', backgroundColor: VOID }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>

          {/* ── Header ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
            <button
              onClick={() => { setView('list'); resetCreate(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'none', border: 'none', color: MUTED,
                fontSize: 13, fontFamily: SORA, cursor: 'pointer',
                padding: 0, transition: 'color 150ms ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = SILVER)}
              onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
            >
              {IC.arrowLeft}
              Voltar para produtos
            </button>
            <span style={{ fontSize: 12, fontFamily: MONO, color: DIM }}>
              {step + 1}/{totalSteps}
            </span>
          </div>

          {/* ── Step Indicator Bars ── */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
            {steps.map((s, i) => (
              <div
                key={s}
                style={{
                  flex: 1, height: 3, borderRadius: 2,
                  backgroundColor: i <= step ? EMBER : ELEV,
                  transition: 'background-color 150ms ease',
                }}
              />
            ))}
          </div>

          {/* ── Step Title ── */}
          <h2 style={{ fontFamily: SORA, fontSize: 20, fontWeight: 600, color: SILVER, margin: '0 0 4px' }}>
            {currentStepName === 'Tipo' && 'Tipo do Produto'}
            {currentStepName === 'Detalhes' && 'Detalhes do Produto'}
            {currentStepName === 'Precificacao' && 'Precificacao'}
            {currentStepName === 'Logistica' && 'Logistica e Envio'}
            {currentStepName === 'Afiliacao' && 'Programa de Afiliados'}
            {currentStepName === 'Pagina IA' && 'Pagina de Vendas com IA'}
            {currentStepName === 'Revisao' && 'Revisao Final'}
          </h2>
          <p style={{ fontFamily: SORA, fontSize: 13, color: DIM, margin: '0 0 28px' }}>
            {currentStepName === 'Tipo' && 'Selecione o tipo de produto que voce deseja criar'}
            {currentStepName === 'Detalhes' && 'Preencha as informacoes basicas do seu produto'}
            {currentStepName === 'Precificacao' && 'Defina o preco e modelo de cobranca'}
            {currentStepName === 'Logistica' && 'Configure peso, dimensoes e tipo de envio'}
            {currentStepName === 'Afiliacao' && 'Configure se deseja ter afiliados vendendo seu produto'}
            {currentStepName === 'Pagina IA' && 'Gere automaticamente uma pagina de vendas com inteligencia artificial'}
            {currentStepName === 'Revisao' && 'Revise todos os dados antes de publicar'}
          </p>

          {/* ═══ STEP: Tipo ═══ */}
          {currentStepName === 'Tipo' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {PRODUCT_TYPES.map(t => {
                const active = pType === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setPType(t.id)}
                    style={{
                      padding: 20,
                      borderRadius: 6,
                      border: `1px solid ${active ? EMBER : BRD}`,
                      backgroundColor: active ? EMBER_BG : SURF,
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = GLOW; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = BRD; }}
                  >
                    <div style={{ color: active ? EMBER : MUTED, marginBottom: 12 }}>{t.icon}</div>
                    <div style={{ fontFamily: SORA, fontSize: 14, fontWeight: 600, color: active ? SILVER : SILVER, marginBottom: 4 }}>
                      {t.label}
                    </div>
                    <div style={{ fontFamily: SORA, fontSize: 12, color: DIM, lineHeight: 1.4 }}>
                      {t.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ═══ STEP: Detalhes ═══ */}
          {currentStepName === 'Detalhes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Name */}
              <div>
                <label style={labelStyle}>Nome do Produto</label>
                <input
                  type="text" value={pName} onChange={e => setPName(e.target.value)}
                  placeholder="Ex: Curso Completo de Marketing Digital"
                  style={inputStyle} onFocus={handleFocus} onBlur={handleBlur}
                />
              </div>

              {/* Description + AI button */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ ...labelStyle, margin: 0 }}>Descricao</label>
                  <button
                    onClick={generateAIDesc}
                    disabled={!pName || aiDescGenerating}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 12px', borderRadius: 6, border: 'none',
                      backgroundColor: EMBER, color: '#fff',
                      fontSize: 11, fontWeight: 600, fontFamily: SORA,
                      cursor: pName && !aiDescGenerating ? 'pointer' : 'not-allowed',
                      opacity: pName && !aiDescGenerating ? 1 : 0.5,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      transition: 'opacity 150ms ease',
                    }}
                  >
                    {aiDescGenerating ? <Spinner size={12} /> : IC.sparkle}
                    {aiDescGenerating ? 'GERANDO...' : 'GERAR COM IA'}
                  </button>
                </div>
                <textarea
                  value={pDesc} onChange={e => setPDesc(e.target.value)}
                  placeholder="Descreva seu produto..."
                  rows={5}
                  style={{ ...inputStyle, resize: 'vertical' as const }}
                  onFocus={handleFocus as any} onBlur={handleBlur as any}
                />
              </div>

              {/* Category */}
              <div>
                <label style={labelStyle}>Categoria</label>
                <select value={pCat} onChange={e => setPCat(e.target.value)} style={selectStyle} onFocus={handleFocus as any} onBlur={handleBlur as any}>
                  <option value="">Selecione uma categoria</option>
                  {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Image Upload */}
              <div>
                <label style={labelStyle}>Imagem do Produto</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      setImageError('Arquivo muito grande. Maximo 5MB.');
                      return;
                    }
                    setImageUploading(true);
                    setImageError('');
                    try {
                      const formData = new FormData();
                      formData.append('file', file);
                      const token = tokenStorage.getToken();
                      const workspaceId = tokenStorage.getWorkspaceId();
                      const headers: Record<string, string> = {};
                      if (token) headers['Authorization'] = `Bearer ${token}`;
                      if (workspaceId) headers['x-workspace-id'] = workspaceId;
                      const res = await fetch(apiUrl('/kloel/upload'), {
                        method: 'POST',
                        headers,
                        body: formData,
                      });
                      if (!res.ok) throw new Error(`Upload falhou (${res.status})`);
                      const data = await res.json();
                      if (data.success && data.url) {
                        setPImageUrl(data.url);
                      } else if (data.success) {
                        // Backend may not return URL yet -- use filename as reference
                        setPImageUrl(data.filename || file.name);
                      } else {
                        throw new Error(data.error || 'Falha no upload');
                      }
                    } catch (err: any) {
                      setImageError(err?.message || 'Erro ao enviar imagem. Tente novamente.');
                    } finally {
                      setImageUploading(false);
                      // Reset input so the same file can be selected again
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }
                  }}
                />
                {pImageUrl ? (
                  <div style={{
                    border: `1px solid ${EMBER}`, borderRadius: 6,
                    padding: 12, backgroundColor: SURF,
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    {pImageUrl.startsWith('http') ? (
                      <img
                        src={pImageUrl}
                        alt="Preview"
                        style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, border: `1px solid ${BRD}` }}
                      />
                    ) : (
                      <div style={{
                        width: 80, height: 80, borderRadius: 4,
                        backgroundColor: ELEV, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1px solid ${BRD}`,
                      }}>
                        <div style={{ color: EMBER }}>{IC.check}</div>
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: SORA, fontSize: 13, color: SILVER, margin: 0, fontWeight: 500 }}>
                        Imagem enviada
                      </p>
                      <p style={{ fontFamily: MONO, fontSize: 11, color: DIM, margin: '4px 0 0', wordBreak: 'break-all' }}>
                        {pImageUrl}
                      </p>
                    </div>
                    <button
                      onClick={() => { setPImageUrl(''); fileInputRef.current?.click(); }}
                      style={{
                        padding: '6px 12px', borderRadius: 6, border: `1px solid ${BRD}`,
                        background: 'transparent', color: MUTED, fontSize: 11,
                        fontFamily: SORA, cursor: 'pointer', fontWeight: 600,
                      }}
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => !imageUploading && fileInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${imageError ? '#E05252' : BRD}`, borderRadius: 6,
                      padding: '40px 20px', textAlign: 'center',
                      backgroundColor: SURF, cursor: imageUploading ? 'wait' : 'pointer',
                      transition: 'border-color 150ms ease',
                      opacity: imageUploading ? 0.6 : 1,
                    }}
                    onMouseEnter={e => { if (!imageUploading) e.currentTarget.style.borderColor = GLOW; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = imageError ? '#E05252' : BRD; }}
                  >
                    {imageUploading ? (
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><Spinner size={24} /></div>
                    ) : (
                      <div style={{ color: DIM, marginBottom: 8, display: 'flex', justifyContent: 'center' }}>{IC.upload}</div>
                    )}
                    <p style={{ fontFamily: SORA, fontSize: 13, color: MUTED, margin: 0 }}>
                      {imageUploading ? 'Enviando imagem...' : 'Arraste uma imagem ou clique para selecionar'}
                    </p>
                    <p style={{ fontFamily: SORA, fontSize: 11, color: DIM, margin: '4px 0 0' }}>
                      PNG, JPG ou WEBP. Max 5MB.
                    </p>
                    {imageError && (
                      <p style={{ fontFamily: SORA, fontSize: 12, color: '#E05252', margin: '8px 0 0', fontWeight: 500 }}>
                        {imageError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ STEP: Precificacao ═══ */}
          {currentStepName === 'Precificacao' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Price + Currency */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Preco</label>
                  <input
                    type="number" value={pPrice} onChange={e => setPPrice(e.target.value)}
                    placeholder="0.00" step="0.01" min="0"
                    style={{ ...inputStyle, fontFamily: MONO }}
                    onFocus={handleFocus} onBlur={handleBlur}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Moeda</label>
                  <select value={pCurrency} onChange={e => setPCurrency(e.target.value)} style={selectStyle} onFocus={handleFocus as any} onBlur={handleBlur as any}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Billing type toggle */}
              <div>
                <label style={labelStyle}>Tipo de Cobranca</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { id: 'unico', label: 'Unico' },
                    { id: 'recorrente', label: 'Assinatura' },
                    { id: 'parcelado', label: 'Parcelado' },
                  ].map(b => {
                    const active = pBilling === b.id;
                    return (
                      <button
                        key={b.id}
                        onClick={() => setPBilling(b.id)}
                        style={{
                          flex: 1, padding: '10px 16px', borderRadius: 6,
                          border: `1px solid ${active ? EMBER : BRD}`,
                          backgroundColor: active ? EMBER_BG : 'transparent',
                          color: active ? EMBER : MUTED,
                          fontSize: 13, fontWeight: 500, fontFamily: SORA,
                          cursor: 'pointer', transition: 'all 150ms ease',
                        }}
                      >
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Recurring period (if subscription) */}
              {pBilling === 'recorrente' && (
                <div>
                  <label style={labelStyle}>Periodo de Cobranca</label>
                  <select value={pPeriod} onChange={e => setPPeriod(e.target.value)} style={selectStyle} onFocus={handleFocus as any} onBlur={handleBlur as any}>
                    {PERIODS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
              )}

              {/* Guarantee */}
              <div>
                <label style={labelStyle}>Garantia (dias)</label>
                <input
                  type="number" value={pGuarantee} onChange={e => setPGuarantee(e.target.value)}
                  placeholder="30" min="0"
                  style={{ ...inputStyle, fontFamily: MONO }}
                  onFocus={handleFocus} onBlur={handleBlur}
                />
              </div>
            </div>
          )}

          {/* ═══ STEP: Logistica (physical only) ═══ */}
          {currentStepName === 'Logistica' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Weight */}
              <div>
                <label style={labelStyle}>Peso (kg)</label>
                <input
                  type="number" value={pWeight} onChange={e => setPWeight(e.target.value)}
                  placeholder="0.5" step="0.01" min="0"
                  style={{ ...inputStyle, fontFamily: MONO }}
                  onFocus={handleFocus} onBlur={handleBlur}
                />
              </div>

              {/* Dimensions */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Altura (cm)</label>
                  <input type="number" value={pHeight} onChange={e => setPHeight(e.target.value)} placeholder="10" min="0" style={{ ...inputStyle, fontFamily: MONO }} onFocus={handleFocus} onBlur={handleBlur} />
                </div>
                <div>
                  <label style={labelStyle}>Largura (cm)</label>
                  <input type="number" value={pWidth} onChange={e => setPWidth(e.target.value)} placeholder="20" min="0" style={{ ...inputStyle, fontFamily: MONO }} onFocus={handleFocus} onBlur={handleBlur} />
                </div>
                <div>
                  <label style={labelStyle}>Comprimento (cm)</label>
                  <input type="number" value={pLength} onChange={e => setPLength(e.target.value)} placeholder="30" min="0" style={{ ...inputStyle, fontFamily: MONO }} onFocus={handleFocus} onBlur={handleBlur} />
                </div>
              </div>

              {/* Shipping type */}
              <div>
                <label style={labelStyle}>Tipo de Envio</label>
                <select value={pShipping} onChange={e => setPShipping(e.target.value)} style={selectStyle} onFocus={handleFocus as any} onBlur={handleBlur as any}>
                  {SHIPPING_TYPES.map(s => (
                    <option key={s} value={s}>
                      {s === 'correios' ? 'Correios' : s === 'transportadora' ? 'Transportadora' : s === 'retirada' ? 'Retirada no local' : 'Frete gratis'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ═══ STEP: Afiliacao ═══ */}
          {currentStepName === 'Afiliacao' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Toggle */}
              <div
                onClick={() => setPAffiliate(!pAffiliate)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 20, borderRadius: 6,
                  border: `1px solid ${pAffiliate ? EMBER : BRD}`,
                  backgroundColor: pAffiliate ? EMBER_BG : SURF,
                  cursor: 'pointer', transition: 'all 150ms ease',
                }}
              >
                <div>
                  <div style={{ fontFamily: SORA, fontSize: 14, fontWeight: 600, color: SILVER }}>
                    Habilitar Programa de Afiliados
                  </div>
                  <div style={{ fontFamily: SORA, fontSize: 12, color: DIM, marginTop: 4 }}>
                    Permita que outros promovam e vendam seu produto
                  </div>
                </div>
                <div style={{
                  width: 44, height: 24, borderRadius: 6, position: 'relative',
                  backgroundColor: pAffiliate ? EMBER : ELEV,
                  transition: 'background-color 150ms ease',
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 4,
                    backgroundColor: '#fff',
                    position: 'absolute', top: 3,
                    left: pAffiliate ? 23 : 3,
                    transition: 'left 150ms ease',
                  }} />
                </div>
              </div>

              {pAffiliate && (
                <>
                  {/* Commission */}
                  <div>
                    <label style={labelStyle}>Comissao (%)</label>
                    <input
                      type="number" value={pCommission} onChange={e => setPCommission(e.target.value)}
                      placeholder="30" min="1" max="90"
                      style={{ ...inputStyle, fontFamily: MONO }}
                      onFocus={handleFocus} onBlur={handleBlur}
                    />
                  </div>

                  {/* Approval mode */}
                  <div>
                    <label style={labelStyle}>Modo de Aprovacao</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[
                        { id: 'automatica', label: 'Automatica' },
                        { id: 'manual', label: 'Manual' },
                      ].map(a => {
                        const active = pApproval === a.id;
                        return (
                          <button
                            key={a.id}
                            onClick={() => setPApproval(a.id)}
                            style={{
                              flex: 1, padding: '10px 16px', borderRadius: 6,
                              border: `1px solid ${active ? EMBER : BRD}`,
                              backgroundColor: active ? EMBER_BG : 'transparent',
                              color: active ? EMBER : MUTED,
                              fontSize: 13, fontWeight: 500, fontFamily: SORA,
                              cursor: 'pointer', transition: 'all 150ms ease',
                            }}
                          >
                            {a.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ STEP: Pagina IA ═══ */}
          {currentStepName === 'Pagina IA' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {!aiDone && !aiGenerating && (
                <div style={{
                  padding: 40, borderRadius: 6, border: `2px dashed ${BRD}`,
                  backgroundColor: SURF, textAlign: 'center',
                }}>
                  <div style={{ color: DIM, marginBottom: 12, display: 'flex', justifyContent: 'center' }}>{IC.sparkle}</div>
                  <p style={{ fontFamily: SORA, fontSize: 14, color: SILVER, margin: '0 0 8px', fontWeight: 500 }}>
                    Gere uma pagina de vendas automatica
                  </p>
                  <p style={{ fontFamily: SORA, fontSize: 12, color: DIM, margin: '0 0 20px' }}>
                    Nossa IA vai criar uma pagina otimizada com base nas informacoes do seu produto
                  </p>
                  <button
                    onClick={generateAIPage}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '10px 24px', borderRadius: 6, border: 'none',
                      backgroundColor: EMBER, color: '#fff',
                      fontSize: 13, fontWeight: 600, fontFamily: SORA,
                      cursor: 'pointer', transition: 'opacity 150ms ease',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {IC.sparkle}
                    GERAR COM IA
                  </button>
                </div>
              )}

              {aiGenerating && (
                <div style={{
                  padding: 24, borderRadius: 6, border: `1px solid ${BRD}`,
                  backgroundColor: SURF,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <Spinner size={16} />
                    <span style={{ fontFamily: SORA, fontSize: 13, color: EMBER, fontWeight: 500 }}>
                      Gerando pagina...
                    </span>
                  </div>
                  <p style={{ fontFamily: MONO, fontSize: 12, color: MUTED, lineHeight: 1.8, margin: 0 }}>
                    {aiText}<span style={{ animation: 'blink 1s step-end infinite', color: EMBER }}>|</span>
                  </p>
                </div>
              )}

              {aiDone && (
                <div style={{
                  padding: 24, borderRadius: 6, border: `1px solid ${EMBER}`,
                  backgroundColor: EMBER_BG,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ color: EMBER }}>{IC.check}</div>
                    <span style={{ fontFamily: SORA, fontSize: 13, color: EMBER, fontWeight: 600 }}>
                      Pagina gerada com sucesso
                    </span>
                  </div>
                  <p style={{ fontFamily: SORA, fontSize: 13, color: MUTED, lineHeight: 1.6, margin: 0 }}>
                    {aiText}
                  </p>
                </div>
              )}

              {/* Skip option */}
              {!aiDone && !aiGenerating && (
                <p style={{ fontFamily: SORA, fontSize: 12, color: DIM, textAlign: 'center' }}>
                  Voce pode pular esta etapa e criar a pagina depois.
                </p>
              )}
            </div>
          )}

          {/* ═══ STEP: Revisao ═══ */}
          {currentStepName === 'Revisao' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Review card */}
              <div style={{ borderRadius: 6, border: `1px solid ${BRD}`, backgroundColor: SURF, overflow: 'hidden' }}>
                {[
                  { label: 'Tipo',        value: PRODUCT_TYPES.find(t => t.id === pType)?.label || '-' },
                  { label: 'Nome',        value: pName || '-' },
                  { label: 'Categoria',   value: pCat || '-' },
                  { label: 'Preco',       value: pPrice ? `${pCurrency} ${parseFloat(pPrice).toFixed(2).replace('.', ',')}` : '-', mono: true },
                  { label: 'Cobranca',    value: pBilling === 'unico' ? 'Pagamento unico' : pBilling === 'recorrente' ? `Assinatura ${pPeriod}` : 'Parcelado' },
                  { label: 'Garantia',    value: `${pGuarantee} dias`, mono: true },
                  ...(isPhysical ? [
                    { label: 'Peso',        value: pWeight ? `${pWeight} kg` : '-', mono: true },
                    { label: 'Dimensoes',   value: pHeight && pWidth && pLength ? `${pHeight} x ${pWidth} x ${pLength} cm` : '-', mono: true },
                    { label: 'Envio',       value: pShipping },
                  ] : []),
                  { label: 'Afiliados',   value: pAffiliate ? `Sim (${pCommission}% comissao)` : 'Nao' },
                  { label: 'Pagina IA',   value: aiDone ? 'Gerada' : 'Nao gerada' },
                ].map((row, i) => (
                  <div
                    key={row.label}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 20px',
                      borderBottom: `1px solid ${BRD}`,
                    }}
                  >
                    <span style={{ fontFamily: SORA, fontSize: 12, color: MUTED, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {row.label}
                    </span>
                    <span style={{ fontFamily: (row as any).mono ? MONO : SORA, fontSize: 13, color: SILVER, fontWeight: 500 }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Description preview */}
              {pDesc && (
                <div style={{ padding: 20, borderRadius: 6, border: `1px solid ${BRD}`, backgroundColor: SURF }}>
                  <div style={{ ...labelStyle, marginBottom: 8 }}>Descricao</div>
                  <p style={{ fontFamily: SORA, fontSize: 13, color: MUTED, lineHeight: 1.6, margin: 0 }}>
                    {pDesc}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Navigation buttons ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
            <button
              onClick={() => step > 0 ? setStep(step - 1) : null}
              disabled={step === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 20px', borderRadius: 6,
                border: `1px solid ${BRD}`,
                backgroundColor: 'transparent',
                color: step === 0 ? DIM : MUTED,
                fontSize: 13, fontWeight: 500, fontFamily: SORA,
                cursor: step === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              {IC.arrowLeft}
              Voltar
            </button>

            {isFinal ? (
              <button
                onClick={handlePublish}
                disabled={publishing}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 28px', borderRadius: 6, border: 'none',
                  backgroundColor: EMBER, color: '#fff',
                  fontSize: 13, fontWeight: 600, fontFamily: SORA,
                  cursor: publishing ? 'not-allowed' : 'pointer',
                  opacity: publishing ? 0.7 : 1,
                  letterSpacing: '0.02em',
                  transition: 'opacity 150ms ease',
                }}
              >
                {publishing ? <Spinner size={14} /> : IC.check}
                {publishing ? 'Publicando...' : 'Publicar'}
              </button>
            ) : (
              <button
                onClick={() => canNext && setStep(step + 1)}
                disabled={!canNext}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 20px', borderRadius: 6, border: 'none',
                  backgroundColor: canNext ? EMBER : ELEV,
                  color: canNext ? '#fff' : DIM,
                  fontSize: 13, fontWeight: 600, fontFamily: SORA,
                  cursor: canNext ? 'pointer' : 'not-allowed',
                  transition: 'all 150ms ease',
                }}
              >
                Proximo
                {IC.arrowRight}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // RENDER — LIST VIEW
  // ═══════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', backgroundColor: VOID }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: SORA, fontSize: 20, fontWeight: 600, color: SILVER, margin: 0, letterSpacing: '-0.01em' }}>
              Meus Produtos
            </h1>
            <p style={{ fontFamily: SORA, fontSize: 13, color: DIM, margin: '4px 0 0' }}>
              Gerencie todos os seus produtos cadastrados na plataforma Kloel
            </p>
          </div>
          <button
            onClick={() => { resetCreate(); setView('create'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 6, border: 'none',
              backgroundColor: EMBER, color: '#fff',
              fontSize: 13, fontWeight: 600, fontFamily: SORA,
              cursor: 'pointer', letterSpacing: '0.02em',
              transition: 'opacity 150ms ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            {IC.plus}
            Criar produto
          </button>
        </div>

        {/* ── Stats Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Receita Total', value: `R$ ${totalRevenue.toFixed(2).replace('.', ',')}`, icon: IC.revenue, accent: true },
            { label: 'Vendas', value: `${products.length}`, icon: IC.sales, accent: false },
            { label: 'Produtos Ativos', value: `${activeCount}`, icon: IC.active, accent: false },
          ].map(stat => (
            <div
              key={stat.label}
              style={{
                padding: 20, borderRadius: 6,
                border: `1px solid ${BRD}`,
                backgroundColor: SURF,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontFamily: SORA, fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {stat.label}
                </span>
                <div style={{ color: DIM }}>{stat.icon}</div>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: stat.accent ? EMBER : SILVER }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Search + Filter Row ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {/* Search input */}
          <div style={{ position: 'relative', flex: 1 }}>
            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: MUTED, display: 'flex' }}>
              {IC.search}
            </div>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar produtos..."
              style={{ ...inputStyle, paddingLeft: 34 }}
              onFocus={handleFocus} onBlur={handleBlur}
            />
          </div>

          {/* Status filter buttons */}
          {[
            { id: '', label: 'Todos' },
            { id: 'APPROVED', label: 'Ativo' },
            { id: 'DRAFT', label: 'Rascunho' },
          ].map(f => {
            const active = statusFilter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                style={{
                  padding: '10px 16px', borderRadius: 6,
                  border: `1px solid ${active ? EMBER : BRD}`,
                  backgroundColor: active ? EMBER_BG : 'transparent',
                  color: active ? EMBER : MUTED,
                  fontSize: 12, fontWeight: 600, fontFamily: SORA,
                  cursor: 'pointer', letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  transition: 'all 150ms ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* ── Loading ── */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <Spinner />
            <p style={{ marginTop: 16, fontSize: 14, color: MUTED, fontFamily: SORA }}>
              Carregando produtos...
            </p>
          </div>
        ) : filtered.length === 0 ? (
          /* ── Empty State ── */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '80px 20px', borderRadius: 6, border: `2px dashed ${BRD}`, backgroundColor: SURF,
          }}>
            <div style={{ color: DIM, marginBottom: 16 }}>{IC.package}</div>
            <h2 style={{ fontFamily: SORA, fontSize: 18, fontWeight: 600, color: SILVER, margin: '0 0 8px' }}>
              {products.length === 0 ? 'Nenhum produto cadastrado' : 'Nenhum resultado encontrado'}
            </h2>
            <p style={{ fontFamily: SORA, fontSize: 13, color: MUTED, margin: '0 0 24px', textAlign: 'center', maxWidth: 360 }}>
              {products.length === 0
                ? 'Cadastre seu primeiro produto e comece a vender com o Kloel.'
                : 'Tente alterar os filtros ou o termo de busca.'
              }
            </p>
            {products.length === 0 && (
              <button
                onClick={() => { resetCreate(); setView('create'); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 24px', borderRadius: 6, border: 'none',
                  backgroundColor: EMBER, color: '#fff',
                  fontSize: 13, fontWeight: 600, fontFamily: SORA,
                  cursor: 'pointer', transition: 'opacity 150ms ease',
                }}
              >
                {IC.plus}
                Criar meu primeiro produto
              </button>
            )}
          </div>
        ) : (
          /* ── Product Table ── */
          <div style={{ borderRadius: 6, border: `1px solid ${BRD}`, backgroundColor: SURF, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 40px',
              padding: '12px 20px', borderBottom: `1px solid ${BRD}`,
              backgroundColor: ELEV,
            }}>
              {['Produto', 'Tipo', 'Preco', 'Status', 'Receita', ''].map(h => (
                <span key={h} style={{
                  fontFamily: SORA, fontSize: 11, fontWeight: 600, color: MUTED,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Table rows */}
            {filtered.map((p: any) => {
              const st = STATUS_MAP[p.status] || STATUS_MAP.DRAFT;
              const isMenuOpen = menuOpen === p.id;
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 40px',
                    padding: '14px 20px', borderBottom: `1px solid ${BRD}`,
                    alignItems: 'center', transition: 'background-color 150ms ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = ELEV)}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {/* Product name + desc */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontFamily: SORA, fontSize: 13, fontWeight: 600, color: SILVER,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {p.name}
                    </div>
                    {p.description && (
                      <div style={{
                        fontFamily: SORA, fontSize: 11, color: DIM, marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {p.description}
                      </div>
                    )}
                  </div>

                  {/* Type */}
                  <span style={{ fontFamily: SORA, fontSize: 12, color: MUTED }}>
                    {FORMAT_MAP[p.format] || p.format || '-'}
                  </span>

                  {/* Price */}
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: SILVER }}>
                    R$ {(p.price || 0).toFixed(2).replace('.', ',')}
                  </span>

                  {/* Status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: st.color }} />
                    <span style={{ fontFamily: SORA, fontSize: 12, fontWeight: 500, color: st.color }}>
                      {st.label}
                    </span>
                  </div>

                  {/* Revenue (using price as placeholder) */}
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: EMBER }}>
                    R$ {(p.price || 0).toFixed(2).replace('.', ',')}
                  </span>

                  {/* Action menu */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(isMenuOpen ? null : p.id);
                      }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: MUTED, padding: 4, display: 'flex',
                        transition: 'color 150ms ease',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = SILVER)}
                      onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
                    >
                      {IC.dots}
                    </button>

                    {isMenuOpen && (
                      <>
                        {/* Click-away overlay */}
                        <div
                          onClick={() => setMenuOpen(null)}
                          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
                        />
                        {/* Dropdown menu — only allowed shadow */}
                        <div style={{
                          position: 'absolute', top: '100%', right: 0, zIndex: 100,
                          minWidth: 180, padding: 4, borderRadius: 6,
                          border: `1px solid ${BRD}`, backgroundColor: SURF,
                          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        }}>
                          {[
                            { icon: IC.eye,   label: 'Ver detalhes',   action: () => setMenuOpen(null) },
                            { icon: IC.edit,  label: 'Editar',          action: () => setMenuOpen(null) },
                            { icon: IC.copy,  label: 'Duplicar',        action: () => setMenuOpen(null) },
                            { icon: IC.link,  label: 'Copiar link',     action: () => setMenuOpen(null) },
                            { icon: IC.trash, label: 'Excluir',         action: () => handleDelete(p.id), danger: true },
                          ].map((item, idx) => (
                            <button
                              key={idx}
                              onClick={(e) => { e.stopPropagation(); item.action(); }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                padding: '8px 12px', borderRadius: 4, border: 'none',
                                backgroundColor: 'transparent',
                                color: (item as any).danger ? EMBER : MUTED,
                                fontSize: 12, fontWeight: 500, fontFamily: SORA,
                                cursor: 'pointer', transition: 'all 150ms ease',
                                textAlign: 'left',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.backgroundColor = ELEV;
                                e.currentTarget.style.color = (item as any).danger ? EMBER : SILVER;
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = (item as any).danger ? EMBER : MUTED;
                              }}
                            >
                              {item.icon}
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Results count ── */}
        {!isLoading && filtered.length > 0 && (
          <p style={{ fontFamily: SORA, fontSize: 12, color: DIM, marginTop: 12 }}>
            {filtered.length} produto{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
