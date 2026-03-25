'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  useAffiliateMarketplace,
  useAffiliateStats,
  useAffiliateRecommended,
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
   ProductCard Component
   ════════════════════════════════════════════════════════════════════ */
function ProductCard({
  product,
  onRequestAffiliation,
  onToggleSave,
  requesting,
}: {
  product: AffiliateProduct;
  onRequestAffiliation: (id: string) => void;
  onToggleSave: (id: string) => void;
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
  requesting,
}: {
  title: string;
  subtitle?: string;
  products: AffiliateProduct[];
  onRequestAffiliation: (id: string) => void;
  onToggleSave: (id: string) => void;
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
              requesting={requesting}
            />
          ))}
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

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [requesting, setRequesting] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [aiSearch, setAiSearch] = useState('');
  const [aiSearching, setAiSearching] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

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
        <style>{`@keyframes kloel-spin { to { transform: rotate(360deg); } }`}</style>
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
          requesting={requesting}
        />

        {/* Em alta */}
        <Carousel
          title="Em alta"
          subtitle="Tendencias do momento"
          products={trending}
          onRequestAffiliation={handleRequestAffiliation}
          onToggleSave={handleToggleSave}
          requesting={requesting}
        />

        {/* Produtos fisicos */}
        <Carousel
          title="Produtos fisicos"
          subtitle="Itens tangíveis para promover"
          products={physical}
          onRequestAffiliation={handleRequestAffiliation}
          onToggleSave={handleToggleSave}
          requesting={requesting}
        />

        {/* Lancamentos */}
        <Carousel
          title="Lancamentos"
          subtitle="Adicionados recentemente"
          products={newest}
          onRequestAffiliation={handleRequestAffiliation}
          onToggleSave={handleToggleSave}
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
           8. FOOTER
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
      </div>
    </div>
  );
}
