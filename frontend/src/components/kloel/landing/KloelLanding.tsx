'use client';

import { colors } from '@/lib/design-tokens';
import { LandingHeader } from './LandingHeader';
import { HeroSection } from './HeroSection';
import { MultiChannelSection } from './MultiChannelSection';
import { ManifestSection } from './ManifestSection';
import { StepsSection } from './StepsSection';
import { FeaturesGridSection } from './FeaturesGridSection';
import { PricingSection } from './PricingSection';
import ThanosSection from './ThanosSection';
import { TestimonialsSection } from './TestimonialsSection';
import { FinalCtaSection } from './FinalCtaSection';
import { FaqSection } from './FaqSection';
import { FooterSection } from './FooterSection';

const V = colors.background.void;
const F = "var(--font-sora), 'Sora', sans-serif";

export default function KloelLanding() {
  return (
    <div
      className="landing-shell"
      style={{ background: V, color: colors.text.silver, fontFamily: F, overflowX: 'hidden' }}
    >
      <style>{`*{box-sizing:border-box}:root{--c2:1fr 1fr;--c3:1fr 1fr 1fr;--c4:repeat(4,1fr);--sp:100px 24px}@media(max-width:768px){:root{--c2:1fr;--c3:1fr;--c4:1fr;--sp:48px 16px}}@keyframes fm{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}::selection{background:rgba(232,93,48,.3)}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:colors.border.space;border-radius:4px}html{scroll-behavior:smooth}input::placeholder{color:colors.text.dim!important}.landing-header-inner{padding:0 clamp(14px,4vw,24px)}.landing-hero-section,.landing-final-cta{padding-left:clamp(16px,4vw,24px)!important;padding-right:clamp(16px,4vw,24px)!important}.landing-final-cta-row{display:flex;gap:10px;justify-content:center;max-width:440px;margin:48px auto 0;flex-wrap:wrap}.landing-final-cta-input{flex:1;min-width:0;width:100%}.landing-final-cta-button{white-space:nowrap}@media(max-width:640px){.landing-header-inner{height:56px}.landing-header-actions{gap:4px!important}.landing-header-login{padding:7px 10px!important}.landing-header-cta{padding:7px 12px!important}.landing-hero-section{padding-top:72px!important;padding-bottom:36px!important}.landing-hero-sub{font-size:14px!important;line-height:1.7!important;max-width:320px!important;margin-top:32px!important;padding:0 8px}.landing-final-cta-row{gap:12px}.landing-final-cta-row>*{width:100%!important}.landing-final-cta-button{width:100%!important}.landing-final-manifest-stack{gap:22px!important}.landing-final-manifest-line{font-size:clamp(18px,5.2vw,30px)!important;line-height:1.18!important}.thanos-stage{padding:40px 16px!important;min-height:620px!important}.thanos-reveal{padding:0 8px!important}}`}</style>

      <LandingHeader />
      <HeroSection />
      <MultiChannelSection />
      <ManifestSection />
      <StepsSection />
      <FeaturesGridSection />
      <PricingSection />
      <ThanosSection />
      <TestimonialsSection />
      <FinalCtaSection />
      <FaqSection />
      <FooterSection />
    </div>
  );
}
