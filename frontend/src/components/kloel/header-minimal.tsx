'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FlaskConical, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TestKloelModal } from './test-kloel-modal';
import { useAuth } from './auth/auth-provider';
import { buildAppUrl, buildAuthUrl, buildMarketingUrl } from '@/lib/subdomains';
import { KloelBrandLockup } from './KloelBrand';

interface HeaderMinimalProps {
  isWhatsAppConnected: boolean;
  onOpenSettings: () => void;
  subscriptionStatus?: 'none' | 'trial' | 'active' | 'expired' | 'suspended';
  trialDaysLeft?: number;
}

export function HeaderMinimal({
  isWhatsAppConnected,
  onOpenSettings,
  subscriptionStatus = 'none',
  trialDaysLeft = 7,
}: HeaderMinimalProps) {
  const [showTestModal, setShowTestModal] = useState(false);
  const { isAuthenticated, userName, signOut } = useAuth();
  const currentHost = typeof window !== 'undefined' ? window.location.host : undefined;
  const logoHref = isAuthenticated
    ? buildAppUrl('/', currentHost)
    : buildMarketingUrl('/', currentHost);

  return (
    <>
      <header
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          top: 0,
          zIndex: 50,
          background: '#0A0A0C',
          borderBottom: '1px solid #19191C',
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            display: 'flex',
            height: 56,
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href={logoHref} style={{ textDecoration: 'none', cursor: 'pointer' }}>
              <KloelBrandLockup markSize={18} fontSize={15} fontWeight={600} />
            </Link>

            {isAuthenticated && subscriptionStatus === 'trial' && (
              <div
                style={{
                  marginLeft: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 6,
                  background: 'rgba(232, 93, 48, 0.06)',
                  padding: '4px 12px',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: '#E85D30',
                    fontFamily: "'Sora', sans-serif",
                  }}
                >
                  Basic - {trialDaysLeft} dias
                </span>
              </div>
            )}

            {isAuthenticated && subscriptionStatus === 'active' && (
              <div
                style={{
                  marginLeft: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 6,
                  background: '#111113',
                  padding: '4px 12px',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: '#E0DDD8',
                    fontFamily: "'Sora', sans-serif",
                  }}
                >
                  Plano Basic
                </span>
              </div>
            )}

            {isAuthenticated && isWhatsAppConnected && (
              <div
                style={{
                  marginLeft: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 6,
                  background: '#111113',
                  padding: '4px 12px',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: '#E0DDD8',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: '#E0DDD8',
                    fontFamily: "'Sora', sans-serif",
                  }}
                >
                  WhatsApp conectado
                </span>
              </div>
            )}
          </div>

          {/* Auth Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isAuthenticated &&
              (subscriptionStatus === 'trial' || subscriptionStatus === 'active') &&
              isWhatsAppConnected && (
                <Button
                  variant="ghost"
                  onClick={() => setShowTestModal(true)}
                  style={{ fontSize: 13, color: '#6E6E73', fontFamily: "'Sora', sans-serif" }}
                >
                  <FlaskConical style={{ width: 14, height: 14, marginRight: 6 }} />
                  Testar Kloel
                </Button>
              )}

            {!isAuthenticated ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (typeof window === 'undefined') return;
                    window.location.assign(buildAuthUrl('/login', window.location.host));
                  }}
                  style={{ fontSize: 13, color: '#6E6E73', fontFamily: "'Sora', sans-serif" }}
                >
                  Entrar
                </Button>
                <Button
                  onClick={() => {
                    if (typeof window === 'undefined') return;
                    window.location.assign(buildAuthUrl('/register', window.location.host));
                  }}
                  style={{
                    borderRadius: 6,
                    background: '#E0DDD8',
                    padding: '8px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#0A0A0C',
                    fontFamily: "'Sora', sans-serif",
                  }}
                >
                  Cadastrar-se
                </Button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: '#E85D30',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#0A0A0C',
                      fontFamily: "'Sora', sans-serif",
                    }}
                  >
                    {userName?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#E0DDD8',
                      fontFamily: "'Sora', sans-serif",
                    }}
                  >
                    {userName || 'Usuario'}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  onClick={signOut}
                  style={{ fontSize: 13, color: '#6E6E73', fontFamily: "'Sora', sans-serif" }}
                >
                  <LogOut style={{ width: 14, height: 14, marginRight: 6 }} />
                  Sair
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <TestKloelModal isOpen={showTestModal} onClose={() => setShowTestModal(false)} />
    </>
  );
}
