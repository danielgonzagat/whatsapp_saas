'use client';

import { XCircle } from 'lucide-react';

interface InboxErrorBannerProps {
  error: string | null;
}

export function InboxErrorBanner({ error }: InboxErrorBannerProps) {
  if (!error) {
    return null;
  }

  return (
    <div className="mb-[var(--inbox-shell-gap)] flex items-center gap-3 rounded-[var(--inbox-radius)] border border-red-200 bg-red-50 px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)] text-[length:var(--inbox-body)] text-red-700">
      <XCircle
        className="text-red-700"
        style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
        aria-hidden="true"
      />
      <span>{error}</span>
    </div>
  );
}
