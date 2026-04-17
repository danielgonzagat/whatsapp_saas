'use client';

import type { CSSProperties, ReactNode } from 'react';
import { MetricNumber, type MetricNumberProps } from '@/components/ui/metric-number';
import { cn } from '@/lib/utils';

export function AdminPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-[var(--app-bg-primary)] px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4">{children}</div>
    </div>
  );
}

export function AdminSurface({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section
      className={cn(
        'rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-card)]',
        className,
      )}
      style={style}
    >
      {children}
    </section>
  );
}

export function AdminPageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <AdminSurface className="overflow-visible px-5 py-5 lg:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--app-text-tertiary)]">
            {eyebrow}
          </div>
          <h1 className="text-[30px] font-bold leading-none tracking-[-0.04em] text-[var(--app-text-primary)] lg:text-[38px]">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-[14px] text-[var(--app-text-secondary)]">
            {description}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </AdminSurface>
  );
}

export function AdminHeroSplit({
  label,
  value,
  kind = 'currency-brl',
  description,
  compactCards,
}: {
  label: string;
  value: number | null | undefined;
  kind?: MetricNumberProps['kind'];
  description: ReactNode;
  compactCards: Array<{
    label: string;
    value: number | null | undefined;
    kind?: MetricNumberProps['kind'];
    note: string;
    tone?: string;
  }>;
}) {
  return (
    <AdminSurface className="px-5 py-5 lg:px-6 lg:py-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.9fr)]">
        <div>
          <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
            {label}
          </div>
          <MetricNumber
            value={value}
            kind={kind}
            className="text-[36px] font-bold leading-none tracking-[-0.05em] text-[var(--app-accent)] lg:text-[52px]"
          />
          <div className="mt-3 text-[13px] text-[var(--app-text-secondary)]">{description}</div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {compactCards.map((card) => (
            <div
              key={card.label}
              className="min-h-[102px] rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
            >
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--app-text-tertiary)]">
                {card.label}
              </div>
              <MetricNumber
                value={card.value}
                kind={card.kind || 'currency-brl'}
                className={cn(
                  'text-[18px] font-bold leading-tight text-[var(--app-text-primary)]',
                  card.tone,
                )}
              />
              <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">{card.note}</div>
            </div>
          ))}
        </div>
      </div>
    </AdminSurface>
  );
}

export function AdminMetricGrid({
  items,
}: {
  items: Array<{
    label: string;
    value: number | null | undefined;
    kind?: MetricNumberProps['kind'];
    detail: string;
    tone?: string;
  }>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <AdminSurface key={item.label} className="px-5 py-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                {item.label}
              </div>
              <MetricNumber
                value={item.value}
                kind={item.kind || 'integer'}
                className={cn(
                  'text-[28px] font-bold leading-none tracking-[-0.04em] text-[var(--app-text-primary)]',
                  item.tone,
                )}
              />
            </div>
          </div>
          <div className="text-[11px] text-[var(--app-text-secondary)]">{item.detail}</div>
        </AdminSurface>
      ))}
    </div>
  );
}

export function AdminSectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
          {title}
        </div>
        {description ? (
          <div className="text-[13px] text-[var(--app-text-secondary)]">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminPillTabs({
  items,
  active,
  onChange,
}: {
  items: Array<{ key: string; label: string }>;
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-2 rounded-[999px] border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] p-1">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              'rounded-[999px] px-4 py-2 text-[12px] font-semibold transition-colors',
              isActive
                ? 'border border-[var(--app-accent)] bg-[var(--app-bg-primary)] text-[var(--app-accent)]'
                : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-hover)] hover:text-[var(--app-text-primary)]',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function AdminSubinterfaceTabs({
  items,
  active,
  onChange,
}: {
  items: Array<{ key: string; label: string; icon?: ReactNode }>;
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      className="mx-auto mb-6 flex max-w-[1240px] gap-1 overflow-x-auto pb-2"
      style={{ scrollbarWidth: 'none' }}
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-md bg-transparent px-3.5 py-2 text-[12px] transition-colors',
              isActive
                ? 'font-semibold text-[var(--app-accent)]'
                : 'font-medium text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]',
            )}
            style={{ fontFamily: "var(--font-sora), 'Sora', sans-serif" }}
          >
            {item.icon ? <span className="flex items-center">{item.icon}</span> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function AdminTicker({
  items,
  emptyLabel = 'Sem atualizações recentes',
}: {
  items: string[];
  emptyLabel?: string;
}) {
  const safeItems = items.length > 0 ? items : [emptyLabel];
  const content = [...safeItems, ...safeItems];

  return (
    <AdminSurface className="overflow-hidden px-0 py-0">
      <style>{`
        @keyframes adminTickerScroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
      <div className="overflow-hidden py-3">
        <div
          className="flex min-w-max items-center gap-10 whitespace-nowrap"
          style={{ animation: 'adminTickerScroll 36s linear infinite' }}
        >
          {content.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--app-text-secondary)]"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </AdminSurface>
  );
}

export function AdminProgressList({
  items,
  accent = 'var(--app-accent)',
}: {
  items: Array<{
    label: string;
    valueLabel: string;
    progress: number;
  }>;
  accent?: string;
}) {
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--app-text-secondary)]">{item.label}</span>
            <span
              className="text-[11px] text-[var(--app-text-primary)]"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {item.valueLabel}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-[var(--app-border-primary)]">
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${Math.max(0, Math.min(100, item.progress))}%`,
                background: accent,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminTimelineFeed({
  items,
}: {
  items: Array<{
    id: string;
    title: string;
    body: string;
    meta?: string;
  }>;
}) {
  if (items.length === 0) {
    return (
      <AdminEmptyState
        title="Nada por aqui ainda"
        description="Assim que eventos forem registrados, o feed passa a refletir a operação em tempo real."
      />
    );
  }

  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
        >
          <div className="mb-1 text-[13px] font-semibold text-[var(--app-text-primary)]">
            {item.title}
          </div>
          <div className="text-[12px] leading-6 text-[var(--app-text-secondary)]">{item.body}</div>
          {item.meta ? (
            <div
              className="mt-2 text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {item.meta}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function AdminEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-[10px] bg-[var(--app-accent-light)] text-[var(--app-accent)]">
        —
      </div>
      <div className="text-[14px] font-medium text-[var(--app-text-primary)]">{title}</div>
      <div className="max-w-sm text-[12.5px] leading-6 text-[var(--app-text-secondary)]">
        {description}
      </div>
    </div>
  );
}
