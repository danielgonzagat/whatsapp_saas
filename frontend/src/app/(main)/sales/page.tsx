"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, CreditCard, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useAuth } from "@/components/kloel/auth/auth-provider";
import {
  createPaymentLink,
  getWalletBalance,
  getWalletTransactions,
  type PaymentLinkResponse,
  type WalletBalance,
  type WalletTransaction,
} from "@/lib/api";

function formatDateTime(value?: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
}

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function txTypeLabel(type: WalletTransaction["type"]) {
  const map: Record<WalletTransaction["type"], string> = {
    sale: "Venda",
    withdrawal: "Saque",
    refund: "Reembolso",
    fee: "Taxa",
  };
  return map[type] || type;
}

function txStatusLabel(status: WalletTransaction["status"]) {
  const map: Record<WalletTransaction["status"], string> = {
    confirmed: "Confirmado",
    pending: "Pendente",
    failed: "Falhou",
  };
  return map[status] || status;
}

function badgeClass(status: WalletTransaction["status"]) {
  if (status === "confirmed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

export default function SalesPage() {
  const { isAuthenticated, isLoading, workspace, openAuthModal } = useAuth();
  const workspaceId = workspace?.id;

  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);

  const [amount, setAmount] = useState<string>("49.90");
  const [productName, setProductName] = useState<string>("Plano mensal");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [creatingLink, setCreatingLink] = useState(false);
  const [createdLink, setCreatedLink] = useState<PaymentLinkResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => {
    const confirmedSales = transactions.filter((t) => t.type === "sale" && t.status === "confirmed");
    const pendingSales = transactions.filter((t) => t.type === "sale" && t.status === "pending");
    const totalRevenue = confirmedSales.reduce((sum, t) => sum + (t.netAmount ?? t.amount), 0);
    const pendingAmount = pendingSales.reduce((sum, t) => sum + (t.netAmount ?? t.amount), 0);
    return {
      totalSales: confirmedSales.length,
      totalRevenue,
      totalPending: pendingSales.length,
      pendingAmount,
    };
  }, [transactions]);

  const refresh = async () => {
    if (!workspaceId) return;
    setError(null);
    setLoadingData(true);
    try {
      const [b, t] = await Promise.all([getWalletBalance(workspaceId), getWalletTransactions(workspaceId)]);
      setBalance(b);
      setTransactions(Array.isArray(t) ? t : []);
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar dados financeiros");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && workspaceId) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated, workspaceId]);

  const handleCreatePaymentLink = async () => {
    if (!workspaceId) return;
    setError(null);

    const parsedAmount = Number(String(amount).replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Informe um valor válido");
      return;
    }
    if (!productName.trim()) {
      setError("Informe o nome do produto");
      return;
    }
    if (!customerPhone.trim()) {
      setError("Informe o WhatsApp do cliente");
      return;
    }

    setCreatingLink(true);
    try {
      const result = await createPaymentLink(workspaceId, {
        amount: parsedAmount,
        productName: productName.trim(),
        customerPhone: customerPhone.trim(),
        customerName: customerName.trim() || undefined,
      });
      setCreatedLink(result);
      setCopied(false);
    } catch (e: any) {
      setError(e?.message || "Falha ao criar link de pagamento");
    } finally {
      setCreatingLink(false);
    }
  };

  const paymentLink =
    createdLink?.payment?.paymentLink || createdLink?.paymentLink || createdLink?.payment?.invoiceUrl || null;

  const copyLink = async () => {
    if (!paymentLink) return;
    try {
      await navigator.clipboard.writeText(paymentLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">Sales</h1>
          <p className="mt-2 text-sm text-gray-600">Faça login para visualizar seu financeiro.</p>
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => openAuthModal("login")}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Entrar
            </button>
            <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Voltar ao chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">Sales</h1>
          <p className="mt-2 text-sm text-gray-600">Workspace não configurado para esta sessão.</p>
          <div className="mt-6">
            <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Voltar ao chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sales</h1>
          <p className="mt-1 text-sm text-gray-600">Saldo, transações e geração de links de pagamento.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Voltar ao chat
          </Link>
          <button
            onClick={refresh}
            disabled={loadingData}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw className={loadingData ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Atualizar
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="text-xs font-medium text-gray-500">Disponível</div>
              <div className="mt-2 text-xl font-semibold text-gray-900">{balance?.formattedAvailable || "—"}</div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="text-xs font-medium text-gray-500">Pendente</div>
              <div className="mt-2 text-xl font-semibold text-gray-900">{balance?.formattedPending || "—"}</div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="text-xs font-medium text-gray-500">Total</div>
              <div className="mt-2 text-xl font-semibold text-gray-900">{balance?.formattedTotal || "—"}</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-gray-500">Vendas confirmadas</div>
              <div className="mt-1 text-xl font-semibold text-gray-900">{stats.totalSales}</div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-gray-500">Receita</div>
              <div className="mt-1 text-xl font-semibold text-gray-900">{currency.format(stats.totalRevenue)}</div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-gray-500">Pendentes</div>
              <div className="mt-1 text-xl font-semibold text-gray-900">{stats.totalPending}</div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-gray-500">Valor pendente</div>
              <div className="mt-1 text-xl font-semibold text-gray-900">{currency.format(stats.pendingAmount)}</div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="text-sm font-semibold text-gray-900">Transações</div>
              <div className="mt-1 text-xs text-gray-500">Mostrando até 50 mais recentes</div>
            </div>
            <div className="divide-y divide-gray-100">
              {loadingData ? (
                <div className="flex items-center justify-center px-5 py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                </div>
              ) : transactions.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-600">Nenhuma transação ainda.</div>
              ) : (
                transactions.slice(0, 50).map((t) => (
                  <div key={t.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-semibold text-gray-900">
                            {t.description || txTypeLabel(t.type)}
                          </div>
                          <span
                            className={
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium " +
                              badgeClass(t.status)
                            }
                          >
                            {txStatusLabel(t.status)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">{formatDateTime(t.createdAt)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-gray-900">{currency.format(t.amount)}</div>
                        <div className="mt-1 text-xs text-gray-500">{txTypeLabel(t.type)}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 text-sm font-semibold text-gray-900">Gerar link de pagamento</div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Produto</label>
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  placeholder="Ex: Mentoria"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Valor (R$)</label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  placeholder="49.90"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">WhatsApp do cliente</label>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  placeholder="5511999999999"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Nome (opcional)</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  placeholder="João"
                />
              </div>

              <button
                onClick={handleCreatePaymentLink}
                disabled={creatingLink}
                className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {creatingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  Gerar link
                </span>
              </button>

              {paymentLink && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-medium text-gray-600">Link gerado</div>
                  <div className="mt-2 break-all text-sm text-gray-900">{paymentLink}</div>
                  <button
                    onClick={async () => {
                      await copyLink();
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
