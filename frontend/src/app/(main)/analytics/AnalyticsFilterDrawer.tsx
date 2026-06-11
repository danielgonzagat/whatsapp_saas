'use client';

import { useEffect, useState } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { V, inputStyle, labelStyle } from './analytics.design-tokens';
import { clearReportAdvancedFilters } from './analytics.helpers';
import { Button } from './shared/Components';
import type { ReportFilters, SetFilters } from './analytics.types';
import { productApi, type CatalogProduct } from '@/lib/api/products';

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: ReportFilters;
  setFilters: SetFilters;
}

export function AnalyticsFilterDrawer({ open, onClose, filters, setFilters }: FilterDrawerProps) {
  const [draftFilters, setDraftFilters] = useState<ReportFilters>(filters);
  const [productOptions, setProductOptions] = useState<CatalogProduct[]>([]);

  useEffect(() => {
    if (!open || productOptions.length > 0) {
      return undefined;
    }
    let cancelled = false;
    productApi
      .list()
      .then((res) => {
        const products = res?.data?.products;
        if (!cancelled && Array.isArray(products)) {
          setProductOptions(products);
        }
      })
      .catch(() => {
        // Honest degradation: the select keeps only "Todos".
      });
    return () => {
      cancelled = true;
    };
  }, [open, productOptions.length]);

  const updateDraftFilters: SetFilters = (nextFilters) => {
    setDraftFilters((current) =>
      typeof nextFilters === 'function' ? nextFilters(current) : nextFilters,
    );
  };
  const applyFilters = () => {
    setFilters(() => draftFilters);
    onClose();
  };
  const clearFilters = () => {
    const nextFilters = clearReportAdvancedFilters(filters);
    setDraftFilters(nextFilters);
    setFilters(() => nextFilters);
  };

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    document.addEventListener('keydown', closeOnEscape, { capture: true });
    return () => document.removeEventListener('keydown', closeOnEscape, { capture: true });
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={kloelT(`Filtro avancado`)}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', justifyContent: 'flex-end' }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
      />
      <div style={{ position: 'relative', width: 380, maxWidth: '90vw', background: V.s, borderLeft: `1px solid ${V.b}`, height: '100vh', overflowY: 'auto', padding: '28px 24px', animation: 'fadeIn .2s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: V.t }}>{kloelT(`Filtro avancado`)}</span>
          <button type="button" aria-label={kloelT(`Fechar filtro avancado`)} onClick={onClose} style={{ background: 'none', border: 'none', color: V.t3, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>&times;</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <span style={labelStyle}>{kloelT(`Periodo`)}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="analytics-filter-start-date" name="analyticsFilterStartDate" aria-label="Data inicio" type="date" value={draftFilters.startDate ?? ''} onChange={(e) => updateDraftFilters((f) => ({ ...f, startDate: e.target.value }))} style={inputStyle} />
              <input id="analytics-filter-end-date" name="analyticsFilterEndDate" aria-label="Data fim" type="date" value={draftFilters.endDate ?? ''} onChange={(e) => updateDraftFilters((f) => ({ ...f, endDate: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`Codigo da venda`)}</span>
            <input id="analytics-filter-order-code" name="analyticsFilterOrderCode" aria-label="Codigo da venda" placeholder={kloelT(`Ex: ORD-12345`)} value={draftFilters.orderCode ?? ''} onChange={(e) => updateDraftFilters((f) => ({ ...f, orderCode: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`Comprador`)}</span>
            <input id="analytics-filter-buyer-name" name="analyticsFilterBuyerName" aria-label="Nome do comprador" placeholder={kloelT(`Nome do comprador`)} value={draftFilters.buyerName ?? ''} onChange={(e) => updateDraftFilters((f) => ({ ...f, buyerName: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`CPF / CNPJ`)}</span>
            <input id="analytics-filter-cpf-cnpj" name="analyticsFilterCpfCnpj" aria-label="CPF ou CNPJ" placeholder="000.000.000-00" value={draftFilters.cpfCnpj ?? ''} onChange={(e) => updateDraftFilters((f) => ({ ...f, cpfCnpj: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`Forma de pagamento`)}</span>
            <select id="analytics-filter-payment-method" name="analyticsFilterPaymentMethod" aria-label="Forma de pagamento" style={inputStyle} value={draftFilters.paymentMethod || ''} onChange={(e) => updateDraftFilters((f) => ({ ...f, paymentMethod: e.target.value }))}>
              <option value="">{kloelT(`Todas`)}</option>
              <option value="CREDIT_CARD">{kloelT(`Cartao de credito`)}</option>
              <option value="PIX">{kloelT(`Pix`)}</option>
              <option value="BOLETO">{kloelT(`Boleto`)}</option>
            </select>
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`Status`)}</span>
            <select id="analytics-filter-status" name="analyticsFilterStatus" aria-label="Status" style={inputStyle} value={draftFilters.status || ''} onChange={(e) => updateDraftFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">{kloelT(`Todos`)}</option>
              <option value="PAID">{kloelT(`Aprovado`)}</option>
              <option value="PENDING">{kloelT(`Pendente`)}</option>
              <option value="PROCESSING">{kloelT(`Processando`)}</option>
              <option value="CANCELED">{kloelT(`Cancelado`)}</option>
              <option value="REFUNDED">{kloelT(`Estornado`)}</option>
            </select>
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`Produto`)}</span>
            <select id="analytics-filter-product" name="analyticsFilterProduct" aria-label="Produto" style={inputStyle} value={draftFilters.product || ''} onChange={(e) => updateDraftFilters((f) => ({ ...f, product: e.target.value }))}>
              <option value="">{kloelT(`Todos`)}</option>
              {productOptions.map((product) => (
                <option key={product.id} value={product.name}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`Plano`)}</span>
            <input id="analytics-filter-plan-name" name="analyticsFilterPlanName" aria-label="Nome do plano" placeholder={kloelT(`Nome do plano`)} value={draftFilters.planName ?? ''} onChange={(e) => updateDraftFilters((f) => ({ ...f, planName: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`UTM Source / Medium`)}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="analytics-filter-utm-source" name="analyticsFilterUtmSource" aria-label="UTM Source" placeholder="utm_source" value={draftFilters.utmSource ?? ''} onChange={(e) => updateDraftFilters((f) => ({ ...f, utmSource: e.target.value }))} style={inputStyle} />
              <input id="analytics-filter-utm-medium" name="analyticsFilterUtmMedium" aria-label="UTM Medium" placeholder="utm_medium" value={draftFilters.utmMedium ?? ''} onChange={(e) => updateDraftFilters((f) => ({ ...f, utmMedium: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`Email afiliado`)}</span>
            <input id="analytics-filter-affiliate-email" name="analyticsFilterAffiliateEmail" aria-label="Email do afiliado" placeholder={kloelT(`email@afiliado.com`)} value={draftFilters.affiliateEmail ?? ''} onChange={(e) => updateDraftFilters((f) => ({ ...f, affiliateEmail: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            {([['Recuperacao', 'isRecovery'], ['Upsell', 'isUpsell']] as const).map(([label, key]) => (
              <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: V.t2, cursor: 'pointer' }}>
                <input id={`analytics-filter-${key}`} name={key} type="checkbox" checked={draftFilters[key] === 'true'} onChange={(e) => updateDraftFilters((f) => ({ ...f, [key]: e.target.checked ? 'true' : '' }))} style={{ accentColor: V.em }} />{label}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
          <Button primary onClick={applyFilters}>{kloelT(`Aplicar filtros`)}</Button>
          <Button onClick={clearFilters}>{kloelT(`Limpar`)}</Button>
        </div>
      </div>
    </div>
  );
}
