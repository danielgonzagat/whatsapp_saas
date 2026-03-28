import type React from "react";
import { DM_Sans, Playfair_Display } from "next/font/google";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${dmSans.variable} ${playfair.variable}`} style={{ margin: 0, padding: 0 }}>
      {children}
    </div>
  );
}
