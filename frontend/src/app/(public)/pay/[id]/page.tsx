'use client';

import { kloelT } from '@/lib/i18n/t';
import {
  KloelBrandLockup,
  KloelLoadingState,
  KloelMushroomVisual,
} from '@/components/kloel/KloelBrand';
import { apiUrl } from '@/lib/http';
import Image from 'next/image';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  QrCode,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { use, useEffect, useRef, useState } from 'react';
import { colors } from '@/lib/design-tokens';

interface PaymentDetails {
  id: string;
  amount: number;
  productName: string;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'overdue';
  paymentMethod: string;
  createdAt: string;
  paidAt?: string;
  companyName: string;
  pixQrCodeUrl?: string;
  pixCopyPaste?: string;
  paymentLink?: string;
  bankInfo?: {
    bank?: string;
    agency?: string;
    account?: string;
    name?: string;
  };
}

const statusConfig = {
  pending: {
    icon: Clock,
    label: 'Aguardando pagamento',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/30',
  },
  paid: {
    icon: CheckCircle2,
    label: 'Pagamento confirmado',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
  },
  cancelled: {
    icon: XCircle,
    label: 'Pagamento cancelado',
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/30',
  },
  refunded: {
    icon: AlertCircle,
    label: 'Pagamento estornado',
    color: 'text-slate-400',
    bg: 'bg-slate-500/10 border-slate-500/30',
  },
  overdue: {
    icon: AlertCircle,
    label: 'Pagamento vencido',
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/30',
  },
};

