'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Package,
  Plus,
  Search,
  Filter,
  ImageIcon,
  ChevronDown,
  ArrowUpDown,
} from 'lucide-react'
import { colors, typography } from '@/lib/design-tokens'
import { useProducts } from '@/hooks/useProducts'
import { PRODUCT_CATEGORIES } from '@/lib/categories'
import { PageTitle } from '@/components/kloel/PageTitle'

const Loader = () => (
  <div style={{width:20,height:20,border:'2px solid transparent',borderTopColor:'#E85D30',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
);

// ============================================
// STATUS CONFIG (Monitor colors)
// ============================================

const STATUS_CONFIG: Record<
  string,
  { color: string; label: string }
> = {
  APPROVED: { color: '#E0DDD8', label: 'Aprovado' },
  PENDING: { color: '#6E6E73', label: 'Pendente' },
  DRAFT: { color: '#3A3A3F', label: 'Rascunho' },
  REJECTED: { color: '#E05252', label: 'Reprovado' },
  BLOCKED: { color: '#8B2020', label: 'Bloqueado' },
}

const FORMAT_LABELS: Record<string, string> = {
  PHYSICAL: 'Fisico',
  DIGITAL: 'Digital',
  HYBRID: 'Hibrido',
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Mais recentes' },
  { value: 'oldest', label: 'Mais antigos' },
  { value: 'name_asc', label: 'Nome A-Z' },
  { value: 'name_desc', label: 'Nome Z-A' },
  { value: 'price_asc', label: 'Menor preco' },
  { value: 'price_desc', label: 'Maior preco' },
]

// ============================================
// TYPES
// ============================================

interface ProductItem {
  id: string
  name: string
  description?: string
  price: number
  currency: string
  category?: string
  format: string
  imageUrl?: string
  active: boolean
  status: string
  tags: string[]
  createdAt: string
  _count?: { plans: number }
}

// ============================================
// MONITOR STYLES
// ============================================

const monitorInput: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#19191C',
  border: '1px solid #222226',
  borderRadius: 6,
  padding: '10px 14px',
  fontSize: 13,
  fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  color: '#E0DDD8',
  outline: 'none',
  transition: 'border-color 150ms ease',
}

const monitorSelect: React.CSSProperties = {
  ...monitorInput,
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236E6E73' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 32,
}

// ============================================
// PRODUCT CARD
// ============================================

function ProductCard({
  product,
  onClick,
}: {
  product: ProductItem
  onClick: () => void
}) {
  const statusInfo = STATUS_CONFIG[product.status] || STATUS_CONFIG.DRAFT

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: '#111113',
        border: '1px solid #222226',
        borderRadius: 6,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 150ms ease',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = '#333338'
        el.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = '#222226'
        el.style.transform = 'translateY(0)'
      }}
    >
      {/* Image area */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '5 / 4',
          overflow: 'hidden',
          backgroundColor: '#19191C',
        }}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 150ms ease',
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
            }}
          >
            <ImageIcon style={{ width: 48, height: 48, color: '#222226' }} />
          </div>
        )}

        {/* Status dot */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 6,
            backgroundColor: 'rgba(10, 10, 12, 0.7)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: statusInfo.color,
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: statusInfo.color,
              fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {statusInfo.label}
          </span>
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: 16 }}>
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
            color: '#E0DDD8',
            margin: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {product.name}
        </h3>

        <p
          style={{
            fontSize: 12,
            color: '#6E6E73',
            fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
            margin: '4px 0 0',
          }}
        >
          {FORMAT_LABELS[product.format] || product.format}
          {product.category ? ` \u00B7 ${product.category}` : ''}
        </p>

        {/* Product code */}
        <p
          style={{
            fontSize: 12,
            color: '#6E6E73',
            fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
            margin: '2px 0 0',
          }}
        >
          ID: {product.id.slice(0, 8)}
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 14,
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
              color: '#E0DDD8',
            }}
          >
            R$ {product.price.toFixed(2).replace('.', ',')}
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation()
              onClick()
            }}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid #222226',
              backgroundColor: '#111113',
              color: '#E0DDD8',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
              cursor: 'pointer',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.backgroundColor = '#19191C'
              el.style.color = '#E0DDD8'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.backgroundColor = '#111113'
              el.style.color = '#E0DDD8'
            }}
          >
            MAIS INFORMACOES
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// MAIN PAGE
// ============================================

