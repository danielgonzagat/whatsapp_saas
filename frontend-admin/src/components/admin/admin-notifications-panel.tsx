'use client';

import { Bell } from 'lucide-react';
import useSWR from 'swr';
import { adminNotificationsApi } from '@/lib/api/admin-notifications-api';

export function AdminNotificationsPanel() {
  const { data, mutate, isLoading } = useSWR('admin/notifications', () =>
    adminNotificationsApi.list(),
  );

  async function handleMarkRead(notificationId: string) {
    await adminNotificationsApi.markRead(notificationId);
    await mutate();
  }

  async function togglePreference(key: 'chargebacks' | 'kyc' | 'support' | 'security' | 'growth') {
    const current = data?.preferences?.[key] ?? true;
    await adminNotificationsApi.updatePreferences({ [key]: !current });
    await mutate();
  }

  return (
    <div className="border-b border-[var(--app-border-subtle)] px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-[var(--app-text-secondary)]" />
          <span className="text-[12px] font-semibold text-[var(--app-text-primary)]">
            Notificações
          </span>
        </div>
        <span className="rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-accent)]">
          {data?.unreadCount ?? 0} novas
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        {(
          [
            ['chargebacks', 'Chargebacks'],
            ['kyc', 'KYC'],
            ['support', 'Suporte'],
            ['security', 'Segurança'],
            ['growth', 'Growth'],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            className="flex items-center gap-2 rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-2 py-1.5 text-[11px] text-[var(--app-text-secondary)]"
          >
            <input
              type="checkbox"
              checked={data?.preferences?.[key] ?? true}
              onChange={() => void togglePreference(key)}
              className="size-3.5 rounded border-[var(--app-border-primary)] bg-transparent"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      {isLoading ? (
        <div className="text-[11px] text-[var(--app-text-secondary)]">Carregando alertas…</div>
      ) : (
        <div className="grid max-h-[240px] gap-2 overflow-y-auto">
          {(data?.items ?? []).slice(0, 8).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void handleMarkRead(item.id)}
              className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-3 py-2 text-left transition-colors hover:bg-[var(--app-bg-hover)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[12px] font-semibold text-[var(--app-text-primary)]">
                    {item.title}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                    {item.body}
                  </div>
                </div>
                {!item.read ? (
                  <span className="mt-0.5 size-2 rounded-full bg-[var(--app-accent)]" />
                ) : null}
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                {new Date(item.createdAt).toLocaleString('pt-BR')}
              </div>
            </button>
          ))}
          {data?.items.length === 0 ? (
            <div className="text-[11px] text-[var(--app-text-secondary)]">
              Nenhum alerta ativo para as preferências atuais.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