/** Payment page. */
export default function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    const fetchPayment = async () => {
      try {
        const res = await fetch(apiUrl(`/kloel/payments/public/${resolvedParams.id}`));
        if (!res.ok) {
          if (res.status === 404) {
            setError('Pagamento não encontrado');
          } else {
            setError('Erro ao carregar dados do pagamento');
          }
          return;
        }
        const data = await res.json();
        setPayment(data);
      } catch (_err) {
        setError('Não foi possível conectar ao servidor');
      } finally {
        setLoading(false);
      }
    };

    fetchPayment();
  }, [resolvedParams.id]);

  const copyPixCode = () => {
    if (payment?.pixCopyPaste) {
      navigator.clipboard.writeText(payment.pixCopyPaste);
      setCopied(true);
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) {
    return (
      <div className="min-h-screen bg-[colors.background.void] flex items-center justify-center px-4">
        <KloelLoadingState
          size={96}
          traceColor={kloelT(`#FFFFFF`)}
          label={kloelT(`Kloel`)}
          hint={kloelT(`carregando o checkout`)}
          minHeight={320}
        />
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 border border-gray-200 max-w-md w-full text-center">
          <div className="flex justify-center mb-4">
            <KloelMushroomVisual
              size={72}
              traceColor={kloelT(`colors.background.void`)}
              spores="static"
            />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {kloelT(`Pagamento não encontrado`)}
          </h1>
          <p className="text-gray-600">
            {error || 'Este link de pagamento não existe ou expirou.'}
          </p>
        </div>
      </div>
    );
  }

  const StatusInfo = statusConfig[payment.status] || statusConfig.pending;
  const StatusIcon = StatusInfo.icon;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <KloelBrandLockup
              markSize={20}
              fontSize={16}
              fontWeight={600}
              traceColor={kloelT(`colors.background.void`)}
              textColor={kloelT(`colors.background.void`)}
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{payment.companyName}</h1>
          <p className="text-gray-600 text-sm mt-1">{kloelT(`Link de Pagamento`)}</p>
        </div>

        {/* Payment Card */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Status Banner */}
          <div className={`px-6 py-4 border-b ${StatusInfo.bg}`}>
            <div className="flex items-center justify-center gap-2">
              <StatusIcon className={`w-5 h-5 ${StatusInfo.color}`} />
              <span className={`font-medium ${StatusInfo.color}`}>{StatusInfo.label}</span>
            </div>
          </div>

          {/* Amount */}
          <div className="px-6 py-8 text-center border-b border-gray-200">
            <p className="text-gray-600 text-sm mb-2">{payment.productName}</p>
            <p className="text-4xl font-bold text-gray-900">{formatCurrency(payment.amount)}</p>
            <p className="text-gray-400 text-xs mt-2">
              {kloelT(`Criado em`)} {formatDate(payment.createdAt)}
            </p>
          </div>

          {/* Payment Instructions */}
          {payment.status === 'pending' && (
            <div className="p-6 space-y-4">
              {/* PIX Payment */}
              {payment.paymentMethod === 'PIX' &&
                (payment.pixCopyPaste || payment.pixQrCodeUrl || payment.paymentLink) && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-blue-500">
                      <QrCode className="w-5 h-5" aria-hidden="true" />
                      <span className="font-medium">{kloelT(`Pagamento via PIX`)}</span>
                    </div>

                    {payment.pixQrCodeUrl && (
                      <div className="bg-white border border-gray-200 rounded-xl p-4 flex justify-center">
                        {}
                        <Image
                          src={payment.pixQrCodeUrl}
                          alt="QR Code PIX"
                          width={224}
                          height={224}
                          unoptimized
                          className="w-56 h-56 object-contain"
                        />
                      </div>
                    )}

                    {payment.pixCopyPaste && (
                      <div className="bg-gray-100 rounded-xl p-4">
                        <p className="text-gray-600 text-xs mb-2">
                          {kloelT(`Código PIX copia e cola`)}
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-gray-900 text-sm bg-gray-200 px-3 py-2 rounded-lg font-mono break-all">
                            {payment.pixCopyPaste}
                          </code>
                          <button
                            type="button"
                            onClick={copyPixCode}
                            className="p-2 bg-blue-500/10 text-blue-500 rounded-lg hover:bg-blue-500/20 transition-colors"
                          >
                            {copied ? (
                              <Check className="w-5 h-5" aria-hidden="true" />
                            ) : (
                              <Copy className="w-5 h-5" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                        {copied && (
                          <p className="text-blue-500 text-xs mt-2">
                            {kloelT(`Código PIX copiado!`)}
                          </p>
                        )}
                      </div>
                    )}

                    {!payment.pixCopyPaste && payment.paymentLink && (
                      <a
                        href={payment.paymentLink}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-full text-center bg-blue-500 text-white font-medium rounded-xl px-4 py-3 hover:bg-blue-600 transition-colors"
                      >
                        {kloelT(`Abrir instruções de pagamento`)}
                      </a>
                    )}

                    {/* Instructions */}
                    <div className="bg-gray-100 rounded-xl p-4">
                      <p className="text-gray-600 text-sm font-medium mb-3">
                        {kloelT(`Como pagar:`)}
                      </p>
                      <div className="space-y-2">
                        <div className="flex items-start gap-3 text-gray-700 text-sm">
                          <span className="bg-blue-500/20 text-blue-500 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                            1
                          </span>
                          <span>{kloelT(`Abra o app do seu banco`)}</span>
                        </div>
                        <div className="flex items-start gap-3 text-gray-700 text-sm">
                          <span className="bg-blue-500/20 text-blue-500 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                            2
                          </span>
                          <span>{kloelT(`Vá em PIX → Copia e Cola ou escaneie o QR Code`)}</span>
                        </div>
                        <div className="flex items-start gap-3 text-gray-700 text-sm">
                          <span className="bg-blue-500/20 text-blue-500 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                            3
                          </span>
                          <span>
                            {kloelT(`Confirme o valor de`)}{' '}
                            <strong>{formatCurrency(payment.amount)}</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              {/* Bank Transfer */}
              {payment.bankInfo && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-teal-400">
                    <Building2 className="w-5 h-5" aria-hidden="true" />
                    <span className="font-medium">{kloelT(`Dados Bancários`)}</span>
                  </div>

                  <div className="bg-gray-100 rounded-xl p-4 space-y-2">
                    {payment.bankInfo.bank && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 text-sm">{kloelT(`Banco`)}</span>
                        <span className="text-gray-900 text-sm">{payment.bankInfo.bank}</span>
                      </div>
                    )}
                    {payment.bankInfo.agency && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 text-sm">{kloelT(`Agência`)}</span>
                        <span className="text-gray-900 text-sm font-mono">
                          {payment.bankInfo.agency}
                        </span>
                      </div>
                    )}
                    {payment.bankInfo.account && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 text-sm">{kloelT(`Conta`)}</span>
                        <span className="text-gray-900 text-sm font-mono">
                          {payment.bankInfo.account}
                        </span>
                      </div>
                    )}
                    {payment.bankInfo.name && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 text-sm">{kloelT(`Favorecido`)}</span>
                        <span className="text-gray-900 text-sm">{payment.bankInfo.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* No payment info available */}
              {!payment.pixCopyPaste && !payment.pixQrCodeUrl && !payment.bankInfo && (
                <div className="text-center py-4">
                  <Smartphone className="w-12 h-12 text-gray-400 mx-auto mb-3" aria-hidden="true" />
                  <p className="text-gray-600">
                    {kloelT(`Entre em contato com`)}{' '}
                    <strong className="text-gray-900">{payment.companyName}</strong>{' '}
                    {kloelT(`para obter os
                    dados de pagamento.`)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Paid Status */}
          {payment.status === 'paid' && payment.paidAt && (
            <div className="p-6 text-center">
              <CheckCircle2
                className="w-16 h-16 text-emerald-400 mx-auto mb-4"
                aria-hidden="true"
              />
              <p className="text-emerald-400 font-medium">{kloelT(`Pagamento confirmado!`)}</p>
              <p className="text-gray-600 text-sm mt-2">
                {kloelT(`Pago em`)} {formatDate(payment.paidAt)}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-slate-600 text-xs">{kloelT(`Pagamento seguro via Kloel`)}</p>
        </div>
      </div>
    </div>
  );
}
