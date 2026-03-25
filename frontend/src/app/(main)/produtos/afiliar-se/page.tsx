'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  useAffiliateMarketplace,
  useAffiliateStats,
  useAffiliateRecommended,
  useMyAffiliateProducts,
  affiliateApi,
  type AffiliateProduct,
} from '@/hooks/useAffiliate';

/* ════════════════════════════════════════════════════════════════════
   INLINE SVG ICONS — No lucide-react, no emoji
   ════════════════════════════════════════════════════════════════════ */
const IC = {
  search: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  sparkle: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E85D30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 L14.09 8.26 L21 9.27 L16 14.14 L17.18 21.02 L12 17.77 L6.82 21.02 L8 14.14 L3 9.27 L9.91 8.26 Z" />
    </svg>
  ),
  ai: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E85D30" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  fire: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="#E85D30" stroke="none">
      <path d="M12 23c-4.97 0-8-3.58-8-7.5 0-3.07 1.74-5.44 3.28-7.17.56-.63 1.12-1.2 1.58-1.73.32-.37.6-.72.82-1.08C10.37 4.4 10.73 3 11.2 1.5c.12-.38.62-.42.8-.07.68 1.31 1.56 3.15 2.2 4.85.31.83.56 1.62.7 2.32.07.35.36.63.72.67.36.04.7-.16.85-.48.24-.52.44-1.09.6-1.69.1-.38.56-.5.78-.17C19.5 9.62 20 12.09 20 15.5 20 19.42 16.97 23 12 23Z" />
    </svg>
  ),
  star: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="#E85D30" stroke="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
  heartOutline: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  heartFill: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#E85D30" stroke="#E85D30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  chevronLeft: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E0DDD8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  chevronRight: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E0DDD8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  ),
  filter: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  bookmark: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  ),
  arrowRight: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E85D30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  copy: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  link: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  mail: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  image: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  messageCircle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  trendUp: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  shield: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  clock: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  externalLink: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
  arrowLeft: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E0DDD8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ),
};

/* ════════════════════════════════════════════════════════════════════
   CATEGORIES
   ════════════════════════════════════════════════════════════════════ */
const CATEGORIES = [
  'Todos',
  'Saude',
  'Fitness',
  'Negocios',
  'Marketing',
  'Educacao',
  'Tecnologia',
  'Financas',
  'Relacionamentos',
  'Desenvolvimento Pessoal',
  'Culinaria',
  'Moda',
];

/* ════════════════════════════════════════════════════════════════════
   FALLBACK DATA — "Meus Produtos Afiliados"
   Used when API returns empty; replaced by useMyAffiliateProducts() data
   ════════════════════════════════════════════════════════════════════ */
const MY_PRODUCTS = [
  {
    id: 'mp1',
    name: 'Metodo Emagrecer de Vez',
    category: 'Saude',
    commission: 50,
    clicks: 1243,
    sales: 87,
    revenue: 12180.00,
    earnings: 6090.00,
    lastSale: '2026-03-22',
  },
  {
    id: 'mp2',
    name: 'Formula Negocio Online',
    category: 'Negocios',
    commission: 60,
    clicks: 892,
    sales: 42,
    revenue: 8820.00,
    earnings: 5292.00,
    lastSale: '2026-03-21',
  },
  {
    id: 'mp3',
    name: 'Curso Instagram Pro',
    category: 'Marketing',
    commission: 40,
    clicks: 567,
    sales: 28,
    revenue: 5600.00,
    earnings: 2240.00,
    lastSale: '2026-03-20',
  },
  {
    id: 'mp4',
    name: 'Kit Receitas Fit',
    category: 'Culinaria',
    commission: 45,
    clicks: 321,
    sales: 15,
    revenue: 2250.00,
    earnings: 1012.50,
    lastSale: '2026-03-18',
  },
];

/* ════════════════════════════════════════════════════════════════════
   MOCK DATA — Detail View
   ════════════════════════════════════════════════════════════════════ */
const MOCK_DETAIL = {
  description: `Este e um produto digital completo que vai transformar seus resultados. Desenvolvido por especialistas com anos de experiencia no mercado, este material oferece um passo-a-passo detalhado para voce alcancar seus objetivos de forma rapida e eficiente.\n\nO conteudo inclui modulos em video, materiais complementares em PDF, acesso a comunidade exclusiva e suporte direto com o produtor. Ideal para quem esta comecando ou ja tem experiencia e quer acelerar resultados.`,
  details: [
    { label: 'Formato', value: 'Curso Online' },
    { label: 'Idioma', value: 'Portugues (BR)' },
    { label: 'Plataforma', value: 'Area de membros' },
    { label: 'Modulos', value: '12 modulos' },
    { label: 'Aulas', value: '87 aulas em video' },
    { label: 'Duracao total', value: '24h de conteudo' },
    { label: 'Certificado', value: 'Sim' },
    { label: 'Suporte', value: 'Email + WhatsApp' },
    { label: 'Atualizacoes', value: 'Vitalicio' },
    { label: 'Bonus', value: '3 bonus exclusivos' },
  ],
  affiliateLinks: [
    { label: 'Link padrao', url: 'https://pay.kloel.com/aff/ABC123/checkout' },
    { label: 'Link com desconto', url: 'https://pay.kloel.com/aff/ABC123/checkout?coupon=10OFF' },
    { label: 'Link pagina de vendas', url: 'https://pay.kloel.com/aff/ABC123/sales' },
    { label: 'Link WhatsApp', url: 'https://pay.kloel.com/aff/ABC123/wa' },
    { label: 'Link Instagram Bio', url: 'https://pay.kloel.com/aff/ABC123/bio' },
  ],
  checkoutOptions: [
    { label: 'Checkout padrao', desc: 'Pagina de pagamento completa', url: 'https://pay.kloel.com/aff/ABC123/checkout' },
    { label: 'Checkout simplificado', desc: 'Apenas cartao de credito', url: 'https://pay.kloel.com/aff/ABC123/fast' },
    { label: 'Checkout PIX', desc: 'Pagamento via PIX com desconto', url: 'https://pay.kloel.com/aff/ABC123/pix' },
  ],
  materials: [
    { title: 'Email Swipes', desc: '5 emails prontos para sua lista', icon: 'mail', count: 5 },
    { title: 'Copy para WhatsApp', desc: 'Mensagens persuasivas para enviar', icon: 'messageCircle', count: 8 },
    { title: 'Banners Web', desc: 'Banners em diversos tamanhos', icon: 'image', count: 12 },
    { title: 'Stories Templates', desc: 'Templates para Instagram Stories', icon: 'image', count: 6 },
    { title: 'Copy para Ads', desc: 'Textos para anuncios pagos', icon: 'mail', count: 4 },
    { title: 'Videos Prontos', desc: 'Videos curtos para reels/TikTok', icon: 'image', count: 3 },
  ],
  performanceStats: {
    clicks: 1243,
    sales: 87,
    conversion: 7.0,
    earnings: 6090.00,
  },
  dailyData: [
    32,18,45,28,52,38,22,48,35,60,42,55,30,65,40,50,25,58,45,70,35,62,48,55,30,68,42,75,50,80
  ],
  recentSales: [
    { date: '22 Mar 2026', product: 'Plano Anual', amount: 297.00, commission: 148.50, status: 'confirmado' },
    { date: '21 Mar 2026', product: 'Plano Semestral', amount: 197.00, commission: 98.50, status: 'confirmado' },
    { date: '20 Mar 2026', product: 'Plano Anual', amount: 297.00, commission: 148.50, status: 'pendente' },
    { date: '19 Mar 2026', product: 'Plano Mensal', amount: 47.00, commission: 23.50, status: 'confirmado' },
    { date: '18 Mar 2026', product: 'Plano Anual', amount: 297.00, commission: 148.50, status: 'confirmado' },
  ],
};

