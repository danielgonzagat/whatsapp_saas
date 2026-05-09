'use client';

import { Mail, Phone } from 'lucide-react';

interface ContactInfoSectionProps {
  phone: string;
  email: string | null | undefined;
}

const C = {
  muted: 'var(--text-muted, #6E6E73)',
  text: 'var(--text-silver, #E0DDD8)',
  mono: "var(--font-jetbrains), 'JetBrains Mono', monospace",
} as const;

function InfoRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: C.text,
        marginBottom: 6,
      }}
    >
      <span style={{ color: C.muted, display: 'flex' }}>{icon}</span>
      <span style={{ fontFamily: C.mono }}>{label}</span>
    </div>
  );
}

export function ContactInfoSection({ phone, email }: ContactInfoSectionProps) {
  return (
    <>
      <InfoRow icon={<Phone size={14} aria-hidden="true" />} label={phone} />
      {email && <InfoRow icon={<Mail size={14} aria-hidden="true" />} label={email} />}
    </>
  );
}