export default function ProductsPage() {
  const router = useRouter()
  const [filterOpen, setFilterOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [formatFilter, setFormatFilter] = useState('')
  const [sortBy, setSortBy] = useState('newest')

  // Use the SWR hook
  const { products: rawProducts, isLoading } = useProducts({
    search: searchQuery || undefined,
    category: categoryFilter || undefined,
    active: statusFilter || undefined,
  })

  // Cast to our local type
  const products: ProductItem[] = (rawProducts || []) as ProductItem[]

  // Client-side filtering for status and format
  const filteredProducts = products.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false
    if (formatFilter && p.format !== formatFilter) return false
    return true
  })

  // Client-side sorting
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      case 'name_asc':
        return a.name.localeCompare(b.name)
      case 'name_desc':
        return b.name.localeCompare(a.name)
      case 'price_asc':
        return a.price - b.price
      case 'price_desc':
        return b.price - a.price
      default:
        return 0
    }
  })

  // Focus handlers for inputs
  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = '#E0DDD8'
  }
  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = '#222226'
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0A0A0C',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative', zIndex: 1, padding: '32px 24px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          {/* Page Title */}
          <PageTitle
            title="Meus Produtos"
            sub="Gerencie todos os seus produtos cadastrados na plataforma Kloel"
            right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={() => router.push('/products/new')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 20px',
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: '#E0DDD8',
                    color: '#0A0A0C',
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  <Plus style={{ width: 16, height: 16 }} />
                  Cadastrar Produto
                </button>
                <button
                  onClick={() => setFilterOpen(!filterOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '10px 16px',
                    borderRadius: 6,
                    border: `1px solid ${filterOpen ? '#E0DDD8' : '#222226'}`,
                    backgroundColor: filterOpen ? 'rgba(224, 221, 216, 0.06)' : 'transparent',
                    color: filterOpen ? '#E0DDD8' : '#6E6E73',
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  <Filter style={{ width: 15, height: 15 }} />
                  Filtros
                </button>
              </div>
            }
          />

          {/* Filter Panel */}
          {filterOpen && (
            <div
              style={{
                marginBottom: 24,
                padding: 20,
                borderRadius: 6,
                backgroundColor: '#111113',
                border: '1px solid #222226',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 14,
                }}
              >
                {/* Search */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#6E6E73',
                      fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Buscar
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Search
                      style={{
                        position: 'absolute',
                        left: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 14,
                        height: 14,
                        color: '#6E6E73',
                      }}
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar produtos..."
                      style={{ ...monitorInput, paddingLeft: 34 }}
                      onFocus={handleFocus}
                      onBlur={handleBlur}
                    />
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#6E6E73',
                      fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={monitorSelect}
                    onFocus={handleFocus as any}
                    onBlur={handleBlur as any}
                  >
                    <option value="">Todos</option>
                    <option value="APPROVED">Aprovado</option>
                    <option value="PENDING">Pendente</option>
                    <option value="DRAFT">Rascunho</option>
                    <option value="REJECTED">Reprovado</option>
                    <option value="BLOCKED">Bloqueado</option>
                  </select>
                </div>

                {/* Category */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#6E6E73',
                      fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Categoria
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={monitorSelect}
                    onFocus={handleFocus as any}
                    onBlur={handleBlur as any}
                  >
                    <option value="">Todas</option>
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Format */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#6E6E73',
                      fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Formato
                  </label>
                  <select
                    value={formatFilter}
                    onChange={(e) => setFormatFilter(e.target.value)}
                    style={monitorSelect}
                    onFocus={handleFocus as any}
                    onBlur={handleBlur as any}
                  >
                    <option value="">Todos</option>
                    <option value="PHYSICAL">Fisico</option>
                    <option value="DIGITAL">Digital</option>
                    <option value="HYBRID">Hibrido</option>
                  </select>
                </div>

                {/* Sort */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#6E6E73',
                      fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Ordenar
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    style={monitorSelect}
                    onFocus={handleFocus as any}
                    onBlur={handleBlur as any}
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Loading state */}
          {isLoading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '80px 0',
              }}
            >
              <Loader />
              <p
                style={{
                  marginTop: 16,
                  fontSize: 14,
                  color: '#6E6E73',
                  fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                }}
              >
                Carregando produtos...
              </p>
            </div>
          ) : sortedProducts.length === 0 ? (
            /* Empty State */
            <div
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '80px 20px',
                borderRadius: 6,
                border: '2px dashed #222226',
                backgroundColor: '#111113',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                <Package
                  style={{
                    width: 56,
                    height: 56,
                    color: '#333338',
                    marginBottom: 16,
                  }}
                />
                <h2
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                    color: '#E0DDD8',
                    margin: '0 0 8px',
                  }}
                >
                  Nenhum produto cadastrado
                </h2>
                <p
                  style={{
                    fontSize: 14,
                    color: '#6E6E73',
                    fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                    margin: '0 0 28px',
                    maxWidth: 360,
                  }}
                >
                  Cadastre seu primeiro produto e comece a vender com o Kloel.
                </p>
                <button
                  onClick={() => router.push('/products/new')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 28px',
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: '#E0DDD8',
                    color: '#0A0A0C',
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  <Plus style={{ width: 16, height: 16 }} />
                  Cadastrar meu primeiro produto
                </button>
              </div>
            </div>
          ) : (
            /* Product Grid */
            <>
              {/* Results count */}
              <p
                style={{
                  fontSize: 13,
                  color: '#6E6E73',
                  fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                  marginBottom: 16,
                }}
              >
                {sortedProducts.length} produto{sortedProducts.length !== 1 ? 's' : ''} encontrado
                {sortedProducts.length !== 1 ? 's' : ''}
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 20,
                }}
              >
                {sortedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onClick={() => router.push(`/products/${product.id}`)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