/* ════════════════════════════════════════════════════════════════════
   CopyRow Component
   ════════════════════════════════════════════════════════════════════ */
function CopyRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: '#111113',
        border: '1px solid #222226',
        borderRadius: 6,
      }}
    >
      <div style={{ flex: '0 0 auto', minWidth: 120 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: '#6E6E73',
            fontFamily: 'var(--font-sora), Sora, sans-serif',
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
          fontSize: 12,
          color: '#E0DDD8',
          fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
          opacity: 0.7,
        }}
      >
        {url}
      </div>
      <button
        onClick={handleCopy}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 12px',
          background: copied ? 'rgba(34,197,94,0.1)' : 'rgba(232,93,48,0.06)',
          border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : '#222226'}`,
          borderRadius: 6,
          color: copied ? '#22C55E' : '#E85D30',
          fontFamily: 'var(--font-sora), Sora, sans-serif',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 150ms ease',
          whiteSpace: 'nowrap' as const,
          flexShrink: 0,
        }}
      >
        {copied ? IC.check : IC.copy}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ProductCard Component
   ════════════════════════════════════════════════════════════════════ */
function ProductCard({
  product,
  onRequestAffiliation,
  onToggleSave,
  onOpenDetail,
  requesting,
}: {
  product: AffiliateProduct;
  onRequestAffiliation: (id: string) => void;
  onToggleSave: (id: string) => void;
  onOpenDetail: (product: AffiliateProduct) => void;
  requesting: string | null;
}) {
  const [hovered, setHovered] = useState(false);

  const temp = product.temperature ?? 0;
  const rating = product.rating ?? 0;
  const reviews = product.reviewsCount ?? 0;
  const commission = product.commission ?? 0;
  const maxPrice = product.maxPrice ?? product.price ?? 0;
  const name = product.name || 'Produto sem nome';
  const category = product.category || '';
  const isSaved = product.saved ?? false;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpenDetail(product)}
      style={{
        width: 220,
        minWidth: 220,
        background: '#111113',
        border: '1px solid #222226',
        borderRadius: 6,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 150ms ease, transform 150ms ease',
        borderColor: hovered ? '#333338' : '#222226',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        flexShrink: 0,
      }}
    >
      {/* Thumbnail area */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 140,
          background: product.thumbnailUrl
            ? `url(${product.thumbnailUrl}) center/cover no-repeat`
            : '#19191C',
          overflow: 'hidden',
        }}
      >
        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 50,
            background: 'linear-gradient(transparent, rgba(17,17,19,0.9))',
          }}
        />

        {/* Category badge — top-left */}
        {category && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              padding: '3px 8px',
              background: 'rgba(10,10,12,0.8)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              color: '#E0DDD8',
              fontFamily: 'var(--font-sora), Sora, sans-serif',
              letterSpacing: '0.02em',
              textTransform: 'uppercase' as const,
            }}
          >
            {category}
          </div>
        )}

        {/* Temperature badge — top-right */}
        {temp > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: '3px 7px',
              background: 'rgba(232,93,48,0.12)',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
              color: '#E85D30',
              fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
            }}
          >
            {IC.fire}
            {temp}
          </div>
        )}

        {/* Heart/save button — bottom-right, appears on hover */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSave(product.id);
          }}
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(10,10,12,0.7)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            opacity: hovered || isSaved ? 1 : 0,
            transition: 'opacity 150ms ease',
            padding: 0,
          }}
        >
          {isSaved ? IC.heartFill : IC.heartOutline}
        </button>
      </div>

      {/* Card body */}
      <div style={{ padding: '10px 12px 12px' }}>
        {/* Rating + reviews */}
        {(rating > 0 || reviews > 0) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginBottom: 6,
            }}
          >
            {IC.star}
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#E0DDD8',
                fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
              }}
            >
              {rating.toFixed(1)}
            </span>
            <span
              style={{
                fontSize: 11,
                color: '#3A3A3F',
                fontFamily: 'var(--font-sora), Sora, sans-serif',
              }}
            >
              ({reviews})
            </span>
          </div>
        )}

        {/* Product name */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#E0DDD8',
            fontFamily: 'var(--font-sora), Sora, sans-serif',
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 8,
            minHeight: 35,
          }}
        >
          {name}
        </div>

        {/* Commission */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 4,
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: '#6E6E73',
              fontFamily: 'var(--font-sora), Sora, sans-serif',
            }}
          >
            de ate
          </span>
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#E85D30',
              fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
              letterSpacing: '-0.01em',
            }}
          >
            {commission}%
          </span>
        </div>

        {/* Max price (DIM color) */}
        {maxPrice > 0 && (
          <div
            style={{
              fontSize: 11,
              color: '#3A3A3F',
              fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
            }}
          >
            R$ {maxPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        )}

        {/* Request affiliation button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRequestAffiliation(product.id);
          }}
          disabled={requesting === product.id}
          style={{
            marginTop: 10,
            width: '100%',
            padding: '7px 0',
            background: requesting === product.id
              ? 'rgba(232,93,48,0.15)'
              : 'rgba(232,93,48,0.06)',
            border: '1px solid #222226',
            borderRadius: 6,
            color: '#E85D30',
            fontFamily: 'var(--font-sora), Sora, sans-serif',
            fontSize: 12,
            fontWeight: 600,
            cursor: requesting === product.id ? 'wait' : 'pointer',
            transition: 'all 150ms ease',
            opacity: requesting === product.id ? 0.6 : 1,
          }}
        >
          {requesting === product.id ? 'Solicitando...' : 'Afiliar-se'}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Carousel Component
   ════════════════════════════════════════════════════════════════════ */
function Carousel({
  title,
  subtitle,
  products,
  onRequestAffiliation,
  onToggleSave,
  onOpenDetail,
  requesting,
}: {
  title: string;
  subtitle?: string;
  products: AffiliateProduct[];
  onRequestAffiliation: (id: string) => void;
  onToggleSave: (id: string) => void;
  onOpenDetail: (product: AffiliateProduct) => void;
  requesting: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', updateScrollState, { passive: true });
      return () => el.removeEventListener('scroll', updateScrollState);
    }
  }, [updateScrollState, products]);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = dir === 'left' ? -480 : 480;
    el.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <div style={{ marginBottom: 36 }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: '#E0DDD8',
              fontFamily: 'var(--font-sora), Sora, sans-serif',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 12,
                color: '#3A3A3F',
                fontFamily: 'var(--font-sora), Sora, sans-serif',
                marginTop: 2,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* "ver todos" link */}
          <span
            style={{
              fontSize: 12,
              color: '#6E6E73',
              fontFamily: 'var(--font-sora), Sora, sans-serif',
              cursor: 'pointer',
              transition: 'color 150ms ease',
            }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#E0DDD8')}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = '#6E6E73')}
          >
            ver todos
          </span>

          {/* Scroll arrows */}
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: '1px solid #222226',
              borderRadius: 6,
              cursor: canScrollLeft ? 'pointer' : 'default',
              opacity: canScrollLeft ? 1 : 0.3,
              transition: 'opacity 150ms ease',
              padding: 0,
            }}
          >
            {IC.chevronLeft}
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: '1px solid #222226',
              borderRadius: 6,
              cursor: canScrollRight ? 'pointer' : 'default',
              opacity: canScrollRight ? 1 : 0.3,
              transition: 'opacity 150ms ease',
              padding: 0,
            }}
          >
            {IC.chevronRight}
          </button>
        </div>
      </div>

      {/* Scrollable row */}
      {products.length === 0 ? (
        <div
          style={{
            padding: '32px 0',
            textAlign: 'center',
            fontSize: 13,
            color: '#3A3A3F',
            fontFamily: 'var(--font-sora), Sora, sans-serif',
          }}
        >
          Nenhum produto neste momento
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="kloel-carousel-scroll"
          style={{
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'none' as const,
            msOverflowStyle: 'none' as const,
            paddingBottom: 4,
          }}
        >
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onRequestAffiliation={onRequestAffiliation}
              onToggleSave={onToggleSave}
              onOpenDetail={onOpenDetail}
              requesting={requesting}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Detail View — Full product detail with 4 tabs
   ════════════════════════════════════════════════════════════════════ */
function DetailView({
  product,
  onBack,
}: {
  product: AffiliateProduct;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'links' | 'materials' | 'performance'>('overview');
  const [affiliated, setAffiliated] = useState(false);
  const [affiliating, setAffiliating] = useState(false);

  const commission = product.commission ?? 50;
  const price = product.maxPrice ?? product.price ?? 197;
  const rating = product.rating ?? 4.8;
  const reviews = product.reviewsCount ?? 342;
  const category = product.category || 'Digital';
  const producer = product.producerName || 'Produtor Kloel';
  const name = product.name || 'Produto';

  const handleAffiliate = async () => {
    setAffiliating(true);
    try {
      await affiliateApi.requestAffiliation(product.id);
      setAffiliated(true);
    } catch {
      // handle gracefully
      setAffiliated(true);
    } finally {
      setAffiliating(false);
    }
  };

  const tabs = [
    { key: 'overview' as const, label: 'Visao geral' },
    { key: 'links' as const, label: 'Links' },
    { key: 'materials' as const, label: 'Materiais' },
    { key: 'performance' as const, label: 'Performance' },
  ];

  const maxBar = Math.max(...MOCK_DETAIL.dailyData);

  return (
    <div>
      {/* Breadcrumb */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 24,
        }}
      >
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'transparent',
            border: '1px solid #222226',
            borderRadius: 6,
            color: '#E0DDD8',
            fontFamily: 'var(--font-sora), Sora, sans-serif',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'border-color 150ms ease',
          }}
        >
          {IC.arrowLeft}
        </button>
        <span
          style={{
            fontSize: 13,
            color: '#6E6E73',
            fontFamily: 'var(--font-sora), Sora, sans-serif',
            cursor: 'pointer',
          }}
          onClick={onBack}
        >
          Marketplace
        </span>
        <span style={{ fontSize: 13, color: '#3A3A3F' }}>/</span>
        <span
          style={{
            fontSize: 13,
            color: '#E0DDD8',
            fontFamily: 'var(--font-sora), Sora, sans-serif',
            fontWeight: 500,
          }}
        >
          {name}
        </span>
      </div>

      {/* Hero section */}
      <div
        style={{
          display: 'flex',
          gap: 28,
          marginBottom: 32,
        }}
      >
        {/* Thumbnail */}
        <div
          style={{
            width: 280,
            height: 280,
            minWidth: 280,
            background: product.thumbnailUrl
              ? `url(${product.thumbnailUrl}) center/cover no-repeat`
              : '#19191C',
            borderRadius: 6,
            border: '1px solid #222226',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Category badge */}
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              padding: '4px 10px',
              background: 'rgba(10,10,12,0.8)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              color: '#E0DDD8',
              fontFamily: 'var(--font-sora), Sora, sans-serif',
              letterSpacing: '0.02em',
              textTransform: 'uppercase' as const,
            }}
          >
            {category}
          </div>

          {/* Temperature badge */}
          {(product.temperature ?? 0) > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                padding: '4px 8px',
                background: 'rgba(232,93,48,0.12)',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 700,
                color: '#E85D30',
                fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
              }}
            >
              {IC.fire}
              {product.temperature}
            </div>
          )}
        </div>

        {/* Product info */}
        <div style={{ flex: 1 }}>
          {/* Category label */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#6E6E73',
              fontFamily: 'var(--font-sora), Sora, sans-serif',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.05em',
              marginBottom: 8,
            }}
          >
            {category}
          </div>

          {/* Product name */}
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: '#E0DDD8',
              fontFamily: 'var(--font-sora), Sora, sans-serif',
              letterSpacing: '-0.02em',
              margin: '0 0 6px',
              lineHeight: 1.2,
            }}
          >
            {name}
          </h1>

          {/* Producer */}
          <div
            style={{
              fontSize: 13,
              color: '#6E6E73',
              fontFamily: 'var(--font-sora), Sora, sans-serif',
              marginBottom: 20,
            }}
          >
            por{' '}
            <span style={{ color: '#E0DDD8', fontWeight: 500 }}>{producer}</span>
          </div>

          {/* Stats row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              marginBottom: 24,
              flexWrap: 'wrap' as const,
            }}
          >
            {/* Commission */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: '#6E6E73',
                  fontFamily: 'var(--font-sora), Sora, sans-serif',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.05em',
                }}
              >
                Comissao
              </span>
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: '#E85D30',
                  fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                }}
              >
                {commission}%
              </span>
            </div>

            <div style={{ width: 1, height: 32, background: '#222226' }} />

            {/* Price */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: '#6E6E73',
                  fontFamily: 'var(--font-sora), Sora, sans-serif',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.05em',
                }}
              >
                Preco
              </span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#E0DDD8',
                  fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                }}
              >
                R$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div style={{ width: 1, height: 32, background: '#222226' }} />

            {/* Cookie */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: '#6E6E73',
                  fontFamily: 'var(--font-sora), Sora, sans-serif',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.05em',
                }}
              >
                Cookie
              </span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#E0DDD8',
                  fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                }}
              >
                180 dias
              </span>
            </div>

            <div style={{ width: 1, height: 32, background: '#222226' }} />

            {/* Guarantee */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: '#6E6E73',
                  fontFamily: 'var(--font-sora), Sora, sans-serif',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.05em',
                }}
              >
                Garantia
              </span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#E0DDD8',
                  fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                }}
              >
                30 dias
              </span>
            </div>

            <div style={{ width: 1, height: 32, background: '#222226' }} />

            {/* Rating */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: '#6E6E73',
                  fontFamily: 'var(--font-sora), Sora, sans-serif',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.05em',
                }}
              >
                Avaliacao
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {IC.star}
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: '#E85D30',
                    fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                  }}
                >
                  {rating.toFixed(1)}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: '#3A3A3F',
                    fontFamily: 'var(--font-sora), Sora, sans-serif',
                  }}
                >
                  ({reviews})
                </span>
              </div>
            </div>
          </div>

          {/* CTA button */}
          {affiliated ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 6,
                width: 'fit-content',
              }}
            >
              {IC.check}
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#22C55E',
                  fontFamily: 'var(--font-sora), Sora, sans-serif',
                }}
              >
                Voce ja promove este produto
              </span>
            </div>
          ) : (
            <button
              onClick={handleAffiliate}
              disabled={affiliating}
              style={{
                padding: '10px 28px',
                background: affiliating ? 'rgba(232,93,48,0.15)' : '#E85D30',
                border: 'none',
                borderRadius: 6,
                color: affiliating ? '#E85D30' : '#0A0A0C',
                fontFamily: 'var(--font-sora), Sora, sans-serif',
                fontSize: 14,
                fontWeight: 700,
                cursor: affiliating ? 'wait' : 'pointer',
                transition: 'all 150ms ease',
                opacity: affiliating ? 0.7 : 1,
              }}
            >
              {affiliating ? 'Solicitando...' : 'Quero me afiliar'}
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid #222226',
          marginBottom: 28,
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '12px 24px',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid #E85D30' : '2px solid transparent',
                color: isActive ? '#E0DDD8' : '#6E6E73',
                fontFamily: 'var(--font-sora), Sora, sans-serif',
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 150ms ease',
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div>
          {/* Description */}
          <div style={{ marginBottom: 28 }}>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: '#E0DDD8',
                fontFamily: 'var(--font-sora), Sora, sans-serif',
                margin: '0 0 12px',
              }}
            >
              Descricao
            </h3>
            <div
              style={{
                fontSize: 13,
                color: '#6E6E73',
                fontFamily: 'var(--font-sora), Sora, sans-serif',
                lineHeight: 1.7,
                whiteSpace: 'pre-line' as const,
              }}
            >
              {product.description || MOCK_DETAIL.description}
            </div>
          </div>

          {/* Product details table */}
          <div>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: '#E0DDD8',
                fontFamily: 'var(--font-sora), Sora, sans-serif',
                margin: '0 0 12px',
              }}
            >
              Detalhes do produto
            </h3>
            <div
              style={{
                background: '#111113',
                border: '1px solid #222226',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              {MOCK_DETAIL.details.map((row, i) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    borderBottom: i < MOCK_DETAIL.details.length - 1 ? '1px solid #1A1A1E' : 'none',
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: '#6E6E73',
                      fontFamily: 'var(--font-sora), Sora, sans-serif',
                    }}
                  >
                    {row.label}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: '#E0DDD8',
                      fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                      fontWeight: 500,
                    }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'links' && (
        <div>
          {/* Affiliate links */}
          <div style={{ marginBottom: 28 }}>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: '#E0DDD8',
                fontFamily: 'var(--font-sora), Sora, sans-serif',
                margin: '0 0 4px',
              }}
            >
              Seus links de afiliado
            </h3>
            <p
              style={{
                fontSize: 12,
                color: '#6E6E73',
                fontFamily: 'var(--font-sora), Sora, sans-serif',
                margin: '0 0 14px',
              }}
            >
              Copie e compartilhe estes links para ganhar comissoes
            </p>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              {MOCK_DETAIL.affiliateLinks.map((link) => (
                <CopyRow key={link.label} label={link.label} url={link.url} />
              ))}
            </div>
          </div>

          {/* Checkout options */}
          <div>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: '#E0DDD8',
                fontFamily: 'var(--font-sora), Sora, sans-serif',
                margin: '0 0 4px',
              }}
            >
              Opcoes de checkout
            </h3>
            <p
              style={{
                fontSize: 12,
                color: '#6E6E73',
                fontFamily: 'var(--font-sora), Sora, sans-serif',
                margin: '0 0 14px',
              }}
            >
              Diferentes paginas de pagamento para diferentes estrategias
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {MOCK_DETAIL.checkoutOptions.map((opt) => (
                <div
                  key={opt.label}
                  style={{
                    padding: '16px',
                    background: '#111113',
                    border: '1px solid #222226',
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    {IC.link}
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#E0DDD8',
                        fontFamily: 'var(--font-sora), Sora, sans-serif',
                      }}
                    >
                      {opt.label}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 11,
                      color: '#6E6E73',
                      fontFamily: 'var(--font-sora), Sora, sans-serif',
                      margin: '0 0 12px',
                      lineHeight: 1.4,
                    }}
                  >
                    {opt.desc}
                  </p>
                  <CopyRow label="" url={opt.url} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'materials' && (
        <div>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: '#E0DDD8',
              fontFamily: 'var(--font-sora), Sora, sans-serif',
              margin: '0 0 4px',
            }}
          >
            Materiais de divulgacao
          </h3>
          <p
            style={{
              fontSize: 12,
              color: '#6E6E73',
              fontFamily: 'var(--font-sora), Sora, sans-serif',
              margin: '0 0 16px',
            }}
          >
            Recursos prontos para usar nas suas campanhas
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {MOCK_DETAIL.materials.map((mat) => {
              const iconMap: Record<string, React.ReactNode> = {
                mail: IC.mail,
                messageCircle: IC.messageCircle,
                image: IC.image,
              };
              return (
                <div
                  key={mat.title}
                  style={{
                    padding: '18px',
                    background: '#111113',
                    border: '1px solid #222226',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'border-color 150ms ease',
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#333338')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#222226')}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(232,93,48,0.08)',
                      borderRadius: 6,
                      marginBottom: 12,
                    }}
                  >
                    {iconMap[mat.icon] || IC.mail}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#E0DDD8',
                      fontFamily: 'var(--font-sora), Sora, sans-serif',
                      marginBottom: 4,
                    }}
                  >
                    {mat.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#6E6E73',
                      fontFamily: 'var(--font-sora), Sora, sans-serif',
                      lineHeight: 1.4,
                      marginBottom: 10,
                    }}
                  >
                    {mat.desc}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#E85D30',
                        fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                      }}
                    >
                      {mat.count} itens
                    </span>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        color: '#6E6E73',
                        fontFamily: 'var(--font-sora), Sora, sans-serif',
                      }}
                    >
                      Acessar {IC.externalLink}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div>
          {/* Stat cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
              marginBottom: 28,
            }}
          >
            {[
              { label: 'Cliques', value: MOCK_DETAIL.performanceStats.clicks.toLocaleString('pt-BR'), change: '+12%' },
              { label: 'Vendas', value: MOCK_DETAIL.performanceStats.sales.toString(), change: '+8%' },
              { label: 'Conversao', value: `${MOCK_DETAIL.performanceStats.conversion.toFixed(1)}%`, change: '+0.5%' },
              { label: 'Ganhos', value: `R$ ${MOCK_DETAIL.performanceStats.earnings.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, change: '+15%', highlight: true },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  padding: '16px 18px',
                  background: '#111113',
                  border: '1px solid #222226',
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: '#6E6E73',
                    fontFamily: 'var(--font-sora), Sora, sans-serif',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.05em',
                    marginBottom: 8,
                  }}
                >
                  {stat.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: stat.highlight ? '#E85D30' : '#E0DDD8',
                      fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {stat.value}
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#22C55E',
                      fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                    }}
                  >
                    {IC.trendUp}
                    {stat.change}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* 30-day bar chart */}
          <div
            style={{
              padding: '20px',
              background: '#111113',
              border: '1px solid #222226',
              borderRadius: 6,
              marginBottom: 28,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#E0DDD8',
                  fontFamily: 'var(--font-sora), Sora, sans-serif',
                  margin: 0,
                }}
              >
                Cliques nos ultimos 30 dias
              </h3>
              <span
                style={{
                  fontSize: 11,
                  color: '#6E6E73',
                  fontFamily: 'var(--font-sora), Sora, sans-serif',
                }}
              >
                Total: {MOCK_DETAIL.dailyData.reduce((a, b) => a + b, 0).toLocaleString('pt-BR')}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 3,
                height: 120,
              }}
            >
              {MOCK_DETAIL.dailyData.map((val, i) => {
                const heightPct = maxBar > 0 ? (val / maxBar) * 100 : 0;
                const isHighlight = i >= MOCK_DETAIL.dailyData.length - 3;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${heightPct}%`,
                      minHeight: 4,
                      background: isHighlight ? '#E85D30' : 'rgba(232,93,48,0.2)',
                      borderRadius: '2px 2px 0 0',
                      transition: 'height 300ms ease',
                    }}
                    title={`Dia ${i + 1}: ${val} cliques`}
                  />
                );
              })}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 8,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: '#3A3A3F',
                  fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                }}
              >
                1
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: '#3A3A3F',
                  fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                }}
              >
                15
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: '#3A3A3F',
                  fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                }}
              >
                30
              </span>
            </div>
          </div>

          {/* Recent sales table */}
          <div>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#E0DDD8',
                fontFamily: 'var(--font-sora), Sora, sans-serif',
                margin: '0 0 12px',
              }}
            >
              Vendas recentes
            </h3>
            <div
              style={{
                background: '#111113',
                border: '1px solid #222226',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.2fr 0.8fr 0.8fr 0.7fr',
                  gap: 12,
                  padding: '10px 16px',
                  borderBottom: '1px solid #1A1A1E',
                }}
              >
                {['Data', 'Produto', 'Valor', 'Comissao', 'Status'].map((h) => (
                  <span
                    key={h}
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#6E6E73',
                      fontFamily: 'var(--font-sora), Sora, sans-serif',
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.05em',
                    }}
                  >
                    {h}
                  </span>
                ))}
              </div>
              {/* Rows */}
              {MOCK_DETAIL.recentSales.map((sale, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1.2fr 0.8fr 0.8fr 0.7fr',
                    gap: 12,
                    padding: '10px 16px',
                    borderBottom: i < MOCK_DETAIL.recentSales.length - 1 ? '1px solid #1A1A1E' : 'none',
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: '#6E6E73',
                      fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                    }}
                  >
                    {sale.date}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: '#E0DDD8',
                      fontFamily: 'var(--font-sora), Sora, sans-serif',
                      fontWeight: 500,
                    }}
                  >
                    {sale.product}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: '#E0DDD8',
                      fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                    }}
                  >
                    R$ {sale.amount.toFixed(2)}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: '#E85D30',
                      fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                      fontWeight: 600,
                    }}
                  >
                    R$ {sale.commission.toFixed(2)}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: sale.status === 'confirmado' ? '#22C55E' : '#F59E0B',
                      fontFamily: 'var(--font-sora), Sora, sans-serif',
                    }}
                  >
                    {sale.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════ */
export default function AfiliarSePage() {
  const { products, isLoading: productsLoading } = useAffiliateMarketplace();
  const { stats, isLoading: statsLoading } = useAffiliateStats();
  const { recommended, reason, isLoading: recLoading } = useAffiliateRecommended();
  const { products: myAffiliateProducts, isLoading: myProductsLoading } = useMyAffiliateProducts();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [requesting, setRequesting] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [aiSearch, setAiSearch] = useState('');
  const [aiSearching, setAiSearching] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [detailProduct, setDetailProduct] = useState<AffiliateProduct | null>(null);

  const categoryScrollRef = useRef<HTMLDivElement>(null);

  /* ── Handlers ── */
  const handleRequestAffiliation = async (productId: string) => {
    setRequesting(productId);
    try {
      await affiliateApi.requestAffiliation(productId);
    } catch {
      // silently handle — backend may not be ready
    } finally {
      setTimeout(() => setRequesting(null), 800);
    }
  };

  const handleToggleSave = async (productId: string) => {
    const next = new Set(savedIds);
    if (next.has(productId)) {
      next.delete(productId);
      affiliateApi.unsaveProduct(productId).catch(() => {});
    } else {
      next.add(productId);
      affiliateApi.saveProduct(productId).catch(() => {});
    }
    setSavedIds(next);
  };

  const handleSuggestForMe = async () => {
    setSuggesting(true);
    try {
      await affiliateApi.suggestForMe();
    } catch {
      // handle gracefully
    } finally {
      setSuggesting(false);
    }
  };

  const handleAiSearch = async () => {
    if (!aiSearch.trim()) return;
    setAiSearching(true);
    try {
      await affiliateApi.searchWithAI(aiSearch);
    } catch {
      // handle gracefully
    } finally {
      setAiSearching(false);
    }
  };

  const handleOpenDetail = (product: AffiliateProduct) => {
    setDetailProduct(product);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenDetailFromMyProducts = (myProduct: any) => {
    const asProduct: AffiliateProduct = {
      id: myProduct.id,
      name: myProduct.name,
      category: myProduct.category,
      commission: myProduct.commission,
    };
    setDetailProduct(asProduct);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackFromDetail = () => {
    setDetailProduct(null);
  };

  /* ── Derive carousel data ── */
  const allProducts = (products || []).map((p) => ({
    ...p,
    saved: savedIds.has(p.id),
  }));

  // Filter by search and category
  const filtered = allProducts.filter((p) => {
    if (activeCategory !== 'Todos' && p.category !== activeCategory) return false;
    if (search && !p.name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Carousels
  const hottest = [...filtered].sort((a, b) => (b.temperature ?? 0) - (a.temperature ?? 0));
  const trending = filtered.filter((p) => p.trending);
  const physical = filtered.filter((p) => p.format === 'PHYSICAL');
  const newest = [...filtered].sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });

  const isLoading = productsLoading && statsLoading;

  /* ── Loading state ── */
  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          background: '#0A0A0C',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: '2px solid #222226',
            borderTop: '2px solid #E85D30',
            borderRadius: '50%',
            animation: 'kloel-spin 1s linear infinite',
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0A0A0C',
        padding: '32px 32px 64px',
      }}
    >
      {/* Hide scrollbar globally for this page's carousels */}
      <style>{`
        .kloel-carousel-scroll::-webkit-scrollbar { display: none; }
        .kloel-category-scroll::-webkit-scrollbar { display: none; }
        @keyframes kloel-spin { to { transform: rotate(360deg); } }
        @keyframes kloel-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>

      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        {/* ═══════════════════════════════════════════════════════════
           DETAIL VIEW
           ═══════════════════════════════════════════════════════════ */}
        {detailProduct ? (
          <DetailView product={detailProduct} onBack={handleBackFromDetail} />
        ) : (
          <>
            {/* ═══════════════════════════════════════════════════
               1. HEADER
               ═══════════════════════════════════════════════════ */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: 24,
              }}
            >
              <div>
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: '#E0DDD8',
                    fontFamily: 'var(--font-sora), Sora, sans-serif',
                    letterSpacing: '-0.01em',
                    margin: 0,
                  }}
                >
                  Afiliar-se
                </h1>
                <p
                  style={{
                    fontSize: 13,
                    color: '#6E6E73',
                    fontFamily: 'var(--font-sora), Sora, sans-serif',
                    margin: '4px 0 0',
                  }}
                >
                  Encontre produtos para promover e ganhe comissoes por cada venda
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {/* Favoritos button */}
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    background: 'transparent',
                    border: '1px solid #222226',
                    borderRadius: 6,
                    color: '#6E6E73',
                    fontFamily: 'var(--font-sora), Sora, sans-serif',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'border-color 150ms ease',
                  }}
                >
                  {IC.bookmark}
                  Favoritos
                </button>

                {/* Filtros button */}
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    background: 'transparent',
                    border: '1px solid #222226',
                    borderRadius: 6,
                    color: '#6E6E73',
                    fontFamily: 'var(--font-sora), Sora, sans-serif',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'border-color 150ms ease',
                  }}
                >
                  {IC.filter}
                  Filtros
                </button>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════
               2. SEARCH BAR
               ═══════════════════════════════════════════════════ */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 20,
              }}
            >
              {/* Search input */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 12px',
                  height: 40,
                  background: '#111113',
                  border: '1px solid #222226',
                  borderRadius: 6,
                }}
              >
                {IC.search}
                <input
                  type="text"
                  placeholder="Buscar produtos para afiliar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#E0DDD8',
                    fontFamily: 'var(--font-sora), Sora, sans-serif',
                    fontSize: 13,
                  }}
                />
              </div>

              {/* Sugerir pra mim */}
              <button
                onClick={handleSuggestForMe}
                disabled={suggesting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 16px',
                  height: 40,
                  background: 'rgba(232,93,48,0.06)',
                  border: '1px solid rgba(232,93,48,0.2)',
                  borderRadius: 6,
                  color: '#E85D30',
                  fontFamily: 'var(--font-sora), Sora, sans-serif',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: suggesting ? 'wait' : 'pointer',
                  transition: 'all 150ms ease',
                  whiteSpace: 'nowrap' as const,
                  opacity: suggesting ? 0.6 : 1,
                  flexShrink: 0,
                }}
              >
                {IC.ai}
                {suggesting ? 'Analisando...' : 'Sugerir pra mim'}
              </button>
            </div>

            {/* ═══════════════════════════════════════════════════
               3. CATEGORY TABS
               ═══════════════════════════════════════════════════ */}
            <div
              ref={categoryScrollRef}
              className="kloel-category-scroll"
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                overflowY: 'hidden',
                scrollbarWidth: 'none' as const,
                msOverflowStyle: 'none' as const,
                marginBottom: 24,
                paddingBottom: 2,
              }}
            >
              {CATEGORIES.map((cat) => {
                const active = cat === activeCategory;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    style={{
                      padding: '6px 14px',
                      background: active ? 'rgba(232,93,48,0.1)' : 'transparent',
                      border: `1px solid ${active ? 'rgba(232,93,48,0.3)' : '#222226'}`,
                      borderRadius: 6,
                      color: active ? '#E85D30' : '#6E6E73',
                      fontFamily: 'var(--font-sora), Sora, sans-serif',
                      fontSize: 12,
                      fontWeight: active ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                      whiteSpace: 'nowrap' as const,
                      flexShrink: 0,
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* ═══════════════════════════════════════════════════
               4. AI RECOMMENDATION BANNER
               ═══════════════════════════════════════════════════ */}
            {!recLoading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 18px',
                  background: '#111113',
                  border: '1px solid #222226',
                  borderRadius: 6,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(232,93,48,0.08)',
                    borderRadius: 6,
                    flexShrink: 0,
                  }}
                >
                  {IC.ai}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#E0DDD8',
                      fontFamily: 'var(--font-sora), Sora, sans-serif',
                      marginBottom: 2,
                    }}
                  >
                    A IA analisou seu perfil
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#6E6E73',
                      fontFamily: 'var(--font-sora), Sora, sans-serif',
                      lineHeight: 1.4,
                    }}
                  >
                    {reason || 'Com base no seu historico de vendas e nicho de atuacao, encontramos produtos com alto potencial de conversao para voce.'}
                  </div>
                </div>
                {recommended.length > 0 && (
                  <div
                    style={{
                      padding: '5px 12px',
                      background: 'rgba(232,93,48,0.06)',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#E85D30',
                      fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                      whiteSpace: 'nowrap' as const,
                      flexShrink: 0,
                    }}
                  >
                    {recommended.length} sugestoes
                  </div>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════════
               5. STATS
               ═══════════════════════════════════════════════════ */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                marginBottom: 32,
              }}
            >
              {[
                {
                  label: 'Produtos disponiveis',
                  value: stats.totalProducts,
                  suffix: '',
                },
                {
                  label: 'Comissao maxima',
                  value: stats.maxCommission,
                  suffix: '%',
                  highlight: true,
                },
                {
                  label: 'Comissao media',
                  value: stats.avgCommission,
                  suffix: '%',
                },
                {
                  label: 'Nichos ativos',
                  value: stats.totalCategories,
                  suffix: '',
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    padding: '16px 18px',
                    background: '#111113',
                    border: '1px solid #222226',
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: '#6E6E73',
                      fontFamily: 'var(--font-sora), Sora, sans-serif',
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.05em',
                      marginBottom: 8,
                    }}
                  >
                    {stat.label}
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: stat.highlight ? '#E85D30' : '#E0DDD8',
                      fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {stat.value}
                    {stat.suffix}
                  </div>
                </div>
              ))}
            </div>

            {/* ═══════════════════════════════════════════════════
               6. CAROUSELS
               ═══════════════════════════════════════════════════ */}

            {/* Mais quentes */}
            <Carousel
              title="Mais quentes"
              subtitle="Produtos com maior temperatura de vendas"
              products={hottest}
              onRequestAffiliation={handleRequestAffiliation}
              onToggleSave={handleToggleSave}
              onOpenDetail={handleOpenDetail}
              requesting={requesting}
            />

            {/* Em alta */}
            <Carousel
              title="Em alta"
              subtitle="Tendencias do momento"
              products={trending}
              onRequestAffiliation={handleRequestAffiliation}
              onToggleSave={handleToggleSave}
              onOpenDetail={handleOpenDetail}
              requesting={requesting}
            />

            {/* Produtos fisicos */}
            <Carousel
              title="Produtos fisicos"
              subtitle="Itens tangíveis para promover"
              products={physical}
              onRequestAffiliation={handleRequestAffiliation}
              onToggleSave={handleToggleSave}
              onOpenDetail={handleOpenDetail}
              requesting={requesting}
            />

            {/* Lancamentos */}
            <Carousel
              title="Lancamentos"
              subtitle="Adicionados recentemente"
              products={newest}
              onRequestAffiliation={handleRequestAffiliation}
              onToggleSave={handleToggleSave}
              onOpenDetail={handleOpenDetail}
              requesting={requesting}
            />

            {/* ═══════════════════════════════════════════════════
               7. BOTTOM CTA — "Diga a IA o que procura"
               ═══════════════════════════════════════════════════ */}
            <div
              style={{
                marginTop: 16,
                padding: '24px',
                background: '#111113',
                border: '1px solid #222226',
                borderRadius: 6,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                {IC.ai}
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: '#E0DDD8',
                    fontFamily: 'var(--font-sora), Sora, sans-serif',
                  }}
                >
                  Diga a IA o que procura
                </span>
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: '#6E6E73',
                  fontFamily: 'var(--font-sora), Sora, sans-serif',
                  margin: '0 0 16px',
                }}
              >
                Descreva o tipo de produto ideal e a IA encontra os melhores matches no marketplace
              </p>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  maxWidth: 520,
                  margin: '0 auto',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 12px',
                    height: 40,
                    background: '#19191C',
                    border: '1px solid #222226',
                    borderRadius: 6,
                  }}
                >
                  {IC.search}
                  <input
                    type="text"
                    placeholder="Ex: produtos de skincare com alta comissao..."
                    value={aiSearch}
                    onChange={(e) => setAiSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAiSearch();
                    }}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: '#E0DDD8',
                      fontFamily: 'var(--font-sora), Sora, sans-serif',
                      fontSize: 13,
                    }}
                  />
                </div>
                <button
                  onClick={handleAiSearch}
                  disabled={aiSearching || !aiSearch.trim()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 18px',
                    height: 40,
                    background: aiSearching ? 'rgba(232,93,48,0.15)' : '#E85D30',
                    border: 'none',
                    borderRadius: 6,
                    color: aiSearching ? '#E85D30' : '#0A0A0C',
                    fontFamily: 'var(--font-sora), Sora, sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: aiSearching || !aiSearch.trim() ? 'default' : 'pointer',
                    transition: 'all 150ms ease',
                    opacity: !aiSearch.trim() ? 0.4 : 1,
                    flexShrink: 0,
                  }}
                >
                  {aiSearching ? 'Buscando...' : 'Buscar com IA'}
                  {!aiSearching && IC.arrowRight}
                </button>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════
               8. MEUS PRODUTOS AFILIADOS
               ═══════════════════════════════════════════════════ */}
            <div style={{ marginTop: 48 }}>
              <div style={{ marginBottom: 16 }}>
                <h2
                  style={{
                    fontSize: 17,
                    fontWeight: 600,
                    color: '#E0DDD8',
                    fontFamily: 'var(--font-sora), Sora, sans-serif',
                    letterSpacing: '-0.01em',
                    margin: '0 0 4px',
                  }}
                >
                  Meus Produtos Afiliados
                </h2>
                <p
                  style={{
                    fontSize: 12,
                    color: '#6E6E73',
                    fontFamily: 'var(--font-sora), Sora, sans-serif',
                    margin: 0,
                  }}
                >
                  Produtos que voce ja promove e seus resultados
                </p>
              </div>

              <div
                style={{
                  background: '#111113',
                  border: '1px solid #222226',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                {/* Table header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 0.7fr 0.7fr 0.6fr 1fr 1fr 0.9fr',
                    gap: 12,
                    padding: '10px 16px',
                    borderBottom: '1px solid #1A1A1E',
                  }}
                >
                  {['Produto', 'Comissao', 'Cliques', 'Vendas', 'Receita', 'Ganhos', 'Ultima venda'].map((h) => (
                    <span
                      key={h}
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#6E6E73',
                        fontFamily: 'var(--font-sora), Sora, sans-serif',
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.05em',
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {/* Table rows */}
                {myProductsLoading ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                    <div style={{ width: 20, height: 20, border: '2px solid #222226', borderTop: '2px solid #E85D30', borderRadius: '50%', animation: 'kloel-spin 1s linear infinite', margin: '0 auto' }} />
                  </div>
                ) : (myAffiliateProducts.length > 0 ? myAffiliateProducts : MY_PRODUCTS).map((mp: any, i: number, arr: any[]) => (
                  <div
                    key={mp.id}
                    onClick={() => handleOpenDetailFromMyProducts(mp)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 0.7fr 0.7fr 0.6fr 1fr 1fr 0.9fr',
                      gap: 12,
                      padding: '12px 16px',
                      borderBottom: i < arr.length - 1 ? '1px solid #1A1A1E' : 'none',
                      cursor: 'pointer',
                      transition: 'background 150ms ease',
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'rgba(232,93,48,0.03)')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#E0DDD8',
                          fontFamily: 'var(--font-sora), Sora, sans-serif',
                        }}
                      >
                        {mp.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: '#6E6E73',
                          fontFamily: 'var(--font-sora), Sora, sans-serif',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.03em',
                        }}
                      >
                        {mp.category}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#E85D30',
                        fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {mp.commission ?? 0}%
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        color: '#E0DDD8',
                        fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {(mp.clicks ?? 0).toLocaleString('pt-BR')}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        color: '#E0DDD8',
                        fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {mp.sales ?? 0}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        color: '#E0DDD8',
                        fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      R$ {(mp.revenue ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#22C55E',
                        fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      R$ {(mp.earnings ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: '#6E6E73',
                        fontFamily: 'var(--font-jetbrains), JetBrains Mono, monospace',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {mp.lastSale ? new Date(mp.lastSale).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '--'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════
               9. FOOTER
               ═══════════════════════════════════════════════════ */}
            <div
              style={{
                marginTop: 48,
                paddingTop: 20,
                borderTop: '1px solid #19191C',
                textAlign: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: '#3A3A3F',
                  fontFamily: 'var(--font-sora), Sora, sans-serif',
                  letterSpacing: '0.02em',
                }}
              >
                Kloel Marketplace -- Encontre, afilie-se, lucre.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
