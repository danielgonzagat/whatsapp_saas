import { colors } from '@/lib/design-tokens';

export const centerPageStyle: React.CSSProperties = {
  background: 'var(--app-bg-primary)',
  minHeight: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
};

export const authInnerStyle: React.CSSProperties = {
  textAlign: 'center',
};

export const authMessageStyle: React.CSSProperties = {
  color: 'var(--app-text-primary)',
  fontSize: 14,
  marginBottom: 16,
  fontFamily: 'Sora, sans-serif',
};

export const loginBtnStyle: React.CSSProperties = {
  background: colors.ember.primary,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '10px 24px',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'Sora, sans-serif',
};

export const pageStyle: React.CSSProperties = {
  background: 'var(--app-bg-primary)',
  minHeight: '100vh',
  padding: '24px 32px',
  fontFamily: 'Sora, sans-serif',
};

export const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 24,
};

export const headerLeftStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

export const emberIconStyle: React.CSSProperties = {
  color: colors.ember.primary,
};

export const pageTitleStyle: React.CSSProperties = {
  color: 'var(--app-text-primary)',
  fontSize: 20,
  fontWeight: 700,
  margin: 0,
};

export const createBtnStyle: React.CSSProperties = {
  background: colors.ember.primary,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 18px',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'Sora, sans-serif',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

export const errorBannerStyle: React.CSSProperties = {
  background: 'rgba(232, 93, 48, 0.08)',
  border: '1px solid rgba(232, 93, 48, 0.2)',
  borderRadius: 6,
  padding: '10px 16px',
  marginBottom: 16,
  color: colors.ember.primary,
  fontSize: 13,
};

export const loaderWrapStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: 40,
};

export const loaderStyle: React.CSSProperties = {
  color: colors.ember.primary,
  animation: 'spin 1s linear infinite',
};

export const emptyStateStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 8,
  padding: 48,
  textAlign: 'center',
};

export const emptyIconStyle: React.CSSProperties = {
  color: '#444',
  marginBottom: 12,
};

export const emptyTextStyle: React.CSSProperties = {
  color: '#666',
  fontSize: 14,
};

export const emptyHintStyle: React.CSSProperties = {
  color: '#555',
  fontSize: 12,
};

export const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  gap: 12,
};
