'use client';

import { AdminSectionHeader, AdminSurface } from '@/components/admin/admin-monitor-ui';
import { CONFIG_PAGE_COPY } from './config-constants';

export function GovernanceNotesSection() {
  return (
    <AdminSurface className="px-5 py-5 lg:px-6">
      <AdminSectionHeader
        title={CONFIG_PAGE_COPY.governanceTitle}
        description={CONFIG_PAGE_COPY.governanceDescription}
      />
      <div className="grid gap-3 text-[13px] text-[var(--app-text-secondary)] lg:grid-cols-3">
        {CONFIG_PAGE_COPY.governanceNotes.map((note) => (
          <div
            key={note}
            className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
          >
            {note}
          </div>
        ))}
      </div>
    </AdminSurface>
  );
}
