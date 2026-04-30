/** Thanos section. */
export default function ThanosSection() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const secRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);
  const [showReveal, setShowReveal] = useState(false);
  const [showSales, setShowSales] = useState(false);
  const [started, setStarted] = useState(false);
  const [imgsLoaded, setImgsLoaded] = useState<LoadedIcon[] | null>(null);
  const [salesRunToken, setSalesRunToken] = useState(0);

  useEffect(() => {
    thanosLoadImages(THANOS_ICONS).then(setImgsLoaded);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setStarted(false);
      return;
    }

    const el = secRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    if (!started || !imgsLoaded?.length) {
      return;
    }
    const canvas = cvRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return;
    }

    let alive = true;
    let currentFrame: ImageData | null = null;
    let currentBuffer: Uint8ClampedArray | null = null;

    const animate = (layout: LegacyLayout, particles: Particle[]) =>
      new Promise<void>((resolve) => {
        if (!currentFrame || !currentBuffer) {
          resolve();
          return;
        }

        let previous = performance.now();

        const tick = (now: number) => {
          if (!alive || !currentFrame || !currentBuffer) {
            resolve();
            return;
          }

          const dtSec = Math.min((now - previous) / 1000, 0.05);
          previous = now;
          const frameScale = dtSec * 60;
          currentBuffer.fill(0);
          let active = 0;

          for (const particle of particles) {
            particle.ageSec += dtSec;

            if (particle.ageSec < particle.delaySec) {
              active++;
              blendSquare(
                currentBuffer,
                layout.pixelWidth,
                layout.pixelHeight,
                particle.x * layout.dpr,
                particle.y * layout.dpr,
                particle.size * layout.dpr,
                particle.r,
                particle.g,
                particle.b,
                particle.a,
              );
              continue;
            }

            if (particle.life <= 0 || particle.size <= 0.12) {
              continue;
            }

            updateParticleMotion(particle, dtSec, frameScale);

            if (isParticleOffscreen(particle, layout)) {
              continue;
            }
            if (particle.life <= 0 || particle.size <= 0.12) {
              continue;
            }

            active++;
            blendSquare(
              currentBuffer,
              layout.pixelWidth,
              layout.pixelHeight,
              particle.x * layout.dpr,
              particle.y * layout.dpr,
              particle.size * layout.dpr,
              particle.r,
              particle.g,
              particle.b,
              particle.life * particle.a,
            );
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.putImageData(currentFrame, 0, 0);

          if (active > 0) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          resolve();
        };

        rafRef.current = requestAnimationFrame(tick);
      });

    const runCycle = async () => {
      while (alive) {
        setShowReveal(false);
        setShowSales(false);
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        const dpr = window.devicePixelRatio || 1;
        const layout = buildLegacyLayout(width, height, dpr);
        canvas.width = layout.pixelWidth;
        canvas.height = layout.pixelHeight;
        canvas.style.opacity = '1';
        drawScene(ctx, layout, imgsLoaded);

        await wait(STATIC_HOLD_MS);
        if (!alive) {
          return;
        }

        drawScene(ctx, layout, imgsLoaded);
        const particles = captureParticles(ctx, layout);
        currentFrame = ctx.createImageData(layout.pixelWidth, layout.pixelHeight);
        currentBuffer = currentFrame.data;

        await animate(layout, particles);
        if (!alive) {
          return;
        }

        canvas.style.opacity = '0';
        await wait(PRE_REVEAL_MS);
        if (!alive) {
          return;
        }

        setShowReveal(true);
        await wait(SALES_DELAY_MS);
        if (!alive) {
          return;
        }

        setSalesRunToken((value) => value + 1);
        setShowSales(true);
        await wait(REVEAL_HOLD_MS);
        if (!alive) {
          return;
        }

        setShowReveal(false);
        setShowSales(false);
        await wait(400);
      }
    };

    runCycle();
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [imgsLoaded, prefersReducedMotion, started]);

  return (
    <div ref={secRef} style={{ position: 'relative' }}>
      <section
        className="thanos-stage"
        style={{
          padding: '0 24px',
          maxWidth: 860,
          margin: '0 auto',
          position: 'relative',
          minHeight: '80vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <canvas
          ref={cvRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            transition: 'opacity .8s ease',
            opacity: prefersReducedMotion ? 0 : 1,
          }}
        />
        {(prefersReducedMotion || showReveal) && (
          <div
            className="thanos-reveal"
            style={{
              position: 'relative',
              zIndex: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '0 24px',
              animation: prefersReducedMotion ? 'none' : 'thanosIn 1s ease both',
            }}
          >
            <h2
              style={{
                fontSize: 'clamp(28px,4.5vw,40px)',
                fontWeight: 800,
                color: E,
                letterSpacing: '-.03em',
                textAlign: 'center',
                marginBottom: showSales ? 52 : 0,
              }}
            >
              {kloelT(`O Kloel escala.`)}
            </h2>
            {(prefersReducedMotion || showSales) && (
              <div style={{ width: '100%', maxWidth: 740 }}>
                <ThanosOmniSales runToken={prefersReducedMotion ? 0 : salesRunToken} />
              </div>
            )}
          </div>
        )}
      </section>
      <style>{`@keyframes thanosIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

