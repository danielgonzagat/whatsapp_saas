import type { ReactNode } from 'react';

const FONT_SANS = "var(--font-sora), 'Sora', sans-serif";

interface SurfaceProps {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  tone?: 'default' | 'accent';
}

export function Surface({ title, eyebrow, children, tone = 'default' }: SurfaceProps) {
  return (
    <div
      className={`rounded-[12px] border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] px-5 py-5 ${
        tone === 'accent' ? 'border-l-[3px] border-l-[var(--app-accent)]' : ''
      }`}
      style={{ fontFamily: FONT_SANS }}
    >
      {eyebrow ? (
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
          {eyebrow}
        </div>
      ) : null}
      <div className="mb-4 text-[13px] font-semibold text-[var(--app-text-primary)]">{title}</div>
      {children}
    </div>
  );
}
