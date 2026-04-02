'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const kloelSettingsClass = {
  sectionTitle: 'text-lg font-semibold text-[#E0DDD8]',
  sectionDescription: 'text-sm text-[#6E6E73]',
  card: 'rounded-md border border-[#222226] bg-[#111113] p-5 shadow-none',
  cardTitle: 'text-lg font-semibold text-[#E0DDD8]',
  cardDescription: 'text-sm text-[#6E6E73]',
  label: 'text-xs text-[#6E6E73]',
  inset: 'rounded-md border border-[#19191C] bg-[#0A0A0C]',
  insetSoft: 'rounded-md border border-[#19191C] bg-[#19191C]',
  metricTile: 'rounded-md border border-[#19191C] bg-[#0A0A0C] p-4',
  input:
    'rounded-md border-[#222226] bg-[#0A0A0C] text-[#E0DDD8] placeholder:text-[#3A3A3F] shadow-none focus-visible:border-[#E85D30] focus-visible:ring-[#E85D30]/15',
  textarea:
    'rounded-md border-[#222226] bg-[#0A0A0C] text-[#E0DDD8] placeholder:text-[#3A3A3F] shadow-none focus-visible:border-[#E85D30] focus-visible:ring-[#E85D30]/15',
  selectTrigger:
    'w-full rounded-md border-[#222226] bg-[#0A0A0C] text-[#E0DDD8] shadow-none focus-visible:border-[#E85D30] focus-visible:ring-[#E85D30]/15',
  selectContent: 'border-[#222226] bg-[#111113] text-[#E0DDD8]',
  switch: 'data-[state=checked]:bg-[#E85D30] data-[state=unchecked]:bg-[#19191C]',
  primaryButton:
    'rounded-md border border-[#E85D30] bg-[#E85D30] text-[#0A0A0C] hover:bg-[#E85D30] hover:opacity-95',
  outlineButton:
    'rounded-md border-[#222226] bg-transparent text-[#6E6E73] hover:bg-[#19191C] hover:text-[#E0DDD8]',
  dangerButton:
    'rounded-md border-[#E05252]/35 bg-transparent text-[#E05252] hover:bg-[#E05252]/10 hover:text-[#E05252]',
  modalSurface:
    'w-full rounded-md border border-[#222226] bg-[#111113] p-6 shadow-2xl shadow-black/40',
  modalOverlay:
    'fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm',
  cardButton:
    'rounded-md border border-[#19191C] bg-[#0A0A0C] text-[#E0DDD8] hover:border-[#222226] hover:bg-[#19191C]',
} as const;

export function SettingsCard({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(kloelSettingsClass.card, className)} {...props}>
      {children}
    </div>
  );
}

export function SettingsHeader({
  title,
  description,
  icon,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-start gap-3', className)}>
      {icon ? <div className="mt-0.5 text-[#6E6E73]">{icon}</div> : null}
      <div>
        <h4 className={kloelSettingsClass.cardTitle}>{title}</h4>
        {description ? <p className="mt-1 text-sm text-[#6E6E73]">{description}</p> : null}
      </div>
    </div>
  );
}

export function SettingsMetricTile({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(kloelSettingsClass.metricTile, className)} {...props}>
      {children}
    </div>
  );
}

export function SettingsInset({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(kloelSettingsClass.inset, className)} {...props}>
      {children}
    </div>
  );
}

export function SettingsSwitchRow({
  title,
  description,
  control,
  className,
}: {
  title: string;
  description?: string;
  control: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 rounded-md border border-[#19191C] bg-[#0A0A0C] px-4 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#E0DDD8]">{title}</p>
        {description ? <p className="mt-1 text-xs text-[#6E6E73]">{description}</p> : null}
      </div>
      {control}
    </div>
  );
}

export function SettingsNotice({
  tone = 'neutral',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'info'
      ? 'border-[#3B82F6]/25 bg-[#3B82F6]/10 text-[#93C5FD]'
      : tone === 'success'
        ? 'border-[#10B981]/25 bg-[#10B981]/10 text-[#7FE2BC]'
        : tone === 'warning'
          ? 'border-[#E85D30]/25 bg-[#E85D30]/10 text-[#F2B29D]'
          : tone === 'danger'
            ? 'border-[#E05252]/25 bg-[#E05252]/10 text-[#F7A8A8]'
            : 'border-[#19191C] bg-[#0A0A0C] text-[#6E6E73]';

  return (
    <div className={cn('rounded-md border px-4 py-3', toneClass, className)} {...props}>
      {children}
    </div>
  );
}

export function SettingsStatusPill({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  children: ReactNode;
  className?: string;
}) {
  const toneClass =
    tone === 'info'
      ? 'bg-[#3B82F6]/12 text-[#93C5FD]'
      : tone === 'success'
        ? 'bg-[#10B981]/12 text-[#7FE2BC]'
        : tone === 'warning'
          ? 'bg-[#E85D30]/12 text-[#F2B29D]'
          : tone === 'danger'
            ? 'bg-[#E05252]/12 text-[#F7A8A8]'
            : 'bg-[#19191C] text-[#6E6E73]';

  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', toneClass, className)}>
      {children}
    </span>
  );
}

export function SettingsModal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={kloelSettingsClass.modalOverlay}>
      <div className={cn(kloelSettingsClass.modalSurface, className)}>{children}</div>
    </div>
  );
}
