'use client';

import { AuthProvider } from "@/components/kloel/auth/auth-provider";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <div
        style={{
          backgroundColor: "#0A0A0C",
          margin: 0,
          padding: 0,
          minHeight: "100vh",
          fontFamily: "var(--font-sora), 'Sora', sans-serif",
          color: "#E0DDD8",
        }}
      >
        {children}
      </div>
    </AuthProvider>
  );
}
