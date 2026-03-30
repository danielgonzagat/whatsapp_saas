'use client';

import { useState, useEffect, useCallback } from 'react';

const BRAZILIAN_NAMES = [
  'Maria S.', 'João P.', 'Ana L.', 'Pedro M.', 'Carla R.', 'Lucas F.', 'Fernanda A.',
  'Ricardo B.', 'Patricia C.', 'Marcos V.', 'Juliana T.', 'Roberto S.', 'Camila O.',
  'Felipe N.', 'Beatriz G.', 'Gustavo H.', 'Larissa D.', 'Eduardo K.', 'Mariana E.',
  'Thiago W.', 'Isabela M.', 'Rafael L.', 'Amanda P.', 'Bruno C.', 'Leticia R.',
];

const TEMPLATES = [
  { id: 'buying_now', text: '{count} pessoas estao comprando {product} nesse momento' },
  { id: 'bought_week', text: '{count} pessoas compraram {product} essa semana' },
  { id: 'bought_30min', text: '{count} pessoas compraram {product} nos ultimos 30 minutos' },
  { id: 'bought_today', text: '{count} pessoas compraram {product} hoje' },
  { id: 'bought_hour', text: '{count} pessoas compraram {product} na ultima hora' },
  { id: 'person_bought', text: '{name} comprou {product}' },
  { id: 'person_just_bought', text: '{name} acabou de comprar {product}' },
];

interface SocialProofToastProps {
  enabled: boolean;
  productName: string;
  alerts?: Array<{ id: string; enabled: boolean; minQuantity?: number }>;
  customNames?: string;
}

export function SocialProofToast({ enabled, productName, alerts, customNames }: SocialProofToastProps) {
  // Disabled: social proof must use real data, not fabricated names/counts.
  // Re-enable when connected to real recent sales API.
  if (process.env.NEXT_PUBLIC_ENABLE_SOCIAL_PROOF !== 'true') return null;

  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');

  const names = customNames
    ? customNames.split(',').map(n => n.trim()).filter(Boolean)
    : BRAZILIAN_NAMES;

  const activeAlerts = (alerts || []).filter(a => a.enabled);

  const generateMessage = useCallback(() => {
    if (activeAlerts.length === 0) return '';
    const alert = activeAlerts[Math.floor(Math.random() * activeAlerts.length)];
    const template = TEMPLATES.find(t => t.id === alert.id);
    if (!template) return '';

    const name = names[Math.floor(Math.random() * names.length)];
    const min = alert.minQuantity || 15;
    const count = min + Math.floor(Math.random() * 30);

    return template.text
      .replace('{count}', String(count))
      .replace('{product}', productName)
      .replace('{name}', name);
  }, [activeAlerts, names, productName]);

  useEffect(() => {
    if (!enabled || activeAlerts.length === 0) return;

    const show = () => {
      const msg = generateMessage();
      if (!msg) return;
      setMessage(msg);
      setVisible(true);
      setTimeout(() => setVisible(false), 4000);
    };

    // First toast after 5s
    const initial = setTimeout(show, 5000);

    // Subsequent toasts every 8-15s
    const interval = setInterval(() => {
      show();
    }, 8000 + Math.random() * 7000);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [enabled, activeAlerts.length, generateMessage]);

  if (!enabled || !visible || !message) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      left: 20,
      zIndex: 90,
      maxWidth: 340,
      padding: '12px 16px',
      background: '#fff',
      border: '1px solid rgba(0,0,0,0.08)',
      borderRadius: 8,
      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      animation: 'socialProofSlide 0.4s ease-out',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <style>{`
        @keyframes socialProofSlide {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: 'linear-gradient(135deg, #10B981, #059669)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#1A1714', fontWeight: 500, lineHeight: 1.4, fontFamily: "'DM Sans', sans-serif" }}>
          {message}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
          agora mesmo
        </div>
      </div>
    </div>
  );
}
