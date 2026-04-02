import type React from 'react';

const checkoutFontStyle: React.CSSProperties & {
  '--font-dm-sans': string;
  '--font-playfair': string;
} = {
  '--font-dm-sans': 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  '--font-playfair': 'Georgia, "Times New Roman", serif',
  margin: 0,
  padding: 0,
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <div style={checkoutFontStyle}>{children}</div>;
}
