'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { type Lead } from '@/lib/api';
import {
  LEAD_STATUS_LABEL as STATUS_LABEL,
  formatLeadTimeAgo as formatTimeAgo,
  leadTitle,
  safeLeadDate as safeDate,
} from './leads-page.helpers';
import { Search, Users } from 'lucide-react';
import Link from 'next/link';

interface LeadsListPanelProps {
  loadingLeads: boolean;
  leads: Lead[];
  filteredLeads: Lead[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  selectedLeadId: string | null;
  onSelectLead: (id: string) => void;
  source: string;
}

export function LeadsListPanel({
  loadingLeads,
  leads,
  filteredLeads,
  searchTerm,
  onSearchChange,
  status,
  onStatusChange,
  selectedLeadId,
  onSelectLead,
  source,
}: LeadsListPanelProps) {
  return (
    <div className="lg:col-span-5">
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted" aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">{kloelT(`Lista`)}</span>
              <span className="text-xs text-muted-foreground">({filteredLeads.length})</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={kloelT(`Buscar por nome, telefone ou email`)}
                className="w-full rounded-xl border border-border bg-muted py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">{kloelT(`Todos os status`)}</option>
              <option value="hot">{kloelT(`Quentes`)}</option>
              <option value="warm">{kloelT(`Mornos`)}</option>
              <option value="new">{kloelT(`Novos`)}</option>
              <option value="cold">{kloelT(`Frios`)}</option>
              <option value="converted">{kloelT(`Convertidos`)}</option>
            </select>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {loadingLeads && leads.length === 0 ? (
            <div className="flex items-center justify-center px-5 py-10">
              <KloelMushroomMark size={22} title="Carregando leads" traceColor={colors.ember.primary} />
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                {kloelT(`Nenhum lead encontrado`)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {source === 'scrapers'
                  ? 'Volte para Scrapers e conclua uma importacao para abastecer esta fila.'
                  : 'Tente ajustar o filtro ou o termo de busca.'}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/scrapers"
                  className="rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent"
                >
                  {kloelT(`Abrir Scrapers`)}
                </Link>
                <Link
                  href="/marketing/whatsapp?mode=broadcast"
                  className="rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent"
                >
                  {kloelT(`Preparar broadcast`)}
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredLeads.map((lead) => {
                const isActive = lead.id === selectedLeadId;
                const lastInteraction =
                  safeDate(lead.lastInteraction) ||
                  safeDate(lead.updatedAt) ||
                  safeDate(lead.createdAt);
                const statusLabel = STATUS_LABEL[lead.status] || lead.status || '—';
                return (
                  <button
                    type="button"
                    key={lead.id}
                    onClick={() => onSelectLead(lead.id)}
                    className={`w-full px-5 py-4 text-left transition-colors ${isActive ? 'bg-muted' : 'hover:bg-muted'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {leadTitle(lead)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {lead.phone}
                        </p>
                        {lead.email ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {lead.email}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
                          {statusLabel}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatTimeAgo(lastInteraction)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
