'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);
  const visible = prefersReducedMotion || hasEnteredViewport;

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    const el = ref.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasEnteredViewport(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
        transition: prefersReducedMotion
          ? 'none'
          : `opacity .8s ease ${delay}ms, transform .8s ease ${delay}ms`,
      }}
    >
      {visible ? children : <div style={{ minHeight: 50 }} />}
    </div>
  );
}
