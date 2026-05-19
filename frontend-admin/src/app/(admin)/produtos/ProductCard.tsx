import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { AdminProductRow } from '@/lib/api/admin-products-api';
import { formatMoney, formatInteger, statusTone } from './page.helpers';

const FONT_SANS = "var(--font-sora), 'Sora', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

interface ProductCardProps {
  product: AdminProductRow;
  busyId: string | null;
  onApprove: (product: AdminProductRow) => void;
  onReject: (product: AdminProductRow) => void;
}

export function ProductCard({ product, busyId, onApprove, onReject }: ProductCardProps) {
  const tone = statusTone(product.status);
  const isBusy = busyId === product.id;
  const pendingModeration = product.status === 'PENDING';

  return (
    <div
      className="group relative rounded-[12px] border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] p-4"
      style={{ fontFamily: FONT_SANS }}
    >
      <div className="grid gap-4 lg:grid-cols-[64px_minmax(0,1fr)_auto]">
        <div className="flex flex-col items-start gap-3">
          <div className="flex size-16 items-center justify-center overflow-hidden rounded-[12px] border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)]">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[11px] text-[var(--app-text-tertiary)]">Sem imagem</span>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Link
              href={`/produtos/${product.id}`}
              className="truncate text-[15px] font-semibold text-[var(--app-text-primary)] transition-colors hover:text-[var(--app-accent)]"
            >
              {product.name}
            </Link>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${tone.badge}`}
            >
              {product.status}
            </span>
            {product.commerce.chargebackOrders > 0 ? (
              <span className="inline-flex items-center rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-600">
                Chargeback {product.commerce.chargebackOrders}
              </span>
            ) : null}
          </div>

          <div
            className="mb-2 text-[11px] text-[var(--app-text-secondary)]"
            style={{ fontFamily: FONT_MONO }}
          >
            {product.category || 'Sem categoria'} · {product.workspaceName || product.workspaceId}
          </div>

          <div
            className="mb-3 text-[11px] text-[var(--app-text-secondary)]"
            style={{ fontFamily: FONT_MONO }}
          >
            {formatInteger(product.commerce.approvedOrders)} pedidos aprovados ·{' '}
            {formatInteger(product.commerce.pendingOrders)} em fila
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--app-accent-medium)] bg-[var(--app-bg-secondary)] px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--app-accent)]">
              PREÇO
              <span
                className="text-[12px] font-semibold normal-case"
                style={{ fontFamily: FONT_MONO }}
              >
                {formatMoney(product.priceInCents)}
              </span>
            </span>

            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-secondary)]">
              GMV 30D
              <span
                className="text-[12px] font-semibold normal-case text-[var(--app-text-primary)]"
                style={{ fontFamily: FONT_MONO }}
              >
                {formatMoney(product.commerce.last30dGmvInCents)}
              </span>
            </span>

            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-secondary)]">
              PRODUTOR
              <span
                className="max-w-[160px] truncate text-[12px] font-semibold normal-case text-[var(--app-text-primary)]"
                style={{ fontFamily: FONT_MONO }}
              >
                {product.workspaceName || product.workspaceId}
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          <div className="min-w-[112px] text-left lg:text-right">
            <div
              className="text-[14px] font-semibold text-[var(--app-accent)]"
              style={{ fontFamily: FONT_MONO }}
            >
              {formatMoney(product.commerce.gmvInCents)}
            </div>
            <div className="mt-1 inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: tone.dot }} />
              <span
                className="text-[10px] uppercase tracking-[0.12em]"
                style={{ color: tone.dot, fontFamily: FONT_MONO }}
              >
                {product.active ? 'Ativo' : product.status}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/produtos/${product.id}`}>Detalhar</Link>
            </Button>
            {pendingModeration ? (
              <>
                <Button size="sm" onClick={() => onApprove(product)} disabled={isBusy}>
                  {isBusy ? 'Processando...' : 'Aprovar'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReject(product)}
                  disabled={isBusy}
                >
                  Rejeitar
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
