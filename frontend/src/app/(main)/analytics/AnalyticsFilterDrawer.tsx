'use client';

import { kloelT } from '@/lib/i18n/t';
import { V, inputStyle, labelStyle } from './analytics.design-tokens';
import { Button } from './shared/Components';
import type { ReportFilters, SetFilters } from './analytics.types';

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: ReportFilters;
  setFilters: SetFilters;
}

export function AnalyticsFilterDrawer({ open, onClose, filters, setFilters }: FilterDrawerProps) {
  if (!open) {return null;}

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
      />
      <div style={{ position: 'relative', width: 380, maxWidth: '90vw', background: V.s, borderLeft: `1px solid ${V.b}`, height: '100vh', overflowY: 'auto', padding: '28px 24px', animation: 'fadeIn .2s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: V.t }}>{kloelT(`Filtro avancado`)}</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: V.t3, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>&times;</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <span style={labelStyle}>{kloelT(`Periodo`)}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input aria-label="Data inicio" type="date" value={filters.startDate ?? ''} onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))} style={inputStyle} />
              <input aria-label="Data fim" type="date" value={filters.endDate ?? ''} onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`Codigo da venda`)}</span>
            <input aria-label="Codigo da venda" placeholder={kloelT(`Ex: ORD-12345`)} style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`Comprador`)}</span>
            <input aria-label="Nome do comprador" placeholder={kloelT(`Nome do comprador`)} style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`CPF / CNPJ`)}</span>
            <input aria-label="CPF ou CNPJ" placeholder="000.000.000-00" style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`Forma de pagamento`)}</span>
            <select style={inputStyle} value={filters.paymentMethod || ''} onChange={(e) => setFilters((f) => ({ ...f, paymentMethod: e.target.value }))}>
              <option value="">{kloelT(`Todas`)}</option>
              <option value="CREDIT_CARD">{kloelT(`Cartao de credito`)}</option>
              <option value="PIX">{kloelT(`Pix`)}</option>
              <option value="BOLETO">{kloelT(`Boleto`)}</option>
            </select>
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`Status`)}</span>
            <select style={inputStyle} value={filters.status || ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
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
            <select style={inputStyle} value={filters.product || ''} onChange={(e) => setFilters((f) => ({ ...f, product: e.target.value }))}>
              <option value="">{kloelT(`Todos`)}</option>
            </select>
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`Plano`)}</span>
            <input aria-label="Nome do plano" placeholder={kloelT(`Nome do plano`)} style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`UTM Source / Medium`)}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input aria-label="UTM Source" placeholder="utm_source" style={inputStyle} />
              <input aria-label="UTM Medium" placeholder="utm_medium" style={inputStyle} />
            </div>
          </div>
          <div>
            <span style={labelStyle}>{kloelT(`Email afiliado`)}</span>
            <input aria-label="Email do afiliado" placeholder={kloelT(`email@afiliado.com`)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            {['Primeira compra', 'Recuperacao', 'Upsell'].map((label) => (
              <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: V.t2, cursor: 'pointer' }}>
                <input type="checkbox" style={{ accentColor: V.em }} />{label}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
          <Button primary onClick={onClose}>{kloelT(`Aplicar filtros`)}</Button>
          <Button onClick={onClose}>{kloelT(`Limpar`)}</Button>
        </div>
      </div>
    </div>
  );
}
